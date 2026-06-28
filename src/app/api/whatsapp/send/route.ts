import {
  isWhatsAppConfigured,
  sendTemplate,
  sendText,
  type TemplateComponent,
} from "@/lib/whatsapp";

/**
 * Send a WhatsApp message through the Cloud API.
 *
 *   POST /api/whatsapp/send
 *
 * Body (text message):
 *   { "to": "15551234567", "type": "text", "body": "Hello!", "previewUrl": false }
 *
 * Body (template message):
 *   {
 *     "to": "15551234567",
 *     "type": "template",
 *     "template": "appointment_reminder",
 *     "language": "en_US",
 *     "components": [ ... ]   // optional
 *   }
 *
 * `to` must be in international format (digits only, no "+", no spaces).
 *
 * Note: this endpoint is unauthenticated for now since the portal has no auth
 * layer yet. Put it behind session/API-key auth before exposing it publicly.
 */

export const dynamic = "force-dynamic";

interface SendBody {
  to?: string;
  type?: "text" | "template";
  body?: string;
  previewUrl?: boolean;
  template?: string;
  language?: string;
  components?: TemplateComponent[];
}

export async function POST(request: Request): Promise<Response> {
  if (!isWhatsAppConfigured()) {
    return Response.json(
      {
        ok: false,
        error:
          "WhatsApp Cloud API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
      },
      { status: 503 },
    );
  }

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const to = body.to?.replace(/[^\d]/g, "");
  if (!to) {
    return Response.json(
      { ok: false, error: "`to` is required (international format, digits only)" },
      { status: 400 },
    );
  }

  const type = body.type ?? "text";

  if (type === "text") {
    if (!body.body) {
      return Response.json(
        { ok: false, error: "`body` is required for text messages" },
        { status: 400 },
      );
    }
    const result = await sendText(to, body.body, { previewUrl: body.previewUrl });
    return Response.json(result, { status: result.ok ? 200 : 502 });
  }

  if (type === "template") {
    if (!body.template) {
      return Response.json(
        { ok: false, error: "`template` is required for template messages" },
        { status: 400 },
      );
    }
    const result = await sendTemplate(
      to,
      body.template,
      body.language ?? "en_US",
      body.components,
    );
    return Response.json(result, { status: result.ok ? 200 : 502 });
  }

  return Response.json(
    { ok: false, error: `Unsupported message type: ${type}` },
    { status: 400 },
  );
}
