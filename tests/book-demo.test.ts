import test from "node:test";
import assert from "node:assert/strict";
import { bookingUrl, demoTarget, demoHint, DEMO_PREFILL } from "../src/lib/book-demo.ts";

test("a Calendly link is used as it is", () => {
  assert.equal(
    bookingUrl("https://calendly.com/neurachat/demo"),
    "https://calendly.com/neurachat/demo"
  );
});

test("surrounding space is tolerated, because links get pasted", () => {
  assert.equal(bookingUrl("  https://cal.com/vivek/30min  "), "https://cal.com/vivek/30min");
});

test("anything that could run in the visitor's page is refused", () => {
  // The link is rendered as a target="_blank" anchor, so a javascript:
  // URL typed into the admin field would execute on the landing page.
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "  JavaScript:alert(1)  ",
  ]) {
    assert.equal(bookingUrl(bad), null, bad);
  }
});

test("plain http is refused, not silently upgraded", () => {
  // A calendar page collecting a name and an email over plain text is not
  // one to send people to, and quietly rewriting somebody's URL hides
  // that their link is wrong.
  assert.equal(bookingUrl("http://calendly.com/neurachat"), null);
});

test("something that is not a URL at all gives nothing", () => {
  for (const bad of ["", "   ", "calendly.com/x", "not a url", "https://localhost"]) {
    assert.equal(bookingUrl(bad), null, bad);
  }
});

// --- which destination wins ------------------------------------------------

test("a configured booking page wins over WhatsApp", () => {
  const target = demoTarget({
    demoUrl: "https://calendly.com/neurachat/demo",
    whatsappNumber: "8237982569",
  });
  assert.deepEqual(target, { kind: "booking", href: "https://calendly.com/neurachat/demo" });
});

test("with no booking page, the demo starts on WhatsApp", () => {
  // Which is the right fallback for a product that sells WhatsApp
  // automation — not a second-best, but the demo itself.
  const target = demoTarget({ whatsappNumber: "8237982569" });
  assert.equal(target.kind, "whatsapp");
  assert.match(target.kind === "whatsapp" ? target.href : "", /^https:\/\/wa\.me\/918237982569\?text=/);
});

test("the prefilled message says what the person wants", () => {
  const target = demoTarget({ whatsappNumber: "8237982569" });
  const text = new URL(target.kind === "whatsapp" ? target.href : "").searchParams.get("text");
  assert.equal(text, DEMO_PREFILL);
});

test("a custom message is carried instead", () => {
  const target = demoTarget({ whatsappNumber: "8237982569", message: "Demo please" });
  const text = new URL(target.kind === "whatsapp" ? target.href : "").searchParams.get("text");
  assert.equal(text, "Demo please");
});

test("an unusable booking link falls through to WhatsApp rather than breaking", () => {
  const target = demoTarget({ demoUrl: "calendly.com/oops", whatsappNumber: "8237982569" });
  assert.equal(target.kind, "whatsapp");
});

test("neither configured means no button at all", () => {
  // A button that opens nothing is worse than no button.
  assert.deepEqual(demoTarget({}), { kind: "none" });
  assert.deepEqual(demoTarget({ demoUrl: "nope", whatsappNumber: "123" }), { kind: "none" });
});

test("the hint under the button matches where it goes", () => {
  assert.match(demoHint({ kind: "booking", href: "https://x.com/y" }), /time/i);
  assert.match(demoHint({ kind: "whatsapp", href: "https://wa.me/1" }), /WhatsApp/);
  assert.equal(demoHint({ kind: "none" }), "");
});
