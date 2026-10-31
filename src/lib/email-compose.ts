// Turning what somebody typed into what a mailbox receives.
//
// Pure, and deliberately narrow. A template is a subject, some paragraphs
// and at most one button — not HTML. The shell around it (the banner, the
// table scaffolding Outlook needs, the footer, the unsubscribe) is built
// in code, and a template that could put markup inside that shell would be
// a template that can break every client it renders in. So the body is
// escaped and split on blank lines, and that is the whole language.

/** Everything a template may refer to, with what it means on screen. */
export const VARIABLES: { key: string; means: string }[] = [
  { key: "workspace", means: "The workspace's name" },
  { key: "email", means: "The address it is going to" },
  { key: "brand", means: "This product's name" },
  { key: "app_url", means: "The dashboard's address" },
  { key: "price", means: "The cheapest monthly plan" },
  { key: "plan", means: "Their plan's name, where there is one" },
  { key: "days_left", means: "Days remaining, on a countdown" },
  { key: "days_since", means: "Days since a trial ended" },
  { key: "renews_on", means: "The date a plan renews" },
  { key: "trial_days", means: "How long the free trial is" },
  { key: "bot_name", means: "The bot they just built" },
  { key: "amount", means: "What was paid" },
];

const KNOWN = new Set(VARIABLES.map((row) => row.key));

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Substitute the placeholders.
 *
 * An unknown name becomes nothing at all rather than being left in place.
 * `{{frist_name}}` sitting in a customer's inbox is worse than a gap: the
 * gap reads as a slightly terse sentence, the placeholder reads as a
 * company that does not test its own mail. The screen warns about it
 * before the send, which is where a typo should be caught.
 *
 * A value that is missing for this particular recipient — no plan name on
 * a workspace that never had one — is the same case and gets the same
 * treatment.
 */
export function fillIn(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(PLACEHOLDER, (_whole, name: string) => values[name]?.trim() || "");
}

/** Placeholders the product cannot fill, so the author can be told. */
export function unknownVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (!KNOWN.has(match[1])) found.add(match[1]);
  }
  return [...found].sort();
}

/**
 * Paragraphs, from blank lines.
 *
 * A single newline is kept as a line break inside the paragraph, because
 * people type addresses and short lists that way and collapsing them into
 * a run-on sentence is not what they meant.
 */
export function paragraphs(body: string): string[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export interface TemplateDraft {
  name: string;
  subject: string;
  body: string;
  actionLabel?: string | null;
  actionPath?: string | null;
}

/** What is wrong with a template, or null. One sentence, the worst first. */
export function templateProblem(draft: TemplateDraft): string | null {
  if (!draft.name.trim()) return "Give the template a name so you can find it again.";
  if (!draft.subject.trim()) return "A message with no subject line is filed as spam by most clients.";
  if (draft.subject.length > 200) return "That subject line is too long — keep it under 200 characters.";
  if (!draft.body.trim()) return "The message has no body.";

  const label = draft.actionLabel?.trim();
  const path = draft.actionPath?.trim();

  // Half a button is the failure that looks like it worked: the message
  // sends, and the one thing it was asking the reader to do is missing.
  if (label && !path) return "The button has a label but nowhere to go. Add a link, or clear the label.";
  if (path && !label) return "The button has a link but no label. Add one, or clear the link.";

  if (path && !path.startsWith("/")) {
    return "The button's link has to start with / — it is a path inside the app, like /billing, so it keeps working if the domain changes.";
  }

  const unknown = [...unknownVariables(draft.subject), ...unknownVariables(draft.body)];
  if (unknown.length > 0) {
    return `Nothing can fill in ${unknown.map((name) => `{{${name}}}`).join(", ")}, so it would arrive blank. Check the spelling against the list of what you can use.`;
  }

  return null;
}

/** A URL-safe slug for a new template, from its name. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "template";
}

/**
 * The first line of the message, for the preview strip beside a subject.
 *
 * Built from the body rather than written separately: one more field to
 * fill in is one more field left empty, and an empty preheader means the
 * client shows whatever text comes first — usually the logo's alt text.
 */
export function preheaderFrom(body: string): string {
  const first = paragraphs(body)[0] ?? "";
  return first.replace(/\s+/g, " ").slice(0, 140);
}
