// Which screen an order belongs on.
//
// Pure by design: no fetch, no env, no server-only, so the rule is one
// function two screens agree on rather than two filters that drift.
//
// Commerce and Shipments read the same table, which is right — an order
// is one thing and shipping it is something that happens to it. What was
// wrong was showing all of them in both places. Pulling a courier
// account in put every parcel of the last year into Commerce, where the
// question is "what did somebody buy", each row with no items on it and
// a tracking button that belongs on the other screen.

export interface OrderOrigin {
  /** Set once the order exists at the courier, however it got there. */
  shiprocketOrderId: string | null;
  /** True when the order is attached to a WhatsApp conversation. */
  hasConversation: boolean;
  /** How many lines the order has. A pulled-in parcel has none. */
  itemCount: number;
}

/**
 * Whether this order started here.
 *
 * An order raised in this product always has something of ours on it: a
 * conversation it came from, or lines somebody entered. One pulled in
 * from the courier has neither — it is a parcel we learned about, not a
 * sale we took.
 *
 * Deliberately not "has no shiprocket id": an order that started here
 * and was then pushed to the courier has one too, and hiding those would
 * empty the screen of exactly the orders that worked.
 */
export function startedHere(order: OrderOrigin): boolean {
  if (order.hasConversation) return true;
  if (order.itemCount > 0) return true;
  // No conversation, no lines: ours only if the courier never saw it,
  // which means somebody raised it here a moment ago.
  return !order.shiprocketOrderId;
}

/** The opposite, for the Shipments screen's own wording. */
export function cameFromCourier(order: OrderOrigin): boolean {
  return !startedHere(order);
}

/**
 * Splits a list once, so both counts come from the same pass and cannot
 * disagree with each other on screen.
 */
export function splitByOrigin<T extends OrderOrigin>(
  orders: readonly T[]
): { own: T[]; courier: T[] } {
  const own: T[] = [];
  const courier: T[] = [];
  for (const order of orders) {
    if (startedHere(order)) own.push(order);
    else courier.push(order);
  }
  return { own, courier };
}
