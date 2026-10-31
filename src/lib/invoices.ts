// Invoice arithmetic.
//
// An invoice is a legal document, not a receipt: in India a GST invoice has
// to carry consecutive numbering, the tax split the right way for where the
// customer is, and — by convention that every accountant expects — the total
// written out in words. Getting any of it wrong is not a cosmetic bug; it is
// a document somebody files.
//
// The split is the part that is easy to get quietly wrong. Same state as the
// seller means CGST plus SGST, half the rate each. A different state means
// IGST at the full rate. The total is identical either way, which is exactly
// why nobody notices the mistake until a return is filed.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.

/** The GST rates that exist. Anything else is a typo, not a rate. */
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const;

export interface InvoiceLine {
  description: string;
  /** HSN for goods, SAC for services. Required on a registered invoice. */
  hsnCode?: string | null;
  quantity: number;
  /** Smallest currency unit, before tax. */
  unitPriceCents: number;
  /** Percent. Per line, because a bill can mix rates. */
  taxPercent: number;
  /** Percent off this line, applied before tax. */
  discountPercent?: number;
}

export interface LineTotals {
  /** Quantity × price, before discount. */
  grossCents: number;
  discountCents: number;
  /** What the tax is charged on. */
  taxableCents: number;
  taxCents: number;
  /** Taxable plus tax. */
  totalCents: number;
}

export interface TaxBand {
  percent: number;
  taxableCents: number;
  /** Half the band's tax, when the sale is inside one state. */
  cgstCents: number;
  sgstCents: number;
  /** The whole of it, when the sale crosses a state line. */
  igstCents: number;
  totalTaxCents: number;
}

export interface InvoiceTotals {
  subtotalCents: number;
  discountCents: number;
  taxableCents: number;
  cgstCents: number;
  sgstCents: number;
  igstCents: number;
  taxCents: number;
  /** What rounding to the nearest rupee added or removed. Can be negative. */
  roundOffCents: number;
  totalCents: number;
  /** One row per distinct rate, which is what a GST invoice must show. */
  bands: TaxBand[];
  lines: LineTotals[];
}

export interface TaxContext {
  /** False for a sale inside the seller's own state. */
  interState: boolean;
  /** Round the total to the nearest rupee and show the difference. */
  roundToRupee: boolean;
}

export const DEFAULT_TAX_CONTEXT: TaxContext = {
  interState: false,
  roundToRupee: true,
};

/** One line, before anything is combined. */
export function lineTotals(line: InvoiceLine): LineTotals {
  const quantity = Math.max(0, line.quantity);
  const grossCents = Math.round(Math.max(0, line.unitPriceCents) * quantity);

  // The discount comes off before tax, because tax is charged on what the
  // customer actually pays for the goods.
  const discountPercent = Math.min(100, Math.max(0, line.discountPercent ?? 0));
  const discountCents = Math.round((grossCents * discountPercent) / 100);
  const taxableCents = grossCents - discountCents;

  const taxPercent = Math.max(0, line.taxPercent);
  const taxCents = Math.round((taxableCents * taxPercent) / 100);

  return {
    grossCents,
    discountCents,
    taxableCents,
    taxCents,
    totalCents: taxableCents + taxCents,
  };
}

/**
 * The whole invoice.
 *
 * Tax is computed per line and then grouped by rate, rather than once over
 * the subtotal: a bill mixing 5% and 18% has no single rate to apply, and
 * the banded breakdown is what has to appear on the document anyway.
 */
