// Building an agent, step by step, and knowing what is still missing.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// The editor used to be three tabs with no opinion about order. Everything
// was reachable and nothing said what mattered first, so an agent could be
// saved with no instructions, no key and no handoff — three settings that
// each turn it into a bot that answers every customer with an error, and
// none of which announce themselves until a real person is on the other
// end of it.
//
// So: five numbered steps in the order the decisions actually depend on
// each other, and a checklist that names what is not done yet and why it
// matters. The checklist is the part that earns its space — a step rail
// says where you are, and only the checklist says what to do next.

export const STEPS = [
  {
    key: "persona",
    label: "Persona",
    hint: "Who it is and how it speaks",
  },
  {
    key: "model",
    label: "Model",
    hint: "Which AI answers, and how freely",
  },
  {
    key: "knowledge",
    label: "Knowledge",
    hint: "What it is allowed to know",
  },
  {
    key: "safety",
    label: "Safety",
    hint: "When to stop and fetch a human",
  },
  {
    key: "settings",
    label: "Settings",
    hint: "Memory, forms and follow-ups",
  },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export function stepNumber(key: StepKey): number {
  return STEPS.findIndex((step) => step.key === key) + 1;
}

// --- language --------------------------------------------------------------

/**
 * The languages an agent can be told to answer in.
 *
 * Each one carries the name in its own script as well as in English,
 * because the person choosing Tamil for their customers reads Tamil, and a
 * list that only says "Tamil" is a list written for somebody else.
 *
 * Hinglish is in here as its own entry rather than as a dialect of Hindi.
 * It is what a very large number of Indian customers actually type —
 * Hindi words in Latin letters — and a model told "reply in Hindi" answers
 * those messages in Devanagari, which reads as a different person
 * answering.
 */
export const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "hinglish", label: "Hinglish", native: "Hindi written in Latin characters" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ur", label: "Urdu", native: "اردو" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export function isLanguage(value: unknown): value is LanguageCode {
  return LANGUAGES.some((language) => language.code === value);
}

export function languageLabel(code: string): string {
  const found = LANGUAGES.find((language) => language.code === code);
  if (!found) return "English";
  return found.native === found.label ? found.label : `${found.label} (${found.native})`;
}

// --- tone ------------------------------------------------------------------

export const TONES = [
  { key: "professional", label: "Professional", hint: "Plain, correct, no small talk." },
  { key: "friendly", label: "Friendly", hint: "Warm and informal, still useful." },
  { key: "concise", label: "Concise", hint: "The shortest answer that is complete." },
  { key: "enthusiastic", label: "Enthusiastic", hint: "Upbeat. Suits retail, not support." },
  { key: "formal", label: "Formal", hint: "Deferential. Suits finance and legal." },
] as const;

export type ToneKey = (typeof TONES)[number]["key"];

export function isTone(value: unknown): value is ToneKey {
  return TONES.some((tone) => tone.key === value);
}

/**
 * The sentences about language and tone that go in front of the agent's
 * own instructions.
 *
 * Generated rather than typed into the prompt box, so changing the
 * dropdown actually changes what the model is told. A language picker that
 * only coloured a label would be the worst kind of setting: visible,
 * saved, and doing nothing.
 */
export function styleInstructions(input: {
  language: string;
  multilingual: boolean;
  tone: string;
}): string {
  const lines: string[] = [];

  const language = LANGUAGES.find((entry) => entry.code === input.language);
  if (language) {
    if (language.code === "hinglish") {
      lines.push(
        "Reply in Hinglish — Hindi written in Latin characters, the way the customer types it. Never answer in Devanagari script."
      );
    } else {
      lines.push(`Reply in ${language.label}.`);
    }
  }

  if (input.multilingual) {
    lines.push(
      "If the customer writes in a different language, answer in theirs instead — match the language of their last message."
    );
  }

  const tone = TONES.find((entry) => entry.key === input.tone);
  if (tone) lines.push(`Tone: ${tone.label.toLowerCase()}. ${tone.hint}`);

  return lines.join(" ");
}

// --- the checklist ---------------------------------------------------------

export interface CheckItem {
  key: string;
  /** What is true when it passes, in the present tense. */
  title: string;
  /** Why it matters — the reason somebody should care enough to fix it. */
  why: string;
  /** Which step to go and fix it on. */
  step: StepKey;
  done: boolean;
}

export interface AgentForCheck {
  name: string;
  systemPrompt: string;
  primaryLanguage: string;
  handoffKeywords: string[];
  offHoursMessage: string;
  workingHoursEnabled: boolean;
  useKnowledgeBase: boolean;
  knowledgeCount: number;
  /** Resolved on the server: an own key, or a platform key for this provider. */
  hasKey: boolean;
}

/**
 * What is done and what is not.
 *
 * Every item is something that changes how the agent behaves with a real
 * customer. Nothing is in here because it would be tidy — a checklist
 * padded with "give it a description" teaches people to ignore it, and
 * then the one item that matters is ignored too.
 */
export function checklist(agent: AgentForCheck): CheckItem[] {
  return [
    {
      key: "language",
      title: "Agent language is set",
      why: "Decides what your customers are answered in.",
      step: "persona",
      done: isLanguage(agent.primaryLanguage),
    },
    {
      key: "instructions",
      title: "Instructions are written",
      why: "Without them the model invents its own idea of your business.",
      step: "persona",
      // Short enough to be a placeholder nobody replaced is the same as
      // empty, so a length is checked rather than mere presence.
      done: agent.systemPrompt.trim().length >= 40,
    },
    {
      key: "key",
      title: "An API key is available",
      why: "No key means every customer gets an error instead of an answer.",
      step: "model",
      done: agent.hasKey,
    },
    {
      key: "knowledge",
      title: "It has something to answer from",
      why: "With no knowledge it can only talk in generalities about your products.",
      step: "knowledge",
      done: !agent.useKnowledgeBase || agent.knowledgeCount > 0,
    },
    {
      key: "handoff",
      title: "Handoff keywords are set",
      why: "A complaint that cannot reach a person is the one that becomes a review.",
      step: "safety",
      done: agent.handoffKeywords.length > 0,
    },
    {
      key: "offhours",
      title: "An after-hours reply is written",
      why: "Silence at 11pm reads as nobody being there at all.",
      step: "safety",
      done: !agent.workingHoursEnabled || agent.offHoursMessage.trim().length > 0,
    },
  ];
}

/** How many are done, and whether the agent is ready to be switched on. */
export function checkSummary(items: CheckItem[]): {
  done: number;
  total: number;
  ready: boolean;
  /** The first thing left to do, for the line under the list. */
  next: CheckItem | null;
} {
  const done = items.filter((item) => item.done).length;
  const next = items.find((item) => !item.done) ?? null;
  return { done, total: items.length, ready: done === items.length, next };
}

/** Which steps still have something outstanding, for the dots on the rail. */
export function stepsNeedingWork(items: CheckItem[]): Set<StepKey> {
  return new Set(items.filter((item) => !item.done).map((item) => item.step));
}
