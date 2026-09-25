// The parameters a template send has to carry.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Meta validates this shape exactly. A template declaring one body
// variable must be sent one body parameter — two is a 400, none is a
// different 400 — and a template with an image header must be sent a
// header component holding that image. There is no leniency and no
// partial send: the whole message is refused.
//
// The header half of that was missing. Campaigns built a body component
// and nothing else, so every template with a media header failed for
// every recipient, which looks from the outside like "campaigns do not
// work" rather than "this template needs its picture".

import { variablesIn } from "./template-spec.ts";
import type { MetaTemplateComponent } from "@/lib/meta-whatsapp";

export type HeaderFormat = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

/** The media formats, whose parameter is a link rather than text. */
const MEDIA: Record<string, "image" | "video" | "document"> = {
  IMAGE: "image",
  VIDEO: "video",
  DOCUMENT: "document",
};

export interface TemplateShape {
  bodyText: string;
  headerFormat?: string | null;
  headerText?: string | null;
  /** Where the header image, video or document is hosted. */
  headerMediaUrl?: string | null;
}

export type BuildResult =
  | { ok: true; components: MetaTemplateComponent[] }
  | { ok: false; error: string };

/**
 * Everything the send needs, or the reason it cannot be built.
 *
 * Refusing here rather than letting Meta refuse is the point. Meta answers
 * a missing header image with "Parameter format does not match format in
 * the created template", which names neither the header nor the template,
 * and arrives once per recipient.
 */
export function buildTemplateComponents(
  template: TemplateShape,
  variables: readonly string[] = []
): BuildResult {
  const components: MetaTemplateComponent[] = [];
  const format = (template.headerFormat ?? "NONE").toUpperCase();

  const media = MEDIA[format];
  if (media) {
    const link = (template.headerMediaUrl ?? "").trim();

    if (!link) {
      return {
        ok: false,
        error: `This template has ${
          media === "image" ? "an" : "a"
        } ${media} header, but no ${media} has been saved against it. Open the template, add the ${media} URL, and send again — Meta refuses the whole message without it.`,
      };
    }

    if (!/^https:\/\//i.test(link)) {
      return {
        ok: false,
        error: `The ${media} on this template is not an https:// address, and Meta will not fetch it. Upload it in Gallery and use the link from there.`,
      };
    }

    components.push({
      type: "header",
      parameters: [{ type: media, [media]: { link } }],
    });
  } else if (format === "TEXT") {
    // A text header may carry one variable. Meta numbers header and body
    // variables separately, so its {{1}} is not the body's {{1}}.
    const slots = variablesIn(template.headerText ?? "").length;
    if (slots > 0) {
      components.push({
        type: "header",
        parameters: Array.from({ length: slots }, (_, index) => ({
          type: "text",
          text: variables[index]?.trim() || " ",
        })),
      });
    }
  }

  // Body variables are filled from the start of the list. A text header
  // that consumed some would make this wrong, but Meta allows exactly one
  // header variable and the builder stores body values separately, so the
  // list is the body's own.
  const bodySlots = variablesIn(template.bodyText ?? "").length;
  if (bodySlots > 0) {
    components.push({
      type: "body",
      parameters: Array.from({ length: bodySlots }, (_, index) => ({
        type: "text",
        text: variables[index]?.trim() || " ",
      })),
    });
  }

  return { ok: true, components };
}

/**
 * Whether this template can be sent at all right now.
 *
 * Used before a campaign starts, so a run that cannot succeed is stopped
 * at one clear message instead of failing every recipient one at a time —
 * and campaign_recipients has no un-fail, so those people would otherwise
 * be permanently recorded as attempted.
 */
export function templateSendable(template: TemplateShape): string | null {
  const result = buildTemplateComponents(template, []);
  return result.ok ? null : result.error;
}
