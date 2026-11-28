import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { decryptToken } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { providerById, type ProviderId } from "@/lib/ai-providers";

// One call into whichever provider a tenant configured. The AI Assistant
// writes replies with it; the chatbot generator builds flows with it. Both
// want the same thing — a prompt in, text out, and an error sentence that
// names the fix rather than a bare 401.

// A hung provider must not hold the WhatsApp webhook open — Meta retries a
// delivery it doesn't get a 200 for, which would double-send the reply.
const REQUEST_TIMEOUT_MS = 30_000;

/** Per-call overrides. Everything optional; the defaults are the chat case. */
export interface AiCallOptions {
  /**
   * How long to wait for the provider. The default suits a chat reply,
   * where the customer is watching. Building a whole chatbot from a
   * paragraph is a different job: it writes thousands of tokens and
   * thirty seconds is not enough, which is what "it is not building the
   * chatbot" turned out to mean.
   */
  timeoutMs?: number;
}

/** The subset of an assistant row a provider call actually needs. */
export interface AiCallConfig {
  provider: string;
  model: string;
  api_key_encrypted: string | null;
  api_base_url: string | null;
  temperature: number;
  max_tokens: number;
  /**
   * Whose workspace this is, so the key saved on the Integrations page
   * can be used when this particular assistant has none of its own.
   * Optional: a caller that cannot supply it still works, it just skips
   * that step.
   */
  org_id?: string | null;
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
/**
 * The Integrations slug that holds a workspace key for this provider.
 *
 * Google's is spelled differently in the two places — "google" is the
 * model provider, "google-gemini" is what the card is called — so the
 * mapping is written down rather than assumed. A key saved under a name
 * nothing looks up is a key that silently does nothing, which is the
 * failure this whole indirection exists to avoid.
 */
const WORKSPACE_KEY_SLUG: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google-gemini",
};

/**
 * The key saved for the whole workspace on the Integrations page.
 *
 * Sits between the assistant's own key and the platform's environment
 * key: specific beats general, and a business that pasted one key for
 * the workspace should not have to paste it again into every assistant.
 */
async function workspaceKey(config: AiCallConfig): Promise<string | null> {
  const slug = WORKSPACE_KEY_SLUG[config.provider];
  if (!slug || !config.org_id) return null;

  try {
    const { data } = await createAdminClient()
      .from("org_integrations")
      .select("credentials_encrypted, status")
      .eq("org_id", config.org_id)
      .eq("provider", slug)
      .maybeSingle();

    if (!data?.credentials_encrypted || data.status !== "connected") return null;

    const parsed = JSON.parse(decryptToken(data.credentials_encrypted)) as {
      api_key?: string;
    };
    return parsed.api_key?.trim() || null;
  } catch (error) {
    // A key encrypted under a previous TOKEN_ENCRYPTION_KEY, or a row
    // that is not the JSON this expects. Fall through to the
    // environment rather than failing the reply outright.
    console.error("Could not read the workspace AI key", error);
    return null;
  }
}

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

/**
 * Whether a key can be found at all — the assistant's own, the
 * workspace's, or the platform's.
 *
 * Async because the workspace key lives in the database. The screen that
 * shows "no API key" used to ask the synchronous question, so after the
 * Integrations page learned to hold a key it would have gone on
 * reporting an assistant as unconfigured while it was about to work
 * perfectly well.
 */
export async function hasUsableKey(config: AiCallConfig): Promise<boolean> {
  if (resolveApiKey(config) !== null) return true;
  return (await workspaceKey(config)) !== null;
}

/** Never throws: every failure comes back as a sentence the tenant can act on. */
export async function callProvider(
  config: AiCallConfig,
  system: string,
  turns: AiTurn[],
  options: AiCallOptions = {}
): Promise<AiCallResult> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const provider = providerById(config.provider);
  if (!provider) {
    return {
      ok: false,
      error: `"${config.provider}" is not a provider this workspace can use. Pick one on the AI Assistant screen.`,
    };
  }

  // Assistant's own key, then the workspace key from Integrations, then
  // the platform's. resolveApiKey covers the first and the last, so the
  // middle one is tried before falling back to it entirely.
  const apiKey =
    (config.api_key_encrypted ? resolveApiKey(config) : null) ??
    (await workspaceKey(config)) ??
    resolveApiKey(config);

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
    timeoutMs,
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
  timeoutMs: number;
}

async function callAnthropic({
  apiKey,
  model,
  system,
  turns,
  temperature,
  maxTokens,
  timeoutMs,
}: ProviderRequest): Promise<string> {
  const client = new Anthropic({ apiKey, timeout: timeoutMs });

  // Streamed, then collected. The result is identical to a plain call, but
  // a long generation — a whole chatbot written out node by node — no
  // longer looks like a stalled connection to anything in between, and the
  // SDK stops refusing large max_tokens requests outright.
  const stream = client.messages.stream({
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

  const response = await stream.finalMessage();

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
  timeoutMs,
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
    signal: AbortSignal.timeout(timeoutMs),
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
  timeoutMs,
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
    signal: AbortSignal.timeout(timeoutMs),
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
