// The one-time code that proves a WhatsApp number belongs to the person
// typing it in.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Sign-up asks for a number so the platform can message its own customers
// — a welcome, a trial ending, a payment landing. Before this, the number
// was simply believed. Anyone could type a stranger's number into the form
// and that stranger would get the messages, which is both a spam vector
// and a number this business can get its own WhatsApp account blocked
// over.
//
// So the number is proved: a six-digit code goes to it over WhatsApp, and
// nothing is stored against the account until the code comes back.
//
// Four limits, all of them real, because this is the one path in the
// product where a stranger with no account can make it send a WhatsApp
// message to a number they chose:
//
//   - the code expires, so a leaked one is worthless by tomorrow
//   - wrong guesses are counted, so 10^6 cannot be walked through
//   - a number cannot be messaged again immediately, nor many times a day
//   - the whole platform has an hourly ceiling, which is what actually
//     protects the sending number from being reported as spam
//
// The code is never stored. An HMAC of it is, so a copy of the database
// without the server's key is not a list of valid codes.
//
// Split in two on purpose. This half is the rules and the shapes, and the
// sign-up page imports it into the browser to know how many boxes to draw.
// Anything that touches the code itself — making one, hashing it, comparing
// it — lives in signup-otp-code.ts, because node:crypto cannot be bundled
// for a browser and a secret-handling function has no business being sent
// to one.

/** Six digits, as every other one-time code anybody has ever been sent. */
export const CODE_LENGTH = 6;

/** How long a code lives. Long enough to find the message, short enough to matter. */
export const CODE_TTL_MINUTES = 10;

/**
 * Wrong guesses allowed on one code.
 *
 * Six digits is a million possibilities, so five guesses is a one-in-two
 * hundred thousand chance — and asking for a fresh code resets it, which
 * is why the per-number send limits below are the real wall.
 */
export const MAX_ATTEMPTS = 5;

/** The wait before the same number can be sent another code. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Codes one number can be sent in a day, however many times it is asked for. */
export const MAX_SENDS_PER_NUMBER = 5;

/** Distinct numbers one visitor can have codes sent to in an hour. */
export const MAX_NUMBERS_PER_VISITOR = 5;

/**
 * Codes the whole platform sends in an hour.
 *
 * The ceiling that matters. Everything above is per-number or per-visitor
 * and a script with a list of numbers walks around both; this is what
 * stops that list turning into a thousand unsolicited WhatsApp messages
 * from the business's own number, which is how a number gets blocked.
 */
export const MAX_SENDS_PER_HOUR = 60;

/** The rolling windows the two cumulative limits are counted over. */
export const NUMBER_WINDOW_HOURS = 24;
export const VISITOR_WINDOW_MINUTES = 60;
export const PLATFORM_WINDOW_MINUTES = 60;

/**
 * How long a verified number can be turned into an account.
 *
 * The code proves the number; this is how long that proof is worth
 * something. Somebody who verifies and then wanders off for an hour is
 * asked again rather than left with a token that creates an account
 * whenever it is next used.
 */
export const VERIFIED_FOR_MINUTES = 30;

/** A verification token: 32 hex characters, from crypto-quality randomness. */
export const VERIFICATION_TOKEN_LENGTH = 32;

/**
 * The digits out of whatever was typed or pasted.
 *
 * People paste "123 456", and autofill pastes the whole sentence the
 * message was in. Anything that is not six digits after the spaces come
 * out is refused rather than guessed at.
 */
export function normaliseCode(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === CODE_LENGTH ? digits : null;
}

/**
 * How a code reached somebody.
 *
 * Two channels prove two different things, and the difference is recorded
 * rather than smoothed over: a code typed back after arriving on WhatsApp
 * proves whoever signed up holds that phone, and a code read in an inbox
 * proves only that they hold that inbox. Email is the fallback for an
 * account Meta has not yet approved a code template on — worth having,
 * because the alternative is nobody being able to sign up at all, and
 * worth labelling, because it is not the same evidence.
 */
export type OtpChannel = "whatsapp" | "email";

export interface OtpRow {
  wa_id: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  sends: number;
  last_sent_at: string | null;
  window_started_at: string | null;
  channel?: OtpChannel;
  verified_at: string | null;
  verification_token: string | null;
  consumed_at: string | null;
}

export type SendVerdict =
  | { ok: true; /** Whether the day's tally starts again with this one. */ resetWindow: boolean }
  | { ok: false; reason: string; retryAfterSeconds?: number };

