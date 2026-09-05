// Types for the platform administration + billing layer
// (supabase/migrations/20260820100000_admin_billing.sql).
//
// Kept separate from database.ts so the tenant schema stays readable; these
// tables are queried through the loosely-typed admin helpers rather than the
// generated client generics.

export type PlanInterval = "monthly" | "yearly";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | "expired";
export type OrderKind = "subscription" | "onboarding_fee" | "add_on" | "other";
export type OrderStatus = "pending" | "paid" | "failed" | "refunded";
export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type DiscountType = "percent" | "fixed";

export type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  currency: string;
  billing_interval: PlanInterval;
  message_limit: number | null;
  contact_limit: number | null;
  seat_limit: number | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export type AddOn = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  currency: string;
  is_active: boolean;
  created_at: string;
}

export type Subscription = {
  id: string;
  org_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export type Coupon = {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  max_redemptions: number | null;
  times_redeemed: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export type Order = {
  id: string;
  org_id: string;
  plan_id: string | null;
  coupon_id: string | null;
  kind: OrderKind;
  description: string | null;
  amount_cents: number;
  currency: string;
  status: OrderStatus;
  provider: string | null;
  provider_reference: string | null;
  created_at: string;
  paid_at: string | null;
}

export type SupportTicket = {
  id: string;
  org_id: string;
  created_by: string | null;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
}

export type WebhookLog = {
  id: string;
  org_id: string | null;
  phone_number_id: string | null;
  event_type: string | null;
  signature_valid: boolean;
  payload: unknown;
  error: string | null;
  created_at: string;
}

export type PlatformSetting = {
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

// Money is stored in the smallest currency unit; format at the edge only.
export function formatMoney(cents: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Logs need the clock as well as the calendar — "yesterday" is not enough
// to line a bot run up against the message that triggered it.
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
