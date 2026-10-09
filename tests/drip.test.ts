import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  MAX_STEPS,
  TRIGGERS,
  advance,
  clockLabel,
  describeDuration,
  describeEnrolment,
  describeWait,
  isTrigger,
  matchesKeyword,
  minutesFrom,
  nextSendAt,
  normaliseKeywords,
  sequenceProblem,
  settingsProblem,
  splitMinutes,
  stepProblem,
  type DripStep,
} from "../src/lib/drip.ts";

const IST = { skipMissedSteps: false, timeZone: "Asia/Kolkata" };

function step(over: Partial<DripStep> = {}): DripStep {
  return {
    stepIndex: 1,
    templateId: "tpl-1",
    variables: [],
    waitKind: "duration",
    waitMinutes: 1440,
    sendAtMinutes: 600,
    sendAtDays: 1,
    ...over,
  };
}

// --- keywords --------------------------------------------------------------

test("keywords are lower-cased and de-duplicated", () => {
  // The list is matched against lower-cased incoming text, so holding both
  // "Hi" and "hi" would read as two chances to join.
  assert.deepEqual(normaliseKeywords(["Hi", "hi", " HI ", "", "join"]), ["hi", "join"]);
});

test("a keyword has to be the whole message, not a word inside it", () => {
  // "don't stop sending me these" must not end the sequence, and that is a
  // sentence people actually send.
  assert.equal(matchesKeyword("stop", ["stop"]), true);
  assert.equal(matchesKeyword("  STOP  ", ["stop"]), true);
  assert.equal(matchesKeyword("don't stop sending me these", ["stop"]), false);
});

test("loose matching is available, but is not the default", () => {
  assert.equal(matchesKeyword("please stop now", ["stop"], false), true);
});

test("an empty message or an empty list matches nothing", () => {
  assert.equal(matchesKeyword("", ["stop"]), false);
  assert.equal(matchesKeyword("stop", []), false);
  assert.equal(matchesKeyword(null, ["stop"]), false);
});

// --- when the next step is due --------------------------------------------

test("a duration wait is added to the moment the last step was delivered", () => {
  const from = new Date("2026-10-06T09:00:00.000Z");
  const next = nextSendAt(step({ waitMinutes: 240 }), from, IST);
  assert.equal(next.skipped, false);
  assert.equal(next.at?.toISOString(), "2026-10-06T13:00:00.000Z");
});

test("a zero duration means the next step follows immediately", () => {
  const from = new Date("2026-10-06T09:00:00.000Z");
  assert.equal(nextSendAt(step({ waitMinutes: 0 }), from, IST).at?.getTime(), from.getTime());
});

test("a timed step lands at that wall clock in the campaign's own zone", () => {
  // 10:00 in Kolkata is 04:30 UTC. Getting this wrong by the offset is how
  // a "good morning" sequence arrives in the middle of the night.
  const from = new Date("2026-10-06T09:00:00.000Z"); // 14:30 IST on the 6th
  const next = nextSendAt(
    step({ waitKind: "time_of_day", sendAtMinutes: 600, sendAtDays: 1 }),
    from,
    IST
  );
  assert.equal(next.at?.toISOString(), "2026-10-07T04:30:00.000Z");
});

test("a timed step in a zone west of UTC is just as exact", () => {
  // 09:00 in New York in October is 13:00 UTC (daylight time).
  const from = new Date("2026-10-06T20:00:00.000Z");
  const next = nextSendAt(
    step({ waitKind: "time_of_day", sendAtMinutes: 540, sendAtDays: 1 }),
    from,
    { skipMissedSteps: false, timeZone: "America/New_York" }
  );
  assert.equal(next.at?.toISOString(), "2026-10-07T13:00:00.000Z");
});

test("an hour that has already gone comes round the next day", () => {
  // Joining at 14:30 IST with a step set for 10:00 the same day.
  const from = new Date("2026-10-06T09:00:00.000Z");
  const next = nextSendAt(
    step({ waitKind: "time_of_day", sendAtMinutes: 600, sendAtDays: 0 }),
    from,
    IST
  );
  assert.equal(next.skipped, false);
  assert.equal(next.at?.toISOString(), "2026-10-07T04:30:00.000Z");
});

