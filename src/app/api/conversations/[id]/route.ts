import { sendOutbound } from "@/lib/automation";
import {
  getContact,
  getMessages,
  markConversationRead,
  db,
  ensureLoaded,
  persist,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  await ensureLoaded();
  const { id } = await ctx.params;
  const conv = db().conversations.find((c) => c.id === id);
  if (!conv) return Response.json({ ok: false, error: "Not found" }, { status: 404 });

  markConversationRead(id);
  await persist();
  return Response.json({
    conversation: conv,
    contact: getContact(conv.contactId),
    messages: getMessages(id),
  });
}

/** Send a manual reply from the team inbox. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  await ensureLoaded();
  const { id } = await ctx.params;
  const conv = db().conversations.find((c) => c.id === id);
  if (!conv) return Response.json({ ok: false, error: "Not found" }, { status: 404 });

  const contact = getContact(conv.contactId);
  if (!contact) return Response.json({ ok: false, error: "Contact missing" }, { status: 404 });

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.text) return Response.json({ ok: false, error: "`text` is required" }, { status: 400 });

  const message = await sendOutbound(contact, body.text, { via: "manual" });
  await persist();
  return Response.json({ ok: true, message });
}
