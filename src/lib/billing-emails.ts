import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/types/admin";
import {
  dueBillingEmail,
  collapseByRecipient,
  type BillingEmailKind,
  type DueEmail,
} from "@/lib/billing-email-plan";
import { sendEmail } from "@/lib/email";
import { maySend } from "@/lib/email-overrides";
import {
  renewalReminderEmail,
  subscriptionExpiredEmail,
  trialEndingEmail,
  trialExpiredEmail,
  trialFollowUpEmail,
  type EmailBody,
  type EmailBrand,
} from "@/lib/email-templates";

// The nightly sweep that sends trial and renewal mail.
//
// It reads every workspace's subscription and asks the pure planner what,
// if anything, each is owed. Nothing here decides timing or wording — that
// is all in billing-email-plan and email-templates, where it can be tested
// without a database and without the risk of a test sending real mail.
//
// Who gets it: the owner. A workspace can have several members and the
// bill is one person's problem; copying an admin who cannot pay is noise,
// and copying everybody is how a product ends up in a filter.

export interface SweepResult {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
}

function bodyFor(
  kind: BillingEmailKind,
  brand: EmailBrand,
  input: {
    planName: string | null;
    daysLeft: number;
    renewsOn: string;
    step: number;
    fromPrice: string | null;
  }
): EmailBody {
  switch (kind) {
    case "trial_ending":
      return trialEndingEmail(brand, { daysLeft: input.daysLeft });
    case "trial_expired":
      return trialExpiredEmail(brand, { fromPrice: input.fromPrice });
    case "trial_followup":
      return trialFollowUpEmail(brand, {
        step: input.step,
        daysSince: -input.daysLeft,
        fromPrice: input.fromPrice,
      });
    case "renewal_reminder":
      return renewalReminderEmail(brand, {
        planName: input.planName ?? "Your plan",
        daysLeft: input.daysLeft,
        renewsOn: input.renewsOn,
      });
    case "subscription_expired":
      return subscriptionExpiredEmail(brand, { planName: input.planName });
  }
}

/**
 * The cheapest plan on offer, as a sentence fragment.
 *
 * Read once for the whole sweep rather than per workspace: it is the same
 * answer every time, and a query per customer for a number that does not
 * change is how a nightly job becomes a slow one.
 */
async function cheapestPlan(
  admin: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const { data } = await admin
    .from("plans")
    .select("price_cents, currency, billing_interval")
    .eq("is_active", true)
    .eq("billing_interval", "monthly")
    .order("price_cents", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data || typeof data.price_cents !== "number") return null;
  return `${formatMoney(data.price_cents, data.currency)} a month`;
}

/** Human date for a sentence: "16 October 2026". */
function longDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export async function sweepBillingEmails(now: Date = new Date()): Promise<SweepResult> {
  const admin = createAdminClient();
  // The brand is no longer built here: each message gets one carrying that
  // recipient's own unsubscribe link, which sendEmail supplies.
  const result: SweepResult = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  const fromPrice = await cheapestPlan(admin);

  const { data: subscriptions, error } = await admin
    .from("subscriptions")
    .select("org_id, status, current_period_end, plans(name), organizations(name)")
    // Only states that can owe a message. A cancelled workspace has
    // already said no and should not be chased.
    .in("status", ["trialing", "active", "past_due"]);

  if (error || !subscriptions) {
    console.error("Could not read subscriptions for billing email", error);
    return result;
  }

  // Gathered first rather than sent as they are found, so one person owning
  // several workspaces can be collapsed to one message before anything
  // leaves. Four identical "your trial ends tomorrow" arriving together is
  // what teaches somebody to filter everything this product sends.
  const pending: PendingSend[] = [];

  for (const row of subscriptions) {
    result.checked += 1;

    const due = dueBillingEmail(
      row.org_id,
      {
        status: row.status,
        current_period_end: row.current_period_end,
        plans: row.plans as { name: string } | null,
      },
      now
    );
    if (!due) continue;

    pending.push({
      orgId: row.org_id,
      orgName: (row.organizations as { name: string } | null)?.name ?? null,
      email: await ownerEmail(admin, row.org_id),
      periodEnd: row.current_period_end,
      due,
    });
  }

  const { send, collapsed } = collapseByRecipient(
    pending.map((row) => ({ ...row, kind: row.due.kind }))
  );
  result.skipped += collapsed.length;

  for (const row of send) {
    const outcome = await deliverDue(row, fromPrice);

    if (!outcome) result.skipped += 1;
    else if (outcome.skipped) result.skipped += 1;
    else if (outcome.ok) result.sent += 1;
    else result.failed += 1;
  }

  return result;
}

