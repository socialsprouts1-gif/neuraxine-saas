"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import {
  RECURRENCE_INTERVALS,
  formatInvoiceAmount,
  isValidGstin,
  todayIn,
  type RecurrenceInterval,
} from "@/lib/invoices";
import {
  attachPaymentLink,
  decideInterState,
  invoiceUrl,
  issueInvoice,
  loadInvoiceSettings,
  recordInvoicePayment,
  runDueRecurringInvoices,
  sendInvoice,
  writeInvoiceLines,
  type StoredLine,
} from "@/lib/invoice-engine";
import { INVOICE_STATUSES } from "@/types/portal";
import type { ActionResult } from "./actions";

// Everything the Invoice screens write.
//
// As everywhere else, the org comes from the session and never from the
// submitted form: a form field naming an org id is a request to write to
// somebody else's workspace.

async function requireManager() {
  const ctx = await requireFeature("invoicing");
  if (ctx.role !== "owner" && ctx.role !== "admin") return null;
  return ctx;
}

const DENIED = "Only owners and admins can change invoicing.";

function number(form: FormData, name: string, fallback: number): number {
  const raw = String(form.get(name) ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Where this app is reachable, for the link that goes in a message. */
async function origin(): Promise<string> {
  const host = (await headers()).get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

// -------------------------------------------------------------- settings

export async function saveInvoiceSettings(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const text = (name: string): string | null =>
    String(formData.get(name) ?? "").trim() || null;

  const gstin = (text("gstin") ?? "").toUpperCase();
  // Checked because a wrong GSTIN goes onto every invoice from here on, and
  // an invoice with a bad one is a document the customer cannot claim credit
  // against.
  if (gstin && !isValidGstin(gstin)) {
    return {
      ok: false,
      error:
        "That GSTIN does not check out. It is 15 characters — two-digit state code, ten-character PAN, then three more — and the last character is a checksum, so a single typo fails here.",
    };
  }

  const prefix = String(formData.get("number_prefix") ?? "").trim();
  const nextNumber = Math.max(1, Math.round(number(formData, "next_number", 1)));

  const supabase = await createClient();

  // Moving the counter backwards would hand out a number an issued invoice
  // already has, and the unique index would then refuse the next issue with
  // a constraint error nobody could read.
  const { data: existing } = await supabase
    .from("invoice_settings")
    .select("next_number")
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (existing && nextNumber < existing.next_number) {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .not("number", "is", null);

    if (count && count > 0) {
      return {
        ok: false,
        error: `The counter is at ${existing.next_number} and ${count} ${
          count === 1 ? "invoice has" : "invoices have"
        } already been issued. Moving it back would reuse a number that is already on a document.`,
      };
    }
  }

  const { error } = await supabase.from("invoice_settings").upsert(
    {
      org_id: ctx.orgId,
      business_name: text("business_name"),
      address: text("address"),
      city: text("city"),
      state: text("state"),
      postal_code: text("postal_code"),
      country: text("country") ?? "India",
      gstin: gstin || null,
      pan: (text("pan") ?? "").toUpperCase() || null,
      email: text("email"),
      phone: text("phone"),
      logo_url: text("logo_url"),
      bank_account_name: text("bank_account_name"),
      bank_account_number: text("bank_account_number"),
      bank_ifsc: (text("bank_ifsc") ?? "").toUpperCase() || null,
      bank_name: text("bank_name"),
      upi_id: text("upi_id"),
      number_prefix: prefix,
      next_number: nextNumber,
      number_padding: Math.max(1, Math.min(10, Math.round(number(formData, "number_padding", 4)))),
      default_terms_days: Math.max(
        0,
        Math.min(365, Math.round(number(formData, "default_terms_days", 15)))
      ),
      default_tax_percent: Math.max(0, Math.min(100, number(formData, "default_tax_percent", 18))),
      round_to_rupee: formData.get("round_to_rupee") !== null,
      notes: text("notes"),
      terms_text: text("terms_text") ?? "",
      send_message:
        text("send_message") ??
        "Invoice {{number}} for {{total}} is ready. View and pay here: {{link}}",
      reminder_message:
        text("reminder_message") ??
        "A reminder that invoice {{number}} for {{total}} was due on {{due}}. {{link}}",
      payment_received_message:
        text("payment_received_message") ??
        "Payment received for invoice {{number}}. Thank you.",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoice/settings");
  revalidatePath("/invoice/list");
  return { ok: true, message: "Saved. New invoices will use these details." };
}

// --------------------------------------------------------------- invoices

/**
 * Reads the line items out of the builder form.
 *
 * The rows submit parallel arrays, so an empty row is skipped rather than
 * becoming a zero line — somebody who adds three rows and fills two should
 * get two lines.
 */
function readLines(formData: FormData, defaultTax: number): StoredLine[] {
  const descriptions = formData.getAll("line_description").map(String);
  const hsn = formData.getAll("line_hsn").map(String);
  const quantities = formData.getAll("line_quantity").map(String);
  const prices = formData.getAll("line_price").map(String);
  const taxes = formData.getAll("line_tax").map(String);
  const discounts = formData.getAll("line_discount").map(String);

  const lines: StoredLine[] = [];
  for (let index = 0; index < descriptions.length; index += 1) {
    const description = (descriptions[index] ?? "").trim();
    const price = Number(prices[index] ?? "0");
    if (!description || !Number.isFinite(price) || price <= 0) continue;

    const quantity = Number(quantities[index] ?? "1");
    const tax = Number(taxes[index] ?? String(defaultTax));
    const discount = Number(discounts[index] ?? "0");

    lines.push({
      description,
      hsnCode: (hsn[index] ?? "").trim() || null,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      // Typed in rupees, stored in paise.
      unitPriceCents: Math.round(price * 100),
      taxPercent: Number.isFinite(tax) ? Math.max(0, Math.min(100, tax)) : 0,
      discountPercent: Number.isFinite(discount) ? Math.max(0, Math.min(100, discount)) : 0,
    });
  }

  return lines;
}

/**
 * Creates or updates an invoice.
 *
 * An issued invoice keeps its number and its dates: editing one is for
 * fixing a typo in a description, not for changing what was billed. Changing
 * the money on a document the customer already has is a credit note, which
 * is a different thing and not pretended at here.
 */
export async function saveInvoice(
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const ctx = await requireFeature("invoicing");

  const supabase = await createClient();
  const settings = await loadInvoiceSettings(supabase, ctx.orgId);

  const lines = readLines(formData, Number(settings.default_tax_percent) || 0);
  if (lines.length === 0) {
    return { ok: false, error: "Add at least one line with a description and an amount." };
  }

  const contactId = String(formData.get("contact_id") ?? "").trim() || null;
  const customerGstin = (String(formData.get("customer_gstin") ?? "").trim() || "").toUpperCase();
  if (customerGstin && !isValidGstin(customerGstin)) {
    return {
      ok: false,
      error:
        "The customer's GSTIN does not check out. Leave it blank if you do not have it — the invoice is still valid, it just cannot be claimed against.",
    };
  }

  const { data: contact } = contactId
    ? await supabase
        .from("contacts")
        .select("id, name, wa_id, custom_fields")
        .eq("org_id", ctx.orgId)
        .eq("id", contactId)
        .maybeSingle()
    : { data: null };

  const custom = (contact?.custom_fields ?? {}) as Record<string, string>;
  const interState = decideInterState(settings, customerGstin || null);

  const id = String(formData.get("id") ?? "").trim();

  const row = {
    org_id: ctx.orgId,
    contact_id: contactId,
    // A snapshot: the customer as they are today, not a join that rewrites
    // itself when the contact is renamed.
    customer_name:
      String(formData.get("customer_name") ?? "").trim() || contact?.name || null,
    customer_gstin: customerGstin || null,
    customer_address:
      String(formData.get("customer_address") ?? "").trim() || custom.address || null,
    customer_state: String(formData.get("customer_state") ?? "").trim() || null,
    customer_phone: contact?.wa_id ?? null,
    customer_email:
      String(formData.get("customer_email") ?? "").trim() || custom.email || null,
    currency: settings.currency,
    inter_state: interState,
    notes: String(formData.get("notes") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  let invoiceId = id;

  if (id) {
    const { error } = await supabase
      .from("invoices")
      .update(row)
      .eq("id", id)
      .eq("org_id", ctx.orgId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: created, error } = await supabase
      .from("invoices")
      .insert({ ...row, status: "draft", created_by: ctx.user.id })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: error?.message ?? "The invoice could not be created." };
    }
    invoiceId = created.id;
  }

  const written = await writeInvoiceLines(supabase, invoiceId, lines, {
    interState,
    roundToRupee: settings.round_to_rupee,
  });
  if (!written.ok) return { ok: false, error: written.error ?? "The lines could not be saved." };

  revalidatePath("/invoice/list");
  return {
    ok: true,
    id: invoiceId,
    message: `${id ? "Updated" : "Draft saved"} — ${formatInvoiceAmount(
      written.total,
      settings.currency
    )}.`,
  };
}

/** Claims a number and marks the invoice issued. */
export async function issueInvoiceAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("invoicing");

  const invoiceId = String(formData.get("id") ?? "").trim();
  if (!invoiceId) return { ok: false, error: "No invoice selected." };

  const supabase = await createClient();
  const settings = await loadInvoiceSettings(supabase, ctx.orgId);
  const result = await issueInvoice(supabase, ctx.orgId, invoiceId, settings);

  revalidatePath("/invoice/list");
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: `Issued as ${result.number}.` };
}

/**
 * Issues if needed, attaches a payment link, and sends it.
 *
 * One button, because the three steps are never wanted separately: nobody
 * issues an invoice in order to leave it sitting there.
 */
export async function sendInvoiceAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("invoicing");

  const invoiceId = String(formData.get("id") ?? "").trim();
  if (!invoiceId) return { ok: false, error: "No invoice selected." };
  const reminder = formData.get("reminder") !== null;

  const supabase = await createClient();
  const settings = await loadInvoiceSettings(supabase, ctx.orgId);

  const issued = await issueInvoice(supabase, ctx.orgId, invoiceId, settings);
  if (!issued.ok) return { ok: false, error: issued.error };

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, number, total_cents, amount_paid_cents, currency, customer_name, customer_phone, payment_link_url"
    )
    .eq("org_id", ctx.orgId)
    .eq("id", invoiceId)
    .maybeSingle();

  // Best effort. An invoice worth sending is worth sending without a link
  // if the gateway is down — the page it points at shows the bank details
  // and the UPI id either way.
  let linkNote = "";
  if (invoice && !invoice.payment_link_url) {
    const link = await attachPaymentLink(supabase, ctx.orgId, invoice as never);
    if (!link.ok) linkNote = ` No payment link: ${link.error}`;
  }

  const sent = await sendInvoice(supabase, ctx.orgId, invoiceId, await origin(), {
    reminder,
  });

  revalidatePath("/invoice/list");
  revalidatePath("/inbox");

  if (!sent.ok) return { ok: false, error: sent.error ?? "The message did not send." };
  return {
    ok: true,
    message: `${reminder ? "Reminder" : issued.number} sent on WhatsApp.${linkNote}`,
  };
}

/** Records money against an invoice, in part or in full. */
export async function recordPayment(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("invoicing");

  const invoiceId = String(formData.get("id") ?? "").trim();
  if (!invoiceId) return { ok: false, error: "No invoice selected." };

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("total_cents, amount_paid_cents, currency")
    .eq("org_id", ctx.orgId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { ok: false, error: "That invoice no longer exists." };

  const outstanding = invoice.total_cents - invoice.amount_paid_cents;
  const typed = number(formData, "amount", 0);
  // Blank means "the rest of it", which is what somebody marking an invoice
  // paid actually wants.
  const amountCents = typed > 0 ? Math.round(typed * 100) : outstanding;

  if (amountCents <= 0) return { ok: false, error: "This invoice is already settled." };

  const result = await recordInvoicePayment(supabase, ctx.orgId, invoiceId, amountCents, {
    provider: String(formData.get("method") ?? "").trim() || "manual",
  });

  revalidatePath("/invoice/list");
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    message: result.fullyPaid
      ? "Marked paid in full."
      : `${formatInvoiceAmount(amountCents, invoice.currency)} recorded — ${formatInvoiceAmount(
          outstanding - amountCents,
          invoice.currency
        )} still owing.`,
  };
}

/** Cancels an invoice. The number stays spent, deliberately. */
export async function setInvoiceStatus(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("invoicing");

  const invoiceId = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!invoiceId) return { ok: false, error: "No invoice selected." };
  if (!(INVOICE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Not a status an invoice can be in." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: status as "paid", updated_at: new Date().toISOString() })
    .eq("org_id", ctx.orgId)
    .eq("id", invoiceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoice/list");
  return {
    ok: true,
    message:
      status === "cancelled"
        ? "Cancelled. The number stays used — a cancelled invoice is part of the sequence, not a gap in it."
        : `Marked ${status.replace("_", " ")}.`,
  };
}

/** Deletes a draft. Only a draft: an issued invoice has been sent to somebody. */
export async function deleteInvoice(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("invoicing");

  const invoiceId = String(formData.get("id") ?? "").trim();
  if (!invoiceId) return { ok: false, error: "No invoice selected." };

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("status, number")
    .eq("org_id", ctx.orgId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return { ok: false, error: "That invoice no longer exists." };
  if (invoice.number) {
    return {
      ok: false,
      error: `${invoice.number} has been issued, so it cannot be deleted — GST requires the sequence to be unbroken. Cancel it instead.`,
    };
  }

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("id", invoiceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoice/list");
  return { ok: true, message: "Draft deleted." };
}

/** Copies an invoice into a new draft, for a repeat bill or a correction. */
export async function duplicateInvoice(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("invoicing");

  const invoiceId = String(formData.get("id") ?? "").trim();
  if (!invoiceId) return { ok: false, error: "No invoice selected." };

  const supabase = await createClient();
  const { data: source } = await supabase
    .from("invoices")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (!source) return { ok: false, error: "That invoice no longer exists." };

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("sort_order");

  const { data: created, error } = await supabase
    .from("invoices")
    .insert({
      org_id: ctx.orgId,
      contact_id: source.contact_id,
      status: "draft",
      currency: source.currency,
      inter_state: source.inter_state,
      customer_name: source.customer_name,
      customer_gstin: source.customer_gstin,
      customer_address: source.customer_address,
      customer_state: source.customer_state,
      customer_phone: source.customer_phone,
      customer_email: source.customer_email,
      notes: source.notes,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { ok: false, error: error?.message ?? "The copy could not be created." };
  }

  const settings = await loadInvoiceSettings(supabase, ctx.orgId);
  const written = await writeInvoiceLines(
    supabase,
    created.id,
    (items ?? []).map((item) => ({
      description: item.description,
      hsnCode: item.hsn_code,
      quantity: Number(item.quantity),
      unitPriceCents: item.unit_price_cents,
      taxPercent: Number(item.tax_percent),
      discountPercent: Number(item.discount_percent),
      productId: item.product_id,
    })),
    { interState: source.inter_state, roundToRupee: settings.round_to_rupee }
  );

  if (!written.ok) return { ok: false, error: written.error ?? "The lines could not be copied." };

  revalidatePath("/invoice/list");
  return { ok: true, message: "Copied to a new draft." };
}

/** The link to give a customer, for pasting somewhere else. */
export async function invoiceLink(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("invoicing");

  const invoiceId = String(formData.get("id") ?? "").trim();
  if (!invoiceId) return { ok: false, error: "No invoice selected." };

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("public_token, number")
    .eq("org_id", ctx.orgId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return { ok: false, error: "That invoice no longer exists." };

  return {
    ok: true,
    message: invoiceUrl(invoice.public_token, await origin()),
  };
}

// -------------------------------------------------------------- recurring

export async function saveRecurringInvoice(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Give the schedule a name you will recognise." };

  const interval = String(formData.get("interval") ?? "monthly");
  if (!(RECURRENCE_INTERVALS as readonly string[]).includes(interval)) {
    return { ok: false, error: "Not an interval this supports." };
  }

  const supabase = await createClient();
  const settings = await loadInvoiceSettings(supabase, ctx.orgId);
  const lines = readLines(formData, Number(settings.default_tax_percent) || 0);

  if (lines.length === 0) {
    return { ok: false, error: "Add at least one line, or there is nothing to invoice for." };
  }

  const startOn = String(formData.get("next_run_on") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startOn)) {
    return { ok: false, error: "Pick the date the first invoice should go out." };
  }

  const limitRaw = String(formData.get("occurrences_limit") ?? "").trim();
  const limit = limitRaw ? Math.max(1, Math.round(Number(limitRaw))) : null;
  if (limitRaw && !Number.isFinite(Number(limitRaw))) {
    return { ok: false, error: "The number of invoices has to be a number, or blank for forever." };
  }

  const id = String(formData.get("id") ?? "").trim();

  const row = {
    org_id: ctx.orgId,
    contact_id: String(formData.get("contact_id") ?? "").trim() || null,
    title,
    interval: interval as RecurrenceInterval,
    next_run_on: startOn,
    occurrences_limit: limit,
    is_active: formData.get("is_active") !== null,
    auto_send: formData.get("auto_send") !== null,
    terms_days: Math.max(0, Math.min(365, Math.round(number(formData, "terms_days", 15)))),
    notes: String(formData.get("notes") ?? "").trim() || null,
    // Stored as the builder wrote them, so the schedule raises the same
    // lines every time without needing a template invoice to copy from.
    items: lines,
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await supabase
        .from("recurring_invoices")
        .update(row)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
    : await supabase.from("recurring_invoices").insert(row);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoice/recurring");
  return {
    ok: true,
    message: id
      ? "Schedule updated."
      : `“${title}” starts on ${startOn}, then ${
          interval === "weekly" ? "weekly" : `every ${interval.replace("ly", "")}`
        }.`,
  };
}

export async function deleteRecurringInvoice(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "No schedule selected." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_invoices")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoice/recurring");
  // The invoices it raised keep their numbers and their history; only the
  // schedule goes.
  return { ok: true, message: "Schedule deleted. Invoices it already raised are untouched." };
}

export async function toggleRecurringInvoice(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const id = String(formData.get("id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return { ok: false, error: "No schedule selected." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_invoices")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoice/recurring");
  return { ok: true, message: active ? "Resumed." : "Paused." };
}

/**
 * Raises the invoices that have come due, now.
 *
 * The same work a scheduler does. This project runs on a plan with no cron,
 * so without a button a monthly invoice would never be raised at all.
 */
export async function runRecurringNow(): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const supabase = await createClient();
  const result = await runDueRecurringInvoices(supabase, ctx.orgId, await origin());

  revalidatePath("/invoice/recurring");
  revalidatePath("/invoice/list");

  if (result.error) return { ok: false, error: result.error };
  if (result.due === 0) {
    const settings = await loadInvoiceSettings(supabase, ctx.orgId);
    return {
      ok: true,
      message: `Nothing due as of ${todayIn(settings.timezone)}. A schedule runs on its own date, not on demand.`,
    };
  }

  const parts = [
    `${result.raised} raised`,
    result.sent > 0 ? `${result.sent} sent` : null,
    result.failed > 0 ? `${result.failed} had a problem` : null,
  ].filter(Boolean);

  return {
    ok: result.failed === 0,
    ...(result.failed === 0
      ? { message: `${parts.join(", ")}.` }
      : { error: `${parts.join(", ")}. ${result.firstError}` }),
  } as ActionResult;
}
