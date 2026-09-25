"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Crown,
  Loader2,
  Rocket,
  Tag,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { formatMoney } from "@/types/admin";
import {
  groupPlans,
  limitLines,
  planFor,
  yearlySaving,
  type PlanInterval,
  type PlanOption,
} from "@/lib/plan-grid";
import { startModalCheckout, cancelSubscription } from "../checkout-actions";

/**
 * A mark per tier, escalating with it.
 *
 * Three cards of identical weight make the reader do all the comparing.
 * A ladder — a spark, a rocket, a crown — carries the ordering before
 * any number is read, which is the whole job of a pricing table.
 */
const TIER_ICONS: LucideIcon[] = [Zap, Rocket, Crown];
import { loadRazorpay, openRazorpay } from "@/lib/razorpay-modal";

export type PickerPlan = PlanOption;

/**
 * Choosing and paying for a plan.
 *
 * Three cards and a switch, not six rows. Each interval is its own row in
 * the database, and rendering that literally put the same three names on
 * screen twice with no way to tell which two were the same thing — a list
 * to read rather than a choice to make.
 *
 * The gateway link opens in this tab rather than a new one: a popup
 * blocker eating the payment page looks like the button not working, and
 * the customer comes back here anyway with ?paid=1.
 */
export default function PlanPicker({
  plans,
  canManage,
  hasSubscription,
  cancelling,
  brandName,
  logoUrl,
}: {
  plans: PickerPlan[];
  canManage: boolean;
  hasSubscription: boolean;
  /** Already set to end at the period's close. */
  cancelling: boolean;
  /** Shown in the payment window, so it does not say "Razorpay" alone. */
  brandName: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const tiers = useMemo(() => groupPlans(plans), [plans]);

  // Opens on whichever interval the workspace is already paying for, so
  // somebody on an annual plan is not shown monthly prices next to their
  // own plan and left to work out why the numbers disagree.
  const [interval, setInterval] = useState<PlanInterval>(() =>
    plans.find((plan) => plan.isCurrent)?.interval === "yearly" ? "yearly" : "monthly"
  );

  const hasYearly = tiers.some((tier) => tier.yearly);
  const bestSaving = Math.max(0, ...tiers.map((tier) => yearlySaving(tier) ?? 0));

  const buy = (planId: string) =>
    startTransition(async () => {
      setBusy(planId);
      setNote(null);

      const data = new FormData();
      data.set("plan_id", planId);
      if (coupon.trim()) data.set("coupon", coupon.trim());

      // The modal first, so the customer never leaves the page. It falls
      // back to the hosted link on its own when the gateway is not Razorpay
      // or the total is zero, and the branch below handles both.
      const result = await startModalCheckout(data);

      if (!result.ok) {
        setBusy(null);
        setNote({ ok: false, text: result.error ?? "Could not start the purchase." });
        return;
      }

      // No checkout object means startModalCheckout handed off to the
      // hosted link — a coupon covering the whole price, or another gateway.
      if (!result.checkout) {
        setBusy(null);
        if (result.payUrl) {
          window.location.href = result.payUrl;
          return;
        }
        setNote({ ok: true, text: result.message ?? "Done." });
        router.refresh();
        return;
      }

      const ready = await loadRazorpay();
      if (!ready) {
        setBusy(null);
        setNote({
          ok: false,
          text: "The payment window could not load. Check an ad blocker is not blocking checkout.razorpay.com, or try again.",
        });
        return;
      }

      const outcome = await openRazorpay(result.checkout, { name: brandName, logoUrl });
      setBusy(null);

      if (outcome.kind === "dismissed") {
        // Not an error. Saying "payment failed" to somebody who chose to
        // close the window is how a checkout loses a customer twice.
        setNote({ ok: true, text: "Payment window closed. Nothing has been charged." });
        return;
      }

      if (outcome.kind === "failed") {
        setNote({ ok: false, text: outcome.error });
        return;
      }

      // Verified on the server before anything is claimed. The webhook does
      // this too and may well get there first, which is why the answer
      // distinguishes "activated" from "already done".
      const response = await fetch("/api/payments/razorpay/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(outcome.fields),
      });

      const verdict = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; planName?: string | null }
        | null;

      if (!response.ok || !verdict?.ok) {
        setNote({
          ok: false,
          text:
            verdict?.error ??
            "The payment went through but could not be confirmed here. It will be applied automatically within a minute — please refresh.",
        });
        return;
      }

      setNote({
        ok: true,
        text: verdict.planName ? `Payment received. You are on ${verdict.planName}.` : "Payment received.",
      });
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Plans</h2>
          <p className="text-xs text-white/45 mt-0.5">
            Change or cancel whenever you like. Prices include everything listed.
          </p>
        </div>

        {hasYearly && <IntervalSwitch value={interval} onChange={setInterval} saving={bestSaving} />}
      </div>

      {canManage && (
        <div className="relative max-w-xs">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            value={coupon}
            onChange={(event) => setCoupon(event.target.value.toUpperCase())}
            placeholder="Discount code (optional)"
            className="w-full bg-white/5 border border-white/12 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
          />
        </div>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
        {tiers.map((tier, index) => {
          const plan = planFor(tier, interval);
          if (!plan) return null;

          const saving = interval === "yearly" ? yearlySaving(tier) : null;
          // The middle tier, where there are three. A recommendation has to
          // come from the shape of the list rather than a flag nobody has
          // set, or every card looks equally weighted and none is chosen.
          const featured = tiers.length === 3 && index === 1;
          const bullets = tier.features.length > 0 ? tier.features : limitLines(plan);
          const TierIcon = TIER_ICONS[Math.min(index, TIER_ICONS.length - 1)];

          return (
            <div
              key={tier.name}
              className={`relative rounded-2xl border flex flex-col h-full transition-all ${
                featured ? "xl:-my-2 xl:shadow-2xl" : ""
              } ${
                plan.isCurrent
                  ? "border-accent/45 bg-accent/8"
                  : featured
                    ? "border-accent/35 bg-gradient-to-b from-accent/[0.07] to-transparent"
                    : "border-white/10 bg-white/3 hover:border-white/20"
              }`}
            >
              {/* A lit top edge on the recommended tier. Three identical
                  boxes make the reader do the comparing; a ladder does
                  some of it for them. */}
              {featured && (
                <span
                  aria-hidden
                  className="absolute inset-x-6 -top-px h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, var(--accent), transparent)",
                  }}
                />
              )}
              <div className="p-5 flex flex-col h-full">
              {(plan.isCurrent || featured) && (
                <span
                  className={`absolute -top-2.5 left-5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                    plan.isCurrent
                      ? "bg-accent text-black"
                      : "bg-accent/15 text-accent-ink border border-accent/30"
                  }`}
                >
                  {plan.isCurrent ? "Your plan" : "Most popular"}
                </span>
              )}

              <div className="mb-4 flex items-start gap-3">
                {/* The tier's mark, escalating with the tier, so the
                    ladder reads before the prices do. */}
                <span
                  className={`w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 border ${
                    featured || plan.isCurrent
                      ? "border-accent/40 text-accent-ink"
                      : "border-white/12 text-white/50"
                  }`}
                  style={{
                    background:
                      featured || plan.isCurrent
                        ? "linear-gradient(140deg, rgba(0,255,135,0.22), rgba(0,255,135,0.06))"
                        : "rgba(255,255,255,0.04)",
                  }}
                >
                  <TierIcon className="w-4 h-4" strokeWidth={2.25} />
                </span>

                <div className="min-w-0">
                <h3 className="font-semibold">{tier.name}</h3>
                {tier.description && (
                  <p className="text-xs text-white/45 mt-1 leading-relaxed">{tier.description}</p>
                )}
                </div>
              </div>

              <div className="mb-5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tabular-nums">
                    {formatMoney(plan.priceCents, plan.currency)}
                  </span>
                  <span className="text-xs text-white/40">
                    /{plan.interval === "yearly" ? "year" : "month"}
                  </span>
                </div>
                {saving !== null && (
                  <p className="text-[11px] text-accent-ink mt-1.5">
                    Save {saving}% against paying monthly
                  </p>
                )}
                {interval === "yearly" && !tier.yearly && (
                  <p className="text-[11px] text-white/35 mt-1.5">
                    Only sold monthly.
                  </p>
                )}
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {bullets.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-xs text-white/65">
                    <Check className="w-3.5 h-3.5 text-accent-ink shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{line}</span>
                  </li>
                ))}
              </ul>

              {canManage ? (
                plan.isCurrent ? (
                  <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-accent-ink py-2.5 border border-accent/25 bg-accent/8 rounded-xl">
                    <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                    Currently active
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => buy(plan.id)}
                    className={`group ${
                      featured ? "btn-primary" : "btn-secondary"
                    } w-full justify-center text-sm font-semibold disabled:opacity-50`}
                  >
                    {busy === plan.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <TierIcon className="w-4 h-4" strokeWidth={2.25} />
                    )}
                    {hasSubscription ? `Switch to ${tier.name}` : `Get ${tier.name}`}
                    {busy !== plan.id && (
                      <ArrowRight className="w-3.5 h-3.5 opacity-50 group-hover:translate-x-0.5 transition-transform" />
                    )}
                  </button>
                )
              ) : null}
              </div>
            </div>
          );
        })}
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
              setNote({ ok: result.ok, text: result.error ?? result.message ?? "Done." });
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

/**
 * Monthly or yearly, for every card at once.
 *
 * A segmented control rather than a toggle switch: on/off says nothing
 * about which state means what, and a customer should not have to flip it
 * to find out which way round it is.
 */
function IntervalSwitch({
  value,
  onChange,
  saving,
}: {
  value: PlanInterval;
  onChange: (next: PlanInterval) => void;
  /** The best saving across tiers, as a percentage. Zero hides the badge. */
  saving: number;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10"
      role="group"
      aria-label="Billing period"
    >
      {(["monthly", "yearly"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            value === option
              ? "bg-accent text-black"
              : "text-white/55 hover:text-white"
          }`}
        >
          {option === "monthly" ? "Monthly" : "Yearly"}
          {option === "yearly" && saving > 0 && (
            <span className={value === option ? "ml-1.5 opacity-70" : "ml-1.5 text-accent-ink"}>
              −{saving}%
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