test("or is skipped outright, when that is what was asked for", () => {
  // Both answers are right for a real sequence, which is why it is a
  // setting: "your table is ready at 7pm" should be skipped, "day two of
  // the course" should not.
  const from = new Date("2026-10-06T09:00:00.000Z");
  const next = nextSendAt(
    step({ waitKind: "time_of_day", sendAtMinutes: 600, sendAtDays: 0 }),
    from,
    { skipMissedSteps: true, timeZone: "Asia/Kolkata" }
  );
  assert.equal(next.skipped, true);
  assert.equal(next.at, null);
});

test("an unknown timezone still schedules something", () => {
  // A typo in the zone box must not stop a sequence dead. It will be wrong
  // by hours for somebody; silence is wrong for everybody.
  const from = new Date("2026-10-06T09:00:00.000Z");
  const next = nextSendAt(
    step({ waitKind: "time_of_day", sendAtMinutes: 600, sendAtDays: 1 }),
    from,
    { skipMissedSteps: false, timeZone: "Not/AZone" }
  );
  assert.ok(next.at instanceof Date);
  assert.ok(!Number.isNaN(next.at!.getTime()));
});

// --- moving an enrolment along ---------------------------------------------

test("after a step, the next one is scheduled from that step's own wait", () => {
  const steps = [step({ stepIndex: 1, waitMinutes: 60 }), step({ stepIndex: 2 })];
  const at = new Date("2026-10-06T09:00:00.000Z");
  const next = advance(steps, 1, at, IST);

  assert.equal(next.status, "active");
  assert.equal(next.nextStepIndex, 2);
  assert.equal(next.nextSendAt?.toISOString(), "2026-10-06T10:00:00.000Z");
});

test("the last step finishes the sequence rather than scheduling nothing", () => {
  const steps = [step({ stepIndex: 1 }), step({ stepIndex: 2 })];
  const next = advance(steps, 2, new Date("2026-10-06T09:00:00.000Z"), IST);

  assert.equal(next.status, "completed");
  assert.equal(next.nextSendAt, null);
});

test("a skipped timed step hands straight on to the one after it", () => {
  // And measured from the same delivery, so a run of skipped steps does not
  // silently add a day each.
  const steps = [
    step({ stepIndex: 1, waitKind: "time_of_day", sendAtMinutes: 600, sendAtDays: 0 }),
    step({ stepIndex: 2, waitMinutes: 120 }),
    step({ stepIndex: 3 }),
  ];
  const at = new Date("2026-10-06T09:00:00.000Z"); // 14:30 IST, past 10:00
  const next = advance(steps, 1, at, { skipMissedSteps: true, timeZone: "Asia/Kolkata" });

  assert.equal(next.status, "active");
  assert.equal(next.nextStepIndex, 3);
  assert.equal(next.nextSendAt?.toISOString(), "2026-10-06T11:00:00.000Z");
});

test("a sequence whose remaining steps are all skipped is finished, not stuck", () => {
  const steps = [
    step({ stepIndex: 1, waitKind: "time_of_day", sendAtMinutes: 600, sendAtDays: 0 }),
    step({ stepIndex: 2, waitKind: "time_of_day", sendAtMinutes: 600, sendAtDays: 0 }),
  ];
  const next = advance(steps, 1, new Date("2026-10-06T09:00:00.000Z"), {
    skipMissedSteps: true,
    timeZone: "Asia/Kolkata",
  });
  assert.equal(next.status, "completed");
});

test("a sequence shortened under somebody finishes them rather than looping", () => {
  const next = advance([step({ stepIndex: 1 })], 3, new Date(), IST);
  assert.equal(next.status, "completed");
});

// --- is it usable ----------------------------------------------------------

test("a step with no template cannot run", () => {
  assert.match(stepProblem(step({ templateId: null }), false)!, /template/i);
});

test("two messages in the same second is not a drip", () => {
  assert.match(stepProblem(step({ waitMinutes: 0 }), false)!, /gap/i);
});

test("the last step's wait is never read, so it is never a problem", () => {
  // Nothing follows it, so a zero there means nothing rather than meaning
  // an instant second message.
  assert.equal(stepProblem(step({ waitMinutes: 0 }), true), null);
});

test("an empty sequence is refused, with a reason", () => {
  assert.match(sequenceProblem([])!, /at least one/i);
});

