// The model catalogue behind the AI Assistant editor. Pure data and pure
// functions only — the editor is a client component, so this file must not
// import anything server-only.

export type ProviderId = "anthropic" | "openai" | "google" | "custom";

export interface ProviderModel {
  value: string;
  label: string;
  hint: string;
}

export interface ProviderDef {
  id: ProviderId;
  name: string;
  /** Shown on the provider card. One line, no marketing. */
  blurb: string;
  /** Where the tenant generates the key we are asking them to paste. */
  consoleUrl: string;
  consoleLabel: string;
  /** What a valid key looks like, so a wrong paste is obvious before saving. */
  keyPlaceholder: string;
  keyPrefix: string | null;
  /** Env var used when the tenant has not pasted their own key. */
  envVar: string | null;
  /** Only 'custom' needs a base URL; everyone else has a fixed endpoint. */
  needsBaseUrl: boolean;
  models: ProviderModel[];
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    blurb: "Claude models. Best at following long, detailed brand instructions.",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    consoleLabel: "console.anthropic.com",
    keyPlaceholder: "sk-ant-api03-…",
    keyPrefix: "sk-ant-",
    envVar: "ANTHROPIC_API_KEY",
    needsBaseUrl: false,
    models: [
      { value: "claude-opus-5", label: "Claude Opus 5", hint: "Most capable" },
      { value: "claude-sonnet-5", label: "Claude Sonnet 5", hint: "Balanced — recommended" },
      { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", hint: "Fastest and cheapest" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    blurb: "GPT models. Widely used, with the largest ecosystem of examples.",
    consoleUrl: "https://platform.openai.com/api-keys",
    consoleLabel: "platform.openai.com",
    keyPlaceholder: "sk-proj-…",
    keyPrefix: "sk-",
    envVar: "OPENAI_API_KEY",
    needsBaseUrl: false,
    models: [
      { value: "gpt-5", label: "GPT-5", hint: "Most capable" },
      { value: "gpt-5-mini", label: "GPT-5 mini", hint: "Balanced" },
      { value: "gpt-4.1", label: "GPT-4.1", hint: "Long context" },
      { value: "gpt-4o-mini", label: "GPT-4o mini", hint: "Fastest and cheapest" },
    ],
  },
  {
    id: "google",
    name: "Google AI",
    blurb: "Gemini models from Google AI Studio. Generous free tier to start on.",
    consoleUrl: "https://aistudio.google.com/app/apikey",
    consoleLabel: "aistudio.google.com",
    keyPlaceholder: "AIza…",
    keyPrefix: "AIza",
    envVar: "GOOGLE_API_KEY",
    needsBaseUrl: false,
    models: [
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Most capable" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Balanced — recommended" },
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", hint: "Fastest and cheapest" },
    ],
  },
  {
    id: "custom",
    name: "Custom endpoint",
    blurb: "Any OpenAI-compatible API — OpenRouter, Groq, Together, Mistral, a local Ollama.",
    consoleUrl: "https://openrouter.ai/keys",
    consoleLabel: "your provider's dashboard",
    keyPlaceholder: "your API key",
    keyPrefix: null,
    envVar: null,
    needsBaseUrl: true,
    models: [],
  },
];

export function providerById(id: string): ProviderDef | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDERS.some((provider) => provider.id === value);
}

/**
 * The default model for a provider. Deliberately the middle option rather
 * than the strongest: a support reply is short, and the top model triples
 * the bill for a difference the customer will not notice.
 */
export function defaultModelFor(id: ProviderId): string {
  const provider = providerById(id);
  if (!provider || provider.models.length === 0) return "";
  return provider.models[1]?.value ?? provider.models[0].value;
}

// --- prompt presets -------------------------------------------------------
// The role cards in the editor. Picking one fills the prompt box, which the
// business is then free to edit — at which point prompt_preset becomes
// 'custom' and the card stops being highlighted.

export interface PromptPreset {
  id: string;
  label: string;
  role: string;
  description: string;
  prompt: string;
}

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: "support",
    label: "Customer support",
    role: "Support agent",
    description: "Answers questions, tracks orders, escalates anything it cannot resolve.",
    prompt:
      "You are the customer support agent for this business.\n\n" +
      "Answer questions about products, orders and policies using only what you have been told. " +
      "Be warm, brief and practical. If a customer is upset, acknowledge it before solving anything.\n\n" +
      "Never invent an order status, a delivery date, a refund decision or a price. " +
      "If you do not have the answer, say a team member will follow up and stop there.",
  },
  {
    id: "sales",
    label: "Sales assistant",
    role: "Sales rep",
    description: "Qualifies interest, explains what is on offer, books the next step.",
    prompt:
      "You are the sales assistant for this business.\n\n" +
      "Find out what the customer is trying to achieve before recommending anything. " +
      "Explain what is on offer in plain language and connect it to what they told you.\n\n" +
      "Never quote a price, a discount or a delivery date you were not given. " +
      "Do not pressure anyone. When there is real interest, offer to book a call or hand the chat to the team.",
  },
  {
    id: "booking",
    label: "Booking assistant",
    role: "Booking assistant",
    description: "Collects the details a booking needs and confirms the slot.",
    prompt:
      "You are the booking assistant for this business.\n\n" +
      "Collect the service wanted, the preferred day and time, and the customer's name — one question at a time, never all at once.\n\n" +
      "Never confirm a slot as booked yourself. Once you have the details, say the team will confirm the appointment shortly.",
  },
  {
    id: "lead",
    label: "Lead qualifier",
    role: "Lead qualifier",
    description: "Asks the few questions that decide whether a lead is worth a call.",
    prompt:
      "You are the lead qualifier for this business.\n\n" +
      "Your job is to learn three things: what the customer needs, roughly when they need it, and who you are speaking to. " +
      "Ask one short question at a time and acknowledge each answer before the next.\n\n" +
      "Do not quote prices or make commitments. When you have all three, thank them and say the team will be in touch.",
  },
  {
    id: "faq",
    label: "FAQ answerer",
    role: "FAQ assistant",
    description: "Answers strictly from the knowledge base, and says so when it cannot.",
    prompt:
      "You answer questions strictly from the reference information you have been given.\n\n" +
      "If the answer is in that information, give it plainly. " +
      'If it is not, say "I don\'t have that one — let me get a team member to answer it" and nothing else.\n\n' +
      "Never guess, never fill a gap with general knowledge, and never soften a missing answer into a vague one.",
  },
];

export function presetById(id: string): PromptPreset | undefined {
  return PROMPT_PRESETS.find((preset) => preset.id === id);
}
