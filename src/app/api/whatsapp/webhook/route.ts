import crypto from "node:crypto";
import {
  extractWebhookValues,
  isWhatsAppConfigured,
  markAsRead,
  sendText,
  type IncomingMessage,
  type WebhookPayload,
} from "@/lib/whatsapp";

/**
 * WhatsApp Cloud API webhook.
 *
 *   GET   verification handshake (Meta calls this once when you save the URL)
 *   POST  delivery of incoming messages and status updates
 *
 * Configure this endpoint in the Meta App dashboard under
 * WhatsApp → Configuration → Webhook:
 *   Callback URL: https://<your-domain>/api/whatsapp/webhook
 *   Verify token: value of WHATSAPP_VERIFY_TOKEN
 *   Subscribe to the "messages" field.
 */

// Always run on the server at request time; never cache or prerender.
export const dynamic = "force-dynamic";

/** Meta's verification handshake. */
export function GET(request: Request): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    // Echo the challenge back as plain text to confirm the subscription.
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

/**
 * Validate the X-Hub-Signature-256 header against the raw request body using
 * the app secret. Returns true when no app secret is configured (verification
 * is then skipped) so local development still works.
 */
function verifySignature(rawBody: string, signature: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true; // verification disabled
  if (!signature) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  for (const value of extractWebhookValues(payload)) {
    for (const message of value.messages ?? []) {
      await handleIncomingMessage(message);
    }
    for (const status of value.statuses ?? []) {
      // Delivery lifecycle: sent → delivered → read (or failed). Persist these
      // to power campaign analytics once a datastore is wired up.
      console.info(
        `[whatsapp] status ${status.status} for ${status.id} → ${status.recipient_id}`,
      );
    }
  }

  // Always 200 quickly; Meta retries on non-2xx and disables flaky webhooks.
  return new Response("OK", { status: 200 });
}

async function handleIncomingMessage(message: IncomingMessage): Promise<void> {
  const preview =
    message.type === "text" ? message.text?.body ?? "" : `[${message.type}]`;
  console.info(`[whatsapp] message from ${message.from}: ${preview}`);

  if (!isWhatsAppConfigured()) return;

  // Acknowledge with a read receipt so the sender sees blue ticks.
  await markAsRead(message.id).catch(() => undefined);

  // Optional auto-reply, controlled by env so it can be disabled in production
  // once a real chatbot/inbox handles replies.
  const autoReply = process.env.WHATSAPP_AUTO_REPLY_MESSAGE;
  if (autoReply && message.type === "text") {
    await sendText(message.from, autoReply).catch((err) =>
      console.error("[whatsapp] auto-reply failed", err),
    );
  }
}
