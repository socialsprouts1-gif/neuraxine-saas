// Where a parcel is in its own lifecycle, and what can be done next.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Shiprocket's steps happen in a fixed order and each one refuses to run
// before the one before it: an order has to exist there before a courier
// can be assigned, a courier before a label, a label before a pickup.
// Offering all four buttons at once means three of them fail, each with
// a different error, and the operator learns the order by being refused
// — so the screen only offers what will actually work.

export interface ShipmentRow {
  /** Ours. Null until the order has been pushed. */
  shiprocketOrderId: string | null;
  shipmentId: string | null;
  awb: string | null;
  labelUrl: string | null;
  invoiceUrl: string | null;
  pickupScheduledAt: string | null;
  /** Ready to ship at all — paid or confirmed, not a draft or cancelled. */
  orderStatus: string;
}

export type Stage =
  | "not_shippable"
  | "not_pushed"
  | "awaiting_courier"
  | "ready_to_pick"
  | "picked_up";

/** Order states where shipping makes sense at all. */
const SHIPPABLE = new Set(["paid", "confirmed", "shipped", "delivered"]);

export function shipmentStage(row: ShipmentRow): Stage {
  if (!SHIPPABLE.has(row.orderStatus)) return "not_shippable";
  if (!row.shiprocketOrderId) return "not_pushed";
  if (!row.awb) return "awaiting_courier";
  if (!row.pickupScheduledAt) return "ready_to_pick";
  return "picked_up";
}

export interface StageView {
  label: string;
  tone: "grey" | "amber" | "blue" | "green";
  detail: string;
}

export function describeStage(stage: Stage): StageView {
  switch (stage) {
    case "not_shippable":
      return {
        label: "not ready",
        tone: "grey",
        detail:
          "Mark the order paid or confirmed before shipping it. A cancelled or unpaid order should not be going out.",
      };
    case "not_pushed":
      return {
        label: "not sent",
        tone: "amber",
        detail: "Not on Shiprocket yet. Send it there to get a shipment created.",
      };
    case "awaiting_courier":
      return {
        label: "no courier",
        tone: "amber",
        detail:
          "On Shiprocket, but no courier has been assigned, so there is no AWB and nothing to track. Assign one to get a tracking number.",
      };
    case "ready_to_pick":
      return {
        label: "ready to ship",
        tone: "blue",
        detail: "Has a courier and a tracking number. Print the label, then book the pickup.",
      };
    case "picked_up":
      return {
        label: "with courier",
        tone: "green",
        detail: "Pickup is booked. Tracking updates come from the courier from here on.",
      };
  }
}

export type Action =
  | "push"
  | "assign_courier"
  | "label"
  | "invoice"
  | "pickup"
  | "track"
  | "notify";

/**
 * What is worth offering at this stage.
 *
 * Ordered so the first entry is the step that moves the parcel forward,
 * which is what a button row should lead with.
 */
export function availableActions(row: ShipmentRow): Action[] {
  const stage = shipmentStage(row);

  switch (stage) {
    case "not_shippable":
      return [];
    case "not_pushed":
      return ["push"];
    case "awaiting_courier":
      // The invoice is for the order, not the shipment, so it exists as
      // soon as Shiprocket has the order.
      return ["assign_courier", "invoice"];
    case "ready_to_pick":
      return ["pickup", "label", "invoice", "track", "notify"];
    case "picked_up":
      return ["track", "notify", "label", "invoice"];
  }
}

/** Whether a document has already been made, so the button can say so. */
export function documentLabel(kind: "label" | "invoice", existing: string | null): string {
  const noun = kind === "label" ? "label" : "invoice";
  return existing ? `Open ${noun}` : `Make ${noun}`;
}

/**
 * The one-line summary above a list.
 *
 * Counts what is stuck rather than what exists: a list of forty orders
 * where three have no courier is a screen about those three.
 */
export function describeQueue(rows: readonly ShipmentRow[]): string | null {
  const stages = rows.map(shipmentStage);
  const waiting = stages.filter((stage) => stage === "not_pushed").length;
  const noCourier = stages.filter((stage) => stage === "awaiting_courier").length;

  const parts: string[] = [];
  if (waiting > 0) parts.push(`${waiting} not sent to Shiprocket yet`);
  if (noCourier > 0) parts.push(`${noCourier} waiting for a courier`);

  return parts.length > 0 ? `${parts.join(", ")}.` : null;
}
