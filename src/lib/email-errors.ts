// Turning a mail provider's refusal into something to act on.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// These strings are what gets written to email_log.error — a status code
// and a JSON body from Resend, or whatever nodemailer's exception said.
// Neither is written for somebody who is trying to work out why a customer
// never got their welcome, and the most common failure of all reads as a
// generic 403.

export interface EmailFailure {
  /** One line naming the cause. */
  summary: string;
  /** What to do about it. */
  fix: string;
}

/**
 * The single most common one, and the least obvious.
 *
 * A Resend account with no verified domain may only send to the address
 * the account was opened with. A test to your own inbox therefore proves
 * almost nothing: it is the one address that is allowed to work. Every real
 * signup is a different address, so every real signup is refused — which
 * looks exactly like mail being broken for everyone.
 */
const RESEND_TESTING =
  /only send testing emails to your own|verify a domain|not verified|domain is not verified/i;

const RESEND_KEY = /api key is invalid|unauthorized|restricted to sending/i;
const RESEND_FROM = /from.*not.*(allowed|valid)|invalid.*from|sender.*not.*allowed/i;
const SMTP_AUTH = /invalid login|username and password not accepted|535|authentication failed/i;
const SMTP_REACH = /etimedout|econnrefused|enotfound|connection timeout|greeting never received/i;
const RATE = /rate.?limit|too many requests|429/i;

export function explainEmailFailure(error: string | null | undefined): EmailFailure | null {
  if (!error || !error.trim()) return null;

  if (RESEND_TESTING.test(error)) {
    return {
      summary:
        "Resend refused this because the sending domain is not verified, so it will only deliver to the address the Resend account was opened with.",
      fix: "Verify your domain at resend.com/domains and set EMAIL_FROM to an address on it. Until then every customer address is refused and only your own inbox works, which is why a test email arrives and a real signup does not.",
    };
  }

  if (RESEND_KEY.test(error)) {
    return {
      summary: "Resend rejected the API key.",
      fix: "Generate a new key at resend.com/api-keys, put it in RESEND_API_KEY, and redeploy — Vercel does not apply a new variable to a build that already exists.",
    };
  }

  if (RESEND_FROM.test(error)) {
    return {
      summary: "The from address is not one this account may send as.",
      fix: "EMAIL_FROM has to be on a domain verified in Resend. A Gmail address cannot be a Resend from address.",
    };
  }

  if (SMTP_AUTH.test(error)) {
    return {
      summary: "The mail server rejected the username or password.",
      fix: "For Gmail this must be a 16-character App Password, not the account password, and two-step verification has to be on for the account to offer one.",
    };
  }

  if (SMTP_REACH.test(error)) {
    return {
      summary: "The mail server could not be reached.",
      fix: "Check SMTP_HOST and SMTP_PORT. Port 465 is implicit TLS and 587 starts plain and upgrades — the two are not interchangeable, and getting it backwards times out with no useful error.",
    };
  }

  if (RATE.test(error)) {
    return {
      summary: "The provider is rate limiting this account.",
      fix: "Sends will succeed again shortly. Nothing is lost — a failed row is kept and can be sent again.",
    };
  }

  return null;
}

/** Whether a log row means "tried and failed" rather than "never tried". */
export function isFailure(status: string): boolean {
  return status === "failed";
}

/**
 * What the absence of any row means for a workspace.
 *
 * A send that was never configured writes nothing at all, so an empty log
 * is not the same as a log full of failures and must not read like one.
 */
export const NEVER_ATTEMPTED =
  "No message has ever been attempted for this workspace. Either mail was not configured when they signed up, or nothing has triggered a send yet.";
