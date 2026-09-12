import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  chargeFor,
  checkCoupon,
  checkoutReference,
  daysRemaining,
  isEntitled,
  orderIdFromReference,
  periodEnd,
  type Coupon,
} from "../src/lib/checkout.ts";
import { checkLimit, monthStart, usageRows } from "../src/lib/limits.ts";
import {
  inviteExpiry,
  inviteState,
  isEmailish,
  isUsable,
  normaliseEmail,
  seatsAvailable,
  type InviteRow,
} from "../src/lib/invites.ts";

// Run with: npm test
//
// This is the money code, so the tests lean on the cases that cost
// something when they are wrong: a coupon that pays the customer, a period
// that gives away days, a limit that lets a broadcast through halfway, and
// a seat count that lets ten people accept the last seat.

const coupon = (overrides: Partial<Coupon> = {}): Coupon => ({
  id: "c1",
  code: "SAVE",
  discount_type: "percent",
  discount_value: 20,
  max_redemptions: null,
  times_redeemed: 0,
  expires_at: null,
  is_active: true,
  ...overrides,
});

describe("checkCoupon", () => {
  const now = new Date("2026-09-12T00:00:00Z");

  it("accepts a live coupon", () => {
    assert.equal(checkCoupon(coupon(), now).ok, true);
  });

  it("refuses one that is switched off, expired, or used up", () => {
    for (const bad of [
      coupon({ is_active: false }),
      coupon({ expires_at: "2026-09-11T00:00:00Z" }),
      coupon({ max_redemptions: 5, times_redeemed: 5 }),
      coupon({ discount_value: 0 }),
      null,
    ]) {
      assert.equal(checkCoupon(bad, now).ok, false);
    }
  });

  it("gives the same reason whatever failed, so codes cannot be probed", () => {
    // A precise "that code has been used 50 times" confirms the code
    // exists to somebody guessing at them.
    const reasons = new Set(
      [
        coupon({ is_active: false }),
        coupon({ expires_at: "2026-01-01T00:00:00Z" }),
        coupon({ max_redemptions: 1, times_redeemed: 1 }),
        null,
      ].map((bad) => {
        const verdict = checkCoupon(bad, now);
        return verdict.ok ? "ok" : verdict.reason;
      })
    );
    assert.equal(reasons.size, 1);
  });
});

describe("chargeFor", () => {
  it("takes a percentage off", () => {
    assert.deepEqual(chargeFor(100000, coupon({ discount_value: 20 })), {
      listCents: 100000,
      discountCents: 20000,
      totalCents: 80000,
    });
  });

  it("takes a fixed amount off", () => {
    assert.deepEqual(chargeFor(100000, coupon({ discount_type: "fixed", discount_value: 25000 })), {
      listCents: 100000,
      discountCents: 25000,
      totalCents: 75000,
    });
  });

  it("never produces a negative total, however wrong the coupon is", () => {
    // A coupon that would pay the customer is a typo in the admin panel.
    for (const bad of [
      coupon({ discount_value: 150 }),
      coupon({ discount_type: "fixed", discount_value: 999999 }),
    ]) {
      const charge = chargeFor(100000, bad);
      assert.equal(charge.totalCents, 0);
      assert.equal(charge.discountCents, 100000);
    }
  });

  it("charges the list price with no coupon", () => {
    assert.equal(chargeFor(100000).totalCents, 100000);
    assert.equal(chargeFor(100000, null).totalCents, 100000);
  });
});

describe("periodEnd", () => {
  it("adds a calendar month, not thirty days", () => {
    // Somebody who pays on the 3rd expects to pay on the 3rd.
    const end = periodEnd(new Date("2026-02-03T10:00:00Z"), "monthly");
    assert.equal(end.toISOString(), "2026-03-03T10:00:00.000Z");
  });

  it("clamps the 31st to the end of a shorter month", () => {
    // Rolling into March instead would quietly give away three days.
    const end = periodEnd(new Date("2026-01-31T00:00:00Z"), "monthly");
    assert.equal(end.toISOString(), "2026-02-28T00:00:00.000Z");
  });

  it("crosses the year boundary", () => {
    const end = periodEnd(new Date("2026-12-15T00:00:00Z"), "monthly");
    assert.equal(end.toISOString(), "2027-01-15T00:00:00.000Z");
  });

  it("adds a year for a yearly plan, and handles 29 February", () => {
    assert.equal(
      periodEnd(new Date("2026-06-01T00:00:00Z"), "yearly").toISOString(),
      "2027-06-01T00:00:00.000Z"
    );
    assert.equal(
      periodEnd(new Date("2028-02-29T00:00:00Z"), "yearly").toISOString(),
      "2029-02-28T00:00:00.000Z"
    );
  });
});

