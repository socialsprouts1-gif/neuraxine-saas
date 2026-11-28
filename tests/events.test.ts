import test from "node:test";
import assert from "node:assert/strict";
import {
  MATCH_OPERATORS,
  describeOutcome,
  eventProblem,
  fillFromEvent,
  missingValues,
  nameIn,
  normaliseEventName,
  phoneIn,
  ruleMatches,
  valueAt,
} from "../src/lib/events.ts";
import { EVENT_STARTERS, knownEventNames, starterFor } from "../src/lib/event-starters.ts";

// Events arriving from somebody else's software.
//
// Everything here fails silently in production if it is wrong: a
// condition that does not match sends nothing and says nothing, and a
// variable filled from the wrong field sends the right customer the
// wrong number. Neither shows up until somebody complains.

const order = {
  name: "order.placed",
  data: { order_id: "T6-1840", total: 1840, table: "T6", customer: { name: "Priya" } },
};

test("an event name is taken however it was typed", () => {
  assert.equal(normaliseEventName("Order.Placed"), "order.placed");
  assert.equal(normaliseEventName("  order.placed  "), "order.placed");
  assert.equal(normaliseEventName(null), "");
});

test("a body without a name is refused with a reason", () => {
  assert.match(eventProblem({}) ?? "", /give the event a name/i);
  assert.match(eventProblem(null) ?? "", /JSON object/i);
  assert.match(eventProblem("hello") ?? "", /JSON object/i);
  assert.match(eventProblem({ event: "Order Placed!" }) ?? "", /lowercase letters/i);
  assert.match(eventProblem({ event: "order.placed", data: [] }) ?? "", /has to be an object/i);
  assert.equal(eventProblem({ event: "order.placed" }), null);
  assert.equal(eventProblem({ event: "order.placed", data: { a: 1 } }), null);
});

test("a value is reachable with or without the data prefix", () => {
  // Half the people writing the sending end leave the prefix off, and
  // being strict about it buys nothing.
  assert.equal(valueAt(order, "data.total"), "1840");
  assert.equal(valueAt(order, "total"), "1840");
  assert.equal(valueAt(order, "data.customer.name"), "Priya");
  assert.equal(valueAt(order, "event"), "order.placed");
  assert.equal(valueAt(order, "nothing"), undefined);
  assert.equal(valueAt(order, ""), undefined);
});

test("a rule with no condition matches on the name alone", () => {
  assert.ok(ruleMatches({ eventName: "order.placed" }, order));
  assert.ok(!ruleMatches({ eventName: "order.cancelled" }, order));
  // Named differently in each system, same event.
  assert.ok(ruleMatches({ eventName: "ORDER.PLACED" }, order));
});

test("conditions compare the way somebody expects", () => {
  const rule = (operator: string, value: string, field = "data.total") =>
    ruleMatches(
      { eventName: "order.placed", matchField: field, matchOperator: operator as never, matchValue: value },
      order
    );

  assert.ok(rule("gt", "1000"));
  assert.ok(!rule("gt", "2000"));
  assert.ok(rule("lt", "2000"));
  assert.ok(rule("equals", "1840"));
  assert.ok(rule("not_equals", "999"));
  assert.ok(rule("contains", "T6", "data.table"));
  assert.ok(rule("exists", "", "data.table"));
  assert.ok(!rule("exists", "", "data.missing"));
});

test("money written with symbols and commas still compares", () => {
  // A rule set up as "over ₹2,000" has to agree with a total of 2500.
  const event = { name: "bill.paid", data: { total: "₹2,500.00" } };
  assert.ok(
    ruleMatches(
      { eventName: "bill.paid", matchField: "data.total", matchOperator: "gt", matchValue: "₹2,000" },
      event
    )
  );
});

test("a missing field never accidentally satisfies a comparison", () => {
  // NaN comparisons are false both ways, which is the right answer: a
  // field that is not there is not "more than" anything.
  const event = { name: "order.placed", data: {} };
  for (const operator of ["gt", "lt"] as const) {
    assert.ok(
      !ruleMatches(
        { eventName: "order.placed", matchField: "data.total", matchOperator: operator, matchValue: "100" },
        event
      ),
      `${operator} matched on a missing field`
    );
  }
});

test("a message is filled from the event, per person", () => {
  // The thing a campaign cannot do. One event is one person, so this is
  // that person's name and nobody else's.
  assert.deepEqual(
    fillFromEvent(["{{data.customer.name}}", "{{data.total}}"], order),
    ["Priya", "1840"]
  );
  // Text around a token survives.
  assert.deepEqual(fillFromEvent(["Table {{data.table}}"], order), ["Table T6"]);
  // A literal with no token is passed straight through.
  assert.deepEqual(fillFromEvent(["Brew & Co."], order), ["Brew & Co."]);
});

