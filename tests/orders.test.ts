import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REFERENCE_LENGTH,
  MINOR_UNIT_OFFSET,
  NO_CHARGES,
  buildOrderDetails,
  buildOrderStatus,
  describeLines,
  formatAmount,
  isOrderReference,
  orderReference,
  orderTotals,
  readInboundCart,
  type CartLine,
} from "../src/lib/orders.ts";

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    retailerId: "KRT-001",
    name: "Cotton kurta",
    quantity: 1,
    unitPriceCents: 129900,
    currency: "INR",
    ...overrides,
  };
}

describe("orderTotals", () => {
  it("multiplies quantity into the subtotal", () => {
    const totals = orderTotals([line({ quantity: 3 })], NO_CHARGES);
    assert.equal(totals.subtotalCents, 389700);
    assert.equal(totals.totalCents, 389700);
  });

  it("sums several lines", () => {
    const totals = orderTotals(
      [line({ unitPriceCents: 100000 }), line({ unitPriceCents: 50000, quantity: 2 })],
      NO_CHARGES
    );
    assert.equal(totals.subtotalCents, 200000);
  });

  it("taxes the goods, not the shipping", () => {
    const totals = orderTotals([line({ unitPriceCents: 100000 })], {
      ...NO_CHARGES,
      taxPercent: 18,
      shippingCents: 5000,
    });

    // 18% of ₹1,000 is ₹180 — not 18% of ₹1,050.
    assert.equal(totals.taxCents, 18000);
    assert.equal(totals.shippingCents, 5000);
    assert.equal(totals.totalCents, 123000);
  });

  it("rounds tax once over the whole order, not per line", () => {
    // Three lines at ₹3.33 with 5% tax. Per-line rounding gives 17 paise
    // (three lots of 16.65 rounded to 17); once over the subtotal gives 50.
    const lines = [
      line({ unitPriceCents: 333 }),
      line({ unitPriceCents: 333 }),
      line({ unitPriceCents: 333 }),
    ];
    const totals = orderTotals(lines, { ...NO_CHARGES, taxPercent: 5 });
    assert.equal(totals.subtotalCents, 999);
    assert.equal(totals.taxCents, 50);
  });

  it("waives shipping at the threshold, not just above it", () => {
    const charges = {
      ...NO_CHARGES,
      shippingCents: 5000,
      freeShippingAboveCents: 100000,
    };

    assert.equal(orderTotals([line({ unitPriceCents: 99900 })], charges).shippingCents, 5000);
    assert.equal(orderTotals([line({ unitPriceCents: 100000 })], charges).shippingCents, 0);
  });

  it("ignores a zero threshold rather than making everything free", () => {
    const totals = orderTotals([line({ unitPriceCents: 1 })], {
      ...NO_CHARGES,
      shippingCents: 5000,
      freeShippingAboveCents: 0,
    });
    assert.equal(totals.shippingCents, 5000);
  });

  it("never lets a discount take an order below zero", () => {
    const totals = orderTotals([line({ unitPriceCents: 10000 })], {
      ...NO_CHARGES,
      discountCents: 999999,
    });
    assert.equal(totals.totalCents, 0);
    assert.equal(totals.discountCents, 10000);
  });

  it("treats a quantity below one as one", () => {
    assert.equal(orderTotals([line({ quantity: 0 })], NO_CHARGES).subtotalCents, 129900);
  });

  it("is zero for an empty order", () => {
    assert.deepEqual(orderTotals([], NO_CHARGES), {
      subtotalCents: 0,
      taxCents: 0,
      shippingCents: 0,
      discountCents: 0,
      totalCents: 0,
    });
  });
});

describe("orderReference", () => {
  it("fits inside Meta's reference_id cap", () => {
    const reference = orderReference(new Date("2026-09-09T00:00:00Z"));
    assert.equal(reference.length <= MAX_REFERENCE_LENGTH, true);
  });

  it("carries the date it was made", () => {
    assert.match(orderReference(new Date("2026-09-09T00:00:00Z")), /^NC-260909-/);
  });

  it("uses no characters that are ambiguous read aloud", () => {
    // No 0/O, no 1/I — somebody reads these out over the phone.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const suffix = orderReference().split("-")[2];
      assert.equal(/[01IO]/.test(suffix), false);
    }
  });

  it("recognises its own output and rejects anything else", () => {
    assert.equal(isOrderReference(orderReference()), true);
    assert.equal(isOrderReference("NC-260909-ABC"), false);
    assert.equal(isOrderReference("order-1"), false);
    assert.equal(isOrderReference("NC-260909-ABCD0"), false);
  });
});

