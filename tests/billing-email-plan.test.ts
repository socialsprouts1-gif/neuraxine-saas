import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUNTDOWN_DAYS,
  FOLLOW_UP_LAST_DAY,
  dueBillingEmail,
  followUpStep,
  collapseByRecipient,
} from "../src/lib/billing-email-plan.ts";

const now = new Date("2026-09-17T10:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

const sub = (status: string, days: number, planName = "Growth") => ({
  status,
  current_period_end: inDays(days),
  plans: { name: planName },
});

test("a trial is left alone until the countdown starts", () => {
  // A week's warning on a seven-day trial is a message on the day
  // somebody signed up, which reads as a demand rather than a reminder.
  assert.equal(dueBillingEmail("o1", sub("trialing", 7), now), null);
  assert.equal(dueBillingEmail("o1", sub("trialing", COUNTDOWN_DAYS + 1), now), null);
});

test("the countdown sends one a day, and each day is its own message", () => {
  // Five down to one. The moment it reaches zero the period has ended, so
  // that day belongs to the expiry mail rather than the countdown.
  const keys = new Set<string>();
  for (let day = COUNTDOWN_DAYS; day >= 1; day -= 1) {
    const due = dueBillingEmail("o1", sub("trialing", day), now);
    assert.equal(due?.kind, "trial_ending", `day ${day}`);
    keys.add(due!.dedupeKey);
  }
  // Distinct keys throughout — two colliding would make the index swallow
  // a day of the countdown.
  assert.equal(keys.size, COUNTDOWN_DAYS);
});

test("the same day asked twice is the same message", () => {
  // Two sweeps on the same day must not send twice, so the key carries
  // the day rather than the moment.
  // Two and a half days out, so eight hours later is still "2 days left".
  const periodEnd = inDays(2.5);
  const row = { status: "trialing", current_period_end: periodEnd, plans: { name: "Growth" } };

  const morning = dueBillingEmail("o1", row, now)!;
  const evening = dueBillingEmail("o1", row, new Date(now.getTime() + 8 * 3600_000))!;

  assert.equal(morning.dedupeKey, evening.dedupeKey);
  assert.equal(morning.daysLeft, 2);
  assert.equal(evening.daysLeft, 2);
});

test("crossing into a new day is a new message, not a repeat", () => {
  // The countdown is meant to say a different number each day, so a key
  // that survived the boundary would silence every day after the first.
  const periodEnd = inDays(2.5);
  const row = { status: "trialing", current_period_end: periodEnd, plans: { name: "Growth" } };

  const today = dueBillingEmail("o1", row, now)!;
  const tomorrow = dueBillingEmail("o1", row, new Date(now.getTime() + 86_400_000))!;

  assert.equal(today.daysLeft, 2);
  assert.equal(tomorrow.daysLeft, 1);
  assert.notEqual(today.dedupeKey, tomorrow.dedupeKey);
});

test("the day a trial ends asks for the sale, once", () => {
  const due = dueBillingEmail("o1", sub("trialing", -1), now);
  assert.equal(due?.kind, "trial_expired");
  assert.match(due!.dedupeKey, /trial_expired/);
});

test("follow-ups every three days for the first month", () => {
  for (const daysSince of [3, 6, 9, 30]) {
    const due = dueBillingEmail("o1", sub("trialing", -daysSince), now);
    assert.equal(due?.kind, "trial_followup", `day ${daysSince}`);
  }
  assert.equal(followUpStep(3), 1);
  assert.equal(followUpStep(30), 10);
});

test("and weekly after the first month", () => {
  // 30 is step 10; a week later is 11, not another three-day step.
  assert.equal(followUpStep(37), 11);
  assert.equal(followUpStep(44), 12);
});

test("a missed sweep catches up rather than skipping a step for ever", () => {
  // The step is computed from the day, not from what was sent last, so a
  // run that misses day 9 still sends step 3 when it next runs.
  assert.equal(followUpStep(9), 3);
  assert.equal(followUpStep(10), 3);
  assert.equal(followUpStep(11), 3);
});

test("each follow-up is its own message", () => {
  const first = dueBillingEmail("o1", sub("trialing", -3), now)!;
  const second = dueBillingEmail("o1", sub("trialing", -6), now)!;
  assert.notEqual(first.dedupeKey, second.dedupeKey);
});

test("the sequence stops rather than running for years", () => {
  // Somebody who has ignored twenty emails over six months has answered.
  // Carrying on earns spam reports, and the sending domain is shared with
  // the receipts people actually want.
  assert.equal(followUpStep(FOLLOW_UP_LAST_DAY), 31);
  assert.equal(followUpStep(FOLLOW_UP_LAST_DAY + 1), null);
  assert.equal(dueBillingEmail("o1", sub("trialing", -400), now), null);
});

test("nothing is due in the gap before the first follow-up", () => {
  // Days 1 and 2 already had the expiry mail; a second one that soon is
  // nagging, not a reminder.
  assert.equal(followUpStep(1), null);
  assert.equal(followUpStep(2), null);
});

test("a paid plan is reminded a few days before it renews", () => {
  assert.equal(dueBillingEmail("o1", sub("active", 2), now)?.kind, "renewal_reminder");
  assert.equal(dueBillingEmail("o1", sub("active", 20), now), null);
});

test("a lapsed paid plan is told, not chased", () => {
  assert.equal(dueBillingEmail("o1", sub("past_due", -2), now)?.kind, "subscription_expired");
});

test("a workspace with no billing row is owed nothing", () => {
  assert.equal(dueBillingEmail("o1", null, now), null);
  assert.equal(dueBillingEmail("o1", { status: "active", current_period_end: null }, now), null);
});

test("keys are unique per workspace", () => {
  const a = dueBillingEmail("org-a", sub("trialing", 2), now)!;
  const b = dueBillingEmail("org-b", sub("trialing", 2), now)!;
  assert.notEqual(a.dedupeKey, b.dedupeKey);
});

// --- the whole countdown, day by day --------------------------------------

test("a seven-day trial is counted down every day from six to one", () => {
  // The sequence asked for: six days remaining, five, four, three, two,
  // one. Each has to be its own message, not a repeat, or the dedupe index
  // refuses all but the first.
  //
  // Zero days left is not part of this: the period end has arrived, so the
  // trial is over and what is owed is the payment message, asserted below.
  const keys = new Set<string>();

  for (let daysLeft = 6; daysLeft >= 1; daysLeft -= 1) {
    const end = new Date(Date.UTC(2026, 8, 24, 12, 0, 0));
    const now = new Date(end.getTime() - daysLeft * 86400000);
    const due = dueBillingEmail(
      "org1",
      { status: "trialing", current_period_end: end.toISOString(), plans: null },
      now
    );

    assert.ok(due, `nothing due at ${daysLeft} days left`);
    assert.equal(due.kind, "trial_ending", `wrong kind at ${daysLeft}`);
    assert.equal(due.daysLeft, daysLeft);
    assert.ok(!keys.has(due.dedupeKey), `day ${daysLeft} repeats an earlier key`);
    keys.add(due.dedupeKey);
  }

  assert.equal(keys.size, 6);
});

test("seven days out is still silent, so the welcome is not doubled", () => {
  const end = new Date(Date.UTC(2026, 8, 24, 12, 0, 0));
  const now = new Date(end.getTime() - 7 * 86400000);
  assert.equal(
    dueBillingEmail(
      "org1",
      { status: "trialing", current_period_end: end.toISOString(), plans: null },
      now
    ),
    null
  );
});

test("once it has expired the payment message comes, then the follow-ups", () => {
  const end = new Date(Date.UTC(2026, 8, 24, 12, 0, 0));
  const at = (daysSince: number) =>
    dueBillingEmail(
      "org1",
      { status: "trialing", current_period_end: end.toISOString(), plans: null },
      new Date(end.getTime() + daysSince * 86400000)
    );

  assert.equal(at(0)?.kind, "trial_expired");
  assert.equal(at(1)?.kind, "trial_expired");
  assert.equal(at(3)?.kind, "trial_followup");
  assert.equal(at(6)?.kind, "trial_followup");
  // Every three days through the first month, then weekly.
  assert.notEqual(at(3)?.dedupeKey, at(6)?.dedupeKey);
});

// --- one person, several workspaces ---------------------------------------

test("four workspaces owned by one person produce one message", () => {
  // Exactly what the preview screen showed: the same address owed the same
  // "one day left" four times over. The dedupe key cannot catch it, because
  // each of those workspaces is correctly owed a message of its own.
  const due = [
    { email: "a@x.com", kind: "trial_ending" },
    { email: "a@x.com", kind: "trial_ending" },
    { email: "a@x.com", kind: "trial_ending" },
    { email: "a@x.com", kind: "trial_ending" },
  ];
  const { send, collapsed } = collapseByRecipient(due);
  assert.equal(send.length, 1);
  assert.equal(collapsed.length, 3);
});

test("different people each still get theirs", () => {
  const { send } = collapseByRecipient([
    { email: "a@x.com", kind: "trial_ending" },
    { email: "b@x.com", kind: "trial_ending" },
  ]);
  assert.equal(send.length, 2);
});

test("different kinds to one person both go", () => {
  // Suppressing a receipt because a trial reminder went to the same inbox
  // would hide money moving.
  const { send } = collapseByRecipient([
    { email: "a@x.com", kind: "trial_ending" },
    { email: "a@x.com", kind: "payment_received" },
  ]);
  assert.equal(send.length, 2);
});

test("case and space do not let a duplicate through", () => {
  const { send } = collapseByRecipient([
    { email: "A@X.com", kind: "trial_ending" },
    { email: " a@x.com ", kind: "trial_ending" },
  ]);
  assert.equal(send.length, 1);
});

test("rows with no address are kept so they can be reported, not silently dropped", () => {
  const { send, collapsed } = collapseByRecipient([
    { email: null, kind: "trial_ending" },
    { email: null, kind: "trial_ending" },
  ]);
  assert.equal(send.length, 2);
  assert.equal(collapsed.length, 0);
});