test("a sequence longer than the cap is refused", () => {
  const many = Array.from({ length: MAX_STEPS + 1 }, (_, i) => step({ stepIndex: i + 1 }));
  assert.match(sequenceProblem(many)!, new RegExp(String(MAX_STEPS)));
});

test("the problem names which step it is in", () => {
  const steps = [step({ stepIndex: 1 }), step({ stepIndex: 2, templateId: null })];
  assert.match(sequenceProblem(steps)!, /Step 2/);
});

test("a good sequence has nothing to report", () => {
  assert.equal(sequenceProblem([step({ stepIndex: 1, waitMinutes: 60 }), step({ stepIndex: 2 })]), null);
});

test("a keyword trigger with no keywords is refused", () => {
  // Otherwise it is switched on, looks live, and nobody can ever join it.
  const problem = settingsProblem({ ...DEFAULT_SETTINGS, trigger: "keyword" });
  assert.match(problem!, /keyword/i);
});

test("exit-on-keyword with no exit words is refused", () => {
  const problem = settingsProblem({ ...DEFAULT_SETTINGS, exitOnKeyword: true });
  assert.match(problem!, /exit/i);
});

test("the default settings are usable as they are", () => {
  assert.equal(settingsProblem(DEFAULT_SETTINGS), null);
});

test("only the three real triggers are triggers", () => {
  for (const trigger of TRIGGERS) assert.equal(isTrigger(trigger.key), true);
  for (const bad of ["", "webhook", null, 7]) assert.equal(isTrigger(bad), false);
});

// --- saying it in words ----------------------------------------------------

test("a gap is described in the unit somebody meant", () => {
  assert.equal(describeDuration(0), "immediately");
  assert.equal(describeDuration(1), "1 minute");
  assert.equal(describeDuration(90), "90 minutes");
  assert.equal(describeDuration(60), "1 hour");
  assert.equal(describeDuration(240), "4 hours");
  assert.equal(describeDuration(1440), "1 day");
  assert.equal(describeDuration(2880), "2 days");
});

test("a gap splits back into the unit it was entered in", () => {
  assert.deepEqual(splitMinutes(2880), { value: 2, unit: "days" });
  assert.deepEqual(splitMinutes(240), { value: 4, unit: "hours" });
  assert.deepEqual(splitMinutes(90), { value: 90, unit: "minutes" });
  assert.deepEqual(splitMinutes(0), { value: 0, unit: "minutes" });
});

test("entering a gap and reading it back gives the same gap", () => {
  for (const minutes of [0, 5, 60, 90, 240, 1440, 4320]) {
    const split = splitMinutes(minutes);
    assert.equal(minutesFrom(split.value, split.unit), minutes, String(minutes));
  }
});

test("a clock reads as HH:MM, padded", () => {
  assert.equal(clockLabel(600), "10:00");
  assert.equal(clockLabel(0), "00:00");
  assert.equal(clockLabel(545), "09:05");
  // Out of range is clamped rather than rendered as "24:00".
  assert.equal(clockLabel(5000), "23:59");
});

test("the wait reads as the sentence somebody says out loud", () => {
  assert.match(describeWait(step({ waitMinutes: 2880 })), /wait 2 days/);
  assert.match(
    describeWait(step({ waitKind: "time_of_day", sendAtMinutes: 600, sendAtDays: 1 })),
    /10:00 the next day/
  );
  assert.match(
    describeWait(step({ waitKind: "time_of_day", sendAtMinutes: 600, sendAtDays: 0 })),
    /same day/
  );
});

test("where somebody is reads as a position, not a number", () => {
  assert.match(describeEnrolment({ status: "active", nextStepIndex: 2, nextSendAt: null }, 4), /step 2 of 4/);
  assert.match(describeEnrolment({ status: "completed", nextStepIndex: 5, nextSendAt: null }, 4), /Finished/);
  assert.match(describeEnrolment({ status: "exited", nextStepIndex: 2, nextSendAt: null }, 4), /Left/);
});

test("somebody past the end does not read as being on a step that does not exist", () => {
  const label = describeEnrolment({ status: "active", nextStepIndex: 9, nextSendAt: null }, 4);
  assert.match(label, /step 4 of 4/);
});
