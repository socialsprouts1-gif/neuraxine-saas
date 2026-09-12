import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { billingState } from "@/lib/billing-state";

/**
 * The one line that says whether this workspace still has time on it.
 *
 * Sits above every page rather than only on Billing, because someone whose
 * trial ran out yesterday is in the inbox wondering why nothing sends, not
 * on the billing screen. Renders nothing at all when there is nothing to
 * say — a banner that is always there is a banner nobody reads.
 */
export default async function BillingBanner({ orgId }: { orgId: string }) {
  let subscription = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("status, current_period_end, plans(name)")
      .eq("org_id", orgId)
      .maybeSingle();
    subscription = data;
  } catch {
    // Billing is not worth taking the app down for.
    return null;
  }

  const state = billingState(subscription);
  if (!state.needsAttention) return null;

  const urgent = state.stage !== "trialing";

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-2.5 border-b text-sm ${
        urgent
          ? "bg-[#F87171]/10 border-[#F87171]/25"
          : "bg-[#FACC15]/10 border-[#FACC15]/25"
      }`}
    >
      {urgent ? (
        <AlertTriangle className="w-4 h-4 text-[#F87171] shrink-0" />
      ) : (
        <Clock className="w-4 h-4 text-[#FACC15] shrink-0" />
      )}

      <span className={`font-medium ${urgent ? "text-[#FCA5A5]" : "text-[#FDE68A]"}`}>
        {state.title}
      </span>
      <span className="text-white/55 min-w-0">{state.detail}</span>

      <Link
        href="/billing"
        className={`ml-auto shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
          urgent
            ? "bg-[#F87171]/15 border-[#F87171]/30 text-[#FCA5A5] hover:bg-[#F87171]/25"
            : "bg-[#FACC15]/15 border-[#FACC15]/30 text-[#FDE68A] hover:bg-[#FACC15]/25"
        }`}
      >
        {urgent ? "Update billing" : "See plans"}
      </Link>
    </div>
  );
}
