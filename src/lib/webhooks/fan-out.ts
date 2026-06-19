import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

export async function fanOutWebhooks(
  orgId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const supabase = createAdminClient();
  const { data: webhooks } = await supabase
    .from("webhooks")
    .select("url, secret, events")
    .eq("org_id", orgId)
    .eq("active", true);

  if (!webhooks) return;

  const body = JSON.stringify({ event, payload, ts: new Date().toISOString() });

  await Promise.allSettled(
    webhooks
      .filter((wh) => (wh.events as string[]).includes(event))
      .map(async (wh) => {
        const sig = crypto.createHmac("sha256", wh.secret).update(body).digest("hex");
        await fetch(wh.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Neuraxine-Signature": sig,
            "X-Neuraxine-Event": event,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
      })
  );
}
