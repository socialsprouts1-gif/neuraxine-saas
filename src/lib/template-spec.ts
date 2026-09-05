// Turning a template a person filled in on a form into the payload Meta
// accepts, and refusing the ones it would reject. Pure, so the rules can be
// tested without a Graph call — a template rejected by Meta costs a review
// cycle, so it is worth catching here.

export const TEMPLATE_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const HEADER_FORMATS = ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"] as const;
export type HeaderFormat = (typeof HEADER_FORMATS)[number];

export type ButtonSpec =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string };

export interface TemplateSpec {
  name: string;
  language: string;
  category: TemplateCategory;
  headerFormat: HeaderFormat;
  /** TEXT headers only. */
  headerText: string;
  /** Media headers only — the sample Meta reviews the template against. */
  headerMediaUrl: string;
  body: string;
  footer: string;
  buttons: ButtonSpec[];
  /** One example per {{n}} in the body, in order. Meta requires them. */
  samples: string[];
}

// Meta's own limits. Exceeding one is a rejection, not a truncation.
export const LIMITS = {
  name: 512,
  headerText: 60,
  body: 1024,
  footer: 60,
  buttonText: 25,
  quickReplies: 3,
  urlButtons: 2,
  phoneButtons: 1,
  buttons: 10,
} as const;

/** The {{1}}, {{2}} … placeholders in a string, in the order they appear. */
export function variablesIn(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const index = Number(match[1]);
    if (!found.includes(index)) found.push(index);
  }
  return found.sort((a, b) => a - b);
}

/**
 * A template name Meta will take: lowercase, digits and underscores only.
 *
 * Normalising rather than refusing, because "Order Update" is what a person
 * types and `order_update` is what it has to become — failing them over a
 * space they cannot see the significance of helps nobody.
 */
export function normaliseName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, LIMITS.name);
}

export type Validation = { ok: true } | { ok: false; errors: string[] };

/**
 * Everything Meta would reject, checked before the request is built.
 *
 * The messages name the field and the rule, because "invalid parameter" from
 * Graph after a 24-hour review is the worst possible way to learn any of it.
 */
export function validateTemplate(spec: TemplateSpec): Validation {
  const errors: string[] = [];

  if (!spec.name.trim()) errors.push("The template needs a name.");
  else if (!/^[a-z0-9_]+$/.test(spec.name)) {
    errors.push("The name can only use lowercase letters, numbers and underscores.");
  }

  if (!spec.language.trim()) errors.push("Pick a language.");

  const body = spec.body.trim();
  if (!body) errors.push("The body is the one part Meta requires.");
  if (body.length > LIMITS.body) {
    errors.push(`The body is ${body.length} characters; Meta allows ${LIMITS.body}.`);
  }

  // A body that is only a variable carries no message of its own, and Meta
  // rejects it every time.
  if (body && body.replace(/\{\{\s*\d+\s*\}\}/g, "").trim().length === 0) {
    errors.push("The body cannot be only variables — it needs words around them.");
  }

  const bodyVariables = variablesIn(body);
  // Meta requires {{1}}..{{n}} with no gaps: {{1}} and {{3}} is a rejection.
  bodyVariables.forEach((value, index) => {
    if (value !== index + 1) {
      errors.push(
        `Variables must run 1, 2, 3 with no gaps — found {{${value}}} where {{${index + 1}}} was expected.`
      );
    }
  });

  const filledSamples = spec.samples.filter((sample) => sample.trim());
  if (bodyVariables.length > 0 && filledSamples.length < bodyVariables.length) {
    errors.push(
      `Give an example for each variable — Meta reviews the template with them filled in (${filledSamples.length} of ${bodyVariables.length}).`
    );
  }

  if (spec.headerFormat === "TEXT") {
    const header = spec.headerText.trim();
    if (!header) errors.push("A text header cannot be empty.");
    if (header.length > LIMITS.headerText) {
      errors.push(`The header is ${header.length} characters; Meta allows ${LIMITS.headerText}.`);
    }
    if (variablesIn(header).length > 1) {
      errors.push("A header can hold at most one variable.");
    }
  }

  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(spec.headerFormat) && !spec.headerMediaUrl.trim()) {
    errors.push("A media header needs a sample file URL for Meta to review.");
  }

  if (spec.footer.trim().length > LIMITS.footer) {
    errors.push(`The footer is over ${LIMITS.footer} characters.`);
  }
  if (variablesIn(spec.footer).length > 0) {
    errors.push("A footer cannot contain variables.");
  }

  const quickReplies = spec.buttons.filter((button) => button.type === "QUICK_REPLY");
  const urls = spec.buttons.filter((button) => button.type === "URL");
  const phones = spec.buttons.filter((button) => button.type === "PHONE_NUMBER");

  if (spec.buttons.length > LIMITS.buttons) {
    errors.push(`At most ${LIMITS.buttons} buttons.`);
  }
  if (quickReplies.length > LIMITS.quickReplies) {
    errors.push(`At most ${LIMITS.quickReplies} quick replies.`);
  }
  if (urls.length > LIMITS.urlButtons) errors.push(`At most ${LIMITS.urlButtons} link buttons.`);
  if (phones.length > LIMITS.phoneButtons) {
    errors.push(`At most ${LIMITS.phoneButtons} call button.`);
  }
  // Meta will not accept quick replies interleaved with action buttons.
  if (quickReplies.length > 0 && urls.length + phones.length > 0) {
    const firstAction = spec.buttons.findIndex((button) => button.type !== "QUICK_REPLY");
    const lastQuickReply = spec.buttons.map((b) => b.type).lastIndexOf("QUICK_REPLY");
    if (firstAction !== -1 && lastQuickReply > firstAction) {
      errors.push("Put all the quick replies together, before the link and call buttons.");
    }
  }

  for (const button of spec.buttons) {
    if (!button.text.trim()) errors.push("Every button needs a label.");
    else if (button.text.length > LIMITS.buttonText) {
      errors.push(`"${button.text}" is over ${LIMITS.buttonText} characters.`);
    }
    if (button.type === "URL" && !/^https?:\/\/\S+$/.test(button.url.trim())) {
      errors.push(`"${button.text}" needs a URL starting with https://`);
    }
    if (button.type === "PHONE_NUMBER" && !/^\+?[0-9]{6,20}$/.test(button.phone_number.trim())) {
      errors.push(`"${button.text}" needs a phone number in international format.`);
    }
  }

  if (spec.category === "AUTHENTICATION" && urls.length + phones.length > 0) {
    errors.push("Authentication templates cannot carry link or call buttons.");
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export interface MetaComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  example?: Record<string, unknown>;
  buttons?: Array<Record<string, unknown>>;
}