describe("isEntitled", () => {
  const now = new Date("2026-09-12T00:00:00Z");
  const future = "2026-10-01T00:00:00Z";
  const past = "2026-09-01T00:00:00Z";

  it("counts a trial", () => {
    assert.equal(
      isEntitled({ status: "trialing", current_period_end: future, cancel_at_period_end: false }, now),
      true
    );
  });

  it("keeps a cancelled subscription until its period runs out", () => {
    // They paid for the period. Cutting them off at the moment they cancel
    // is how a cancellation becomes a chargeback.
    assert.equal(
      isEntitled({ status: "cancelled", current_period_end: future, cancel_at_period_end: true }, now),
      true
    );
    assert.equal(
      isEntitled({ status: "cancelled", current_period_end: past, cancel_at_period_end: true }, now),
      false
    );
  });

  it("treats no end date on an active row as open-ended", () => {
    // What platform staff assigning a plan by hand produces.
    assert.equal(
      isEntitled({ status: "active", current_period_end: null, cancel_at_period_end: false }, now),
      true
    );
  });

  it("refuses an expired row whatever its dates say", () => {
    assert.equal(
      isEntitled({ status: "expired", current_period_end: future, cancel_at_period_end: false }, now),
      false
    );
  });

  it("refuses no subscription at all", () => {
    assert.equal(isEntitled(null, now), false);
  });
});

describe("daysRemaining", () => {
  it("rounds up, so a part day still counts", () => {
    assert.equal(
      daysRemaining(
        { status: "active", current_period_end: "2026-09-15T06:00:00Z", cancel_at_period_end: false },
        new Date("2026-09-12T00:00:00Z")
      ),
      4
    );
  });

  it("never goes negative", () => {
    assert.equal(
      daysRemaining(
        { status: "active", current_period_end: "2026-09-01T00:00:00Z", cancel_at_period_end: false },
        new Date("2026-09-12T00:00:00Z")
      ),
      0
    );
  });

  it("is null when open-ended", () => {
    assert.equal(
      daysRemaining({ status: "active", current_period_end: null, cancel_at_period_end: false }),
      null
    );
  });
});

describe("the checkout reference", () => {
  it("round-trips an order id", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    assert.equal(orderIdFromReference(checkoutReference(id)), id);
  });

  it("does not claim an invoice number or an order reference", () => {
    // All three arrive at the same payment webhook.
    for (const other of ["INV-0042", "NC-260909-ABCDE", "SUB-not-a-uuid", ""]) {
      assert.equal(orderIdFromReference(other), null);
    }
  });
});

describe("checkLimit", () => {
  it("is unlimited when the limit is null", () => {
    const verdict = checkLimit("messages", null, 999999, 5000);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.remaining, null);
    assert.equal(verdict.fraction, null);
  });

  it("counts what is about to happen, not only what has", () => {
    // A limit discovered halfway through a broadcast has already
    // half-sent it.
    assert.equal(checkLimit("messages", 1000, 900, 1).ok, true);
    assert.equal(checkLimit("messages", 1000, 900, 101).ok, false);
    assert.equal(checkLimit("messages", 1000, 900, 100).ok, true);
  });

  it("names the limit and what is left", () => {
    const verdict = checkLimit("messages", 1000, 900, 500);
    assert.match(verdict.reason ?? "", /1,000 messages this month/);
    assert.match(verdict.reason ?? "", /100 left/);
  });

  it("says so plainly when nothing is left", () => {
    const verdict = checkLimit("contacts", 500, 500);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.remaining, 0);
    assert.match(verdict.reason ?? "", /used all of them/);
  });

  it("treats a nonsense negative usage as zero rather than as credit", () => {
    const verdict = checkLimit("contacts", 10, -5, 1);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.remaining, 10);
  });

  it("reports a fraction for the usage bar", () => {
    assert.equal(checkLimit("contacts", 200, 150, 0).fraction, 0.75);
    // Over the limit caps at 1 rather than overflowing the bar.
    assert.equal(checkLimit("contacts", 200, 400, 0).fraction, 1);
  });
});

