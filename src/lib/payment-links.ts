import "server-only";

import { basicAuth, jsonHeaders, providerFetch } from "@/lib/provider-http";
// The slug list and labels are plain data and live in provider-meta so a
// client component can read them without pulling this module — and the API
// clients below — into the browser bundle.
import { PAYMENT_LABEL, PAYMENT_PROVIDERS, type PaymentProvider } from "@/lib/provider-meta";

export type { PaymentProvider };
export { PAYMENT_LABEL, PAYMENT_PROVIDERS };

// Asking a customer for money over WhatsApp.
//
// Three gateways, one job: turn an amount and a phone number into a link
// that opens a payment page. Razorpay and Cashfree both do UPI, which is
// what an Indian customer expects; Stripe is here for anyone selling abroad.
//
// This is the fallback path for WhatsApp Pay, and for most businesses it is
// the only path: the native order_details flow needs a payment configuration
// approved on the WABA, and until that exists a link is what works today.
//
// Amounts are in the smallest currency unit throughout — paise for INR —
// because every one of these APIs takes them that way and the one place a
// float could creep in is a conversion nobody asked for.

export interface PaymentConnection {
  provider: PaymentProvider;
  credentials: Record<string, string>;
  config: Record<string, string>;
}

export interface PaymentLinkRequest {
  /** Smallest currency unit. 50000 is ₹500. */
  amountCents: number;
  currency: string;
  description: string;
  customerName?: string | null;
  /** E.164 with the plus, as toE164 produces. */
  customerPhone?: string | null;
  customerEmail?: string | null;
  /** Our own id for this, so a webhook can be matched back to an order. */
  reference: string;
  /** Where the customer lands after paying. */
  returnUrl?: string | null;
  /** When the link stops working, as a unix timestamp in seconds. */
  expiresAt?: number | null;
}

export interface PaymentLink {
  url: string;
  /** The gateway's own id, for reconciling a webhook later. */
  id: string;
  provider: PaymentProvider;
}

export type PaymentLinkResult =
  | ({ ok: true } & PaymentLink)
  | { ok: false; error: string };

// ------------------------------------------------------------- Razorpay

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

function razorpayAuth(connection: PaymentConnection): string {
  return basicAuth(
    connection.config.key_id ?? connection.credentials.key_id ?? "",
    connection.credentials.key_secret ?? ""
  );
}

async function razorpayLink(
  connection: PaymentConnection,
  request: PaymentLinkRequest
): Promise<PaymentLinkResult> {
  const result = await providerFetch(`${RAZORPAY_BASE}/payment_links`, {
    method: "POST",
    headers: jsonHeaders(razorpayAuth(connection)),
    body: JSON.stringify({
      amount: request.amountCents,
      currency: request.currency,
      description: request.description.slice(0, 2048),
      reference_id: request.reference.slice(0, 40),
      // Razorpay will send its own WhatsApp and SMS nudges if asked. We are
      // already in a WhatsApp conversation with this customer, so it is off:
      // two messages about one payment from two senders reads as a scam.
      notify: { sms: false, email: false },
      reminder_enable: false,
      ...(request.customerName || request.customerPhone || request.customerEmail
        ? {
            customer: {
              ...(request.customerName ? { name: request.customerName } : {}),
              ...(request.customerPhone ? { contact: request.customerPhone } : {}),
              ...(request.customerEmail ? { email: request.customerEmail } : {}),
            },
          }
        : {}),
      ...(request.returnUrl
        ? { callback_url: request.returnUrl, callback_method: "get" }
        : {}),
      ...(request.expiresAt ? { expire_by: request.expiresAt } : {}),
    }),
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status === 401
          ? "Razorpay rejected the key pair. Check the Key ID and secret are from the same mode — a live key with a test secret fails exactly like this."
          : (result.error ?? "Razorpay refused the payment link."),
    };
  }

  const body = result.body as { id?: string; short_url?: string } | null;
  if (!body?.short_url || !body.id) {
    return { ok: false, error: "Razorpay created the link but returned no URL." };
  }
  return { ok: true, url: body.short_url, id: body.id, provider: "razorpay" };
}

async function razorpayTest(connection: PaymentConnection): Promise<string | null> {
  const result = await providerFetch(`${RAZORPAY_BASE}/payments?count=1`, {
    headers: jsonHeaders(razorpayAuth(connection)),
  });
  if (result.ok) return null;
  return result.status === 401
    ? "Razorpay rejected the key pair. Check the Key ID and secret are from the same mode."
    : (result.error ?? "Razorpay refused the request.");
}

// ------------------------------------------------------------- Cashfree

/**
 * Cashfree keeps test and live on different hosts, which is a whole class of
 * "my keys don't work" — a sandbox key against the production host is a 401
 * that reads like a bad secret.
 */
function cashfreeBase(config: Record<string, string>): string {
  const mode = (config.mode ?? "production").trim().toLowerCase();
  return mode === "sandbox" || mode === "test"
    ? "https://sandbox.cashfree.com/pg"
    : "https://api.cashfree.com/pg";
}

function cashfreeHeaders(connection: PaymentConnection): Record<string, string> {
  return {
    ...jsonHeaders(),
    "x-client-id": connection.config.app_id ?? connection.credentials.app_id ?? "",
    "x-client-secret": connection.credentials.secret_key ?? "",
    // Cashfree requires a pinned API version and rejects the request without
    // one, rather than defaulting to its latest.
    "x-api-version": "2023-08-01",
  };
}

