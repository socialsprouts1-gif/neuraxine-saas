import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleComment } from "@/lib/instagram-comments";
import { handleDirectMessage } from "@/lib/instagram-dm";
import { parseDirectMessage, parsePostbacks } from "@/lib/instagram";
import { handlePostback } from "@/lib/instagram-postback";

// Where Instagram delivers comments and direct messages.
//
// One URL for every customer: Instagram webhooks are configured on the
// app, not per account, so each delivery says which Instagram account it
// is about and this looks up whose workspace that is. That is the
// opposite of the WhatsApp side, where each connection carries its own
// verify token, and it is why the token here is an environment variable.
//
// Answers 200 to everything it can parse. Meta retries a non-200 with
// backoff and eventually disables the subscription, so a bug in handling
// one comment must not take the whole channel down — the work happens
// after the response, and failures land in the log instead.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta's subscription handshake.
 *
 * It sends the verify token you typed into the dashboard and expects the
 * challenge echoed back as plain text. A JSON body here fails with a
 * message that does not explain itself.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    console.error("INSTAGRAM_WEBHOOK_VERIFY_TOKEN is not set");
    return new NextResponse("Not configured", { status: 500 });
  }

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  // Read once, as text: the signature is over the exact bytes, so
  // parsing first and re-serialising changes them and every delivery
  // fails to verify.
  const raw = await request.text();

  if (!signatureValid(raw, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  let payload: InstagramWebhook;
  try {
    payload = JSON.parse(raw) as InstagramWebhook;
  } catch {
    return NextResponse.json({ received: true });
  }

  if (payload.object !== "instagram") return NextResponse.json({ received: true });

  // Answer first, work afterwards. Meta's delivery timeout is short and
  // a private reply is two API calls; holding the response open for them
  // is how a subscription gets disabled for being slow.
  after(async () => {
    try {
      await dispatch(payload);
    } catch (error) {
      console.error("Instagram webhook handling failed", error);
    }
  });

  return NextResponse.json({ received: true });
}

function signatureValid(raw: string, header: string | null): boolean {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret) {
    console.error("INSTAGRAM_APP_SECRET is not set, so no delivery can be verified");
    return false;
  }
  if (!header?.startsWith("sha256=")) return false;

  const expected = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"));
  const actual = Buffer.from(header.slice("sha256=".length));
  // Length first: timingSafeEqual throws on a mismatch rather than
  // returning false, which would turn a forged header into a 500.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

interface InstagramWebhook {
  object?: string;
  entry?: {
    id?: string;
    time?: number;
    changes?: { field?: string; value?: Record<string, unknown> }[];
    messaging?: Record<string, unknown>[];
  }[];
}

async function dispatch(payload: InstagramWebhook): Promise<void> {
  const admin = createAdminClient();

  for (const entry of payload.entry ?? []) {
    // The account the event is about. Every entry carries it, and it is
    // the only way to know whose workspace this belongs to.
    const igUserId = entry.id;
    if (!igUserId) continue;

    const { data: connection } = await admin
      .from("instagram_connections")
      .select("id, org_id, ig_user_id, access_token_encrypted, status")
      .eq("ig_user_id", igUserId)
      .maybeSingle();

    // An account that is not connected here, or one whose connection was
    // switched off. Nothing to do, and nothing worth logging loudly —
    // Meta will keep sending these for a disconnected account.
    if (!connection || connection.status !== "active") continue;

    // A tapped button. Handled before messages because a postback has
    // no `message` field, so the message parser drops it — and a gate
    // whose button does nothing is worse than no gate.
    for (const postback of parsePostbacks(entry)) {
      await handlePostback(connection, postback);
    }

    // Direct messages arrive under `messaging`, comments under
    // `changes`. One delivery can carry both, so neither is an else.
    for (const message of parseDirectMessage(entry)) {
      // Someone else's conversation, delivered on this entry. Instagram
      // puts the business on one side of every messaging event; if it is
      // not the recipient, this is an echo of something it sent.
      if (message.toId !== connection.ig_user_id) continue;
      await handleDirectMessage(connection, message);
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const value = change.value ?? {};

      const commentId = asText(value.id);
      if (!commentId) continue;

      const from = value.from as { id?: string; username?: string } | undefined;
      const media = value.media as { id?: string } | undefined;

      await handleComment(connection, {
        commentId,
        mediaId: asText(media?.id),
        text: asText(value.text) ?? "",
        fromId: asText(from?.id),
        fromUsername: asText(from?.username),
        // Meta sends seconds; the seven-day check needs milliseconds.
        createdAt: entry.time ? new Date(entry.time * 1000).toISOString() : null,
      });
    }
  }
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