describe("usageRows", () => {
  it("lists all three whether or not any is close", () => {
    const rows = usageRows(
      { message_limit: 1000, contact_limit: null, seat_limit: 3 },
      { messages: 850, contacts: 4000, seats: 1 }
    );
    assert.deepEqual(
      rows.map((row) => row.kind),
      ["messages", "contacts", "seats"]
    );
    assert.equal(rows[0].nearly, true);
    // An unlimited row has nothing to be near.
    assert.equal(rows[1].nearly, false);
    assert.equal(rows[1].fraction, null);
    assert.equal(rows[2].nearly, false);
  });
});

describe("monthStart", () => {
  it("is the first of the month at midnight UTC", () => {
    assert.equal(monthStart(new Date("2026-09-25T18:30:00Z")), "2026-09-01T00:00:00.000Z");
  });
});

const invite = (overrides: Partial<InviteRow> = {}): InviteRow => ({
  id: "i1",
  email: "anita@example.com",
  role: "member",
  token: "tok",
  expires_at: "2026-09-20T00:00:00Z",
  accepted_at: null,
  revoked_at: null,
  ...overrides,
});

describe("inviteState", () => {
  const now = new Date("2026-09-12T00:00:00Z");

  it("is pending while it is live and untouched", () => {
    assert.equal(inviteState(invite(), now), "pending");
    assert.equal(isUsable(invite(), now), true);
  });

  it("reports accepted even after it would have expired", () => {
    const row = invite({ accepted_at: "2026-09-13T00:00:00Z", expires_at: "2026-09-01T00:00:00Z" });
    assert.equal(inviteState(row, now), "accepted");
  });

  it("reports revoked rather than merely stale", () => {
    const row = invite({ revoked_at: "2026-09-11T00:00:00Z", expires_at: "2026-09-01T00:00:00Z" });
    assert.equal(inviteState(row, now), "revoked");
  });

  it("expires on the boundary rather than a moment after", () => {
    assert.equal(inviteState(invite({ expires_at: now.toISOString() }), now), "expired");
    assert.equal(isUsable(invite({ expires_at: now.toISOString() }), now), false);
  });

  it("gives a new invitation a week", () => {
    const expiry = new Date(inviteExpiry(now)).getTime() - now.getTime();
    assert.equal(expiry / (24 * 60 * 60 * 1000), 7);
  });
});

describe("normaliseEmail", () => {
  it("makes one person out of two spellings", () => {
    assert.equal(normaliseEmail("  Anita@Example.COM "), "anita@example.com");
  });

  it("accepts an ordinary address and refuses obvious nonsense", () => {
    for (const good of ["a@b.co", "anita.sharma+tag@example.co.in"]) {
      assert.equal(isEmailish(good), true, good);
    }
    for (const bad of ["", "anita", "anita@", "@example.com", "anita @example.com", "a@b.c"]) {
      assert.equal(isEmailish(bad), false, bad);
    }
  });
});

describe("seatsAvailable", () => {
  it("is unlimited when the plan says so", () => {
    assert.deepEqual(seatsAvailable({ limit: null, members: 99, pending: 99 }), {
      ok: true,
      remaining: null,
    });
  });

  it("counts pending invitations against the limit", () => {
    // Otherwise a workspace with one seat left sends ten invitations and
    // all ten are accepted, and the tenth person is told they are over a
    // limit somebody else used up.
    const verdict = seatsAvailable({ limit: 3, members: 1, pending: 2 });
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason ?? "", /invitations? still outstanding/);
  });

  it("has room while members plus invitations are under the limit", () => {
    const verdict = seatsAvailable({ limit: 3, members: 1, pending: 1 });
    assert.equal(verdict.ok, true);
    assert.equal(verdict.remaining, 1);
  });

  it("says the seats are simply full when none are outstanding", () => {
    const verdict = seatsAvailable({ limit: 2, members: 2, pending: 0 });
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason ?? "", /all of them are taken/);
  });
});
