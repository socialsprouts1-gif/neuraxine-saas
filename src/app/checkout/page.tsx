import { Suspense } from "react";
import CheckoutLauncher from "./CheckoutLauncher";

export const metadata = { title: "Checkout — Neura Chat" };

/**
 * Paying straight from the pricing page.
 *
 * The launcher reads the plan from the query string, so it is a client
 * component behind a Suspense boundary — a statically prerendered route
 * has to say where the client-rendered part begins, or the production
 * build fails outright on this page.
 */
export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen marketing marketing-canvas" />}>
      <CheckoutLauncher />
    </Suspense>
  );
}
