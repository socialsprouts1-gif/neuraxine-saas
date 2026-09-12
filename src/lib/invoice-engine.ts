import "server-only";

import {
  amountInWords,
  dueDate,
  formatInvoiceAmount,
  formatInvoiceNumber,
  invoiceTotals,
  isInterState,
  nextRunDate,
  todayIn,
  type InvoiceLine,
  type RecurrenceInterval,
} from "@/lib/invoices";
import { fillTemplate } from "@/lib/booking-dialogue";
import { loadIntegration } from "@/lib/integration-store";
import { createPaymentLink, type PaymentConnection } from "@/lib/payment-links";
import { isPaymentProvider } from "@/lib/provider-meta";
import { loadPaymentSettings } from "@/lib/commerce";
import { loadOrgConnection, sendAndLogText, type RunnerClient } from "@/lib/whatsapp-send";
import { findContactConversation } from "@/lib/contact-conversation";
import { toE164 } from "@/lib/crm";
import type { Invoice, InvoiceSettings } from "@/types/portal";

// Issuing an invoice, sending it, and raising the recurring ones.
//
// The arithmetic is in invoices.ts, pure and tested. This is the part that
// touches the database and WhatsApp: claiming a number, writing the lines,
// putting a payment link on it, and sending the customer a link to a page
// they can open without logging in.
//
// No PDF. Generating one server-side means a headless browser or a layout
// engine, and neither belongs in a serverless function that has to answer in
// seconds; WhatsApp also needs a document at a public URL, so a PDF would
// have to be stored and served anyway. The customer gets a link to a printable
// page instead, which their phone renders and their browser can save as a PDF.
// Worth naming as a trade rather than leaving as a gap.

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  org_id: "",
  business_name: null,
  address: null,
  city: null,
  state: null,
  postal_code: null,
  country: "India",
  gstin: null,
  pan: null,
  email: null,
  phone: null,
  logo_url: null,
  signature_url: null,
  bank_account_name: null,
  bank_account_number: null,
  bank_ifsc: null,
  bank_name: null,
  upi_id: null,
  number_prefix: "INV",
  next_number: 1,
  number_padding: 4,
  default_terms_days: 15,
  default_tax_percent: 18,
  round_to_rupee: true,
  currency: "INR",
  timezone: "Asia/Kolkata",
  notes: null,
  terms_text: "Payment due within the terms shown. Goods once sold are not returnable.",
  send_message: "Invoice {{number}} for {{total}} is ready. View and pay here: {{link}}",
  payment_received_message: "Payment received for invoice {{number}}. Thank you.",
  reminder_message:
    "A reminder that invoice {{number}} for {{total}} was due on {{due}}. {{link}}",
  created_at: "",
  updated_at: "",
};

