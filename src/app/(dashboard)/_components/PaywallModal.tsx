"use client";

// The wall that goes up when the trial runs out.
//
// A red line above the page was easy to stop seeing, and somebody whose
// trial ended is usually in the inbox wondering why nothing sends rather
// than on the billing screen. So the plans come to them.
//
// Not a trap. There is a way past it, because a person whose plan lapsed
// may need to reach support, export something, or simply look at what
// they had — and a product that locks you out of your own data to make a
// sale has made an enemy rather than a customer. It comes back on the
// next navigation, which is the right amount of insistent.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Lock, X } from "lucide-react";
import { planCheckoutHref } from "@/lib/plan-checkout";

export interface PaywallPlan {
  slug: string;
  name: string;
  price: string;
  interval: string;
  features: string[];
  popular: boolean;
}

export default function PaywallModal({
  title,
  detail,
  plans,
}: {
  title: string;
  detail: string;
  plans: PaywallPlan[];
}) {
  const [open, setOpen] = useState(true);

  // Held in component state on purpose, not storage: dismissing it lasts
  // for this page, and it is back on the next one.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll under the wall.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#050508]/80 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="relative w-full max-w-3xl my-auto rounded-3xl border border-white/12 bg-[var(--surface-1)] shadow-[0_40px_120px_rgba(0,0,0,0.65)] p-6 sm:p-8">
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute top-4 right-4 p-2 rounded-xl text-white/35 hover:text-white/80 hover:bg-white/8 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-7">
          <span className="w-12 h-12 rounded-2xl bg-accent/12 border border-accent/25 text-accent-ink flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5" />
          </span>
          <h2 className="text-2xl font-bold mb-2">{title}</h2>
          <p className="text-sm text-white/55 max-w-md mx-auto leading-relaxed">{detail}</p>
        </div>

        {plans.length === 0 ? (
          <div className="text-center">
            <Link href="/billing" className="btn-primary text-sm">
              Open billing
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3">
            {plans.map((plan) => (
              <div
                key={plan.slug}
                className={`rounded-2xl border p-5 flex flex-col ${
                  plan.popular
                    ? "border-accent/40 bg-accent/6"
                    : "border-white/10 bg-white/3"
                }`}
              >
                <div className="text-sm font-semibold">{plan.name}</div>
                <div className="mt-1 mb-4">
                  <span className="text-2xl font-black">{plan.price}</span>
                  <span className="text-xs text-white/40 ml-1">/{plan.interval}</span>
                </div>

                <ul className="space-y-1.5 flex-1 mb-4">
                  {plan.features.slice(0, 3).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-xs text-white/60">
                      <Check className="w-3.5 h-3.5 text-accent-ink shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Billing opens the payment window on its own for this
                    plan, so this is one click from here to paying. */}
                <Link
                  href={planCheckoutHref(plan.slug)}
                  className={`${plan.popular ? "btn-primary" : "btn-quiet"} btn-compact justify-center`}
                >
                  Choose {plan.name}
                </Link>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-white/35 mt-6">
          Your data is untouched and nothing is deleted.{" "}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="underline underline-offset-2 hover:text-white/60 transition-colors inline-hit"
          >
            Have a look around first
          </button>
        </p>
      </div>
    </div>
  );
}
