import test from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIES,
  TOPUP_PRESETS,
  DEFAULT_RATES,
  MICROS,
  RATES_CHECKED_ON,
  SUGGESTED_RATES,
  MIN_TOPUP,
  balanceState,
  canSpend,
  checkTopup,
  costOf,
  formatMoney,
  formatRate,
  isCategory,
  isCredit,
  messagesLeft,
  readRates,
  signedAmount,
  summarise,
  walletInUse,
  writeRates,
  type WalletRates,
} from "../src/lib/wallet.ts";

const RATES: WalletRates = {
  currency: "INR",
  marketing: 109 * 10_000, // ₹1.09
  utility: 42 * 10_000, // ₹0.42
  authentication: 35 * 10_000, // ₹0.35
  service: 0,
  blockWhenEmpty: false,
  lowBalance: 100 * MICROS,
};

// --- rates -----------------------------------------------------------------

test("stored rates come back whole, and write back unchanged", () => {
  const stored = writeRates(RATES);
  assert.deepEqual(readRates(stored), RATES);
});

test("nothing stored reads as a wallet that is switched off", () => {
  for (const value of [null, undefined, {}, "nonsense", 42]) {
    const rates = readRates(value);
    assert.equal(walletInUse(rates), false, String(value));
    assert.equal(balanceState(0, rates), "off");
  }
});

test("blocking is only ever literally true", () => {
  // A half-configured wallet that starts refusing sends is a support ticket
  // from every customer at once.
  assert.equal(readRates({ block_when_empty: "yes" }).blockWhenEmpty, false);
  assert.equal(readRates({ block_when_empty: 1 }).blockWhenEmpty, false);
  assert.equal(readRates({ block_when_empty: true }).blockWhenEmpty, true);
  assert.equal(DEFAULT_RATES.blockWhenEmpty, false);
});

test("a negative or nonsense rate reads as zero rather than as a credit", () => {
  const rates = readRates({ marketing: -50, utility: "abc", authentication: NaN });
  assert.equal(rates.marketing, 0);
  assert.equal(rates.utility, 0);
  assert.equal(rates.authentication, 0);
});

test("rates are whole micros, because a float is not money", () => {
  // Held as 0.8631 instead of 863100, three thousand messages come to
  // ₹2,589.2999999999997.
  assert.equal(readRates({ marketing: 863_100.4 }).marketing, 863_100);
});

// --- what a send costs -----------------------------------------------------

test("each category costs its own rate", () => {
  assert.equal(costOf("marketing", RATES), 1_090_000);
  assert.equal(costOf("utility", RATES), 420_000);
  assert.equal(costOf("authentication", RATES), 350_000);
  assert.equal(costOf("service", RATES), 0);
});

test("the category is read however it was cased", () => {
  assert.equal(costOf("MARKETING", RATES), 1_090_000);
});

test("an unrecognised category costs the utility rate, not nothing", () => {
  // Charging zero for something unrecognised is the error that only shows
  // up on the month's invoice, by which time the messages are long gone.
  assert.equal(costOf("", RATES), 420_000);
  assert.equal(costOf("something_new", RATES), 420_000);
});

test("every category in the list is a category", () => {
  for (const category of CATEGORIES) assert.equal(isCategory(category.key), true);
  assert.equal(isCategory("postcard"), false);
});

// --- the balance -----------------------------------------------------------

test("the balance has a state, and each one is distinguishable", () => {
  assert.equal(balanceState(5_000 * MICROS, RATES), "healthy");
  assert.equal(balanceState(50 * MICROS, RATES), "low");
  assert.equal(balanceState(100 * MICROS, RATES), "low");
  assert.equal(balanceState(0, RATES), "empty");
  assert.equal(balanceState(-200, RATES), "negative");
});

test("sending is not blocked unless somebody switched blocking on", () => {
  assert.equal(canSpend(0, 1_090_000, RATES), true);
  assert.equal(canSpend(-5_000_000, 1_090_000, RATES), true);
});

test("with blocking on, an empty wallet stops a charged message", () => {
  const strict = { ...RATES, blockWhenEmpty: true };
  assert.equal(canSpend(5_000_000, 1_090_000, strict), true);
  assert.equal(canSpend(1_000_000, 1_090_000, strict), false);
  assert.equal(canSpend(1_090_000, 1_090_000, strict), true);
});

test("a free message goes out whatever the balance says", () => {
  const strict = { ...RATES, blockWhenEmpty: true };
  assert.equal(canSpend(0, 0, strict), true);
});

test("how many messages are left is worked out at the dearest rate", () => {
  // The number worked out at the cheapest rate is the one that runs out two
  // days early.
  assert.equal(messagesLeft(109 * MICROS, RATES), 100);
});

test("with nothing priced there is no estimate, rather than an infinite one", () => {
  assert.equal(messagesLeft(100 * MICROS, DEFAULT_RATES), null);
});

// --- topping up ------------------------------------------------------------

test("a sensible top-up is accepted", () => {
  const check = checkTopup(1_000 * MICROS);
  assert.equal(check.ok, true);
  assert.equal(check.ok && check.micros, 1_000 * MICROS);
});

