import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { decryptToken } from "@/lib/crypto";
import { providerById, type ProviderId } from "@/lib/ai-providers";

// One call into whichever provider a tenant configured. The AI Assistant
// writes replies with it; the chatbot generator builds flows with it. Both
// want the same thing — a prompt in, text out, and an error sentence that
// names the fix rather than a bare 401.

// A hung provider must not hold the WhatsApp webhook open — Meta retries a
// delivery it doesn't get a 200 for, which would double-send the reply.
const REQUEST_TIMEOUT_MS = 30_000;

/** The subset of an assistant row a provider call actually needs. */
export interface AiCallConfig {
  provider: string;
  model: string;
  api_key_encrypted: string | null;
  api_base_url: string | null;
  temperature: number;
  max_tokens: number;
}

export interface AiTurn {
  role: "user" | "assistant";
  text: string;
}

export type AiCallResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * The key this call will authenticate with: the tenant's own pasted key
 * first, then the platform's env key for that provider.
 *
 * Returns null when neither exists, so the caller can say which one to set
 * instead of letting the provider answer with a bare 401.
 */
export function resolveApiKey(config: AiCallConfig): string | null {
  if (config.api_key_encrypted) {
    try {
      const key = decryptToken(config.api_key_encrypted).trim();
      if (key) return key;
    } catch (error) {
      // A key encrypted under a previous TOKEN_ENCRYPTION_KEY can't be read
      // back. Fall through to the env key rather than failing outright.
      console.error("Could not decrypt the stored API key", error);
    }
  }

  const envVar = providerById(config.provider)?.envVar;
  const fromEnv = envVar ? process.env[envVar]?.trim() : undefined;
  return fromEnv || null;
}

/** Never throws: every failure comes back as a sentence the tenant can act on. */
export async function callProvider(
  config: AiCallConfig,
  system: string,
  turns: AiTurn[]
): Promise<AiCallResult> {
  const provider = providerById(config.provider);
  if (!provider) {
    return {
      ok: false,
      error: `"${config.provider}" is not a provider this workspace can use. Pick one on the AI Assistant screen.`,
    };
  }

  const apiKey = resolveApiKey(config);
  if (!apiKey) {
    return {
      ok: false,
      error: provider.envVar
        ? `No ${provider.name} API key. Paste one on the assistant's AI Configuration tab, or set ${provider.envVar} in the environment.`
        : "No API key for this endpoint. Paste one on the assistant's AI Configuration tab.",
    };
  }

  const request: ProviderRequest = {
    apiKey,
    model: config.model,
    system,
    turns,
    temperature: config.temperature,
    maxTokens: config.max_tokens,
  };

  try {
    switch (provider.id as ProviderId) {
      case "anthropic":
        return { ok: true, text: await callAnthropic(request) };
      case "google":
        return { ok: true, text: await callGoogle(request) };
      case "custom": {
        const baseUrl = (config.api_base_url ?? "").trim().replace(/\/+$/, "");
        if (!baseUrl) {
          return {
            ok: false,
            error:
              "This uses a custom endpoint but no base URL is set. Add one on the AI Configuration tab, e.g. https://openrouter.ai/api/v1",
          };
        }
        return {
          ok: true,
          text: await callOpenAiCompatible({ ...request, baseUrl, tokenParam: "max_tokens" }),
        };
      }
      case "openai":
      default:
        return {
          ok: true,
          text: await callOpenAiCompatible({
            ...request,
            baseUrl: "https://api.openai.com/v1",
            tokenParam: "max_completion_tokens",
          }),
        };
    }
  } catch (error) {
    // Surface the provider's own message: "invalid api key" and "credit
    // balance too low" need different fixes, and a generic string hides
    // which one it was.
    const message =
      error instanceof Anthropic.APIError
        ? `${provider.name} API error (${error.status}): ${error.message}`
        : error instanceof Error
          ? error.message
          : `Unknown error calling ${provider.name}`;
    console.error("Provider call failed", error);
    return { ok: false, error: message };
  }
}


interface ProviderRequest {
  apiKey: string;
  model: string;
  system: string;
  turns: AiTurn[];
  temperature: number;
  maxTokens: number;
}

async function callAnthropic({
  apiKey,
  model,
  system,
  turns,
  temperature,
  maxTokens,
}: ProviderRequest): Promise<string> {
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS });

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    // Deliberately no extended thinking. A support reply is not a
    // reasoning task, the latency is visible to the customer waiting in
    // WhatsApp, and thinking pins temperature to 1 — which would make
    // the temperature slider on the AI Assistant screen a lie.
    temperature,
    system,
    messages: turns.map((turn) => ({ role: turn.role, content: turn.text })),
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * OpenAI and anything that speaks its chat-completions shape.
 *
 * `tokenParam` differs because OpenAI renamed max_tokens to
 * max_completion_tokens, while most compatible servers (Groq, Together,
 * Ollama, OpenRouter) still only know the original name.
 */
async function callOpenAiCompatible({
  apiKey,
  model,
  system,
  turns,
  temperature,
  maxTokens,
  baseUrl,
  tokenParam,
}: ProviderRequest & { baseUrl: string; tokenParam: "max_tokens" | "max_completion_tokens" }) {
  const body: Record<string, unknown> = {
    model,
    [tokenParam]: maxTokens,
    messages: [
      { role: "system", content: system },
      ...turns.map((turn) => ({ role: turn.role, content: turn.text })),
    ],
  };

  // The reasoning models reject any temperature but the default, and a 400
  // here reads to the tenant as "my key is broken". Just don't send it.
  if (!isFixedTemperatureModel(model)) body.temperature = temperature;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload = await readJson(response);
  if (!response.ok) throw new Error(describeProviderError("OpenAI", response.status, payload));

  const choice = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  // Some compatible servers return the content as an array of parts.
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "object" && part && "text" in part ? String(part.text) : ""))
      .join("");
  }
  return "";
}

function isFixedTemperatureModel(model: string): boolean {
  return /^(gpt-5|o[1-9])/i.test(model.trim());
}

async function callGoogle({
  apiKey,
  model,
  system,
  turns,
  temperature,
  maxTokens,
}: ProviderRequest): Promise<string> {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Header rather than ?key=, so the key never lands in a proxy or
      // access log alongside the URL.
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.text }],
      })),
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload = await readJson(response);
  if (!response.ok) throw new Error(describeProviderError("Google AI", response.status, payload));

  const data = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
  };

  const blocked = data.promptFeedback?.blockReason;
  if (blocked) {
    throw new Error(`Google AI blocked this conversation (${blocked}) and returned no reply.`);
  }

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === "SAFETY") {
    throw new Error("Google AI stopped the reply on a safety filter.");
  }

  return (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    // A gateway or a wrong base URL answers with HTML. Keep enough of it to
    // recognise, not enough to fill the bot_runs table.
    return { error: { message: raw.slice(0, 300) } };
  }
}

function describeProviderError(name: string, status: number, payload: unknown): string {
  const message = (payload as { error?: { message?: unknown } })?.error?.message;
  const detail = typeof message === "string" && message.trim() ? message.trim() : "no detail";
  if (status === 401 || status === 403) {
    return `${name} rejected the API key (${status}): ${detail}. Check the key on the assistant's AI Configuration tab.`;
  }
  if (status === 404) {
    return `${name} does not have a model named for this assistant (${status}): ${detail}.`;
  }
  if (status === 429) {
    return `${name} rate-limited or out of credit (429): ${detail}.`;
  }
  return `${name} API error (${status}): ${detail}`;
}
