import { createClient } from "@/lib/supabase/server";
import { billingState } from "@/lib/billing-state";
import { buildPricingTiers, type PlanRow } from "@/lib/pricing";
import PaywallModal, { type PaywallPlan } from "./PaywallModal";

/**
 * Puts the plans in front of a workspace whose time has run out.
 *
 * The banner above the page was easy to stop seeing. This is not — but it
 * only appears once there is genuinely nothing left: a trial that has
 * ended, or a paid plan whose period lapsed. A workspace still on trial
 * sees the banner and nothing more, because interrupting somebody on day
 * one of a trial is how a product loses them before it has shown them
 * anything.
 */
export default async function PaywallGate({
  orgId,
  isPlatformAdmin = false,
}: {
  orgId: string;
  isPlatformAdmin?: boolean;
}) {
  // Staff are not being sold to. Their own workspace has a trial row like
  // any other, and walling them out of the admin panel to sell them their
  // own product would be a special kind of unhelpful.
  if (isPlatformAdmin) return null;

  // The reading is wrapped; the rendering is not. Constructing JSX inside
  // a try/catch hides a render-time error in the catch and turns a bug in
  // the modal into a silently missing paywall.
  const wall = await loadWall(orgId);
  if (!wall) return null;

  return <PaywallModal title={wall.title} detail={wall.detail} plans={wall.plans} />;
}

interface Wall {
  title: string;
  detail: string;
  plans: PaywallPlan[];
}

async function loadWall(orgId: string): Promise<Wall | null> {
  try {
    const supabase = await createClient();

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status, current_period_end, plans(name)")
      .eq("org_id", orgId)
      .maybeSingle();

    const state = billingState(subscription);

    // Only when there is nothing left to use. "trialing" and "active" are
    // the states where the banner is enough.
    if (state.stage !== "trial_expired" && state.stage !== "past_due") return null;

    const { data: plans } = await supabase
      .from("plans")
      .select(
        "name, slug, description, price_cents, currency, billing_interval, features, is_active, sort_order"
      )
      .eq("is_active", true)
      .order("sort_order");

    const tiers = buildPricingTiers((plans ?? []) as PlanRow[]);

    return {
      title: state.title,
      detail: state.detail,
      plans: tiers
        .filter((tier) => tier.monthlyCents !== null)
        .slice(0, 3)
        .map((tier) => ({
          slug: tier.slug,
          name: tier.name,
          price: new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: tier.currency || "INR",
            maximumFractionDigits: 0,
          }).format((tier.monthlyCents ?? 0) / 100),
          interval: "mo",
          features: tier.features,
          popular: tier.popular,
        })),
    };
  } catch {
    // Billing is never worth taking the app down for — least of all with
    // a modal in the way.
    return null;
  }
}
