import test from "node:test";
import assert from "node:assert/strict";
import {
  JOURNEY_STARTERS,
  describeStarter,
  industries,
  starterFor,
  templateNameFor,
} from "../src/lib/journey-starters.ts";
import {
  APPOINTMENT_EVENTS,
  DEFAULT_SETTINGS,
  isAppointmentEvent,
  settingsProblem,
  isTrigger,
  TRIGGERS,
} from "../src/lib/drip.ts";

// The starters are data, and data that is wrong is wrong for every
// workspace that picks it. Every rule Meta refuses a template for, and
// every rule the sequence builder refuses a sequence for, is checked here
// rather than discovered one submission at a time.

const VARIABLE = /\{\{\s*(\d+)\s*\}\}/g;

function variablesIn(text: string): number[] {
  return [...text.matchAll(VARIABLE)].map((match) => Number(match[1]));
}

test("the appointment trigger exists and is a trigger", () => {
  assert.ok(isTrigger("appointment"));
  assert.ok(TRIGGERS.some((trigger) => trigger.key === "appointment"));
});

test("appointment events are the four a booking can be in", () => {
  assert.deepEqual(
    APPOINTMENT_EVENTS.map((event) => event.key).sort(),
    ["booked", "cancelled", "completed", "no_show"]
  );
  assert.ok(isAppointmentEvent("completed"));
  assert.ok(!isAppointmentEvent("finished"));
  assert.ok(!isAppointmentEvent(null));
});

test("an appointment sequence with no event chosen cannot be switched on", () => {
  const problem = settingsProblem({
    ...DEFAULT_SETTINGS,
    trigger: "appointment",
    triggerEvent: null,
  });
  assert.match(problem ?? "", /which appointment event/i);

  assert.equal(
    settingsProblem({
      ...DEFAULT_SETTINGS,
      trigger: "appointment",
      triggerEvent: "completed",
    }),
    null
  );
});

test("the other triggers do not need an event", () => {
  for (const trigger of ["manual", "api"] as const) {
    assert.equal(
      settingsProblem({ ...DEFAULT_SETTINGS, trigger, triggerEvent: null }),
      null
    );
  }
});

test("every starter has a unique key and a real event", () => {
  const keys = new Set<string>();
  for (const starter of JOURNEY_STARTERS) {
    assert.ok(!keys.has(starter.key), `duplicate starter key ${starter.key}`);
    keys.add(starter.key);
    assert.ok(isAppointmentEvent(starter.event), `${starter.key} has no real event`);
    assert.ok(starter.name.trim().length > 0, `${starter.key} has no name`);
    assert.ok(starter.description.trim().length > 0, `${starter.key} has no description`);
    assert.ok(starter.steps.length > 0, `${starter.key} has no steps`);
    assert.ok(starter.steps.length <= 10, `${starter.key} is longer than a sequence may be`);
  }
});

test("starter template names are names Meta accepts", () => {
  const names = new Set<string>();
  for (const starter of JOURNEY_STARTERS) {
    for (const step of starter.steps) {
      const name = templateNameFor(starter, step);
      assert.match(name, /^[a-z0-9_]+$/, `${name} is not a legal template name`);
      assert.ok(name.length <= 512);
      assert.ok(!names.has(name), `two starters would submit the same template name ${name}`);
      names.add(name);
    }
  }
});

test("starter bodies are bodies Meta accepts", () => {
  for (const starter of JOURNEY_STARTERS) {
    for (const step of starter.steps) {
      const body = step.body.trim();
      assert.ok(body.length > 0, `${starter.key}/${step.slug} has an empty body`);
      assert.ok(body.length <= 1024, `${starter.key}/${step.slug} is over Meta's body limit`);

      // A body that is only variables is refused every time.
      assert.ok(
        body.replace(VARIABLE, "").trim().length > 0,
        `${starter.key}/${step.slug} is only variables`
      );

      // Variables must run 1..n with no gaps, and each needs an example.
      const used = variablesIn(body);
      used.forEach((value, index) => {
        assert.equal(
          value,
          index + 1,
          `${starter.key}/${step.slug} jumps to {{${value}}} where {{${index + 1}}} was expected`
        );
      });
      assert.equal(
        (step.samples ?? []).filter((sample) => sample.trim()).length,
        used.length,
        `${starter.key}/${step.slug} needs one example per variable`
      );

      // No named variables: this app submits positional ones only.
      assert.ok(
        !/\{\{\s*[a-z_]+\s*\}\}/i.test(body),
        `${starter.key}/${step.slug} uses a named variable`
      );
    }
  }
});

