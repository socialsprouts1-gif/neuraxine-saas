"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Plus } from "lucide-react";
import { startTopup } from "../wallet-actions";
import { MICROS, TOPUP_PRESETS, formatMoney } from "@/lib/wallet";
import Modal from "@/components/ui/Modal";
import { loadRazorpay, openRazorpay } from "@/lib/razorpay-modal";

// Adding money.
//
// The modal is Razorpay's own, opened against an order the server made.
// Nothing here decides an amount: the order carries it, the signature
// proves the payment, and the balance moves on the server. The number in
// this box is a request, not a credit.

export default function TopupButton({
  currency,
  brandName,
  email,
}: {
  currency: string;
  brandName: string;
  email: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(TOPUP_PRESETS[1]);
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    setBusy(true);
    const order = await startTopup(amount).catch(() => ({
      ok: false,
      error: "The payment could not be started.",
    }));

    if (!order.ok || !("orderId" in order) || !order.orderId || !order.keyId) {
      setBusy(false);
      toast.error(("error" in order && order.error) || "The payment could not be started.");
      return;
    }

    try {
      if (!(await loadRazorpay())) {
        setBusy(false);
        toast.error("The payment window could not be loaded. Check your connection and try again.");
        return;
      }

      const result = await openRazorpay(
        {
          razorpayOrderId: order.orderId,
          amountPaise: order.amountPaise ?? amount,
          currency: order.currency ?? currency,
          keyId: order.keyId,
          orderId: order.orderId,
          planName: `Wallet top-up — ${formatMoney(amount, currency)}`,
          customerEmail: email || null,
        },
        { name: brandName }
      );

      // Closing the modal is not a failure. It is somebody changing their
      // mind, and shouting at them for it is how a shop feels.
      if (result.kind === "dismissed") {
        setBusy(false);
        return;
      }

      if (result.kind === "failed") {
        setBusy(false);
        toast.error(result.error);
        return;
      }

      const verified = await fetch("/api/payments/razorpay/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.fields),
      }).then((response) => response.json());

      setBusy(false);

      if (!verified.ok) {
        // The money may well have left their account. Never "try again" —
        // that is how somebody pays twice.
        toast.error(
          verified.error ?? "Payment received, but the balance did not update. Get in touch and we will fix it."
        );
        return;
      }

      toast.success(`Added. Your balance is ${formatMoney(Number(verified.balance), currency)}.`);
      setOpen(false);
      router.refresh();
    } catch {
      setBusy(false);
      toast.error("Payment received, but the balance did not update. Get in touch and we will fix it.");
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-sm">
        <Plus className="w-4 h-4" />
        Add money
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add money to your wallet"
        description="The balance pays for the messages this workspace sends. It does not expire."
        size="sm"
        // While the gateway has the payment, closing the dialog would lose
        // the only thread that credits the balance afterwards.
        dismissable={!busy}
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl border border-white/12 text-sm text-white/65 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void pay()}
              disabled={busy}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                `Pay ${formatMoney(amount, currency)}`
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {TOPUP_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(preset)}
                className={`py-3 rounded-xl border text-sm font-semibold transition-all ${
                  amount === preset
                    ? "border-accent/50 bg-accent/10 text-accent-ink"
                    : "border-white/12 bg-white/4 text-white/65 hover:border-white/25"
                }`}
              >
                {formatMoney(preset, currency)}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">
              Or another amount ({currency})
            </label>
            <input
              type="number"
              min={100}
              step={100}
              value={amount / MICROS}
              onChange={(e) => setAmount(Math.round(Number(e.target.value) * MICROS))}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