test("a top-up is rounded to whole paise, because that is what a card takes", () => {
  const check = checkTopup(1_000 * MICROS + 7);
  assert.equal(check.ok, true);
  assert.equal((check.ok ? check.micros : 1) % 10_000, 0);
});

test("too little is refused, and the message says the floor", () => {
  const check = checkTopup(50 * MICROS);
  assert.equal(check.ok, false);
  assert.match(check.ok === false ? check.error : "", /100/);
});

test("a mistyped amount with four extra zeros is refused", () => {
  // Which is a refund request and a very bad afternoon.
  assert.equal(checkTopup(999_999_999 * MICROS).ok, false);
});

test("nothing at all is refused", () => {
  for (const bad of [0, -100, "", null, undefined, "abc"]) {
    assert.equal(checkTopup(bad).ok, false, String(bad));
  }
});

test("the floor is a real amount of money", () => {
  assert.ok(MIN_TOPUP >= 10 * MICROS);
});

test("every preset divides into whole paise", () => {
  // The card gateway takes paise. A preset that does not divide evenly is
  // a button that fails at the modal.
  for (const preset of TOPUP_PRESETS) {
    assert.equal(preset % 10_000, 0, String(preset));
  }
});

// --- the statement ---------------------------------------------------------

test("money in and money out are told apart", () => {
  assert.equal(isCredit("topup"), true);
  assert.equal(isCredit("refund"), true);
  assert.equal(isCredit("debit"), false);
  assert.equal(isCredit("adjustment"), false);
});

test("a statement line carries its sign, so it scans without reading", () => {
  assert.match(signedAmount({ kind: "topup", amountMicros: 5_000 * MICROS }), /^\+/);
  assert.match(signedAmount({ kind: "debit", amountMicros: 1_090_000 }), /^−/);
});

test("added and spent are kept apart rather than netted", () => {
  // "You added ₹5,000 and spent ₹4,096" can be checked against somebody's
  // own records. A single net figure of ₹904 cannot.
  const total = summarise([
    { kind: "topup", amountMicros: 5_000_000_000, balanceAfterMicros: 5_000_000_000, description: "", createdAt: "" },
    { kind: "debit", amountMicros: 863_100, balanceAfterMicros: 4_999_136_900, description: "", createdAt: "" },
    { kind: "debit", amountMicros: 115_000, balanceAfterMicros: 4_999_021_900, description: "", createdAt: "" },
    { kind: "refund", amountMicros: 115_000, balanceAfterMicros: 4_999_136_900, description: "", createdAt: "" },
  ]);
  assert.equal(total.added, 5_000_115_000);
  assert.equal(total.spent, 978_100);
  // Only the debits are messages. A refund is not a message un-sent.
  assert.equal(total.messages, 2);
});

// --- money on screen -------------------------------------------------------

test("a total reads as money", () => {
  assert.match(formatMoney(1_250 * MICROS), /1,250/);
  assert.match(formatMoney(0), /0/);
});

test("a per-message rate keeps all four decimals", () => {
  // ₹0.8631 is the actual price. "₹0.86" is a different number, and over a
  // hundred thousand messages it is a different invoice.
  assert.match(formatRate(863_100), /0\.8631/);
  assert.match(formatRate(115_000), /0\.115/);
});

test("an unknown currency does not take the page down", () => {
  assert.match(formatMoney(100 * MICROS, "NOTACURRENCY"), /100\.00/);
  assert.match(formatRate(863_100, "NOTACURRENCY"), /0\.8631/);
});

// --- the starting point offered in Admin -----------------------------------

test("the suggested rates actually switch the wallet on", () => {
  // They exist so that turning it on is one Save rather than four guesses.
  // A suggestion of all zeros would be a button that does nothing.
  const rates = readRates({ ...SUGGESTED_RATES, currency: "INR" });
  assert.equal(walletInUse(rates), true);
});

test("the defaults are Meta's published India rates, exactly", () => {
  // The whole point of the micro unit. Neither of these is a whole number
  // of paise, and rounding utility to 12 overcharges by 4.3% on the
  // highest-volume message type there is.
  assert.equal(SUGGESTED_RATES.marketing, 863_100); // ₹0.8631
  assert.equal(SUGGESTED_RATES.utility, 115_000); // ₹0.1150
  assert.equal(SUGGESTED_RATES.authentication, 115_000); // same as utility
});

test("the defaults carry no markup over Meta's own rate", () => {
  // If anybody ever wants a margin they add it in the box, knowingly.
  assert.equal(SUGGESTED_RATES.marketing % 100, 0);
  assert.ok(SUGGESTED_RATES.marketing > SUGGESTED_RATES.utility);
});

test("the defaults leave service free, because the first 1,000 a month are", () => {
  assert.equal(SUGGESTED_RATES.service, 0);
});

test("the rates carry the date they were checked against Meta's card", () => {
  // They change — the January 2026 revision put marketing up about 10%.
  // Undated, there is no way to tell a current rate from a stale one.
  assert.match(RATES_CHECKED_ON, /^\d{4}-\d{2}-\d{2}$/);
});

test("there is a suggestion for every category the form shows", () => {
  // A category with no suggestion renders an empty box in a form whose
  // whole point is being ready to save.
  for (const category of CATEGORIES) {
    assert.equal(typeof SUGGESTED_RATES[category.key], "number", category.key);
  }
});
