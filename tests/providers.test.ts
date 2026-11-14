import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_PROVIDERS,
  PAYMENT_PROVIDERS,
  STORE_PROVIDERS,
  SUPPORTS_UPI,
  WHATSAPP_PAYMENT_GATEWAYS,
  isLeadProvider,
  isPaymentProvider,
  isStoreProvider,
} from "../src/lib/provider-meta.ts";
import { INTEGRATIONS, integrationBySlug } from "../src/lib/integrations.ts";

describe("provider groupings", () => {
  it("names only providers that exist in the catalogue", () => {
    for (const slug of [...PAYMENT_PROVIDERS, ...STORE_PROVIDERS, ...LEAD_PROVIDERS]) {
      assert.ok(integrationBySlug(slug), `${slug} is not in the catalogue`);
    }
  });

  it("recognises its own members and nothing else", () => {
    assert.equal(isPaymentProvider("razorpay"), true);
    assert.equal(isPaymentProvider("hubspot"), false);
    assert.equal(isStoreProvider("shopify"), true);
    assert.equal(isStoreProvider("razorpay"), false);
    assert.equal(isLeadProvider("indiamart"), true);
    assert.equal(isLeadProvider("shopify"), false);
  });

  it("keeps the UPI table in step with the gateway list", () => {
    for (const slug of PAYMENT_PROVIDERS) {
      assert.equal(typeof SUPPORTS_UPI[slug], "boolean", `${slug} has no UPI answer`);
    }
    // The fact an Indian business is choosing on.
    assert.equal(SUPPORTS_UPI.razorpay, true);
    assert.equal(SUPPORTS_UPI.stripe, false);
  });

  it("only offers Meta the gateways it accepts for India", () => {
    assert.deepEqual([...WHATSAPP_PAYMENT_GATEWAYS], ["razorpay", "payu"]);
  });
});

describe("the integration catalogue", () => {
  it("has no duplicate slugs", () => {
    const slugs = INTEGRATIONS.map((def) => def.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it("gives every provider that needs credentials at least one field", () => {
    for (const def of INTEGRATIONS) {
      if (def.capability === "live") continue;
      assert.ok(def.fields.length > 0, `${def.slug} claims a capability but asks for nothing`);
    }
  });

  it("marks every credential field that is genuinely secret as a password", () => {
    // A secret stored in `config` rather than `credentials` is a secret in
    // plaintext: the connect action encrypts only password-typed fields.
    const secretish = /secret|token|password|key$/i;
    for (const def of INTEGRATIONS) {
      for (const field of def.fields) {
        // A public identifier can contain "key" — Razorpay's Key ID is one —
        // so the check is on the label saying it is a secret.
        if (!secretish.test(field.name)) continue;
        if (["key_id", "consumer_key", "app_id", "client_id", "crm_key", "webhook_secret"].includes(field.name)) {
          continue;
        }
        assert.equal(
          field.type,
          "password",
          `${def.slug}.${field.name} would be stored unencrypted`
        );
      }
    }
  });

  it("stores the CRM key and webhook secrets encrypted", () => {
    for (const slug of ["indiamart", "razorpay", "cashfree", "stripe"]) {
      const def = integrationBySlug(slug)!;
      for (const field of def.fields) {
        if (field.name === "crm_key" || field.name === "webhook_secret") {
          assert.equal(field.type, "password", `${slug}.${field.name} must be encrypted`);
        }
      }
    }
  });

  it("says what each provider needs before it can work", () => {
    for (const def of INTEGRATIONS) {
      if (def.fields.length === 0) continue;
      assert.ok(
        def.prerequisite,
        `${def.slug} asks for credentials without saying where to get them`
      );
    }
  });

  it("claims no capability the app cannot deliver", () => {
    // "sync", "import", "payments" and "lookup" all promise a real call, so
    // each of those slugs must be in a group something dispatches on.
    const dispatched = new Set<string>([
      ...PAYMENT_PROVIDERS,
      ...STORE_PROVIDERS,
      ...LEAD_PROVIDERS,
      "hubspot",
      "zoho-crm",
      "salesforce",
      "google-calendar",
      "shiprocket",
      "calendly",
    ]);

    for (const def of INTEGRATIONS) {
      if (!["sync", "import", "payments", "lookup"].includes(def.capability)) continue;
      assert.ok(
        dispatched.has(def.slug),
        `${def.slug} claims "${def.capability}" but nothing dispatches to it`
      );
    }
  });
});
