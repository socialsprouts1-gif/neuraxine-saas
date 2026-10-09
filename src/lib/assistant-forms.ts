import { formMarkerPattern } from "./assistant-forms-pattern.ts";

// Letting the AI assistant hand someone a form.
//
// The assistant talks to three different providers, each with its own
// function-calling shape, and none of them worth three implementations for
// one action. So the assistant asks for a form the way it says everything
// else — in the text — using a marker the business never sees.
//
// The model writes:
//
//   Of course, I can book you in.
//   [[form: Book an appointment]]
//
// and this strips the marker, leaving the sentence to send and the name of
// the form to send after it.
//
// The assistant may only name a form the business attached to it. A model
// inventing a form name gets nothing sent, which is the right failure: the
// customer still receives the sentence.

export interface FormOffer {
  /** What to send as text. May be empty if the model wrote only a marker. */
  text: string;
  /** The form the assistant asked for, exactly as the business named it. */
  formName: string | null;
}

/**
 * Splits a generated reply into the message and the form it asked for.
 *
 * `allowed` is matched case-insensitively and on trimmed names, because a
 * model reproduces a name from a list with roughly that much fidelity and
 * refusing over capitalisation helps nobody.
 */
export function readFormOffer(reply: string, allowed: readonly string[]): FormOffer {
  const lookup = new Map(allowed.map((name) => [name.trim().toLowerCase(), name]));

  let formName: string | null = null;
  const text = reply
    .replace(formMarkerPattern(), (_match, requested: string) => {
      // First valid marker wins. A model that emits two is confused, and
      // sending two forms at once is worse than sending one.
      if (!formName) {
        const matched = lookup.get(requested.trim().toLowerCase());
        if (matched) formName = matched;
      }
      return "";
    })
    // The marker usually sits on its own line, which leaves a gap behind.
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, formName };
}

/**
 * The part of the system prompt that tells the assistant what it may send.
 *
 * Empty when no forms are attached, so an assistant without them is never
 * told about a capability it does not have — which is how a model ends up
 * promising a form that never arrives.
 */
export function formInstructions(
  forms: ReadonlyArray<{ name: string; description?: string | null }>
): string {
  if (forms.length === 0) return "";

  const lines = forms.map((form) =>
    form.description?.trim()
      ? `- "${form.name}" — ${form.description.trim()}`
      : `- "${form.name}"`
  );

  return [
    "",
    "Forms you can open for the customer:",
    ...lines,
    "",
    "To send one, write your sentence and then put the marker on its own line:",
    "[[form: exact name from the list]]",
    "",
    "Rules for forms:",
    "- Only ever a name from that list, copied exactly. Never invent one.",
    "- One form at a time, and only when the customer actually wants that thing.",
    "- Say what you are sending in your own words first; the marker is not shown to them.",
    "- Do not describe the fields or ask the questions yourself — the form does that.",
  ].join("\n");
}