export function invoiceTotals(
  lines: InvoiceLine[],
  context: TaxContext = DEFAULT_TAX_CONTEXT
): InvoiceTotals {
  const computed = lines.map(lineTotals);

  const subtotalCents = computed.reduce((total, line) => total + line.grossCents, 0);
  const discountCents = computed.reduce((total, line) => total + line.discountCents, 0);
  const taxableCents = computed.reduce((total, line) => total + line.taxableCents, 0);

  // Grouped by rate, in ascending order — the order a GST summary table is
  // conventionally printed in.
  const byRate = new Map<number, { taxableCents: number; taxCents: number }>();
  for (let index = 0; index < lines.length; index += 1) {
    const percent = Math.max(0, lines[index].taxPercent);
    const entry = byRate.get(percent) ?? { taxableCents: 0, taxCents: 0 };
    entry.taxableCents += computed[index].taxableCents;
    entry.taxCents += computed[index].taxCents;
    byRate.set(percent, entry);
  }

  const bands: TaxBand[] = [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([percent, entry]) => {
      if (context.interState) {
        return {
          percent,
          taxableCents: entry.taxableCents,
          cgstCents: 0,
          sgstCents: 0,
          igstCents: entry.taxCents,
          totalTaxCents: entry.taxCents,
        };
      }

      // Half each, and the halves must add back to the whole: an odd number
      // of paise split by rounding twice loses one, and a total that is a
      // paisa short of its own components is the kind of thing an auditor
      // circles in red.
      const cgstCents = Math.floor(entry.taxCents / 2);
      return {
        percent,
        taxableCents: entry.taxableCents,
        cgstCents,
        sgstCents: entry.taxCents - cgstCents,
        igstCents: 0,
        totalTaxCents: entry.taxCents,
      };
    });

  const cgstCents = bands.reduce((total, band) => total + band.cgstCents, 0);
  const sgstCents = bands.reduce((total, band) => total + band.sgstCents, 0);
  const igstCents = bands.reduce((total, band) => total + band.igstCents, 0);
  const taxCents = cgstCents + sgstCents + igstCents;

  const beforeRounding = taxableCents + taxCents;
  const rounded = context.roundToRupee
    ? Math.round(beforeRounding / 100) * 100
    : beforeRounding;

  return {
    subtotalCents,
    discountCents,
    taxableCents,
    cgstCents,
    sgstCents,
    igstCents,
    taxCents,
    roundOffCents: rounded - beforeRounding,
    totalCents: rounded,
    bands,
    lines: computed,
  };
}

// ---------------------------------------------------------------- numbering

/**
 * "INV-2026-0042".
 *
 * The prefix is the tenant's and the sequence is ours. Padding keeps them
 * sorting correctly as text, which is how they end up sorted in every
 * spreadsheet anyone exports them into.
 */
export function formatInvoiceNumber(
  prefix: string,
  sequence: number,
  padding = 4
): string {
  const clean = prefix.trim().replace(/[^A-Za-z0-9/\-_]/g, "");
  const digits = String(Math.max(1, Math.floor(sequence))).padStart(
    Math.max(1, Math.min(10, padding)),
    "0"
  );
  return clean ? `${clean}${clean.endsWith("-") || clean.endsWith("/") ? "" : "-"}${digits}` : digits;
}

// ------------------------------------------------------------------- dates

/** Payment terms, as the number of days after the invoice date. */
export const PAYMENT_TERMS = [0, 7, 15, 30, 45, 60, 90] as const;

/**
 * When an invoice falls due.
 *
 * Plain calendar arithmetic in UTC. An invoice's due date is a date, not an
 * instant — nobody's payment terms turn on a timezone — so the string in and
 * the string out are both "YYYY-MM-DD".
 */
export function dueDate(issuedOn: string, termDays: number): string {
  const issued = parseDate(issuedOn);
  if (!issued) return issuedOn;
  const due = new Date(Date.UTC(issued.year, issued.month - 1, issued.day));
  due.setUTCDate(due.getUTCDate() + Math.max(0, Math.floor(termDays)));
  return toDateString(due);
}

export type RecurrenceInterval = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export const RECURRENCE_INTERVALS: RecurrenceInterval[] = [
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "yearly",
];

export const RECURRENCE_LABEL: Record<RecurrenceInterval, string> = {
  weekly: "Every week",
  fortnightly: "Every two weeks",
  monthly: "Every month",
  quarterly: "Every three months",
  yearly: "Every year",
};

/**
 * The next date a recurring invoice should be raised.
 *
 * The month cases clamp rather than overflow: a subscription raised on the
 * 31st must land on the 28th in February, not skid into March and then be a
 * month out for the rest of the year.
 */
export function nextRunDate(from: string, interval: RecurrenceInterval): string {
  const start = parseDate(from);
  if (!start) return from;

  if (interval === "weekly" || interval === "fortnightly") {
    const next = new Date(Date.UTC(start.year, start.month - 1, start.day));
    next.setUTCDate(next.getUTCDate() + (interval === "weekly" ? 7 : 14));
    return toDateString(next);
  }

  const months = interval === "monthly" ? 1 : interval === "quarterly" ? 3 : 12;
  const targetMonth = start.month - 1 + months;
  const year = start.year + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;

  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toDateString(new Date(Date.UTC(year, month, Math.min(start.day, lastDay))));
}