interface PendingSend {
  orgId: string;
  /** For the operator's own wording, which may greet them by name. */
  orgName?: string | null;
  email: string | null;
  periodEnd: string | null;
  due: DueEmail;
}

/**
 * One message out, and the WhatsApp that goes with the one kind that
 * earns an interruption.
 *
 * Pulled out of the sweep loop when the admin screen gained a send button
 * per row. Two call sites writing their own version of this is how the
 * manual send ends up without the unsubscribe link, or without the
 * WhatsApp, or keyed differently so the duplicate guard stops working —
 * and all three of those only show up in a customer's inbox.
 *
 * Returns null when there was no address to write to, which is a skip
 * rather than a failure: a trial with nobody on it is not a fault.
 */
async function deliverDue(row: PendingSend, fromPrice: string | null) {
  const to = row.email;
  if (!to) return null;

  const due = row.due;

  const outcome = await sendEmail({
    to,
    orgId: row.orgId,
    kind: due.kind,
    dedupeKey: due.dedupeKey,
    // A function rather than a built body, so the template is handed a
    // brand carrying this recipient's unsubscribe link — it is signed
    // over their address, so it differs for every person and cannot be
    // known here.
    body: (withOptOut) =>
      bodyFor(due.kind, withOptOut, {
        planName: due.planName,
        daysLeft: due.daysLeft,
        renewsOn: longDate(row.periodEnd ?? ""),
        step: due.step ?? 0,
        fromPrice,
      }),
    // Only read if somebody has rewritten this message in the admin
    // screen. The built-in wording above already has these values; this
    // is the same set, named the way a template refers to them.
    vars: {
      workspace: row.orgName,
      plan: due.planName,
      days_left: String(Math.max(0, due.daysLeft)),
      days_since: String(Math.max(0, -due.daysLeft)),
      renews_on: longDate(row.periodEnd ?? ""),
      price: fromPrice,
    },
  });

  // The same news on WhatsApp, for the one kind where it is worth
  // interrupting somebody: sending has stopped. Sent alongside the email
  // rather than on its own schedule, so the two cannot disagree about who
  // has been told, and never able to fail the send.
  if (due.kind === "trial_expired") {
    try {
      const { sendPlatformEventToOwner } = await import("@/lib/platform-message");
      await sendPlatformEventToOwner("trial_ended", row.orgId);
    } catch (error) {
      console.error("Could not send the trial-ended WhatsApp message", error);
    }
  }

  return outcome;
}

/**
 * The same thing the sweep would do, for one workspace only.
 *
 * The sweep is all-or-nothing, and that is the wrong shape for the job it
 * is usually doing by hand: ten workspaces are owed a follow-up, one of
 * them is the customer actually on the phone, and the other nine are not
 * supposed to hear from us this minute. This sends that one row.
 *
 * It is deliberately not a separate path. It resolves what is owed with
 * the same planner, writes through the same sender under the same dedupe
 * key, and so is refused by the same guard — pressing a row's button
 * after the nightly sweep already sent it does nothing, and says so.
 */