test("a blank is reported by name rather than sent empty", () => {
  // Meta refuses a blank parameter, and a refusal that names the field
  // beats an error that names nothing.
  const filled = fillFromEvent(["{{data.missing}}", "{{data.total}}"], order);
  assert.deepEqual(filled, ["", "1840"]);
  assert.deepEqual(missingValues(filled, ["{{data.missing}}", "{{data.total}}"]), [
    "{{data.missing}}",
  ]);
});

test("a phone number is found under whatever the sender called it", () => {
  // Every till in the country calls this something different, and an
  // integration that fails over "mobile" vs "phone" gets abandoned.
  for (const body of [
    { contact: { phone: "+919000000000" } },
    { contact: { mobile: "+919000000000" } },
    { contact: { wa_id: "+919000000000" } },
    { contact: { whatsapp: "+919000000000" } },
    { phone: "+919000000000" },
    { mobile: "+919000000000" },
  ]) {
    assert.equal(phoneIn(body), "+919000000000", JSON.stringify(body));
  }
  assert.equal(phoneIn({}), "");
});

test("a name is found under whatever the sender called it", () => {
  assert.equal(nameIn({ contact: { name: "Priya" } }), "Priya");
  assert.equal(nameIn({ contact: { full_name: "Priya" } }), "Priya");
  assert.equal(nameIn({ name: "Priya" }), "Priya");
  assert.equal(nameIn({}), "");
});

test("every operator the builder offers is one the matcher understands", () => {
  for (const operator of MATCH_OPERATORS) {
    const result = ruleMatches(
      {
        eventName: "order.placed",
        matchField: "data.total",
        matchOperator: operator.key,
        matchValue: "1840",
      },
      order
    );
    assert.equal(typeof result, "boolean", `${operator.key} did not return a verdict`);
  }
});

test("the log says what became of an event", () => {
  assert.match(describeOutcome("matched", 1), /1 automation ran/);
  assert.match(describeOutcome("matched", 3), /3 automations ran/);
  assert.match(describeOutcome("no_match", 0), /no automation is listening/i);
  assert.match(describeOutcome("failed", 0), /went wrong/i);
});

// --- the ready-made rules --------------------------------------------------

test("every starter rule names a legal event", () => {
  for (const starter of EVENT_STARTERS) {
    assert.ok(starter.rules.length > 0, `${starter.key} has no rules`);
    for (const rule of starter.rules) {
      assert.equal(
        eventProblem({ event: rule.event }),
        null,
        `${starter.key}/${rule.name} uses an event name the endpoint would refuse`
      );
      assert.equal(rule.event, normaliseEventName(rule.event));
      assert.ok(rule.when.length > 10, `${rule.name} does not say when it fires`);
      assert.ok(rule.says.length > 10, `${rule.name} does not say what it sends`);
    }
  }
});

test("a rule that tags somebody has a tag to apply", () => {
  for (const starter of EVENT_STARTERS) {
    for (const rule of starter.rules) {
      if (rule.action !== "add_tag") continue;
      assert.ok(rule.tag?.trim(), `${starter.key}/${rule.name} tags nothing`);
    }
  }
});

test("starter conditions are ones the matcher can run", () => {
  const known = new Set(MATCH_OPERATORS.map((operator) => operator.key));
  for (const starter of EVENT_STARTERS) {
    for (const rule of starter.rules) {
      if (!rule.match) continue;
      assert.ok(known.has(rule.match.operator), `${rule.name} uses an unknown operator`);
      assert.ok(rule.match.field.trim(), `${rule.name} has a condition on no field`);
    }
  }
});

test("starter variables are tokens, not values somebody forgot to replace", () => {
  for (const starter of EVENT_STARTERS) {
    for (const rule of starter.rules) {
      for (const variable of rule.variables ?? []) {
        assert.match(
          variable,
          /\{\{[\w.]+\}\}/,
          `${starter.key}/${rule.name} has a fixed value "${variable}" where a token belongs`
        );
      }
    }
  }
});

test("starter keys are unique and findable", () => {
  const keys = EVENT_STARTERS.map((starter) => starter.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(starterFor("restaurant")?.industry, "Restaurant or cafe");
  assert.equal(starterFor("nope"), null);
});

test("the suggested event names cover what the starters send", () => {
  const names = new Set(knownEventNames());
  for (const starter of EVENT_STARTERS) {
    for (const rule of starter.rules) {
      assert.ok(names.has(rule.event), `${rule.event} is not in the suggestions`);
    }
  }
});
