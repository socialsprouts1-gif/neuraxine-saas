// Whether this deployment can actually take money for itself.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Five things have to line up, and each fails the same way from a
// customer's side — the checkout refuses and names a setting they have
// never heard of. Told apart here, in the order somebody has to fix them,
// because "payments are not working" is not something anyone can act on.

export interface PaymentFacts {
  /** Workspaces that have a payment gateway connected at all. */
  connectedGateways: number;
  /** The workspace named in platform_settings as taking our money. */
  gatewayOrgId: string | null;
  gatewayProvider: string | null;
  /** That workspace's name, or null when it no longer exists. */
  gatewayOrgName: string | null;
  /** Whether that workspace still has that provider connected. */
  gatewayConnected: boolean;
  /** Whether a webhook secret is stored for it. */
  hasWebhookSecret: boolean;
  /** Active plans with a price above zero. */
  sellablePlans: number;
}

export interface PaymentStep {
  done: boolean;
  title: string;
  detail: string;
}

export function paymentChecklist(facts: PaymentFacts): PaymentStep[] {
  const named = Boolean(facts.gatewayOrgId && facts.gatewayProvider);

  return [
    {
      done: facts.connectedGateways > 0,
      title: "Connect Razorpay on a workspace",
      detail:
        facts.connectedGateways > 0
          ? `${facts.connectedGateways} workspace${facts.connectedGateways === 1 ? " has" : "s have"} a gateway connected.`
          : "Open the workspace you run your own business from, go to Integrations → Razorpay, and paste the Key ID and Key secret from Razorpay Dashboard → Account & Settings → API Keys.",
    },
    {
      done: named,
      title: "Say which one takes subscription money",
      detail: named
        ? `Set to ${facts.gatewayOrgName ?? facts.gatewayOrgId} · ${facts.gatewayProvider}.`
        : "Choose it under “Who takes subscription payments” below. Without it every self-serve checkout refuses — a customer paying you must not be charged through their own Razorpay account, because the money would go to them.",
    },
    {
      done: named && facts.gatewayConnected,
      title: "Keep that gateway connected",
      detail:
        named && !facts.gatewayConnected
          ? "The workspace named above no longer has that gateway connected. Reconnect it, or point this at a different one — a name with no credentials behind it is the same outage."
          : "The named workspace still has working credentials.",
    },
    {
      done: facts.hasWebhookSecret,
      title: "Add the webhook secret",
      detail: facts.hasWebhookSecret
        ? "Stored, so a notification can be proved to have come from Razorpay."
        : "Create a webhook in Razorpay pointing at the URL below, set a secret, and paste the same secret into the Razorpay integration as “Webhook secret”. Without it a paid order is never marked paid: a notification that cannot be verified is refused, because a route that trusts unsigned ones can be used by anyone who learns an order reference.",
    },
    {
      done: facts.sellablePlans > 0,
      title: "Have something to sell",
      detail:
        facts.sellablePlans > 0
          ? `${facts.sellablePlans} active plan${facts.sellablePlans === 1 ? "" : "s"} with a price.`
          : "Every active plan is free or inactive, so there is nothing for a checkout to charge for. Add one under Plans.",
    },
  ];
}

export function paymentsReady(facts: PaymentFacts): boolean {
  return paymentChecklist(facts).every((step) => step.done);
}

/** The events Razorpay has to be told to send. */
export const RAZORPAY_EVENTS = [
  "payment_link.paid",
  "payment.captured",
  "payment.failed",
  "payment_link.expired",
  "payment_link.cancelled",
] as const;
