import "server-only";
import { createHmac } from "node:crypto";
import type { RunnerClient } from "@/lib/whatsapp-send";

// Outbound event delivery. This is what makes "connect Neura Chat to
// anything" true without writing bespoke code per provider: Zapier, Make
// and n8n all accept a signed POST on a catch hook, and so does any
// backend the customer already runs.

export const WEBHOOK_EVENTS = [
  "message.received",
  "message.status",
  "contact.created",
  "form.submitted",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

// Deliveries run inside the webhook handler's `after()` callback. A target
// that never answers must not hold that callback open indefinitely.
const DELIVERY_TIMEOUT_MS = 8_000;

/**
 * Signs a delivery the same way Meta signs its own webhooks, so anyone
 * integrating already knows the drill: `sha256=<hex hmac of the raw body>`.
 */
export function signWebhookPayload(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

/**
 * Fires one event to every active webhook in the org subscribed to it, and
 * records each attempt in webhook_deliveries.
 *
 * Never throws and never rejects: a customer's broken endpoint must not
 * affect their inbox, their bot replies, or Meta's view of our webhook.
 */
export async function dispatchWebhookEvent(
  supabase: RunnerClient,
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const { data: hooks, error } = await supabase
    .from("outgoing_webhooks")
    .select("id, target_url, secret, events")
    .eq("org_id", orgId)
    .eq("is_active", true);

  if (error) {
    console.error("Failed to load outgoing webhooks", error);
    return;
  }

  const subscribed = (hooks ?? []).filter((hook) => hook.events.includes(event));
  if (subscribed.length === 0) return;

  const body = JSON.stringify({
    event,
    org_id: orgId,
    // Seconds since epoch, matching the convention Meta and Stripe use, so
    // a receiver can reject replays without converting units first.
    timestamp: Math.floor(Date.now() / 1000),
    data,
  });

  // One slow endpoint should not delay the others.
  await Promise.all(
    subscribed.map((hook) => deliverOne(supabase, orgId, hook, event, body))
  );
}

async function deliverOne(
  supabase: RunnerClient,
  orgId: string,
  hook: { id: string; target_url: string; secret: string },
  event: WebhookEvent,
  body: string
): Promise<void> {
  let statusCode: number | null = null;
  let deliveryError: string | null = null;

  try {
    const response = await fetch(hook.target_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Neura-Signature-256": signWebhookPayload(body, hook.secret),
        "X-Neura-Event": event,
        "User-Agent": "NeuraChat-Webhooks/1.0",
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });

    statusCode = response.status;
    if (!response.ok) {
      // Read a little of the body: a 400 from Zapier explains itself, and
      // that explanation is what the customer needs to see in the UI.
      const text = await response.text().catch(() => "");
      deliveryError = text.slice(0, 500) || `HTTP ${response.status}`;
    }
  } catch (err) {
    deliveryError =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? `No response within ${DELIVERY_TIMEOUT_MS / 1000}s`
          : err.message
        : "Delivery failed";
  }

  const { error: logError } = await supabase.from("webhook_deliveries").insert({
    webhook_id: hook.id,
    org_id: orgId,
    event,
    status_code: statusCode,
    error: deliveryError,
  });

  if (logError) {
    console.error("Failed to record webhook delivery", logError);
  }
}
