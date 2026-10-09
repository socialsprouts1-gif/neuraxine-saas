// Whether the customer actually got the invoice.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Two different facts wear the same word. An invoice's status goes
// draft → sent → paid, where "sent" is the accounting sense: issued, a
// number claimed, the money now owed. Whether a WhatsApp message reached
// anybody is a separate question, and issueInvoice sets the status before
// the send is even attempted.
//
// So an invoice whose message was refused — no conversation open, outside
// the 24-hour window, a dead connection — sits in the list with a green
// "sent" badge, and the only person who knows it never arrived is the
// customer who did not get it. sent_at already records the truth and
// nothing has ever read it.

export interface InvoiceDeliveryRow {
  status: string;
  /** Set only when a WhatsApp message actually went out. */
  sent_at?: string | null;
  /** Why the last attempt failed, when it did. */
  delivery_error?: string | null;
}

export type DeliveryState = "draft" | "delivered" | "undelivered";

export interface Delivery {
  state: DeliveryState;
  label: string;
  tone: "grey" | "green" | "amber";
  detail: string | null;
}

/** Statuses that mean the invoice has been issued to a customer. */
const ISSUED = new Set(["sent", "partly_paid", "paid", "overdue"]);

export function describeDelivery(row: InvoiceDeliveryRow): Delivery {
  const status = row.status?.trim().toLowerCase() ?? "";

  if (!ISSUED.has(status)) {
    return {
      state: "draft",
      label: "not issued",
      tone: "grey",
      detail: null,
    };
  }

  if (row.sent_at) {
    return {
      state: "delivered",
      label: "delivered",
      tone: "green",
      detail: null,
    };
  }

  // Issued, so the number is spent and the money is owed — but nothing
  // reached the customer. Money owed and message delivered are different
  // facts and this is the case where they disagree.
  return {
    state: "undelivered",
    label: "not delivered",
    tone: "amber",
    detail:
      row.delivery_error?.trim() ||
      "The invoice was issued but no WhatsApp message went out. Open it and press Send — the reason will be shown if it fails again.",
  };
}

/**
 * The line above a list, when some of it did not arrive.
 *
 * Silent when everything is fine: a banner that is always there is a
 * banner nobody reads.
 */
export function describeUndelivered(rows: readonly InvoiceDeliveryRow[]): string | null {
  const stuck = rows.filter((row) => describeDelivery(row).state === "undelivered").length;
  if (stuck === 0) return null;

  return `${stuck} invoice${stuck === 1 ? " was" : "s were"} issued but never reached the customer on WhatsApp. ${
    stuck === 1 ? "It is" : "They are"
  } marked below — open ${stuck === 1 ? "it" : "them"} and press Send to try again, or to see why.`;
}