/** A stored timestamp as milliseconds, or null when it is missing or junk. */
export function parsed(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Whether this number can be sent a code right now.
 *
 * Every refusal says which limit it hit and, where there is one, when to
 * come back — "try again later" with no number in it is the message that
 * makes somebody press the button eleven more times.
 */
export function canSendCode(row: OtpRow | null, now: Date = new Date()): SendVerdict {
  if (!row) return { ok: true, resetWindow: true };

  const last = parsed(row.last_sent_at);
  if (last !== null) {
    const waited = Math.floor((now.getTime() - last) / 1000);
    if (waited < RESEND_COOLDOWN_SECONDS) {
      const retryAfterSeconds = RESEND_COOLDOWN_SECONDS - waited;
      return {
        ok: false,
        retryAfterSeconds,
        reason: `A code has just gone out. Wait ${retryAfterSeconds} second${
          retryAfterSeconds === 1 ? "" : "s"
        } before asking for another.`,
      };
    }
  }

  // The day's tally, counted from the first code rather than from midnight
  // — somebody who starts at 11pm is not given ten.
  const windowStart = parsed(row.window_started_at) ?? last;
  const resetWindow =
    windowStart === null ||
    now.getTime() - windowStart > NUMBER_WINDOW_HOURS * 3_600_000;

  if (!resetWindow && row.sends >= MAX_SENDS_PER_NUMBER) {
    return {
      ok: false,
      reason: `That number has been sent ${MAX_SENDS_PER_NUMBER} codes today. Try again tomorrow, or message us on WhatsApp and we will set your account up.`,
    };
  }

  return { ok: true, resetWindow };
}

export type CheckVerdict = { ok: true } | { ok: false; reason: string; exhausted?: boolean };

/**
 * Whether a verified number can still be turned into an account.
 *
 * Checked again at the moment the account is created, because the token
 * travels through the browser between the two steps and the only thing
 * that makes it trustworthy is being looked up here rather than believed.
 */
export function canUseVerification(
  row: Pick<OtpRow, "verified_at" | "consumed_at">,
  now: Date = new Date()
): CheckVerdict {
  if (row.consumed_at) {
    return {
      ok: false,
      reason: "That number has already been used to create an account. Sign in instead.",
    };
  }

  const verified = parsed(row.verified_at);
  if (verified === null) {
    return { ok: false, reason: "Verify your WhatsApp number before setting a password." };
  }

  if (now.getTime() - verified > VERIFIED_FOR_MINUTES * 60_000) {
    return {
      ok: false,
      exhausted: true,
      reason: "That took a while — verify your WhatsApp number again and you are through.",
    };
  }

  return { ok: true };
}

/** When a code sent now stops working. */
export function expiryFrom(now: Date = new Date()): string {
  return new Date(now.getTime() + CODE_TTL_MINUTES * 60_000).toISOString();
}

/**
 * The number as it is shown back to somebody waiting for a code.
 *
 * Enough to recognise their own number and spot a typo, not enough to be
 * worth anything on a screen somebody else can see. The last three digits
 * are what people actually check.
 */
export function maskedNumber(waId: string): string {
  const digits = (waId ?? "").replace(/\D/g, "");
  if (digits.length < 4) return digits;
  return `+${digits.slice(0, 2)} ${"•".repeat(Math.max(digits.length - 5, 1))}${digits.slice(-3)}`;
}

export interface OtpComponent {
  type: "body" | "button";
  sub_type?: "url";
  index?: number;
  parameters: Array<Record<string, unknown>>;
}

/**
 * What Meta is sent for an authentication template.
 *
 * An authentication template is the one shape in the API where the same
 * value goes in twice: once into the body text, and once more into the
 * copy-code button, which is a URL button whose parameter is the code
 * rather than a link. Sending the button component to a template that has
 * no button is refused outright, and leaving it off one that has a button
 * is refused just as hard — so the index comes from the template Meta
 * itself returned rather than from a setting somebody has to keep right.
 */
export function otpComponents(code: string, buttonIndex: number | null): OtpComponent[] {
  const components: OtpComponent[] = [
    { type: "body", parameters: [{ type: "text", text: code }] },
  ];

  if (buttonIndex !== null) {
    components.push({
      type: "button",
      sub_type: "url",
      index: buttonIndex,
      parameters: [{ type: "text", text: code }],
    });
  }

  return components;
}