/** "2026-09-09" as parts, or null if it is not a date. */
function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toDateString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

/** Today, as a date string in the business's timezone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // en-CA gives YYYY-MM-DD, which is the format we want anyway.
  return parts;
}

/** True when an unpaid invoice is past its due date. */
export function isOverdue(dueOn: string | null, today: string): boolean {
  if (!dueOn) return false;
  return dueOn < today;
}

// -------------------------------------------------------- amount in words

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–99. */
function twoDigits(value: number): string {
  if (value < 20) return ONES[value];
  const tens = TENS[Math.floor(value / 10)];
  const ones = ONES[value % 10];
  return ones ? `${tens} ${ones}` : tens;
}

/**
 * A number in the Indian system: crore, lakh, thousand, hundred.
 *
 * Not the western grouping. "1,50,000" is one lakh fifty thousand, and an
 * invoice that says "one hundred fifty thousand" instead reads as though it
 * came from the wrong country.
 */
function indianWords(value: number): string {
  if (value === 0) return "Zero";

  const parts: string[] = [];
  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor((value % 10_000_000) / 100_000);
  const thousand = Math.floor((value % 100_000) / 1_000);
  const hundred = Math.floor((value % 1_000) / 100);
  const rest = value % 100;

  if (crore > 0) parts.push(`${indianWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred > 0) parts.push(`${ONES[hundred]} Hundred`);
  if (rest > 0) parts.push(twoDigits(rest));

  return parts.join(" ");
}

/**
 * "Rupees One Thousand Five Hundred and Fifty Paise Only".
 *
 * Every Indian invoice carries this line. It is not decoration: it is what
 * makes the figure unalterable, which is the whole reason the convention
 * exists.
 */
export function amountInWords(cents: number, currency = "INR"): string {
  const negative = cents < 0;
  const absolute = Math.abs(Math.round(cents));
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;

  const [major, minor] = currency === "INR" ? ["Rupees", "Paise"] : [currency, "Cents"];

  const parts = [major, indianWords(whole)];
  if (fraction > 0) parts.push("and", twoDigits(fraction), minor);
  parts.push("Only");

  return `${negative ? "Minus " : ""}${parts.join(" ")}`;
}

/** "₹1,50,000.00" — grouped the Indian way, always with paise. */
export function formatInvoiceAmount(cents: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

// ------------------------------------------------------------------- GSTIN

/**
 * Whether a GSTIN is the right shape.
 *
 * Fifteen characters: two-digit state code, ten-character PAN, an entity
 * digit, a literal Z, and a checksum. Checked because a typo here goes onto
 * every invoice the business issues from then on.
 */
export function isValidGstin(value: string): boolean {
  const gstin = (value ?? "").trim().toUpperCase();
  if (!/^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return false;

  const state = Number(gstin.slice(0, 2));
  if (state < 1 || state > 38) return false;

  return gstin[14] === gstinChecksum(gstin.slice(0, 14));
}

/**
 * The fifteenth character.
 *
 * Base-36 over the first fourteen, doubling every second digit from the
 * right and folding the overflow back in — the same idea as Luhn, in a
 * larger alphabet.
 */
function gstinChecksum(first14: string): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;

  for (let index = 0; index < first14.length; index += 1) {
    const value = alphabet.indexOf(first14[index]);
    if (value < 0) return "";
    // Positions are counted from 1, and every even one is doubled.
    const factor = index % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }

  return alphabet[(36 - (sum % 36)) % 36];
}

/** The two-digit state code a GSTIN starts with, or null. */
export function gstinState(value: string): string | null {
  const gstin = (value ?? "").trim();
  return /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : null;
}

/**
 * Whether a sale crosses a state line.
 *
 * Decided from the two GSTINs' state codes, because that is what the law
 * decides it on. Unknown either side falls back to intra-state: it is the
 * common case, and a business selling locally with no customer GSTIN on
 * file should not have every invoice silently switch to IGST.
 */
export function isInterState(sellerGstin: string, customerGstin: string | null): boolean {
  const seller = gstinState(sellerGstin);
  const customer = customerGstin ? gstinState(customerGstin) : null;
  if (!seller || !customer) return false;
  return seller !== customer;
}
