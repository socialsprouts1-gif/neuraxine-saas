"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authNextFor } from "@/lib/plan-checkout";
import { sendPlatformEvent } from "@/lib/platform-message";
import { canUseVerification, type OtpRow } from "@/lib/signup-otp";
import { normaliseVerificationToken } from "@/lib/signup-otp-code";

// Creating the account, once the WhatsApp number has been proved.
//
// Sign-up used to happen entirely in the browser, which meant the number
// that ends up on the account was whatever the page said it was. The code
// sent over WhatsApp would have been theatre: a crafted request could skip
// it and still put a stranger's number on a new account.
//
// So the account is created here instead, and the number is not taken from
// the request at all — it is read out of the row the verification token
// points at. The browser can only say "this token"; the server decides what
// that token is worth and whose number it proved.
//
// signUp runs through the ordinary session client rather than the admin API
// on purpose: that is what sends the confirmation email and sets the
// cookies, so the rest of the flow — email confirmation, the org trigger on
// auth.users, the plan carried through the confirmation link — behaves
// exactly as it did before.

export interface SignupInput {
  /** From verifySignupOtp. The only proof the number in this account is theirs. */
  token: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  company?: string;
  /** The plan chosen on the pricing page, carried so the next page is right. */
  plan?: string | null;
}

export interface SignupResult {
  ok: boolean;
  error?: string;
  /** True when Supabase is configured to confirm addresses before signing in. */
  needsEmailConfirmation?: boolean;
  /** Where to go next, when a session was returned. */
  next?: string;
  /** True when the only way forward is a fresh code. */
  needsNewCode?: boolean;
}

export async function completeSignup(input: SignupInput): Promise<SignupResult> {
  const token = normaliseVerificationToken(input?.token ?? "");
  if (!token) {
    return { ok: false, needsNewCode: true, error: "Verify your WhatsApp number first." };
  }

  const email = (input?.email ?? "").trim().toLowerCase();
  const password = input?.password ?? "";
  const fullName = `${(input?.firstName ?? "").trim()} ${(input?.lastName ?? "").trim()}`.trim();

  if (!email || !password) {
    return { ok: false, error: "Fill in your email and a password." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Use a password of at least 8 characters." };
  }

  const admin = createAdminClient();

  const { data: found } = await admin
    .from("signup_otps")
    .select("wa_id, name, channel, verified_at, consumed_at")
    .eq("verification_token", token)
    .maybeSingle();

  if (!found) {
    return { ok: false, needsNewCode: true, error: "Verify your WhatsApp number again." };
  }

  const row = found as Pick<OtpRow, "wa_id" | "channel" | "verified_at" | "consumed_at"> & {
    name: string | null;
  };

  const usable = canUseVerification(row, new Date());
  if (!usable.ok) {
    return { ok: false, error: usable.reason, needsNewCode: true };
  }

  // Spent before the account is made, with the update itself doing the
  // checking: two tabs submitting the same token at once means one of these
  // matches no rows, and only the one that did goes on to create anything.
  const { data: spent } = await admin
    .from("signup_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("verification_token", token)
    .is("consumed_at", null)
    .select("wa_id");

  if (!spent || spent.length === 0) {
    return {
      ok: false,
      error: "That verification has already been used. Sign in, or ask for a new code.",
    };
  }

  const waId = row.wa_id;

  let session = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(
          authNextFor(input?.plan ?? null)
        )}`,
        data: {
          full_name: fullName || null,
          org_name: (input?.company ?? "").trim() || undefined,
          // The verified number, from the row rather than from the request.
          // This is the whole point of doing sign-up on the server.
          whatsapp_number: waId,
          phone: waId,
          // Whether the code actually reached that number, or went to the
          // email address because Meta had not approved a code template
          // yet. The two are not the same evidence, and writing "verified"
          // over both would make the flag worth nothing.
          whatsapp_verified: row.channel !== "email",
        },
      },
    });

    if (error) {
      await release(token);
      return { ok: false, error: error.message };
    }

    session = Boolean(data.session);
  } catch (error) {
    await release(token);
    console.error("Could not create an account", error);
    return { ok: false, error: "The account could not be created just now. Try again." };
  }

  // Hello on WhatsApp, to somebody who just proved they are on WhatsApp.
  //
  // Sent from here rather than from the browser so it goes out whether or
  // not a session came back — with email confirmation switched on there is
  // no session yet, which is exactly when a message saying "your workspace
  // is ready, confirm your email" is most use. It cannot fail loudly:
  // sendPlatformEvent returns a reason and never throws.
  const welcome = await sendPlatformEvent("signup", {
    waId,
    name: fullName || row.name,
  });
  if (!welcome.sent && welcome.reason) {
    console.info("No welcome message was sent", welcome.reason);
  }

  return {
    ok: true,
    needsEmailConfirmation: !session,
    next: authNextFor(input?.plan ?? null),
  };
}

/** Hands the verification back, so a failed sign-up can be retried as it is. */
async function release(token: string): Promise<void> {
  try {
    await createAdminClient()
      .from("signup_otps")
      .update({ consumed_at: null })
      .eq("verification_token", token);
  } catch (error) {
    console.error("Could not release a sign-up verification", error);
  }
}

/**
 * Where the confirmation link should come back to.
 *
 * From the request's own Origin header, which Next already checks against
 * this deployment before a server action runs, so it cannot be used to
 * point a confirmation link at somebody else's site.
 */
async function origin(): Promise<string> {
  try {
    const list = await headers();
    const sent = list.get("origin");
    if (sent) return sent.replace(/\/+$/, "");
  } catch {
    // No request headers — fall through to the configured URL.
  }

  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://neurachat.in").replace(/\/+$/, "");
}
