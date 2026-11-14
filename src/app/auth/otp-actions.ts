"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseWaNumber } from "@/lib/whatsapp-link";
import { sendOtpTemplate } from "@/lib/platform-message";
import { sendEmail } from "@/lib/email";
import { signupCodeEmail } from "@/lib/email-templates";
import {
  CODE_TTL_MINUTES,
  MAX_NUMBERS_PER_VISITOR,
  MAX_SENDS_PER_HOUR,
  PLATFORM_WINDOW_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  VISITOR_WINDOW_MINUTES,
  canSendCode,
  expiryFrom,
  maskedNumber,
  normaliseCode,
  type OtpChannel,
  type OtpRow,
} from "@/lib/signup-otp";
import {
  checkCode,
  generateCode,
  hashCode,
  newVerificationToken,
} from "@/lib/signup-otp-code";

// Sending and checking the code that proves a WhatsApp number is really
// somebody's, during sign-up.
//
// This is the only path in the product where somebody with no account can
// make it send a WhatsApp message to a number they chose, so the limits
// here are not decoration. Three of them are in the database and therefore
// real across every serverless instance: a per-number cooldown, a
// per-number daily cap, and a platform-wide hourly ceiling. The ceiling is
// the one that matters — the first two are walked around by a script with a
// list of numbers, and what is being protected is this business's own
// WhatsApp number from being reported for sending strangers messages they
// did not ask for.
//
// Nothing here returns a Meta error to the browser. A stranger gets "we
// could not send that", the server log gets the reason, and the one
// exception is a setup problem — because the first person to hit that is
// whoever runs this business, testing their own sign-up form.

const GENERIC_SEND_FAILURE =
  "We could not send the code just now. Check the number and try again in a minute.";

/**
 * What a missing table looks like coming back through PostgREST.
 *
 * Worth catching by name. Without the latest database update there is no
 * signup_otps table, and every sign-up stops at this step — so the message
 * says which file to run rather than leaving whoever runs this business
 * staring at "could not send" on their own form.
 */
const UNDEFINED_TABLE = "42P01";
const NEEDS_MIGRATION =
  "Sign-up codes need the latest database update. Run supabase/updates/run-me-latest.sql in the Supabase SQL editor, then try again.";

function secret(): string {
  return process.env.TOKEN_ENCRYPTION_KEY ?? "";
}

/**
 * The visitor's address, as well as it can be known behind a proxy.
 *
 * Only ever used to count how many different numbers one visitor has had
 * codes sent to. Spoofable, which is why it is the weakest of the limits
 * and not the one anything depends on.
 */
async function visitorIp(): Promise<string | null> {
  try {
    const list = await headers();
    const forwarded = list.get("x-forwarded-for") ?? "";
    const first = forwarded.split(",")[0]?.trim();
    return first || list.get("x-real-ip")?.trim() || null;
  } catch {
    return null;
  }
}

const COLUMNS =
  "wa_id, code_hash, expires_at, attempts, sends, last_sent_at, window_started_at, verified_at, verification_token, consumed_at";

export interface OtpSendResult {
  ok: boolean;
  error?: string;
  /** The number or address it went to, so a typo is caught before waiting. */
  sentTo?: string;
  /** Which it was. The form says "on WhatsApp" or "by email" accordingly. */
  channel?: OtpChannel;
  /** Seconds before Resend does anything, for the countdown on the button. */
  retryAfterSeconds?: number;
  expiresInMinutes?: number;
}

