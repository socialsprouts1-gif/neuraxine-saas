// Which providers do what, as plain data.
//
// The slug lists and labels were declared inside the modules that call each
// provider, and those modules are `server-only` — they hold API clients and
// touch credentials. So a client component that only wanted to render
// "Razorpay · UPI" pulled a server module into the browser bundle, which
// Turbopack refuses outright.
//
// This is the shareable half: names, groupings and a couple of facts about
// capability. No fetch, no env, no server-only, so both sides can read it.

export type PaymentProvider = "razorpay" | "cashfree" | "stripe";

export const PAYMENT_PROVIDERS: PaymentProvider[] = ["razorpay", "cashfree", "stripe"];

export function isPaymentProvider(slug: string): slug is PaymentProvider {
  return (PAYMENT_PROVIDERS as string[]).includes(slug);
}

export const PAYMENT_LABEL: Record<PaymentProvider, string> = {
  razorpay: "Razorpay",
  cashfree: "Cashfree",
  stripe: "Stripe",
};

/**
 * Which of these can collect UPI.
 *
 * The single most important fact about a gateway for an Indian business, and
 * the one a customer notices: a card-only checkout in a market that pays by
 * UPI is a checkout people abandon.
 */
export const SUPPORTS_UPI: Record<PaymentProvider, boolean> = {
  razorpay: true,
  cashfree: true,
  stripe: false,
};

/** The gateways Meta will accept behind a WhatsApp payment configuration. */
export const WHATSAPP_PAYMENT_GATEWAYS = ["razorpay", "payu"] as const;

export type StoreProvider = "shopify" | "woocommerce";

export const STORE_PROVIDERS: StoreProvider[] = ["shopify", "woocommerce"];

export function isStoreProvider(slug: string): slug is StoreProvider {
  return (STORE_PROVIDERS as string[]).includes(slug);
}

export const STORE_LABEL: Record<StoreProvider, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
};

export type LeadProvider = "facebook-lead-ads" | "indiamart";

export const LEAD_PROVIDERS: LeadProvider[] = ["facebook-lead-ads", "indiamart"];

export function isLeadProvider(slug: string): slug is LeadProvider {
  return (LEAD_PROVIDERS as string[]).includes(slug);
}

export const LEAD_LABEL: Record<LeadProvider, string> = {
  "facebook-lead-ads": "Facebook Lead Ads",
  indiamart: "IndiaMART",
};

/**
 * The providers that answer a request with a live read, rather than being
 * pushed to or pulled from on a schedule.
 */
export const LOOKUP_PROVIDERS = ["shiprocket", "calendly"] as const;
