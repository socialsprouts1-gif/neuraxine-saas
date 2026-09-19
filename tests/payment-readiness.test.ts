import test from "node:test";
import assert from "node:assert/strict";
import {
  paymentChecklist,
  paymentsReady,
  RAZORPAY_EVENTS,
  type PaymentFacts,
} from "../src/lib/payment-readiness.ts";

const ready: PaymentFacts = {
  connectedGateways: 1,
  gatewayOrgId: "org1",
  gatewayProvider: "razorpay",
  gatewayOrgName: "Neura HQ",
  gatewayConnected: true,
  hasWebhookSecret: true,
  sellablePlans: 3,
};

test("a fully configured deployment passes every step", () => {
  assert.equal(paymentsReady(ready), true);
  assert.equal(paymentChecklist(ready).filter((step) => !step.done).length, 0);
});

test("nothing configured fails every step that depends on something", () => {
  const facts: PaymentFacts = {
    connectedGateways: 0,
    gatewayOrgId: null,
    gatewayProvider: null,
    gatewayOrgName: null,
    gatewayConnected: false,
    hasWebhookSecret: false,
    sellablePlans: 0,
  };
  assert.equal(paymentsReady(facts), false);
  assert.equal(paymentChecklist(facts).every((step) => !step.done), true);
});

test("a gateway named but no longer connected is called out on its own step", () => {
  // The failure that looks like a typo and is not: the setting is right and
  // the credentials behind it are gone.
  const facts = { ...ready, gatewayConnected: false };
  const steps = paymentChecklist(facts);
  assert.equal(steps[1].done, true, "still named");
  assert.equal(steps[2].done, false, "but not connected");
  assert.match(steps[2].detail, /no longer has that gateway connected/);
});

test("a missing webhook secret explains what silently breaks", () => {
  const steps = paymentChecklist({ ...ready, hasWebhookSecret: false });
  const step = steps.find((entry) => entry.title.includes("webhook secret"))!;
  assert.equal(step.done, false);
  // The consequence matters more than the instruction: money arrives and
  // the workspace is never put on a plan.
  assert.match(step.detail, /never marked paid/);
});

test("free-only plans are not something to sell", () => {
  const steps = paymentChecklist({ ...ready, sellablePlans: 0 });
  assert.equal(steps[4].done, false);
  assert.match(steps[4].detail, /nothing for a checkout to charge/);
});

test("the steps stay in the order somebody has to fix them", () => {
  const titles = paymentChecklist(ready).map((step) => step.title);
  assert.deepEqual(titles, [
    "Connect Razorpay on a workspace",
    "Say which one takes subscription money",
    "Keep that gateway connected",
    "Add the webhook secret",
    "Have something to sell",
  ]);
});

test("one connected gateway is reported in the singular", () => {
  assert.match(paymentChecklist(ready)[0].detail, /1 workspace has/);
  assert.match(
    paymentChecklist({ ...ready, connectedGateways: 2 })[0].detail,
    /2 workspaces have/
  );
});

test("the webhook events cover both a paid link and a failed one", () => {
  assert.ok(RAZORPAY_EVENTS.includes("payment_link.paid"));
  assert.ok(RAZORPAY_EVENTS.includes("payment.failed"));
});
