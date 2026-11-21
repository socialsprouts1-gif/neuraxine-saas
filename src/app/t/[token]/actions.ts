"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { handleEvent } from "@/lib/event-runner";
import { normaliseEventName } from "@/lib/events";
import { normaliseWaNumber } from "@/lib/whatsapp-link";

// The one thing a staff link can do.
//
// Deliberately its own action rather than a shared one. Everything else
// in this product is reached by somebody who signed in; this is reached
// by whoever has the URL, so the checks are written out here where they
// can be read in one go rather than inherited from somewhere.

export interface StaffResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export async function fireFromStaffLink(formData: FormData): Promise<StaffResult> {
  const token = String(formData.get("token") ?? "").trim();
  const event = normaliseEventName(formData.get("event"));
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  if (!token || !event) return { ok: false, error: "Something is missing. Reload the page." };

  const phone = normaliseWaNumber(phoneRaw);
  if (!phone) {
    return { ok: false, error: "That number does not look right. Check it and try again." };
  }

  const admin = createAdminClient();

  const { data: link } = await admin
    .from("staff_links")
    .select("id, org_id, revoked_at, uses")
    .eq("token", token)
    .maybeSingle();

  if (!link || link.revoked_at) {
    return { ok: false, error: "This link no longer works. Ask for a new one." };
  }

  // Only events this workspace has switched a rule on for. Without this
  // the link would fire any event name somebody could put in the form,
  // which is a stranger's way into the automations.
  const { data: rule } = await admin
    .from("event_automations")
    .select("id")
    .eq("org_id", link.org_id)
    .eq("event_name", event)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!rule) {
    return { ok: false, error: "That is not switched on any more. Reload the page." };
  }

  const result = await handleEvent({
    orgId: link.org_id,
    name: event,
    data: { source: "staff" },
    phone,
    contactName: String(formData.get("name") ?? "").trim(),
    source: "api",
  });

  // Counted after the work, so a failed tap does not read as a use.
  // Read-then-write rather than an atomic increment, which is fine for
  // what this number is: a sign of life on the links list, not a figure
  // anybody bills from.
  void admin
    .from("staff_links")
    .update({ last_used_at: new Date().toISOString(), uses: (link.uses ?? 0) + 1 })
    .eq("id", link.id)
    .then(() => undefined);

  if (result.problem) return { ok: false, error: result.problem };

  return {
    ok: true,
    message:
      result.matched > 0
        ? "Sent. The customer has it."
        : "Recorded, but nothing was set up to send yet.",
  };
}
