import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEntitled, type SubscriptionRow } from "@/lib/checkout";
import { monthStart, NO_LIMITS, type PlanLimits, type UsageSnapshot } from "@/lib/limits";

// What a workspace is allowed, and how much of it is used.
//
// One place, because the alternative is every screen counting for itself
// and arriving at slightly different numbers — and a limit that reads
// differently on the Billing page from the one that blocked a send is
// worse than no limit at all.

type Client = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

export interface Entitlement {
  limits: PlanLimits;
  planName: string | null;
  subscription: SubscriptionRow | null;
  /** False once the period has run out, or when there is no plan at all. */
  active: boolean;
}

/**
 * The plan a workspace is on and what it includes.
 *
 * No plan means no limits. A workspace waiting for staff to assign one, or
 * on a trial that predates billing, is not punished for it — the failure
 * that matters here is blocking somebody who has paid.
 */
export async function loadEntitlement(
  supabase: Client,
  orgId: string
): Promise<Entitlement> {
  const { data } = await supabase
    .from("subscriptions")
    .select(
      "status, current_period_end, cancel_at_period_end, plans(name, message_limit, contact_limit, seat_limit)"
    )
    .eq("org_id", orgId)
    .maybeSingle();

  const plan = data?.plans as
    | { name: string; message_limit: number | null; contact_limit: number | null; seat_limit: number | null }
    | null
    | undefined;

  const subscription: SubscriptionRow | null = data
    ? {
        status: data.status,
        current_period_end: data.current_period_end,
        cancel_at_period_end: data.cancel_at_period_end,
      }
    : null;

  const active = isEntitled(subscription);

  return {
    // A lapsed subscription keeps its plan's limits rather than falling
    // back to unlimited. Letting a limit disappear when somebody stops
    // paying is the wrong direction for that mistake to go.
    limits: plan
      ? {
          message_limit: plan.message_limit,
          contact_limit: plan.contact_limit,
          seat_limit: plan.seat_limit,
        }
      : NO_LIMITS,
    planName: plan?.name ?? null,
    subscription,
    active,
  };
}

/**
 * How much of each limit is used.
 *
 * Messages are counted outbound-only and for the calendar month, because
 * that is what a monthly allowance means and what the customer is charged
 * for. Inbound is free on every WhatsApp plan and counting it would make
 * a busy support inbox look like heavy usage.
 */
export async function loadUsage(supabase: Client, orgId: string): Promise<UsageSnapshot> {
  const [messages, contacts, members, invites] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("direction", "outbound")
      .gte("created_at", monthStart()),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase
      .from("org_invites")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  return {
    messages: messages.count ?? 0,
    contacts: contacts.count ?? 0,
    // An outstanding invitation holds a seat. See seatsAvailable.
    seats: (members.count ?? 0) + (invites.count ?? 0),
  };
}