export async function requestSignupOtp(input: {
  phone: string;
  name?: string;
  email?: string;
}): Promise<OtpSendResult> {
  const waId = normaliseWaNumber(input?.phone ?? "");
  if (!waId) {
    return {
      ok: false,
      error:
        "That WhatsApp number does not look right. Include the country code, or enter a 10-digit Indian number.",
    };
  }

  try {
    const admin = createAdminClient();
    const now = new Date();

    const { data: existing, error: lookup } = await admin
      .from("signup_otps")
      .select(COLUMNS)
      .eq("wa_id", waId)
      .maybeSingle();

    if (lookup?.code === UNDEFINED_TABLE) {
      console.error("signup_otps is missing — run the latest database update");
      return { ok: false, error: NEEDS_MIGRATION };
    }

    const row = (existing ?? null) as OtpRow | null;

    const allowed = canSendCode(row, now);
    if (!allowed.ok) {
      return { ok: false, error: allowed.reason, retryAfterSeconds: allowed.retryAfterSeconds };
    }

    const ceiling = await overCeiling(admin, now, waId);
    if (ceiling) return { ok: false, error: ceiling };

    const code = generateCode();
    const name = (input?.name ?? "").trim() || null;
    const email = (input?.email ?? "").trim().toLowerCase() || null;

    // A new code replaces the old one outright: a fresh expiry, no guesses
    // yet, and any earlier verification torn up — otherwise asking for a
    // second code would leave the first code's token still usable.
    const { error: written } = await admin.from("signup_otps").upsert(
      {
        wa_id: waId,
        code_hash: hashCode(waId, code, secret()),
        expires_at: expiryFrom(now),
        attempts: 0,
        sends: allowed.resetWindow ? 1 : (row?.sends ?? 0) + 1,
        last_sent_at: now.toISOString(),
        window_started_at: allowed.resetWindow
          ? now.toISOString()
          : row?.window_started_at ?? now.toISOString(),
        verified_at: null,
        verification_token: null,
        consumed_at: null,
        name,
        email,
        requested_ip: await visitorIp(),
      },
      { onConflict: "wa_id" }
    );

    if (written) {
      console.error("Could not store a sign-up code", written.message);
      return {
        ok: false,
        error: written.code === UNDEFINED_TABLE ? NEEDS_MIGRATION : GENERIC_SEND_FAILURE,
      };
    }

    const sent = await sendOtpTemplate({ waId, name }, code);

    if (sent.sent) {
      return {
        ok: true,
        channel: "whatsapp",
        sentTo: maskedNumber(waId),
        retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
        expiresInMinutes: CODE_TTL_MINUTES,
      };
    }

    console.error("Could not send a sign-up code on WhatsApp", sent.reason);

    // WhatsApp could not take it. Rather than stopping sign-up dead, the
    // code goes to the address from the first step — which is a weaker
    // thing entirely, and is recorded as such: a code read in an inbox
    // says nothing about who holds the phone. It is here because an
    // account Meta has not yet approved a code template on would otherwise
    // have a sign-up form nobody can get through.
    if (email && (await emailTheCode(email, code, waId))) {
      await admin.from("signup_otps").update({ channel: "email" }).eq("wa_id", waId);
      return {
        ok: true,
        channel: "email",
        sentTo: email,
        retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
        expiresInMinutes: CODE_TTL_MINUTES,
      };
    }

    // Neither worked. The code was stored before it was sent, because a
    // sent code that was never stored cannot be checked — so the cooldown
    // it started is given back, since making somebody wait a minute for a
    // message they never received is the wrong way round.
    await releaseCooldown(admin, waId, row, now);
    return { ok: false, error: sent.setup ? sent.reason : GENERIC_SEND_FAILURE };
  } catch (error) {
    console.error("Could not start WhatsApp verification", error);
    return { ok: false, error: GENERIC_SEND_FAILURE };
  }
}

/**
 * The code by email, when WhatsApp could not take it.
 *
 * Deduped on the code itself rather than on the number, so pressing Resend
 * sends a new code and not nothing — the dedupe key exists to stop a
 * retried cron sending the same message twice, and every code here is
 * genuinely new.
 */