describe("buildOrderDetails", () => {
  const lines = [line({ unitPriceCents: 100000, quantity: 2 })];
  const totals = orderTotals(lines, { ...NO_CHARGES, taxPercent: 18, shippingCents: 5000 });

  const payload = buildOrderDetails({
    reference: "NC-260909-ABCDE",
    currency: "INR",
    body: "Your order",
    lines,
    totals,
    catalogId: "cat-1",
    goodsType: "physical",
    paymentConfiguration: "my-config",
    gateway: "razorpay",
    expiresAt: 1_800_000_000,
  });

  const parameters = payload.interactive.action.parameters as Record<string, never>;
  const order = parameters.order as unknown as Record<string, { value: number }> & {
    items: Array<{ amount: { value: number }; quantity: number }>;
  };

  it("sends the total Meta will re-add, to the paisa", () => {
    const total = parameters.total_amount as unknown as { value: number; offset: number };
    const itemSum = order.items.reduce(
      (sum, item) => sum + item.amount.value * item.quantity,
      0
    );

    assert.equal(total.value, totals.totalCents);
    assert.equal(
      total.value,
      itemSum + order.tax.value + order.shipping.value
    );
    assert.equal(total.offset, MINOR_UNIT_OFFSET);
  });

  it("names the gateway in the form Meta expects", () => {
    assert.equal(parameters.payment_type, "payment_gateway:razorpay");
    assert.equal(parameters.payment_configuration, "my-config");
  });

  it("marks physical goods so the status gets a shipping stage", () => {
    assert.equal(parameters.type, "physical-goods");

    const digital = buildOrderDetails({
      reference: "NC-260909-ABCDE",
      currency: "INR",
      body: "x",
      lines,
      totals,
      goodsType: "digital",
      paymentConfiguration: "c",
      gateway: "payu",
      expiresAt: 1,
    });
    assert.equal(
      (digital.interactive.action.parameters as Record<string, never>).type,
      "digital-goods"
    );
  });

  it("leaves out a charge that is zero rather than showing ₹0.00 to the customer", () => {
    const plain = buildOrderDetails({
      reference: "NC-260909-ABCDE",
      currency: "INR",
      body: "x",
      lines,
      totals: orderTotals(lines, NO_CHARGES),
      goodsType: "physical",
      paymentConfiguration: "c",
      gateway: "razorpay",
      expiresAt: 1,
    });

    const bare = (plain.interactive.action.parameters as Record<string, never>)
      .order as unknown as Record<string, unknown>;
    assert.equal("tax" in bare, false);
    assert.equal("shipping" in bare, false);
    assert.equal("discount" in bare, false);
  });

  it("clips a reference that would not fit", () => {
    const long = buildOrderDetails({
      reference: "X".repeat(80),
      currency: "INR",
      body: "x",
      lines,
      totals,
      goodsType: "physical",
      paymentConfiguration: "c",
      gateway: "razorpay",
      expiresAt: 1,
    });
    const reference = (long.interactive.action.parameters as Record<string, never>)
      .reference_id as unknown as string;
    assert.equal(reference.length, MAX_REFERENCE_LENGTH);
  });

  it("starts the order at pending, which is what Meta requires", () => {
    assert.equal((order as unknown as { status: string }).status, "pending");
  });
});

describe("buildOrderStatus", () => {
  it("quotes the message it updates, which Meta requires", () => {
    const payload = buildOrderStatus({
      reference: "NC-260909-ABCDE",
      originalMessageId: "wamid.XYZ",
      status: "shipped",
      body: "On its way",
    });

    assert.deepEqual(payload.context, { message_id: "wamid.XYZ" });
  });

  it("carries the new status", () => {
    const payload = buildOrderStatus({
      reference: "NC-260909-ABCDE",
      originalMessageId: "wamid.XYZ",
      status: "completed",
      body: "Delivered",
    });

    const action = (payload.interactive as { action: { parameters: { order: { status: string } } } })
      .action;
    assert.equal(action.parameters.order.status, "completed");
  });
});

describe("readInboundCart", () => {
  it("reads the cart a customer sent", () => {
    const cart = readInboundCart({
      catalog_id: "cat-1",
      text: "Please deliver Saturday",
      product_items: [
        { product_retailer_id: "KRT-001", quantity: "2", item_price: "1299.00", currency: "INR" },
      ],
    });

    assert.equal(cart.catalogId, "cat-1");
    assert.equal(cart.note, "Please deliver Saturday");
    assert.deepEqual(cart.lines, [
      {
        retailerId: "KRT-001",
        name: "KRT-001",
        quantity: 2,
        unitPriceCents: 129900,
        currency: "INR",
      },
    ]);
  });

  it("converts item_price from major units, which is unique to this webhook", () => {
    const [only] = readInboundCart({
      product_items: [{ product_retailer_id: "A", item_price: "49.5", quantity: 1 }],
    }).lines;
    assert.equal(only.unitPriceCents, 4950);
  });

  it("drops an item with no retailer id, which cannot be reordered", () => {
    const cart = readInboundCart({
      product_items: [{ quantity: "1", item_price: "10" }, { product_retailer_id: "B" }],
    });
    assert.equal(cart.lines.length, 1);
    assert.equal(cart.lines[0].retailerId, "B");
  });

  it("survives a cart with nothing in it", () => {
    assert.deepEqual(readInboundCart({}), { catalogId: null, note: null, lines: [] });
  });

  it("treats an unreadable price as zero rather than NaN", () => {
    const [only] = readInboundCart({
      product_items: [{ product_retailer_id: "A", item_price: "free" }],
    }).lines;
    assert.equal(only.unitPriceCents, 0);
  });
});

describe("formatting", () => {
  it("drops the paise when there are none", () => {
    assert.equal(formatAmount(129900), "₹1,299");
  });

  it("keeps the paise when there are some", () => {
    assert.equal(formatAmount(129950), "₹1,299.50");
  });

  it("lists an order in one line", () => {
    assert.equal(
      describeLines([line({ quantity: 2 }), line({ name: "Silk scarf", quantity: 1 })]),
      "2 × Cotton kurta, 1 × Silk scarf"
    );
  });
});
