"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Tag } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { formatMoney } from "@/types/admin";
import { startCheckout, cancelSubscription } from "../checkout-actions";

export interface PickerPlan {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: string;
  isCurrent: boolean;
}

/**
 * Choosing and paying for a plan.
 *
 * The gateway link is opened in this tab rather than a new one: a popup
 * blocker eating the payment page looks like the button not working, and
 * the customer comes back here anyway with ?paid=1.
 */
export default function PlanPicker({
  plans,
  canManage,
  hasSubscription,
  cancelling,
}: {
  plans: PickerPlan[];
  canManage: boolean;
  hasSubscription: boolean;
  /** Already set to end at the period's close. */
  cancelling: boolean;
}) {
  const router = useRouter();
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const buy = (planId: string) =>
    startTransition(async () => {
      setBusy(planId);
      setNote(null);

      const data = new FormData();
      data.set("plan_id", planId);
      if (coupon.trim()) data.set("coupon", coupon.trim());

      const result = await startCheckout(data);
      setBusy(null);

      if (!result.ok) {
        setNote({ ok: false, text: result.error ?? "Could not start the purchase." });
        return;
      }

      if (result.payUrl) {
        window.location.href = result.payUrl;
        return;
      }

      // No link means there was nothing to pay — a full-value coupon.
      setNote({ ok: true, text: result.message ?? "Done." });
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <h2 className="font-semibold">Plans</h2>

      {canManage && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              value={coupon}
              onChange={(event) => setCoupon(event.target.value.toUpperCase())}
              placeholder="Discount code (optional)"
              className="w-full bg-white/5 border border-white/12 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-xl border p-4 ${
              plan.isCurrent ? "border-accent/30 bg-accent/5" : "border-white/8 bg-white/3"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{plan.name}</span>
                  {plan.isCurrent && <Badge tone="green">current</Badge>}
                </div>
                {plan.description && (
                  <p className="text-[11px] text-white/40 mt-0.5">{plan.description}</p>
                )}
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <div className="font-bold tabular-nums">
                    {formatMoney(plan.priceCents, plan.currency)}
                  </div>
                  <div className="text-[10px] text-white/35">
                    /{plan.interval === "yearly" ? "yr" : "mo"}
                  </div>
                </div>

                {canManage && !plan.isCurrent && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => buy(plan.id)}
                    className="btn-primary text-xs py-2 px-3.5 disabled:opacity-50"
                  >
                    {busy === plan.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                    {hasSubscription ? "Switch" : "Choose"}
                  </button>
                )}

                {plan.isCurrent && (
                  <Check className="w-4 h-4 text-accent-ink" aria-label="Current plan" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {note && (
        <p
          className={`text-sm ${note.ok ? "text-accent-ink" : "text-[#F87171]"} leading-relaxed`}
          role="status"
        >
          {note.text}
        </p>
      )}

      {!canManage && (
        <p className="text-[11px] text-white/35 leading-relaxed">
          Only an owner or an admin can change the plan.
        </p>
      )}

      {canManage && hasSubscription && !cancelling && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelSubscription();
              setNote({
                ok: result.ok,
                text: result.error ?? result.message ?? "Done.",
              });
              if (result.ok) router.refresh();
            })
          }
          className="text-[11px] text-white/35 hover:text-[#F87171] transition-colors"
        >
          Cancel the plan
        </button>
      )}

      {cancelling && (
        <p className="text-[11px] text-[#FACC15] leading-relaxed">
          This plan is set to end when the current period closes. Choose a plan above to carry on.
        </p>
      )}
    </div>
  );
}
