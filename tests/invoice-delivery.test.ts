import test from "node:test";
import assert from "node:assert/strict";
import {
  describeDelivery,
  describeUndelivered,
} from "../src/lib/invoice-delivery.ts";

const AT = "2026-09-22T10:00:00Z";

test("a draft has not been issued, so delivery does not apply", () => {
  const d = describeDelivery({ status: "draft" });
  assert.equal(d.state, "draft");
  assert.equal(d.detail, null);
});

test("issued and sent_at set is delivered", () => {
  const d = describeDelivery({ status: "sent", sent_at: AT });
  assert.equal(d.state, "delivered");
  assert.equal(d.tone, "green");
});

// --- the case this exists for ----------------------------------------------

test("issued with no sent_at is NOT delivered, whatever the status says", () => {
  // issueInvoice writes status "sent" before the WhatsApp send is even
  // attempted, so this is the shape of every invoice that was refused.
  const d = describeDelivery({ status: "sent", sent_at: null });
  assert.equal(d.state, "undelivered");
  assert.equal(d.tone, "amber");
  assert.match(d.label, /not delivered/);
});

test("the recorded reason is shown when there is one", () => {
  const d = describeDelivery({
    status: "sent",
    sent_at: null,
    delivery_error: "Outside WhatsApp's 24-hour window.",
  });
  assert.equal(d.detail, "Outside WhatsApp's 24-hour window.");
});

test("no recorded reason still explains what happened and what to do", () => {
  const d = describeDelivery({ status: "sent", sent_at: null });
  assert.match(d.detail ?? "", /issued but no WhatsApp message/);
  assert.match(d.detail ?? "", /press Send/);
});

test("a blank reason is treated as no reason", () => {
  const d = describeDelivery({ status: "sent", sent_at: null, delivery_error: "   " });
  assert.match(d.detail ?? "", /issued but no WhatsApp message/);
});

test("a paid invoice that never reached the customer is still undelivered", () => {
  // Paid by other means. The money arriving does not mean the message did.
  const d = describeDelivery({ status: "paid", sent_at: null });
  assert.equal(d.state, "undelivered");
});

test("partly paid and overdue count as issued", () => {
  for (const status of ["partly_paid", "overdue"]) {
    assert.equal(describeDelivery({ status, sent_at: AT }).state, "delivered", status);
    assert.equal(describeDelivery({ status, sent_at: null }).state, "undelivered", status);
  }
});

test("cancelled is not issued", () => {
  assert.equal(describeDelivery({ status: "cancelled" }).state, "draft");
});

test("status casing and spacing do not change the verdict", () => {
  assert.equal(describeDelivery({ status: "  SENT  ", sent_at: null }).state, "undelivered");
});

// --- the banner ------------------------------------------------------------

test("nothing stuck means no banner at all", () => {
  assert.equal(
    describeUndelivered([
      { status: "sent", sent_at: AT },
      { status: "draft" },
    ]),
    null
  );
});

test("the banner counts only what is genuinely stuck", () => {
  const line = describeUndelivered([
    { status: "sent", sent_at: null },
    { status: "sent", sent_at: AT },
    { status: "draft" },
  ]);
  assert.match(line ?? "", /^1 invoice was issued/);
});

test("the banner is plural when it should be", () => {
  const line = describeUndelivered([
    { status: "sent", sent_at: null },
    { status: "paid", sent_at: null },
  ]);
  assert.match(line ?? "", /^2 invoices were issued/);
  assert.match(line ?? "", /They are/);
});

test("an empty list produces no banner", () => {
  assert.equal(describeUndelivered([]), null);
});
