// Deciding what a "send these products" click will actually put in the chat.
//
// Pure by design: no fetch, no env, no server-only, so the rule can be
// tested and the builder can show the answer before anything is sent.
//
// WhatsApp has three different messages here and picks between them by how
// many products you name, which is not obvious from a screen with
// checkboxes on it. One product is a product card. Several is a scrollable
// list. None is the whole storefront. Getting that wrong is not an error —
// it is the customer receiving something other than what was meant.

/** Meta's cap on a multi-product message. Thirty, across all sections. */
export const MAX_PRODUCTS_PER_MESSAGE = 30;

/** WhatsApp's free-form window: 24 hours from the customer's last message. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SendableProduct {
  id: string;
  name: string;
  /**
   * The id Meta knows this product by. Null means it exists in this app
   * only, which is enough to list it and not enough to send it.
   */
  retailerId: string | null;
}

export type SendKind = "catalogue" | "single" | "list";

export interface SendPlan {
  kind: SendKind;
  /** The ids that will go to Meta, in selection order. */
  retailerIds: string[];
  /** What the customer receives, said plainly, before anyone commits. */
  summary: string;
  /** Set when the send cannot go ahead at all. */
  error: string | null;
  /** True when it can. */
  ok: boolean;
}

/**
 * Works out which of WhatsApp's three product messages a selection means.
 *
 * Mirrors the branching the send itself does, deliberately: a preview that
 * disagrees with what gets sent is worse than no preview.
 *
 * Selecting nothing is not a mistake — it means the whole catalogue, which
 * is a real and often better thing to send.
 */
export function planProductSend(
  products: readonly SendableProduct[],
  selectedIds: readonly string[],
  catalogueLinked: boolean
): SendPlan {
  if (!catalogueLinked) {
    return {
      kind: "catalogue",
      retailerIds: [],
      summary: "",
      ok: false,
      error:
        "No Meta catalogue is linked, so nothing can be sent as a product card. Link one under the Catalogue tab first.",
    };
  }

  const chosen = selectedIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is SendableProduct => Boolean(product));

  // Named but not in the catalogue. Said by name rather than as a count,
  // because "2 products cannot be sent" makes you go and find which two.
  const unsendable = chosen.filter((product) => !product.retailerId);
  if (unsendable.length > 0) {
    return {
      kind: "list",
      retailerIds: [],
      summary: "",
      ok: false,
      error: `${unsendable
        .map((product) => product.name)
        .join(", ")} ${unsendable.length === 1 ? "is" : "are"} not in your Meta catalogue, so ${
        unsendable.length === 1 ? "it" : "they"
      } cannot be sent. Unpick ${unsendable.length === 1 ? "it" : "them"}, or add ${
        unsendable.length === 1 ? "it" : "them"
      } in Commerce Manager and import again.`,
    };
  }

  const retailerIds = chosen
    .map((product) => product.retailerId)
    .filter((id): id is string => Boolean(id));

  if (retailerIds.length === 0) {
    return {
      kind: "catalogue",
      retailerIds: [],
      ok: true,
      error: null,
      summary: "Your whole storefront, which they can browse and build a cart from.",
    };
  }

  if (retailerIds.length > MAX_PRODUCTS_PER_MESSAGE) {
    return {
      kind: "list",
      retailerIds: [],
      summary: "",
      ok: false,
      error: `WhatsApp allows ${MAX_PRODUCTS_PER_MESSAGE} products in one message and ${retailerIds.length} are picked. Send fewer, or send the whole catalogue instead by unpicking everything.`,
    };
  }

  if (retailerIds.length === 1) {
    return {
      kind: "single",
      retailerIds,
      ok: true,
      error: null,
      summary: `A product card for ${chosen[0].name}, with an Add to cart button.`,
    };
  }

  return {
    kind: "list",
    retailerIds,
    ok: true,
    error: null,
    summary: `A scrollable list of ${retailerIds.length} products they can pick from and add to a cart.`,
  };
}

export type WindowTone = "open" | "closing" | "closed";

export interface WindowState {
  tone: WindowTone;
  /** Whole hours left, floored. Null once the window has shut. */
  hoursLeft: number | null;
  label: string;
}

/**
 * How long there is left to send this customer a free-form message.
 *
 * A product card is an interactive message, so it obeys WhatsApp's 24-hour
 * rule: outside the window Meta refuses it, and the refusal names a code
 * rather than the reason. Showing the clock next to each name turns that
 * into a choice made before sending rather than an error afterwards.
 */
export function windowState(
  lastInboundAt: string | null | undefined,
  now: number = Date.now()
): WindowState {
  if (!lastInboundAt) {
    return { tone: "closed", hoursLeft: null, label: "never messaged you" };
  }

  const since = new Date(lastInboundAt).getTime();
  if (Number.isNaN(since)) {
    return { tone: "closed", hoursLeft: null, label: "never messaged you" };
  }

  const remaining = SERVICE_WINDOW_MS - (now - since);
  if (remaining <= 0) return { tone: "closed", hoursLeft: null, label: "window closed" };

  const hours = Math.floor(remaining / 3_600_000);

  // Under an hour is shown in minutes: "0h left" reads as closed, and the
  // difference between forty minutes and four is the difference between
  // sending now and not bothering.
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(remaining / 60_000));
    return { tone: "closing", hoursLeft: 0, label: `${minutes} min left` };
  }

  return { tone: hours < 4 ? "closing" : "open", hoursLeft: hours, label: `${hours}h left` };
}

/** Whether this conversation can be sent an interactive message right now. */
export function canReceiveProducts(
  lastInboundAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  return windowState(lastInboundAt, now).tone !== "closed";
}