export async function sendBillingEmailForOrg(
  orgId: string,
  now: Date = new Date()
): Promise<{ ok: boolean; message: string }> {
  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("subscriptions")
    .select("org_id, status, current_period_end, plans(name), organizations(name)")
    .eq("org_id", orgId)
    .in("status", ["trialing", "active", "past_due"])
    .maybeSingle();

  if (error) return { ok: false, message: error.message };

  const name = (row?.organizations as { name: string } | null)?.name ?? "That workspace";

  if (!row) {
    return {
      ok: false,
      message: `${name} is not on a trial or a paid plan any more, so there is nothing owed to it.`,
    };
  }

  const due = dueBillingEmail(
    row.org_id,
    {
      status: row.status,
      current_period_end: row.current_period_end,
      plans: row.plans as { name: string } | null,
    },
    now
  );

  if (!due) {
    return { ok: false, message: `Nothing is owed to ${name} today.` };
  }

  if (!(await maySend(due.kind))) {
    return {
      ok: false,
      message: `That message is switched off for this deployment, so nothing was sent. Switch it back on under Email templates.`,
    };
  }

  const email = await ownerEmail(admin, orgId);
  if (!email) {
    return {
      ok: false,
      message: `${name} has no owner address on file, so there is nobody to write to. Only the owner is written to — a bill sent to somebody who cannot pay it is worse than one that did not arrive.`,
    };
  }

  const outcome = await deliverDue(
    {
      orgId,
      orgName: (row.organizations as { name: string } | null)?.name ?? null,
      email,
      periodEnd: row.current_period_end,
      due,
    },
    await cheapestPlan(admin)
  );

  if (!outcome) {
    return { ok: false, message: `${name} has no owner address on file.` };
  }

  // Said precisely. "Sent" when nothing left is the one answer this
  // button must never give, because the next thing somebody does is wait
  // for a reply to a message that was never delivered.
  if (outcome.skipped === "duplicate") {
    return {
      ok: false,
      message: `Already sent to ${email} for this period. Every message is keyed to the workspace, the period and the day, so a repeat is refused rather than sent.`,
    };
  }
  if (outcome.skipped === "unsubscribed") {
    return { ok: false, message: `${email} has unsubscribed, so nothing was sent.` };
  }
  if (outcome.skipped === "not_configured") {
    return { ok: false, message: "Email is not configured on this deployment." };
  }
  if (outcome.skipped === "no_address") {
    return { ok: false, message: `${name} has no owner address on file.` };
  }
  if (outcome.skipped === "switched_off") {
    return { ok: false, message: "That message is switched off for this deployment." };
  }
  if (!outcome.ok) {
    return {
      ok: false,
      message: `The provider refused it: ${outcome.error ?? "no reason given"}. The email log below has what came back.`,
    };
  }

  return {
    ok: true,
    message: `Sent the ${due.kind.replace(/_/g, " ")} message to ${email}.`,
  };
}

/**
 * The address to write to.
 *
 * The owner, and only the owner. Falls back to nothing rather than to an
 * admin: a bill sent to somebody who cannot pay it is worse than one that
 * did not arrive, because it looks like it was handled.
 */
export async function ownerEmail(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<string | null> {
  const { data } = await admin
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!data?.user_id) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("user_id", data.user_id)
    .maybeSingle();

  return profile?.email?.trim() || null;
}

export interface DuePreview {
  /** What the row's own send button posts back. */
  orgId: string;
  orgName: string;
  email: string | null;
  kind: string;
  daysLeft: number;
  /** Already in email_log, so the sweep would refuse it. */
  alreadySent: boolean;
}

/**
 * What the next sweep would send, without sending it.
 *
 * These fire once a day on a schedule nobody watches, and the first
 * countdown on a seven-day trial is not due until the sixth day — so
 * "nothing has arrived" and "nothing is broken" look identical for most of
 * a week. This makes the difference visible in one screen.
 */
export async function previewBillingEmails(now: Date = new Date()): Promise<DuePreview[]> {
  const admin = createAdminClient();

  const { data: subscriptions } = await admin
    .from("subscriptions")
    .select("org_id, status, current_period_end, plans(name), organizations(name)")
    .in("status", ["trialing", "active", "past_due"]);

  const preview: DuePreview[] = [];

  for (const row of subscriptions ?? []) {
    const due = dueBillingEmail(
      row.org_id,
      {
        status: row.status,
        current_period_end: row.current_period_end,
        plans: row.plans as { name: string } | null,
      },
      now
    );
    if (!due) continue;

    // A kind that has been switched off is not owed, however the dates
    // fall. Listing it as due and then having the sweep decline to send
    // it is the screen contradicting itself.
    if (!(await maySend(due.kind))) continue;

    const { data: log } = await admin
      .from("email_log")
      .select("id")
      .eq("dedupe_key", due.dedupeKey)
      .maybeSingle();

    preview.push({
      orgId: row.org_id,
      orgName: (row.organizations as { name: string } | null)?.name ?? "—",
      email: await ownerEmail(admin, row.org_id),
      kind: due.kind,
      daysLeft: due.daysLeft,
      alreadySent: Boolean(log),
    });
  }

  // Collapsed the same way the sweep collapses it, so the screen promises
  // what actually goes out rather than one line per workspace.
  return collapseByRecipient(preview).send;
}
