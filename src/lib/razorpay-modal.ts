// Opening Razorpay's Standard Checkout modal from the browser.
//
// Client-side on purpose: checkout.js only works in a page, and the only
// thing it is given is the order id and the public Key ID. The secret is
// never here — everything that needs it happens on the server.

import type { ModalCheckout } from "@/app/(dashboard)/checkout-actions";

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export type ModalOutcome =
  | { kind: "paid"; fields: Record<string, string> }
  | { kind: "dismissed" }
  | { kind: "failed"; error: string };

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

/**
 * Loads checkout.js once, however many times a button is pressed.
 *
 * Appending it per click would attach several copies of the global and
 * leave the second modal listening to the first one's events.
 */
export function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Opens the modal and resolves with what happened.
 *
 * Three endings, and all of them have to be handled. Success hands back
 * three signed fields. Dismissal is somebody closing the window, which is
 * not an error and must not be reported as one. A failure is Razorpay
 * telling us the payment was refused, which the customer needs to see —
 * left unhandled it looks like the button simply stopped working.
 */
export function openRazorpay(
  checkout: ModalCheckout,
  brand: { name: string; logoUrl?: string | null }
): Promise<ModalOutcome> {
  return new Promise((resolve) => {
    if (!window.Razorpay) {
      resolve({ kind: "failed", error: "The payment window could not be loaded." });
      return;
    }

    // Resolved once, whatever order the callbacks arrive in: Razorpay fires
    // its dismiss handler after a failure too, and a promise that resolved
    // twice would overwrite a real error with "cancelled".
    let settled = false;
    const finish = (outcome: ModalOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const razorpay = new window.Razorpay({
      key: checkout.keyId,
      order_id: checkout.razorpayOrderId,
      amount: checkout.amountPaise,
      currency: checkout.currency,
      name: brand.name,
      description: checkout.planName,
      ...(brand.logoUrl ? { image: brand.logoUrl } : {}),
      prefill: checkout.customerEmail ? { email: checkout.customerEmail } : {},
      theme: { color: "#00E08F" },
      handler: (response: Record<string, string>) => finish({ kind: "paid", fields: response }),
      modal: {
        ondismiss: () => finish({ kind: "dismissed" }),
        escape: true,
      },
    });

    razorpay.on("payment.failed", (response: unknown) => {
      const described = (response as { error?: { description?: string; reason?: string } } | null)
        ?.error;
      finish({
        kind: "failed",
        error:
          described?.description ??
          described?.reason ??
          "The payment was not completed. Nothing has been charged.",
      });
    });

    razorpay.open();
  });
}
