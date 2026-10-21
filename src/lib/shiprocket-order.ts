// Turning one of our orders into the order Shiprocket wants.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Two traps live in here and both are expensive.
//
// The first is money. We store paise, Shiprocket takes rupees, and a
// missed division ships a ₹999 order declared at ₹99,900 — which is a
// customs value, an insurance value, and on a COD order the amount the
// courier tries to collect at the door.
//
// The second is that Shiprocket refuses the whole order for one missing
// field and answers with a validation blob keyed by field name. Checking
// here means the operator is told "pincode has to be 6 digits" before
// anything is sent, rather than after.

export interface OrderForShipping {
  reference: string;
  createdAt: string;
  currency: string;
  subtotalCents: number;
  totalCents: number;
  shippingCents: number;
  discountCents: number;
  /** Whether the money is already collected. Decides Prepaid vs COD. */
  paid: boolean;
  shipName: string | null;
  shipPhone: string | null;
  shipAddress: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipPincode: string | null;
  shipCountry: string | null;
  shipEmail: string | null;
  weightGrams: number | null;
  lengthCm: number | null;
  breadthCm: number | null;
  heightCm: number | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    sku?: string | null;
    /** HSN code, for a GST invoice. */
    hsn?: string | null;
    taxPercent?: number | null;
  }>;
  /** Paperwork rather than goods. Different customs treatment. */
  isDocument?: boolean;
  notes?: string | null;
  customerGstin?: string | null;
}

export interface ShiprocketOrderPayload {
  order_id: string;
  order_date: string;
  pickup_location: string;
  billing_customer_name: string;
  billing_last_name: string;
  billing_address: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: boolean;

  /** Only sent when the parcel goes somewhere other than the billing address. */
  shipping_customer_name?: string;
  shipping_last_name?: string;
  shipping_address?: string;
  shipping_city?: string;
  shipping_pincode?: string;
  shipping_state?: string;
  shipping_country?: string;
  shipping_email?: string;
  shipping_phone?: string;

  order_items: Array<{
    name: string;
    sku: string;
    units: number;
    selling_price: number;
    discount?: number;
    tax?: number;
    hsn?: string;
  }>;
  payment_method: "Prepaid" | "COD";
  shipping_charges: number;
  total_discount: number;
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
  /**
   * 0 for goods, 1 for paperwork.
   *
   * Required, and easy to miss because the name reads like a flag rather
   * than a field — leaving it out is refused outright.
   */
  is_document: 0 | 1;
  comment?: string;
  company_name?: string;
  customer_gstin?: string;
}

/** Paise to rupees, to two places. Shiprocket rejects more. */
export function toRupees(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Ten digits, the way Shiprocket wants an Indian number.
 *
 * Our numbers are stored WhatsApp-style with the country code on the
 * front, and sending that makes Shiprocket read 919876543210 as a
 * twelve-digit phone number and refuse it.
 */
export function localPhone(waId: string | null | undefined): string {
  const digits = (waId ?? "").replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) return digits.slice(-10);
  return digits.slice(-10);
}

/**
 * A name split the way Shiprocket's two fields expect.
 *
 * It requires a last name and refuses an empty one, so a single-word
 * name has to put something there. A full stop is what their own
 * dashboard does.
 */
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Customer", last: "." };
  if (parts.length === 1) return { first: parts[0], last: "." };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export type BuildResult =
  | { ok: true; payload: ShiprocketOrderPayload }
  | { ok: false; missing: string[]; error: string };

/** Shiprocket's own minimum. Zero on any of these is refused. */
const DEFAULT_WEIGHT_GRAMS = 500;
const DEFAULT_CM = 10;

export function buildShiprocketOrder(
  order: OrderForShipping,
  pickupLocation: string
): BuildResult {
  const missing: string[] = [];

  const name = splitName(order.shipName);
  const phone = localPhone(order.shipPhone);
  const address = order.shipAddress?.trim() ?? "";
  const city = order.shipCity?.trim() ?? "";
  const state = order.shipState?.trim() ?? "";
  const pincode = (order.shipPincode ?? "").replace(/\D/g, "");
  const country = order.shipCountry?.trim() || "India";

  if (!pickupLocation.trim()) missing.push("a pickup location");
  if (!address) missing.push("a street address");
  if (!city) missing.push("a city");
  if (!state) missing.push("a state");
  if (pincode.length !== 6) missing.push("a 6-digit pincode");
  if (phone.length !== 10) missing.push("a 10-digit phone number");
  if (order.items.length === 0) missing.push("at least one item");

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      error: `Shiprocket needs ${missing.join(", ")} before it will accept this order. Add them under Shipping on the order.`,
    };
  }

  // Shiprocket refuses a zero dimension or weight outright, so an order
  // nobody measured still has to ship. A stated default is better than a
  // refusal the operator cannot act on, and it is visible on the order.
  const weightKg = Math.max((order.weightGrams ?? DEFAULT_WEIGHT_GRAMS) / 1000, 0.01);

  return {
    ok: true,
    payload: {
      order_id: order.reference,
      // "YYYY-MM-DD HH:mm", which is the only shape their parser takes.
      order_date: new Date(order.createdAt).toISOString().slice(0, 16).replace("T", " "),
      pickup_location: pickupLocation.trim(),
      billing_customer_name: name.first,
      billing_last_name: name.last,
      billing_address: address,
      billing_city: city,
      billing_pincode: pincode,
      billing_state: state,
      billing_country: country,
      // Shiprocket requires the field. A placeholder on our own domain
      // beats inventing one that might belong to a real person.
      billing_email: order.shipEmail?.trim() || "orders@neurachat.in",
      billing_phone: phone,
      shipping_is_billing: true,
      order_items: order.items.map((item) => ({
        name: item.name,
        sku: item.sku?.trim() || item.name.slice(0, 40),
        units: Math.max(1, Math.round(item.quantity)),
        selling_price: toRupees(item.unitPriceCents),
        ...(item.hsn?.trim() ? { hsn: item.hsn.trim() } : {}),
        ...(item.taxPercent ? { tax: item.taxPercent } : {}),
      })),
      payment_method: order.paid ? "Prepaid" : "COD",
      shipping_charges: toRupees(order.shippingCents),
      total_discount: toRupees(order.discountCents),
      sub_total: toRupees(order.subtotalCents),
      length: Math.max(order.lengthCm ?? DEFAULT_CM, 0.5),
      breadth: Math.max(order.breadthCm ?? DEFAULT_CM, 0.5),
      height: Math.max(order.heightCm ?? DEFAULT_CM, 0.5),
      weight: weightKg,
      is_document: order.isDocument ? 1 : 0,
      ...(order.notes?.trim() ? { comment: order.notes.trim() } : {}),
      ...(order.customerGstin?.trim()
        ? { customer_gstin: order.customerGstin.trim().toUpperCase() }
        : {}),
    },
  };
}

/**
 * What to tell the customer once a shipment exists.
 *
 * Separate from the tracking message: this one is the moment the parcel
 * gets a number, which is the update people actually want.
 */
export function shippedMessage(input: {
  orderNumber: string;
  awb: string;
  courier: string | null;
  trackingUrl: string | null;
  expectedDelivery?: string | null;
}): string {
  const lines = [
    `Your order ${input.orderNumber} has been shipped${
      input.courier ? ` with ${input.courier}` : ""
    }.`,
  ];
  if (input.expectedDelivery) lines.push(`Expected by ${input.expectedDelivery}.`);
  lines.push(`Tracking number: ${input.awb}`);
  if (input.trackingUrl) lines.push(`Track it here: ${input.trackingUrl}`);
  return lines.join("\n");
}