test("a starter's suggested values line up with its variables", () => {
  for (const starter of JOURNEY_STARTERS) {
    for (const step of starter.steps) {
      const used = variablesIn(step.body).length;
      if (used === 0) {
        assert.equal(
          (step.variables ?? []).length,
          0,
          `${starter.key}/${step.slug} carries values for variables it does not use`
        );
        continue;
      }
      assert.equal(
        (step.variables ?? []).filter((value) => value.trim()).length,
        used,
        `${starter.key}/${step.slug} needs a suggested value per variable`
      );
    }
  }
});

test("no starter greets anybody by name", () => {
  // A drip step's variable values are the same for everybody in the
  // sequence, so a name in a starter would greet two hundred people by
  // one person's name. Caught here because it is invisible until it ships.
  for (const starter of JOURNEY_STARTERS) {
    for (const step of starter.steps) {
      assert.ok(
        !/\b(hi|hello|dear)\b[\s,]*\{\{/i.test(step.body),
        `${starter.key}/${step.slug} greets with a variable, which is the same name for everybody`
      );
      for (const value of [...(step.samples ?? []), ...(step.variables ?? [])]) {
        assert.ok(
          !/^(hi|hello|dear)\b/i.test(value.trim()),
          `${starter.key}/${step.slug} looks like it fills in a name`
        );
      }
    }
  }
});

test("every marketing message carries a way to stop", () => {
  // Meta expects an opt-out on a marketing template, and the sequence
  // honours STOP for real — the starter sets it as an exit keyword.
  for (const starter of JOURNEY_STARTERS) {
    for (const step of starter.steps) {
      if (step.category !== "MARKETING") continue;
      assert.match(
        `${step.body} ${step.footer ?? ""}`,
        /stop/i,
        `${starter.key}/${step.slug} is marketing with no way out`
      );
    }
  }
});

test("footers fit inside Meta's limit", () => {
  for (const starter of JOURNEY_STARTERS) {
    for (const step of starter.steps) {
      if (!step.footer) continue;
      assert.ok(
        step.footer.length <= 60,
        `${starter.key}/${step.slug} has a ${step.footer.length}-character footer`
      );
    }
  }
});

test("every gap except the last one is a real gap", () => {
  for (const starter of JOURNEY_STARTERS) {
    starter.steps.forEach((step, index) => {
      const isLast = index === starter.steps.length - 1;
      if (isLast) {
        assert.equal(step.waitMinutes, 0, `${starter.key} waits after its last message`);
        return;
      }
      assert.ok(
        step.waitMinutes > 0,
        `${starter.key}/${step.slug} sends the next message in the same second`
      );
      // Nothing in here should wait more than a year.
      assert.ok(
        step.waitMinutes <= 366 * 24 * 60,
        `${starter.key}/${step.slug} waits longer than a year`
      );
    });
  }
});

test("starterFor finds one and refuses the rest", () => {
  assert.equal(starterFor("dental_after_treatment")?.industry, "Dental clinic");
  assert.equal(starterFor("nope"), null);
  assert.equal(starterFor(""), null);
});

test("industries lists each trade once, in order", () => {
  const trades = industries();
  assert.equal(new Set(trades).size, trades.length);
  assert.ok(trades.includes("Dental clinic"));
  assert.ok(trades.includes("Any business"));
});

test("every trade has something to pick", () => {
  for (const trade of industries()) {
    const shown = JOURNEY_STARTERS.filter(
      (starter) => starter.industry === trade || starter.industry === "Any business"
    );
    assert.ok(shown.length > 0, `${trade} has no journeys`);
  }
});

test("describeStarter says how many messages over how long", () => {
  const dental = starterFor("dental_after_treatment");
  assert.ok(dental);
  assert.match(describeStarter(dental), /4 messages over \d+ months/);

  const booked = starterFor("any_booked");
  assert.ok(booked);
  // One message, no gap to describe.
  assert.equal(describeStarter(booked), "1 message");
});

test("there is a journey for each of the four events", () => {
  for (const event of APPOINTMENT_EVENTS) {
    assert.ok(
      JOURNEY_STARTERS.some((starter) => starter.event === event.key),
      `nothing starts on ${event.key}`
    );
  }
});