async function cashfreeLink(
  connection: PaymentConnection,
  request: PaymentLinkRequest
): Promise<PaymentLinkResult> {
  const result = await providerFetch(`${cashfreeBase(connection.config)}/links`, {
    method: "POST",
    headers: cashfreeHeaders(connection),
    body: JSON.stringify({
      link_id: request.reference.slice(0, 50),
      // Cashfree takes major units, unlike the other two.
      link_amount: request.amountCents / 100,
      link_currency: request.currency,
      link_purpose: request.description.slice(0, 500),
      customer_details: {
        // A phone number is mandatory here, and Cashfree wants it without
        // the country code prefix's plus.
        customer_phone: (request.customerPhone ?? "").replace(/^\+/, ""),
        ...(request.customerName ? { customer_name: request.customerName } : {}),
        ...(request.customerEmail ? { customer_email: request.customerEmail } : {}),
      },
      link_notify: { send_sms: false, send_email: false },
      ...(request.returnUrl ? { link_meta: { return_url: request.returnUrl } } : {}),
      ...(request.expiresAt
        ? { link_expiry_time: new Date(request.expiresAt * 1000).toISOString() }
        : {}),
    }),
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status === 401
          ? `Cashfree rejected the credentials. Check they are ${
              (connection.config.mode ?? "production") === "sandbox" ? "sandbox" : "production"
            } keys — the two hosts do not accept each other's.`
          : (result.error ?? "Cashfree refused the payment link."),
    };
  }

  const body = result.body as { link_id?: string; link_url?: string } | null;
  if (!body?.link_url) {
    return { ok: false, error: "Cashfree created the link but returned no URL." };
  }
  return {
    ok: true,
    url: body.link_url,
    id: body.link_id ?? request.reference,
    provider: "cashfree",
  };
}

async function cashfreeTest(connection: PaymentConnection): Promise<string | null> {
  // Asking for a link that cannot exist: a 404 proves the credentials were
  // accepted, which is exactly what we want to know and costs nothing.
  const result = await providerFetch(
    `${cashfreeBase(connection.config)}/links/neura-connection-check`,
    { headers: cashfreeHeaders(connection) }
  );

  if (result.ok || result.status === 404) return null;
  return result.status === 401
    ? "Cashfree rejected the credentials. Check the App ID and secret, and that the mode matches where they came from."
    : (result.error ?? "Cashfree refused the request.");
}

// --------------------------------------------------------------- Stripe

const STRIPE_BASE = "https://api.stripe.com/v1";

function stripeHeaders(connection: PaymentConnection): Record<string, string> {
  return {
    Authorization: `Bearer ${connection.credentials.secret_key ?? ""}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

/**
 * Stripe has no one-shot "link for this amount": a Payment Link points at a
 * Price, which points at a Product. So three calls, and the price is created
 * inline on the product to keep it to two.
 */
async function stripeLink(
  connection: PaymentConnection,
  request: PaymentLinkRequest
): Promise<PaymentLinkResult> {
  const price = await providerFetch(`${STRIPE_BASE}/prices`, {
    method: "POST",
    headers: stripeHeaders(connection),
    body: new URLSearchParams({
      unit_amount: String(request.amountCents),
      currency: request.currency.toLowerCase(),
      "product_data[name]": request.description.slice(0, 250) || "Payment",
    }).toString(),
  });

  if (!price.ok) {
    return {
      ok: false,
      error:
        price.status === 401
          ? "Stripe rejected the secret key."
          : (price.error ?? "Stripe would not create a price."),
    };
  }

  const priceId = (price.body as { id?: string } | null)?.id;
  if (!priceId) return { ok: false, error: "Stripe created a price but returned no id." };

  const params = new URLSearchParams({
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    // Our reference, so a webhook can be matched back to the order.
    "metadata[reference]": request.reference,
  });
  if (request.returnUrl) {
    params.set("after_completion[type]", "redirect");
    params.set("after_completion[redirect][url]", request.returnUrl);
  }

  const link = await providerFetch(`${STRIPE_BASE}/payment_links`, {
    method: "POST",
    headers: stripeHeaders(connection),
    body: params.toString(),
  });

  if (!link.ok) return { ok: false, error: link.error ?? "Stripe refused the payment link." };

  const body = link.body as { id?: string; url?: string } | null;
  if (!body?.url || !body.id) {
    return { ok: false, error: "Stripe created the link but returned no URL." };
  }
  return { ok: true, url: body.url, id: body.id, provider: "stripe" };
}

async function stripeTest(connection: PaymentConnection): Promise<string | null> {
  const result = await providerFetch(`${STRIPE_BASE}/balance`, {
    headers: stripeHeaders(connection),
  });
  if (result.ok) return null;
  return result.status === 401
    ? "Stripe rejected the secret key. It should start sk_live_ or sk_test_."
    : (result.error ?? "Stripe refused the request.");
}

// ------------------------------------------------------------- dispatch

const CREATE: Record<
  PaymentProvider,
  (c: PaymentConnection, r: PaymentLinkRequest) => Promise<PaymentLinkResult>
> = {
  razorpay: razorpayLink,
  cashfree: cashfreeLink,
  stripe: stripeLink,
};

const TEST: Record<PaymentProvider, (c: PaymentConnection) => Promise<string | null>> = {
  razorpay: razorpayTest,
  cashfree: cashfreeTest,
  stripe: stripeTest,
};

/** Creates a payment link. Never throws. */
export function createPaymentLink(
  connection: PaymentConnection,
  request: PaymentLinkRequest
): Promise<PaymentLinkResult> {
  if (request.amountCents <= 0) {
    return Promise.resolve({ ok: false, error: "A payment link needs an amount above zero." });
  }
  return CREATE[connection.provider](connection, request);
}

/** Checks the credentials. Null when they work, else why not. */
export function testPaymentProvider(connection: PaymentConnection): Promise<string | null> {
  return TEST[connection.provider](connection);
}
