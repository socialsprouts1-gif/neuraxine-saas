import { processInbound } from "@/lib/automation";

/**
 * Simulate an inbound WhatsApp message — drives the same engine the real
 * webhook uses. Handy for demos and for testing automations without sending a
 * real message from a phone.
 *
 *   POST /api/whatsapp/simulate
 *   { "phone": "919812345670", "name": "Priya", "text": "menu" }
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: { phone?: string; name?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const phone = body.phone?.replace(/[^\d]/g, "");
  if (!phone || !body.text) {
    return Response.json(
      { ok: false, error: "`phone` and `text` are required" },
      { status: 400 },
    );
  }

  const { contact, reply } = await processInbound(phone, body.text, body.name);
  return Response.json({
    ok: true,
    contactId: contact.id,
    reply: reply ? { text: reply.text, via: reply.via } : null,
  });
}
