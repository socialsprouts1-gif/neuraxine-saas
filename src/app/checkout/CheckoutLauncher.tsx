"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, ShieldCheck, CircleAlert } from "lucide-react";
import { loadRazorpay, openRazorpay } from "@/lib/razorpay-modal";
import { startGuestCheckout } from "./actions";
import { PLAN_PARAM } from "@/lib/plan-checkout";

// The payment window, opened before anybody has an account.
//
// The old order was choose, sign up, pay. This page is the middle step
// removed: the card is chosen on the pricing page and the gateway opens
// here, with the account created afterwards out of the details the
// payment already collected.
//
// Every state this can be in is on screen, because there is money moving
// and a blank page with a spinner is the worst thing to show somebody who
// has just been charged.

type Stage =
  | { kind: "starting" }
  | { kind: "paying"; planName: string }
  | { kind: "verifying" }
  | { kind: "cancelled"; planName: string }
  | { kind: "error"; message: string; paid?: boolean };

export default function CheckoutLauncher() {
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get(PLAN_PARAM) ?? "";

  const [stage, setStage] = useState<Stage>({ kind: "starting" });
  const started = useRef(false);

  const run = useCallback(async () => {
    setStage({ kind: "starting" });

    const started = await startGuestCheckout(slug).catch(
      (): { ok: false; error: string } => ({
        ok: false,
        error: "We could not reach the payment service. Check your connection and try again.",
      })
    );
    if (!started.ok) {
      setStage({ kind: "error", message: started.error });
      return;
    }

    const ready = await loadRazorpay();
    if (!ready) {
      setStage({
        kind: "error",
        message:
          "The payment window could not load. Check that an ad blocker is not blocking checkout.razorpay.com, then try again.",
      });
      return;
    }

    setStage({ kind: "paying", planName: started.planName });

    const outcome = await openRazorpay(
      {
        keyId: started.checkout.keyId,
        razorpayOrderId: started.checkout.orderId,
        amountPaise: started.checkout.amount,
        currency: started.checkout.currency,
        planName: started.checkout.description,
        // Our own order row's id, which the signed-in flow uses to report
        // back. A guest checkout is matched on Razorpay's id instead, so
        // this is carried only to satisfy the shared modal helper.
        orderId: "",
        customerEmail: null,
      },
      { name: "NeuraChat", themeColor: "#7C3AED" }
    );

    if (outcome.kind === "dismissed") {
      // Not an error. Telling somebody their payment failed because they
      // closed a window is how a checkout loses a customer twice.
      setStage({ kind: "cancelled", planName: started.planName });
      return;
    }

    if (outcome.kind === "failed") {
      setStage({ kind: "error", message: outcome.error });
      return;
    }

    setStage({ kind: "verifying" });

    // A network failure here is the worst moment for one: the card has
    // been charged and only this call knows about it. It must land in the
    // "paid, contact us" state, never in "try again".
    const verdict = await fetch("/api/payments/razorpay/guest-verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(outcome.fields),
    })
      .then((response) => response.json())
      .catch(() => null) as { ok: boolean; claimToken?: string; error?: string } | null;

    if (!verdict?.ok || !verdict.claimToken) {
      // The money has moved. Never say "payment failed" here.
      setStage({
        kind: "error",
        paid: true,
        message:
          verdict?.error ??
          "Your payment went through, but we could not finish setting up. Please contact support with this page open.",
      });
      return;
    }

    router.replace(`/auth/register?claim=${verdict.claimToken}`);
  }, [slug, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  return (
    <div className="min-h-screen marketing marketing-canvas flex items-center justify-center px-5 py-16">
      <div className="w-full max-w-md text-center">
        {stage.kind === "starting" && (
          <Panel icon={<Loader2 className="w-6 h-6 animate-spin" />} title="Opening secure payment">
            One moment — we&rsquo;re setting up your order.
          </Panel>
        )}

        {stage.kind === "paying" && (
          <Panel icon={<ShieldCheck className="w-6 h-6" />} title={`Paying for ${stage.planName}`}>
            Complete the payment in the window. Your account is created straight afterwards —
            nothing else to fill in first.
          </Panel>
        )}

        {stage.kind === "verifying" && (
          <Panel icon={<Loader2 className="w-6 h-6 animate-spin" />} title="Payment received">
            Confirming it with the bank. Don&rsquo;t close this page.
          </Panel>
        )}

        {stage.kind === "cancelled" && (
          <Panel icon={<CircleAlert className="w-6 h-6" />} title="Payment window closed">
            <p className="mb-6">Nothing has been charged. Pick up where you left off whenever you like.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => void run()} className="btn-primary text-sm">
                Try {stage.planName} again
                <ArrowRight className="w-4 h-4" />
              </button>
              <Link href="/#pricing" className="btn-secondary text-sm">
                See the plans
              </Link>
            </div>
          </Panel>
        )}

        {stage.kind === "error" && (
          <Panel icon={<CircleAlert className="w-6 h-6" />} title={stage.paid ? "Payment received" : "That didn't work"}>
            <p className="mb-6">{stage.message}</p>
            {!stage.paid && (
              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" onClick={() => void run()} className="btn-primary text-sm">
                  Try again
                </button>
                <Link href="/#pricing" className="btn-secondary text-sm">
                  See the plans
                </Link>
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-[#FFFFFF] border border-[rgba(23,18,38,0.07)] shadow-[0_2px_6px_rgba(23,18,38,0.05),0_26px_60px_rgba(23,18,38,0.12)] px-8 py-10">
      <span className="w-14 h-14 rounded-2xl bg-accent/10 text-accent-ink flex items-center justify-center mx-auto mb-5">
        {icon}
      </span>
      <h1 className="text-xl font-bold mb-2">{title}</h1>
      <div className="text-sm text-white/55 leading-relaxed">{children}</div>
    </div>
  );
}
