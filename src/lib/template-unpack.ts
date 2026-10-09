// Reading a template Meta already holds back into the columns this app
// sends from.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Sync pulled the whole component array off Meta, stored it in
// components_json, and wrote nothing into body_text, header_format or
// header_text. Everything that actually sends reads those columns — the
// campaign validator counts the body's variables to decide how many
// values to ask for, and the dispatcher counts them again to decide how
// many parameters to send. With the columns empty both counted zero, so
// a template created in WhatsApp Manager with one variable in it was
// queued without a value and sent without a parameter, and Meta refused
// every recipient with 132000: "number of localizable_params (0) does
// not match the expected number of params (1)".
//
// The same emptiness silently disarmed the media-header check: a synced
// template with an image header has header_format null here, so no
// header component is built and Meta refuses the whole message.

export interface MetaComponentLike {
  type?: string;
  format?: string;
  text?: string;
  [key: string]: unknown;
}

export interface TemplateFields {
  bodyText: string;
  /** "NONE" when the template has no header at all. */
  headerFormat: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  /** Only meaningful for a TEXT header. */
  headerText: string | null;
  footerText: string | null;
}

const HEADER_FORMATS = new Set(["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"]);

function asComponents(value: unknown): MetaComponentLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is MetaComponentLike => Boolean(entry) && typeof entry === "object"
  );
}

/**
 * Unpacks Meta's components into the fields the sender reads.
 *
 * Tolerant on purpose: this runs over whatever Meta returns for every
 * template in an account, and one template with an unexpected shape must
 * not stop the rest syncing. Anything unrecognised comes back as the
 * empty default rather than throwing.
 */
export function templateFieldsFromComponents(components: unknown): TemplateFields {
  const fields: TemplateFields = {
    bodyText: "",
    headerFormat: "NONE",
    headerText: null,
    footerText: null,
  };

  for (const component of asComponents(components)) {
    const type = String(component.type ?? "").toUpperCase();
    const text = typeof component.text === "string" ? component.text : "";

    if (type === "BODY") {
      fields.bodyText = text;
      continue;
    }

    if (type === "FOOTER") {
      fields.footerText = text || null;
      continue;
    }

    if (type === "HEADER") {
      const format = String(component.format ?? "").toUpperCase();
      // A header with no format but with text is a text header — Meta has
      // returned both shapes over the years.
      const resolved = HEADER_FORMATS.has(format) ? format : text ? "TEXT" : "NONE";
      fields.headerFormat = resolved as TemplateFields["headerFormat"];
      fields.headerText = resolved === "TEXT" ? text || null : null;
    }
  }

  return fields;
}

/**
 * The header formats the message_templates column will accept.
 *
 * There is a check constraint on it, so writing anything else fails the
 * whole upsert — and since sync upserts in a loop, one template with a
 * location header would stop every other template on the account from
 * syncing. LOCATION is reported honestly by the unpacker and flattened
 * to NONE here: this app has nowhere to store a latitude, so it could
 * not send that template either way, and losing one template's header
 * beats losing the whole sync.
 */
export function storableHeaderFormat(
  format: TemplateFields["headerFormat"]
): "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" {
  return format === "LOCATION" ? "NONE" : format;
}

/**
 * Whether unpacking would change what is stored.
 *
 * Sync runs over every template on every account, and rewriting rows that
 * already agree is churn nobody asked for — and, more importantly, it
 * would overwrite a body somebody edited here with Meta's copy on every
 * sync. Only an empty or disagreeing column is filled in.
 */
export function needsUnpacking(
  stored: { body_text?: string | null; header_format?: string | null },
  fields: TemplateFields
): boolean {
  const storedBody = (stored.body_text ?? "").trim();
  const storedHeader = (stored.header_format ?? "").trim().toUpperCase();

  if (!storedBody && fields.bodyText) return true;
  if (!storedHeader && fields.headerFormat !== "NONE") return true;
  return false;
}

export interface StoredTemplateRow {
  body_text?: string | null;
  header_format?: string | null;
  header_text?: string | null;
  header_media_url?: string | null;
  /** What Meta returned for this template, stored verbatim on sync. */
  components_json?: unknown;
}

export interface ResolvedShape {
  bodyText: string;
  headerFormat: string | null;
  headerText: string | null;
  headerMediaUrl: string | null;
}

/**
 * The shape to send, taking Meta's own copy over ours.
 *
 * The send has to match what Meta holds exactly — one declared body
 * variable must be sent one parameter — so where the two disagree, Meta
 * is right by definition. components_json is what Meta returned; the
 * body_text column is a local convenience that several paths write and
 * one path (sync, until recently) did not.
 *
 * Reading the authoritative column directly is what makes this fix work
 * on rows that already exist. Filling body_text in on the next sync
 * repairs the data; this repairs the send, now, whether or not anybody
 * presses Sync — which matters because until they do, every campaign
 * against a template made in WhatsApp Manager fails for every recipient.
 *
 * header_media_url has no counterpart at Meta — the URL of the image to
 * send is ours, and Meta only reports that a header exists — so it is
 * always taken from the row.
 */
export function resolveTemplateShape(row: StoredTemplateRow): ResolvedShape {
  const stored = {
    bodyText: (row.body_text ?? "").trim(),
    headerFormat: row.header_format ?? null,
    headerText: row.header_text ?? null,
    headerMediaUrl: row.header_media_url ?? null,
  };

  const fromMeta = templateFieldsFromComponents(row.components_json);

  // Nothing came back from Meta for this template — one created in this
  // app, or a row from before components were stored. Ours is all there is.
  if (!fromMeta.bodyText && fromMeta.headerFormat === "NONE") return stored;

  return {
    bodyText: fromMeta.bodyText || stored.bodyText,
    headerFormat:
      fromMeta.headerFormat === "NONE" ? stored.headerFormat : fromMeta.headerFormat,
    headerText: fromMeta.headerFormat === "TEXT" ? fromMeta.headerText : stored.headerText,
    headerMediaUrl: stored.headerMediaUrl,
  };
}

/**
 * Where the copy-code button is, in a template that has one.
 *
 * Authentication templates carry a button whose "link" is the code itself,
 * and sending one means naming that button by its position. Meta refuses a
 * button component aimed at a template with no buttons, and refuses a
 * template with a button sent none — so this reads the answer out of what
 * Meta returned for the template rather than asking anybody to keep a
 * setting in step with it.
 *
 * null means there is no such button, which is a complete answer: a
 * code-only authentication template is perfectly valid and is sent with
 * just its body.
 */
export function otpButtonIndex(components: unknown): number | null {
  for (const component of asComponents(components)) {
    if (String(component.type ?? "").toUpperCase() !== "BUTTONS") continue;

    const buttons = Array.isArray(component.buttons) ? component.buttons : [];
    for (let index = 0; index < buttons.length; index += 1) {
      const button = buttons[index] as { type?: unknown } | null;
      if (!button || typeof button !== "object") continue;
      if (String(button.type ?? "").toUpperCase() === "OTP") return index;
    }
  }

  return null;
}