/** The workspace's invoice settings, defaults where there is no row. */
export async function loadInvoiceSettings(
  supabase: RunnerClient,
  orgId: string
): Promise<InvoiceSettings> {
  const { data, error } = await supabase
    .from("invoice_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  // An unmigrated database and a workspace that has never opened the screen
  // both mean "the defaults", not "broken".
  if (error || !data) return { ...DEFAULT_INVOICE_SETTINGS, org_id: orgId };
  return { ...DEFAULT_INVOICE_SETTINGS, ...(data as unknown as InvoiceSettings) };
}

// -------------------------------------------------------------- computing

export interface StoredLine extends InvoiceLine {
  productId?: string | null;
}

/**
 * Recomputes an invoice's money and writes it, lines and all.
 *
 * One function for creating and for editing, because the alternative is two
 * places that both decide what an invoice totals — and they drift.
 */
export async function writeInvoiceLines(
  supabase: RunnerClient,
  invoiceId: string,
  lines: StoredLine[],
  options: { interState: boolean; roundToRupee: boolean }
): Promise<{ ok: boolean; error?: string; total: number }> {
  const totals = invoiceTotals(lines, {
    interState: options.interState,
    roundToRupee: options.roundToRupee,
  });

  // Replaced wholesale rather than diffed: an invoice's lines are edited as
  // a set, and matching them up by index would silently mis-assign a line
  // whenever one is deleted from the middle.
  const { error: clearError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", invoiceId);
  if (clearError) return { ok: false, error: clearError.message, total: 0 };

  if (lines.length > 0) {
    const { error: insertError } = await supabase.from("invoice_items").insert(
      lines.map((line, index) => ({
        invoice_id: invoiceId,
        product_id: line.productId ?? null,
        description: line.description.slice(0, 500),
        hsn_code: line.hsnCode ?? null,
        quantity: line.quantity,
        unit_price_cents: line.unitPriceCents,
        tax_percent: line.taxPercent,
        discount_percent: line.discountPercent ?? 0,
        taxable_cents: totals.lines[index].taxableCents,
        tax_cents: totals.lines[index].taxCents,
        total_cents: totals.lines[index].totalCents,
        sort_order: index,
      }))
    );
    if (insertError) return { ok: false, error: insertError.message, total: 0 };
  }

  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      inter_state: options.interState,
      subtotal_cents: totals.subtotalCents,
      discount_cents: totals.discountCents,
      taxable_cents: totals.taxableCents,
      cgst_cents: totals.cgstCents,
      sgst_cents: totals.sgstCents,
      igst_cents: totals.igstCents,
      tax_cents: totals.taxCents,
      round_off_cents: totals.roundOffCents,
      total_cents: totals.totalCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  if (updateError) return { ok: false, error: updateError.message, total: 0 };
  return { ok: true, total: totals.totalCents };
}

/** Whether this sale crosses a state line, given both GSTINs. */
export function decideInterState(
  settings: InvoiceSettings,
  customerGstin: string | null
): boolean {
  return isInterState(settings.gstin ?? "", customerGstin);
}

// ---------------------------------------------------------------- issuing

/**
 * Turns a draft into an issued invoice.
 *
 * The number is claimed here and nowhere else, through the database function
 * that steps the counter under a row lock — GST wants consecutive numbers,
 * and a recurring run raising twenty at once is exactly the case a
 * max(number)+1 would get wrong.
 */
export async function issueInvoice(
  supabase: RunnerClient,
  orgId: string,
  invoiceId: string,
  settings: InvoiceSettings
): Promise<{ ok: true; number: string } | { ok: false; error: string }> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, number, status, total_cents")
    .eq("org_id", orgId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return { ok: false, error: "That invoice no longer exists." };
  if (invoice.status === "cancelled") {
    return { ok: false, error: "This invoice was cancelled. Copy it to a new one instead." };
  }

  // Already numbered. Re-issuing must not burn a second number, or the
  // sequence gains a hole for every accidental double-click.
  if (invoice.number) return { ok: true, number: invoice.number };

  if (invoice.total_cents <= 0) {
    return { ok: false, error: "An invoice needs at least one line with an amount." };
  }

  const { data: claimed, error: claimError } = await supabase.rpc("claim_invoice_number", {
    target_org: orgId,
  });

  if (claimError || typeof claimed !== "number") {
    return {
      ok: false,
      error:
        claimError?.message ??
        "Could not claim an invoice number. If this mentions a missing function, the invoicing migration has not been run.",
    };
  }

  const number = formatInvoiceNumber(
    settings.number_prefix,
    claimed,
    settings.number_padding
  );
  const issuedOn = todayIn(settings.timezone);

  const { error } = await supabase
    .from("invoices")
    .update({
      number,
      status: "sent",
      issued_on: issuedOn,
      due_on: dueDate(issuedOn, settings.default_terms_days),
      terms_text: settings.terms_text,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  if (error) {
    // The number is spent either way — the counter has already stepped — so
    // say so rather than letting somebody wonder why the sequence jumped.
    return {
      ok: false,
      error: `${error.message} Number ${number} was claimed and is now unused.`,
    };
  }

  return { ok: true, number };
}

// --------------------------------------------------------------- payments

/**
 * Puts a payment link on an invoice.
 *
 * The invoice number is the gateway's reference, so the payment webhook can
 * find the invoice without a lookup table — the same trick orders use, and
 * the reason invoice numbers and order references never share a shape.
 */
export async function attachPaymentLink(
  supabase: RunnerClient,
  orgId: string,
  invoice: Pick<
    Invoice,
    "id" | "number" | "total_cents" | "amount_paid_cents" | "currency" | "customer_name" | "customer_phone"
  >
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const outstanding = invoice.total_cents - invoice.amount_paid_cents;
  if (outstanding <= 0) return { ok: false, error: "This invoice has nothing left to pay." };
  if (!invoice.number) {
    return { ok: false, error: "Issue the invoice first — a payment needs its number." };
  }

  const payments = await loadPaymentSettings(supabase, orgId);
  const provider = payments.link_provider ?? "";
  if (!isPaymentProvider(provider)) {
    return {
      ok: false,
      error:
        "No payment gateway chosen. Connect Razorpay, Cashfree or Stripe under Integrations, then pick it under Commerce → Payments.",
    };
  }

  const stored = await loadIntegration(supabase, orgId, provider);
  if (!stored) {
    return {
      ok: false,
      error: `${provider} is not connected, or its stored credentials could not be decrypted.`,
    };
  }

  const connection: PaymentConnection = {
    provider,
    credentials: stored.credentials,
    config: stored.config,
  };

  const link = await createPaymentLink(connection, {
    // The outstanding balance, not the total: an invoice part-paid in cash
    // must not ask for the whole amount again.
    amountCents: outstanding,
    currency: invoice.currency,
    description: `Invoice ${invoice.number}`,
    customerName: invoice.customer_name,
    customerPhone: invoice.customer_phone ? toE164(invoice.customer_phone) : null,
    reference: invoice.number,
    expiresAt:
      Math.floor(Date.now() / 1000) +
      Math.max(600, payments.payment_expiry_minutes * 60),
  });

  if (!link.ok) return { ok: false, error: link.error };

  await supabase
    .from("invoices")
    .update({
      payment_provider: provider,
      payment_link_url: link.url,
      payment_reference: link.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id);

  return { ok: true, url: link.url };
}

// ---------------------------------------------------------------- sending

/** The link a customer opens. Absolute, because it goes in a message. */
export function invoiceUrl(token: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/i/${token}`;
}

export interface SendResult {
  ok: boolean;
  error?: string;
  outsideWindow?: boolean;
}

/**
 * Sends an invoice to its customer on WhatsApp.
 *
 * The 24-hour window applies: this is the business starting the
 * conversation, so an invoice to somebody who has not written in a day
 * cannot go out as free-form text. Said plainly rather than failing with
 * Meta's wording, because the fix — send a template, or wait for them to
 * write — is not obvious from "parameter is invalid".
 */
export async function sendInvoice(
  supabase: RunnerClient,
  orgId: string,
  invoiceId: string,
  origin: string,
  options: { reminder?: boolean } = {}
): Promise<SendResult> {
  const settings = await loadInvoiceSettings(supabase, orgId);

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, number, status, total_cents, amount_paid_cents, currency, due_on, public_token, contact_id, conversation_id, payment_link_url"
    )
    .eq("org_id", orgId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return { ok: false, error: "That invoice no longer exists." };
  if (!invoice.number) return { ok: false, error: "Issue the invoice before sending it." };
  if (!invoice.contact_id) {
    return { ok: false, error: "This invoice has no contact to send to." };
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("wa_id, name, opted_out")
    .eq("org_id", orgId)
    .eq("id", invoice.contact_id)
    .maybeSingle();

  if (!contact?.wa_id) return { ok: false, error: "This invoice's contact has no WhatsApp number." };
  if (contact.opted_out) {
    return { ok: false, error: "This contact has opted out of messages from you." };
  }

  // The thread it was raised in, when there is one, otherwise the one the
  // customer last used. Never assume a contact has exactly one.
  const conversation = await findContactConversation(
    supabase,
    orgId,
    invoice.contact_id,
    invoice.conversation_id
  );

  if (!conversation) {
    return {
      ok: false,
      error:
        "There is no WhatsApp conversation with this contact yet. They have to message you first — WhatsApp does not let a business open a chat with free-form text.",
    };
  }

  const connection = await loadOrgConnection(supabase, orgId, {
    conversationId: conversation.id,
  });
  if (!connection) {
    return { ok: false, error: "No active WhatsApp connection for this workspace." };
  }

  const outstanding = invoice.total_cents - invoice.amount_paid_cents;
  const link = invoiceUrl(invoice.public_token, origin);
  const template = options.reminder ? settings.reminder_message : settings.send_message;

  const body = fillTemplate(template, {
    number: invoice.number,
    total: formatInvoiceAmount(outstanding, invoice.currency),
    due: invoice.due_on ?? "—",
    link,
    name: contact.name ?? "",
    words: amountInWords(outstanding, invoice.currency),
  });

  const sent = await sendAndLogText({
    supabase,
    connection,
    conversationId: conversation.id,
    toWaId: contact.wa_id,
    body,
    lastInboundAt: conversation.last_inbound_at,
  });

  if (!sent.ok) {
    return {
      ok: false,
      outsideWindow: sent.outsideWindow,
      error: sent.outsideWindow
        ? "Outside WhatsApp's 24-hour window, so a plain message will not go out. Send an approved template from Campaigns, or wait for the customer to write first. The invoice link is on the invoice either way."
        : sent.error,
    };
  }

  const now = new Date().toISOString();
  await supabase
    .from("invoices")
    .update(
      options.reminder
        ? { last_reminded_at: now, updated_at: now }
        : { sent_at: now, conversation_id: conversation.id, updated_at: now }
    )
    .eq("id", invoice.id);

  return { ok: true };
}

// ------------------------------------------------------- recording payment

/**
 * Records money against an invoice.
 *
 * Additive rather than absolute, so two part payments add up instead of the
 * second replacing the first. Status follows the arithmetic: fully paid, or
 * partly, and never "paid" for a penny short.
 */
export async function recordInvoicePayment(
  supabase: RunnerClient,
  orgId: string,
  invoiceId: string,
  amountCents: number,
  options: { reference?: string | null; provider?: string | null } = {}
): Promise<{ ok: boolean; error?: string; fullyPaid: boolean }> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, total_cents, amount_paid_cents, status")
    .eq("org_id", orgId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return { ok: false, error: "That invoice no longer exists.", fullyPaid: false };

  const paid = Math.max(0, invoice.amount_paid_cents + Math.round(amountCents));
  const fullyPaid = paid >= invoice.total_cents;

  const { error } = await supabase
    .from("invoices")
    .update({
      amount_paid_cents: paid,
      status: fullyPaid ? "paid" : paid > 0 ? "partly_paid" : invoice.status,
      paid_at: fullyPaid ? new Date().toISOString() : null,
      ...(options.reference ? { payment_reference: options.reference } : {}),
      ...(options.provider ? { payment_provider: options.provider } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  if (error) return { ok: false, error: error.message, fullyPaid: false };
  return { ok: true, fullyPaid };
}

// -------------------------------------------------------------- recurring

export interface RecurringResult {
  due: number;
  raised: number;
  sent: number;
  failed: number;
  firstError: string | null;
  error?: string;
}

const EMPTY_RECURRING: RecurringResult = {
  due: 0,
  raised: 0,
  sent: 0,
  failed: 0,
  firstError: null,
};

/** How many schedules one sweep will run. */
const RECURRING_BATCH = 50;

/**
 * Raises the invoices that have come due, and sends the ones set to send.
 *
 * Never throws. Reachable from a scheduler and from a button, because this
 * project runs on a plan with no cron — without the button a monthly invoice
 * would never be raised at all.
 *
 * The date is advanced from the schedule's own next_run_on rather than from
 * today, so a sweep that has not run for three days raises what it owes and
 * lands back on the right cycle instead of shifting the billing date.
 */
export async function runDueRecurringInvoices(
  supabase: RunnerClient,
  orgId: string,
  origin: string
): Promise<RecurringResult> {
  try {
    const settings = await loadInvoiceSettings(supabase, orgId);
    const today = todayIn(settings.timezone);

    const { data: schedules, error } = await supabase
      .from("recurring_invoices")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .lte("next_run_on", today)
      .order("next_run_on")
      .limit(RECURRING_BATCH);

    if (error) return { ...EMPTY_RECURRING, error: error.message };
    if (!schedules || schedules.length === 0) return { ...EMPTY_RECURRING };

    const result: RecurringResult = { ...EMPTY_RECURRING, due: schedules.length };

    for (const schedule of schedules) {
      const outcome = await raiseFromSchedule(
        supabase,
        orgId,
        schedule as never,
        settings,
        today,
        origin
      );

      if (outcome.raised) result.raised += 1;
      if (outcome.sent) result.sent += 1;
      if (outcome.error) {
        result.failed += 1;
        result.firstError ??= outcome.error;
      }
    }

    return result;
  } catch (error) {
    console.error("The recurring invoice sweep crashed", error);
    return {
      ...EMPTY_RECURRING,
      error: error instanceof Error ? error.message : "Unknown failure",
    };
  }
}

interface ScheduleRow {
  id: string;
  org_id: string;
  contact_id: string | null;
  title: string;
  interval: RecurrenceInterval;
  next_run_on: string;
  occurrences_limit: number | null;
  occurrences_done: number;
  auto_send: boolean;
  terms_days: number;
  notes: string | null;
  items: unknown;
}

async function raiseFromSchedule(
  supabase: RunnerClient,
  orgId: string,
  schedule: ScheduleRow,
  settings: InvoiceSettings,
  today: string,
  origin: string
): Promise<{ raised: boolean; sent: boolean; error: string | null }> {
  const lines = readScheduleItems(schedule.items, settings);
  if (lines.length === 0) {
    // A schedule with nothing on it would raise a zero invoice every month
    // forever. Switched off with a reason rather than left spinning.
    await supabase
      .from("recurring_invoices")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", schedule.id);
    return { raised: false, sent: false, error: `“${schedule.title}” has no lines, so it was paused.` };
  }

  const contact = schedule.contact_id
    ? (
        await supabase
          .from("contacts")
          .select("id, name, wa_id, custom_fields")
          .eq("org_id", orgId)
          .eq("id", schedule.contact_id)
          .maybeSingle()
      ).data
    : null;

  const custom = (contact?.custom_fields ?? {}) as Record<string, string>;
  const customerGstin = custom.gstin ?? custom.GSTIN ?? null;

  const { data: created, error } = await supabase
    .from("invoices")
    .insert({
      org_id: orgId,
      contact_id: schedule.contact_id,
      recurring_id: schedule.id,
      status: "draft",
      currency: settings.currency,
      customer_name: contact?.name ?? null,
      customer_phone: contact?.wa_id ?? null,
      customer_gstin: customerGstin,
      customer_address: custom.address ?? null,
      customer_email: custom.email ?? null,
      notes: schedule.notes,
      inter_state: decideInterState(settings, customerGstin),
    })
    .select("id")
    .single();

  if (error || !created) {
    return { raised: false, sent: false, error: error?.message ?? "The invoice could not be created" };
  }

  const written = await writeInvoiceLines(supabase, created.id, lines, {
    interState: decideInterState(settings, customerGstin),
    roundToRupee: settings.round_to_rupee,
  });
  if (!written.ok) {
    return { raised: false, sent: false, error: written.error ?? "The lines could not be written" };
  }

  // The cycle advances from its own date, not from today. A sweep that has
  // not run since Friday raises what it owes and stays on the same day of
  // the month rather than sliding.
  let cursor = nextRunDate(schedule.next_run_on, schedule.interval);
  // If the schedule is badly behind, walk it forward to the future so one
  // sweep does not raise a year of invoices in a loop.
  let guard = 0;
  while (cursor <= today && guard < 60) {
    cursor = nextRunDate(cursor, schedule.interval);
    guard += 1;
  }

  const done = schedule.occurrences_done + 1;
  const finished = schedule.occurrences_limit !== null && done >= schedule.occurrences_limit;

  await supabase
    .from("recurring_invoices")
    .update({
      last_run_on: today,
      next_run_on: cursor,
      occurrences_done: done,
      is_active: !finished,
      updated_at: new Date().toISOString(),
    })
    .eq("id", schedule.id);

  if (!schedule.auto_send) {
    // Raised as a draft on purpose: somebody wanted to look at it first.
    return { raised: true, sent: false, error: null };
  }

  const issued = await issueInvoice(supabase, orgId, created.id, {
    ...settings,
    default_terms_days: schedule.terms_days,
  });
  if (!issued.ok) return { raised: true, sent: false, error: issued.error };

  // Best effort: an invoice raised and issued is worth having even if the
  // gateway is down, and the link can be added by hand afterwards.
  const { data: full } = await supabase
    .from("invoices")
    .select(
      "id, number, total_cents, amount_paid_cents, currency, customer_name, customer_phone"
    )
    .eq("id", created.id)
    .maybeSingle();
  if (full) await attachPaymentLink(supabase, orgId, full as never);

  const sent = await sendInvoice(supabase, orgId, created.id, origin);
  return {
    raised: true,
    sent: sent.ok,
    // Outside the window is not a failure of the schedule — the invoice
    // exists and is issued, it just could not be messaged.
    error: sent.ok || sent.outsideWindow ? null : (sent.error ?? null),
  };
}

/**
 * Reads a schedule's stored lines.
 *
 * The column is jsonb written by a form, so it can be anything. A line that
 * will not parse is dropped rather than throwing: one bad line should cost
 * that line, not the month's invoice.
 */
export function readScheduleItems(
  value: unknown,
  settings: InvoiceSettings
): StoredLine[] {
  if (!Array.isArray(value)) return [];

  const lines: StoredLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;

    const description = typeof row.description === "string" ? row.description.trim() : "";
    const unitPriceCents = Number(row.unitPriceCents ?? row.unit_price_cents ?? 0);
    if (!description || !Number.isFinite(unitPriceCents) || unitPriceCents <= 0) continue;

    const quantity = Number(row.quantity ?? 1);
    const taxPercent = Number(row.taxPercent ?? row.tax_percent ?? settings.default_tax_percent);
    const discountPercent = Number(row.discountPercent ?? row.discount_percent ?? 0);

    lines.push({
      description,
      hsnCode: typeof row.hsnCode === "string" ? row.hsnCode : null,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitPriceCents: Math.round(unitPriceCents),
      taxPercent: Number.isFinite(taxPercent) ? Math.max(0, Math.min(100, taxPercent)) : 0,
      discountPercent:
        Number.isFinite(discountPercent) ? Math.max(0, Math.min(100, discountPercent)) : 0,
    });
  }

  return lines;
}
