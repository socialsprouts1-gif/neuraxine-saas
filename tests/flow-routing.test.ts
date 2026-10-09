import test from "node:test";
import assert from "node:assert/strict";
import {
  routeFlow,
  accountsToSync,
  assistantsOnNumbers,
  formsOnNumbers,
  type NumberOnAccount,
} from "../src/lib/flow-routing.ts";

const onA: NumberOnAccount = { id: "n1", wabaId: "A", status: "active", isDefault: true };
const onB: NumberOnAccount = { id: "n2", wabaId: "B", status: "active", isDefault: false };
const alsoOnB: NumberOnAccount = { id: "n3", wabaId: "B", status: "active", isDefault: false };

test("a flow is sent from a number on its own account, not the default", () => {
  // The bug in one line: the default is on A, the flow lives on B.
  assert.deepEqual(routeFlow([onA, onB], "B"), { ok: true, connectionId: "n2", wabaId: "B" });
});

test("the default still wins among numbers on the right account", () => {
  const defaultOnB = { ...alsoOnB, isDefault: true };
  const result = routeFlow([onA, onB, defaultOnB], "B");
  assert.deepEqual(result, { ok: true, connectionId: "n3", wabaId: "B" });
});

test("a flow whose account has no active number is refused, not redirected", () => {
  // Redirecting to the default is what produced Meta 131009 with nothing in
  // it to act on, so this must be an error rather than a silent fallback.
  assert.deepEqual(routeFlow([onA], "B"), { ok: false, reason: "account-not-connected" });
});

test("a disabled number on the right account does not count", () => {
  const disabled = { ...onB, status: "disabled" };
  assert.deepEqual(routeFlow([onA, disabled], "B"), { ok: false, reason: "account-not-connected" });
});

test("a flow with no account recorded falls back to the default", () => {
  // Rows created before the column was filled in still have to work.
  assert.deepEqual(routeFlow([onA, onB], null), { ok: true, connectionId: "n1", wabaId: "A" });
  assert.deepEqual(routeFlow([onA, onB], undefined), { ok: true, connectionId: "n1", wabaId: "A" });
});

test("no numbers at all reads differently from the wrong number", () => {
  assert.deepEqual(routeFlow([], "B"), { ok: false, reason: "none-connected" });
  assert.deepEqual(routeFlow([{ ...onA, status: "pending" }], null), {
    ok: false,
    reason: "none-connected",
  });
});

test("an account is synced once however many numbers sit on it", () => {
  // Listing B twice would import every form on it twice over.
  assert.deepEqual(accountsToSync([onA, onB, alsoOnB]), ["A", "B"]);
});

test("only active numbers contribute an account to sync", () => {
  assert.deepEqual(accountsToSync([onA, { ...onB, status: "error" }]), ["A"]);
  assert.deepEqual(accountsToSync([]), []);
});

// --- which forms a bot can open ------------------------------------------

const formOnA = { id: "f1", wabaId: "A" };
const formOnB = { id: "f2", wabaId: "B" };
const formUnknown = { id: "f3", wabaId: null };

test("a bot listening on one number is offered only that account's forms", () => {
  // n2 is on account B, so the form built on A is not offered.
  const result = formsOnNumbers([formOnA, formOnB], [onA, onB], ["n2"]);
  assert.deepEqual(result.map((form) => form.id), ["f2"]);
});

test("listening on nothing means every number, so every form", () => {
  const result = formsOnNumbers([formOnA, formOnB], [onA, onB], []);
  assert.deepEqual(result.map((form) => form.id), ["f1", "f2"]);
});

test("a form with no account recorded is never hidden", () => {
  // It predates the column and may well work. Hiding a working form is
  // worse than showing one that might not.
  const result = formsOnNumbers([formOnA, formUnknown], [onA, onB], ["n2"]);
  assert.deepEqual(result.map((form) => form.id), ["f3"]);
});

test("no form on the listening number reads as empty, not as everything", () => {
  assert.deepEqual(formsOnNumbers([formOnA], [onA, onB], ["n2"]), []);
});

test("a disabled number contributes no account", () => {
  const disabled = { ...onB, status: "disabled" };
  assert.deepEqual(formsOnNumbers([formOnB], [onA, disabled], []), []);
});

test("two numbers on one account offer that account's forms once", () => {
  const result = formsOnNumbers([formOnB], [onB, alsoOnB], ["n2", "n3"]);
  assert.deepEqual(result.map((form) => form.id), ["f2"]);
});

// --- which assistant an AI Agent node may hand a reply to ------------------

const salesOnN1 = { id: "a1", name: "Sales", connectionId: "n1" };
const supportOnN2 = { id: "a2", name: "Support", connectionId: "n2" };
const everywhere = { id: "a3", name: "General", connectionId: null };

test("a bot listening on one number is only offered assistants that answer there", () => {
  assert.deepEqual(
    assistantsOnNumbers([salesOnN1, supportOnN2, everywhere], ["n1"]),
    [salesOnN1, everywhere]
  );
});

test("an assistant on every number is offered whichever number the bot listens on", () => {
  assert.deepEqual(assistantsOnNumbers([supportOnN2, everywhere], ["n1"]), [everywhere]);
});

test("a bot with no numbers ticked listens everywhere, so every assistant is offered", () => {
  const all = [salesOnN1, supportOnN2, everywhere];
  assert.deepEqual(assistantsOnNumbers(all, []), all);
});

test("a workspace with no assistant on the chosen number gets an empty list, not a wrong one", () => {
  // The point of the picker: silently falling back to the sales assistant
  // on the support number is what it exists to stop.
  assert.deepEqual(assistantsOnNumbers([salesOnN1], ["n2"]), []);
});
