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
    .select("org_id, status, current_period_end, plans(name)")
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
  const pending: Array<{
    orgId: string;
    email: string | null;
    periodEnd: string | null;
    due: DueEmail;
  }> = [];

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
    const to = row.email;
    const due = row.due;

    if (!to) {
      result.skipped += 1;
      continue;
    }

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
    });

    if (outcome.skipped) result.skipped += 1;
    else if (outcome.ok) result.sent += 1;
    else result.failed += 1;
  }

  return result;
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

    const { data: log } = await admin
      .from("email_log")
      .select("id")
      .eq("dedupe_key", due.dedupeKey)
      .maybeSingle();

    preview.push({
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