/**
 * The components array as Meta wants it.
 *
 * Examples are nested differently per component — header_text and
 * header_handle are arrays of values, body_text is an array of arrays —
 * and getting that wrong is a 400 that names no field.
 */
export function buildComponents(spec: TemplateSpec, headerHandle?: string): MetaComponent[] {
  const components: MetaComponent[] = [];

  if (spec.headerFormat === "TEXT" && spec.headerText.trim()) {
    const header: MetaComponent = {
      type: "HEADER",
      format: "TEXT",
      text: spec.headerText.trim(),
    };
    if (variablesIn(spec.headerText).length > 0) {
      header.example = { header_text: [spec.samples[0]?.trim() || "example"] };
    }
    components.push(header);
  } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(spec.headerFormat)) {
    // header_handle is a handle from Meta's Resumable Upload API, never a
    // URL — Meta does not fetch links here. The caller uploads the sample
    // and passes the handle in; the URL is only ever a fallback for
    // rendering a preview, and Meta rejects it with a bare "Invalid
    // parameter (code 100)" that names no field.
    components.push({
      type: "HEADER",
      format: spec.headerFormat,
      example: { header_handle: [headerHandle ?? spec.headerMediaUrl.trim()] },
    });
  }

  const body: MetaComponent = { type: "BODY", text: spec.body.trim() };
  const count = variablesIn(spec.body).length;
  if (count > 0) {
    body.example = {
      body_text: [spec.samples.slice(0, count).map((sample) => sample.trim() || "example")],
    };
  }
  components.push(body);

  if (spec.footer.trim()) {
    components.push({ type: "FOOTER", text: spec.footer.trim() });
  }

  if (spec.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: spec.buttons.map((button) => {
        if (button.type === "URL") {
          return { type: "URL", text: button.text.trim(), url: button.url.trim() };
        }
        if (button.type === "PHONE_NUMBER") {
          return {
            type: "PHONE_NUMBER",
            text: button.text.trim(),
            phone_number: button.phone_number.trim(),
          };
        }
        return { type: "QUICK_REPLY", text: button.text.trim() };
      }),
    });
  }

  return components;
}

/** A stored template row, as loose as it arrives from the database. */
export interface StoredTemplate {
  name: string;
  language: string;
  category: string;
  header_format?: string | null;
  header_text?: string | null;
  header_media_url?: string | null;
  body_text?: string | null;
  footer_text?: string | null;
  buttons?: unknown;
  variable_samples?: string[] | null;
}

function readStoredButtons(raw: unknown): ButtonSpec[] {
  if (!Array.isArray(raw)) return [];

  const buttons: ButtonSpec[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const button = entry as Record<string, unknown>;
    const text = typeof button.text === "string" ? button.text : "";

    if (button.type === "URL") {
      buttons.push({ type: "URL", text, url: typeof button.url === "string" ? button.url : "" });
    } else if (button.type === "PHONE_NUMBER") {
      buttons.push({
        type: "PHONE_NUMBER",
        text,
        phone_number: typeof button.phone_number === "string" ? button.phone_number : "",
      });
    } else if (button.type === "QUICK_REPLY") {
      buttons.push({ type: "QUICK_REPLY", text });
    }
  }
  return buttons;
}

/**
 * Rebuilds the builder's state from a saved row.
 *
 * The parts are stored separately for exactly this — a template that Meta
 * refused is worth more as a draft you can correct than as a row you can
 * only delete and retype. A template synced from WhatsApp Manager has no
 * parts saved, so it opens with whatever is there and nothing invented.
 */
export function specFromRow(row: StoredTemplate): TemplateSpec {
  const headerFormat = HEADER_FORMATS.includes(row.header_format as HeaderFormat)
    ? (row.header_format as HeaderFormat)
    : "NONE";

  return {
    name: row.name ?? "",
    language: row.language || "en_US",
    category: (["MARKETING", "UTILITY", "AUTHENTICATION"].includes(row.category)
      ? row.category
      : "UTILITY") as TemplateSpec["category"],
    headerFormat,
    headerText: row.header_text ?? "",
    headerMediaUrl: row.header_media_url ?? "",
    body: row.body_text ?? "",
    footer: row.footer_text ?? "",
    buttons: readStoredButtons(row.buttons),
    samples: Array.isArray(row.variable_samples) ? row.variable_samples : [],
  };
}

/** Substitutes {{1}}, {{2}} … for a preview or an outgoing send. */
export function fillVariables(text: string, values: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, index: string) => {
    const value = values[Number(index) - 1];
    return value?.trim() ? value : whole;
  });
}
