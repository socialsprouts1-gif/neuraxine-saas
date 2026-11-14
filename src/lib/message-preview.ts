// Turning a stored message back into words.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// A message is stored as the type-specific payload Meta sent or we built,
// so nothing can just read `.body`. Two copies of this logic had grown —
// one for the thread and the conversation list, one for the AI copilot —
// and they had already drifted: the copilot could read a template message
// and the inbox could not read an image caption.
//
// The case that matters most here is `template`. A campaign that went out
// to twenty people used to store nothing at all, and once it did store
// something, the inbox showed "Template: neurachat__whatsapp_automation"
// — the name of the file, not the sentence the customer received. The
// person looking at this screen wants to know what was actually said.

export interface MessageLike {
  type: string;
  content: Record<string, unknown>;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The words of a message, for a thread bubble or a list preview.
 *
 * Never empty-handed: an unknown type still says what kind of thing
 * arrived, because a blank row in the inbox reads as a bug.
 */
export function renderMessageBody(type: string, content: Record<string, unknown>): string {
  const kind = (type || "").toLowerCase();

  if (kind === "text") return asText(content.body);

  if (kind === "template") {
    // The filled-in message, if we recorded it — which is what was
    // actually delivered, variables and all. The template's own name is
    // the fallback, and it is a poor one: nobody reads
    // "order_update_v2_final" as a sentence.
    const body = asText(content.body);
    if (body) return body;
    const name = asText(content.template_name);
    return name ? `Template: ${name}` : "[template]";
  }

  if (kind === "image" || kind === "video" || kind === "document" || kind === "audio") {
    const caption = asText(content.caption);
    return caption ? `[${kind}] ${caption}` : `[${kind}]`;
  }

  if (kind === "interactive" || kind === "button") {
    const c = content as {
      body?: unknown;
      button_reply?: { title?: unknown };
      list_reply?: { title?: unknown };
    };
    // Inbound: the customer tapped something, so the title is the message.
    // Outbound: we sent the choices, so the body is.
    return (
      asText(c.button_reply?.title) ||
      asText(c.list_reply?.title) ||
      asText(c.body) ||
      "[interactive]"
    );
  }

  if (kind === "location") {
    const name = asText(content.name) || asText(content.address);
    return name ? `[location] ${name}` : "[location]";
  }

  if (kind === "reaction") {
    const emoji = asText(content.emoji);
    return emoji ? `Reacted ${emoji}` : "[reaction]";
  }

  if (kind === "order") return "[order]";

  return kind ? `[${kind}]` : "[message]";
}

/**
 * The same words, for somewhere that is not the inbox — the AI copilot
 * reading back a conversation, a search index, an export.
 *
 * Differs from renderMessageBody in one way only: a placeholder is
 * parenthesised rather than bracketed, because it is being read as prose
 * rather than shown as a row.
 */
export function plainMessageText(type: string, content: Record<string, unknown>): string {
  const rendered = renderMessageBody(type, content);
  return rendered.replace(/^\[([^\]]+)\]\s*/, (_whole, kind: string) => `(${kind}) `).trim();
}

/** Quick-reply buttons attached to a message, in Meta's {id, title} shape. */
export function renderButtons(content: Record<string, unknown>): string[] {
  const buttons = (content as { buttons?: Array<{ title?: unknown }> }).buttons;
  if (!Array.isArray(buttons)) return [];
  return buttons.map((button) => asText(button?.title)).filter(Boolean);
}

/**
 * What to store as an outbound template message's content.
 *
 * `body` is the filled-in text, so the inbox can show what was sent
 * without re-resolving the template and its variables months later — by
 * which time the template may have been edited or deleted.
 */
export function templateMessageContent(input: {
  templateName: string;
  language: string;
  body: string;
  /** What the campaign or automation was called, when it came from one. */
  source?: string;
}): Record<string, unknown> {
  const content: Record<string, unknown> = {
    template_name: input.templateName,
    language: input.language,
  };
  const body = asText(input.body);
  if (body) content.body = body;
  const source = asText(input.source);
  if (source) content.source = source;
  return content;
}