async function emailTheCode(to: string, code: string, waId: string): Promise<boolean> {
  try {
    const result = await sendEmail({
      to,
      orgId: null,
      kind: "signup_code",
      dedupeKey: `signup_code:${waId}:${hashCode(waId, code, secret()).slice(0, 16)}`,
      body: (brand) => signupCodeEmail(brand, { code, minutes: CODE_TTL_MINUTES }),
    });

    if (!result.ok) console.error("Could not email a sign-up code", result.skipped ?? result.error);
    return result.ok && result.skipped !== "not_configured";
  } catch (error) {
    console.error("Could not email a sign-up code", error);
    return false;
  }
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The two limits that are not about one number: this visitor, and everyone.
 *
 * Counted as rows rather than as sends, which is the right unit — the table
 * holds one row per number, so a count is a count of distinct numbers
 * messaged, and that is exactly what gets a sending number reported.
 */
async function overCeiling(admin: Admin, now: Date, waId: string): Promise<string | null> {
  const platformSince = new Date(now.getTime() - PLATFORM_WINDOW_MINUTES * 60_000).toISOString();

  const { count: platform } = await admin
    .from("signup_otps")
    .select("wa_id", { count: "exact", head: true })
    .gte("last_sent_at", platformSince);

  if ((platform ?? 0) >= MAX_SENDS_PER_HOUR) {
    return "We are sending a lot of codes right now. Try again in a few minutes, or message us on WhatsApp and we will set your account up.";
  }

  const ip = await visitorIp();
  if (!ip) return null;

  const visitorSince = new Date(now.getTime() - VISITOR_WINDOW_MINUTES * 60_000).toISOString();

  const { count: mine } = await admin
    .from("signup_otps")
    .select("wa_id", { count: "exact", head: true })
    .eq("requested_ip", ip)
    .neq("wa_id", waId)
    .gte("last_sent_at", visitorSince);

  if ((mine ?? 0) >= MAX_NUMBERS_PER_VISITOR) {
    return "That is a lot of different numbers from one place. Try again in an hour, or message us on WhatsApp.";
  }

  return null;
}

/** Puts the cooldown back when the message never went out. */
async function releaseCooldown(
  admin: Admin,
  waId: string,
  previous: OtpRow | null,
  now: Date
): Promise<void> {
  try {
    await admin
      .from("signup_otps")
      .update({
        last_sent_at:
          previous?.last_sent_at ??
          new Date(now.getTime() - RESEND_COOLDOWN_SECONDS * 1000).toISOString(),
        sends: previous?.sends ?? 0,
      })
      .eq("wa_id", waId);
  } catch (error) {
    console.error("Could not release a sign-up code cooldown", error);
  }
}

export interface OtpCheckResult {
  ok: boolean;
  error?: string;
  /** Exchanged for an account on the last step. Single use. */
  token?: string;
  /** True when the only way forward is a fresh code. */
  needsNewCode?: boolean;
}

export async function verifySignupOtp(input: {
  phone: string;
  code: string;
}): Promise<OtpCheckResult> {
  const waId = normaliseWaNumber(input?.phone ?? "");
  if (!waId) return { ok: false, error: "Start again and enter your WhatsApp number." };

  if (!normaliseCode(input?.code ?? "")) {
    return { ok: false, error: "Enter the 6-digit code from WhatsApp." };
  }

  try {
    const admin = createAdminClient();
    const now = new Date();

    const { data: existing } = await admin
      .from("signup_otps")
      .select(COLUMNS)
      .eq("wa_id", waId)
      .maybeSingle();

    if (!existing) {
      return { ok: false, needsNewCode: true, error: "Ask for a code first." };
    }

    const row = existing as OtpRow;
    const verdict = checkCode(row, input.code, secret(), now);

    if (!verdict.ok) {
      // Counted here rather than in the pure check, so a run of wrong
      // guesses actually closes the code off instead of being allowed
      // forever. An expired or already-exhausted code does not count
      // against anything — there is nothing left to protect.
      if (!verdict.exhausted) {
        await admin
          .from("signup_otps")
          .update({ attempts: row.attempts + 1 })
          .eq("wa_id", waId);
      }
      return { ok: false, error: verdict.reason, needsNewCode: verdict.exhausted };
    }

    const token = newVerificationToken();

    const { error } = await admin
      .from("signup_otps")
      .update({
        verified_at: now.toISOString(),
        verification_token: token,
        attempts: 0,
      })
      .eq("wa_id", waId);

    if (error) {
      console.error("Could not record a verified number", error.message);
      return { ok: false, error: "That could not be confirmed just now. Try again." };
    }

    return { ok: true, token };
  } catch (error) {
    console.error("Could not check a sign-up code", error);
    return { ok: false, error: "That could not be checked just now. Try again." };
  }
}
