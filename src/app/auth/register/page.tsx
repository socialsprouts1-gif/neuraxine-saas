"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import BrandMark from "@/components/ui/BrandMark";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { WhatsAppGlyph } from "@/components/landing/BrandGlyphs";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { PLAN_PARAM } from "@/lib/plan-checkout";
import { normaliseWaNumber, displayWaNumber } from "@/lib/whatsapp-link";
import { CODE_LENGTH } from "@/lib/signup-otp";
import { requestSignupOtp, verifySignupOtp } from "../otp-actions";
import { completeSignup } from "../signup-actions";
import { describeClaim, claimGuestCheckout } from "../claim-actions";
import { splitName } from "@/lib/guest-checkout";
import Steps, { type StepKey } from "./Steps";
import OtpInput from "./OtpInput";

// Sign-up, in three steps: who you are, the WhatsApp number proved with a
// code, then a password.
//
// The middle step is the reason the other two are split up. The number has
// to be verified before the account exists — once it is on an account, a
// wrong one is a welcome message, a trial warning and an invoice notice all
// going to a stranger — and a code cannot be sent to somebody who is still
// filling in a password field. So: details, verify, password.
//
// Nothing on this page decides what the account ends up holding. The number
// is read on the server from the row the code was checked against, so the
// only thing the browser can do with it is show it back.

const perks = [
  "AI-ready WhatsApp automation",
  "Direct Meta Cloud API — no BSP markup",
  "Unlimited messages and contacts",
  "Multi-tenant from day one",
];

function RegisterForm() {
  const router = useRouter();
  // The plan chosen on the pricing page. Validated on the billing side
  // against the plans that exist — here it is only carried.
  const params = useSearchParams();
  const plan = params.get(PLAN_PARAM);

  // Arrived from the payment window: the plan is already bought, and this
  // form exists only to put a login on it.
  const claim = params.get("claim");
  const [claimed, setClaimed] = useState<{ planName: string } | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const [step, setStep] = useState<StepKey>("personal");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step two's own state: whether a code is out, what was typed, and the
  // token that typing the right one earns.
  const [codeSent, setCodeSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  // Where it went. WhatsApp is the point of the exercise; email is the
  // fallback, and saying which is not a detail — somebody who pressed
  // "Send code on WhatsApp" and then waits at their phone for an email
  // has been told nothing useful.
  const [sentBy, setSentBy] = useState<"whatsapp" | "email">("whatsapp");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [codeWrong, setCodeWrong] = useState(false);

  const [busy, setBusy] = useState<null | "code" | "verify" | "account">(null);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (!claim) return;
    let live = true;

    void describeClaim(claim).then((found) => {
      if (!live) return;
      if (!found.ok) {
        setClaimError(found.error);
        return;
      }
      const name = splitName(found.contact.name);
      setFirstName((current) => current || name.first);
      setLastName((current) => current || name.last);
      setEmail((current) => current || found.contact.email);
      setPhone((current) => current || found.contact.phone);
      setClaimed({ planName: found.planName });
    });

    return () => {
      live = false;
    };
  }, [claim]);

  // The Resend countdown. One interval, cleared when it runs out, so the
  // page is not ticking for the whole time somebody spends on step three.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((left) => (left <= 1 ? 0 : left - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const goToVerify = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStep("verify");
  };

  // Changing the number throws away everything that was true of the old
  // one. A token earned for one number must never travel with another.
  const changeNumber = (value: string) => {
    setPhone(value);
    setCodeSent(false);
    setCode("");
    setToken("");
    setCodeWrong(false);
    setError(null);
  };

  const sendCode = async () => {
    setError(null);
    setCodeWrong(false);

    const waId = normaliseWaNumber(phone);
    if (!waId) {
      setError(
        "That WhatsApp number does not look right. Include the country code, or enter a 10-digit Indian number."
      );
      return;
    }

    setBusy("code");
    const result = await requestSignupOtp({
      phone,
      name: `${firstName} ${lastName}`.trim(),
      email,
    }).catch(() => ({ ok: false, error: "That could not be sent just now. Try again." }));
    setBusy(null);

    if (!result.ok) {
      setError(result.error ?? "That could not be sent just now. Try again.");
      // A refusal for asking too soon still knows when to come back.
      if ("retryAfterSeconds" in result && result.retryAfterSeconds) {
        setCooldown(result.retryAfterSeconds);
        setCodeSent(true);
      }
      return;
    }

    setCodeSent(true);
    setCode("");
    setSentTo(("sentTo" in result && result.sentTo) || displayWaNumber(waId));
    setSentBy(("channel" in result && result.channel === "email") ? "email" : "whatsapp");
    setCooldown(("retryAfterSeconds" in result && result.retryAfterSeconds) || 60);
  };

  const checkCodeNow = async (typed: string) => {
    if (busy) return;
    setError(null);
    setCodeWrong(false);
    setBusy("verify");

    const result = await verifySignupOtp({ phone, code: typed }).catch(() => ({
      ok: false,
      error: "That could not be checked just now. Try again.",
    }));
    setBusy(null);

    if (!result.ok || !("token" in result) || !result.token) {
      setCodeWrong(true);
      setError(result.error ?? "That code is not right.");
      // Out of guesses, or expired: the only way on is a fresh code, so the
      // boxes are cleared rather than left holding digits that cannot work.
      if ("needsNewCode" in result && result.needsNewCode) {
        setCode("");
        setCooldown(0);
      }
      return;
    }

    setToken(result.token);
    setCodeWrong(false);
    setStep("security");
  };

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy("account");

    const result = await completeSignup({
      token,
      email,
      password,
      firstName,
      lastName,
      company: companyName,
      plan,
    }).catch(() => ({ ok: false, error: "The account could not be created just now." }));

    if (!result.ok) {
      setBusy(null);
      setError(result.error ?? "The account could not be created just now.");
      // The verification expired while they were choosing a password.
      if ("needsNewCode" in result && result.needsNewCode) {
        setToken("");
        setCode("");
        setCodeSent(false);
        setStep("verify");
      }
      return;
    }

    // With email confirmation switched on there is no session yet. The
    // workspace exists either way — the trigger fires on the auth.users
    // insert — and the WhatsApp welcome has already gone out from the
    // server, which is why it no longer depends on there being a session.
    if ("needsEmailConfirmation" in result && result.needsEmailConfirmation) {
      setBusy(null);
      setCheckEmail(true);
      return;
    }

    // They already paid. Awaited, because the page they are about to land on
    // shows their plan and would otherwise show them the trial they have
    // just paid to skip.
    if (claim) {
      const applied = await claimGuestCheckout(claim);
      if (!applied.ok && applied.error) {
        // The money is taken and the account exists, so this is a note to
        // act on rather than a sign-up failure to report.
        console.error(applied.error);
      }
    }

    router.push(claim ? "/overview" : ("next" in result && result.next) || "/overview");
    router.refresh();
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthError) setError(oauthError.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign in failed");
    }
  };

  const field =
    "w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all";
  const label = "block text-xs font-medium text-white/70 mb-1.5";

  return (
    <div className="min-h-screen bg-[var(--app-bg)] flex relative overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px]" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent2/5 rounded-full blur-[120px]" />

      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-12 relative">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark size={40} />
          <span className="font-bold text-lg">
            Neura <span className="gradient-text-green">Chat</span>
          </span>
        </Link>

        <div className="space-y-8">
          <div>
            <h2 className="text-4xl font-black leading-tight mb-4">
              Automate WhatsApp on{" "}
              <span className="gradient-text-green">your own Meta credentials</span>
            </h2>
            <p className="text-white/60 leading-relaxed">
              Neura Chat connects straight to the Meta WhatsApp Cloud API — no third-party BSP in
              between.
            </p>
          </div>

          <div className="space-y-3">
            {perks.map((perk) => (
              <div key={perk} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-3 h-3 text-accent-ink" />
                </div>
                <span className="text-sm text-white/70">{perk}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/30">© 2026 Neura Chat · A Neuraxine product</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="flex justify-center mb-6 lg:hidden">
            <Link href="/" className="flex items-center gap-2">
              <BrandMark size={40} />
              <span className="font-bold text-lg">
                Neura <span className="gradient-text-green">Chat</span>
              </span>
            </Link>
          </div>

          <div className="glass-card p-8">
            {checkEmail ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-6 h-6 text-accent-ink" />
                </div>
                <h1 className="text-xl font-bold mb-2">Check your email</h1>
                <p className="text-white/50 text-sm leading-relaxed">
                  We sent a confirmation link to <span className="text-white/80">{email}</span>.
                  Your organization is already set up — confirm your email to sign in.
                </p>
                <p className="text-white/40 text-xs mt-3 leading-relaxed">
                  There is a message waiting on WhatsApp too, on the number you just verified.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  {claimed ? (
                    <>
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/12 border border-accent/25 text-accent-ink text-xs font-semibold mb-3">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Payment received — {claimed.planName}
                      </span>
                      <h1 className="text-2xl font-bold mb-2">Almost there</h1>
                      <p className="text-white/50 text-sm">
                        Your plan is paid for. Verify your WhatsApp number, pick a password, and
                        your workspace is ready.
                      </p>
                    </>
                  ) : (
                    <>
                      <h1 className="text-2xl font-bold mb-2">Create your account</h1>
                      <p className="text-white/50 text-sm">Spin up your Neura Chat organization</p>
                    </>
                  )}
                  {claimError && (
                    <p className="text-sm text-[#FACC15]/85 mt-3 leading-relaxed">{claimError}</p>
                  )}
                </div>

                <Steps current={step} />

                {/* ---------------------------------------------- step one */}
                {step === "personal" && (
                  <>
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/15 bg-white/5 text-sm font-medium hover:border-white/25 hover:bg-white/8 transition-all mb-6"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          fill="#EA4335"
                        />
                      </svg>
                      Continue with Google
                    </button>

                    <div className="flex items-center gap-4 mb-6">
                      <div className="flex-1 h-px bg-white/10" />
                      <span className="text-xs text-white/40">or continue with email</span>
                      <div className="flex-1 h-px bg-white/10" />
                    </div>

                    <form className="space-y-4" onSubmit={goToVerify}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={label}>First name</label>
                          <input
                            type="text"
                            required
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="Alex"
                            autoComplete="given-name"
                            className={field}
                          />
                        </div>
                        <div>
                          <label className={label}>Last name</label>
                          <input
                            type="text"
                            required
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Johnson"
                            autoComplete="family-name"
                            className={field}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={label}>Work email</label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@company.com"
                          autoComplete="email"
                          className={field}
                        />
                      </div>

                      <div>
                        <label className={label}>Company name</label>
                        <input
                          type="text"
                          required
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="Your Company Ltd."
                          autoComplete="organization"
                          className={field}
                        />
                      </div>

                      {error && <p className="text-sm text-red-400">{error}</p>}

                      <button
                        type="submit"
                        className="btn-primary w-full justify-center py-3.5 text-base"
                      >
                        Continue
                        <ArrowRight className="w-5 h-5" />
                      </button>
                    </form>
                  </>
                )}

                {/* ---------------------------------------------- step two */}
                {step === "verify" && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/3 p-3.5">
                      <span className="w-9 h-9 rounded-xl bg-[#25D366] flex items-center justify-center shrink-0">
                        <WhatsAppGlyph className="w-[18px] h-[18px] text-[#FFFFFF]" />
                      </span>
                      <p className="text-[12.5px] text-white/55 leading-relaxed">
                        We send a {CODE_LENGTH}-digit code to your WhatsApp. This is the number
                        your account messages come to, so it has to be one you can open.
                      </p>
                    </div>

                    <div>
                      <label className={label}>WhatsApp number</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => changeNumber(e.target.value)}
                        placeholder="+91 82379 82569"
                        autoComplete="tel"
                        inputMode="tel"
                        disabled={busy === "code"}
                        className={field}
                      />
                      <p className="text-[12px] text-white/40 mt-1.5">
                        A 10-digit Indian number is fine. Anywhere else, include the country code.
                      </p>
                    </div>

                    {!codeSent ? (
                      <button
                        type="button"
                        onClick={sendCode}
                        disabled={busy === "code" || !phone.trim()}
                        className="btn-primary w-full justify-center py-3.5 text-base disabled:opacity-60"
                      >
                        {busy === "code" ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <WhatsAppGlyph className="w-[18px] h-[18px]" />
                            Send code on WhatsApp
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className={label}>Enter the code</label>
                          <OtpInput
                            value={code}
                            onChange={setCode}
                            onComplete={checkCodeNow}
                            disabled={busy === "verify"}
                            invalid={codeWrong}
                          />
                          {sentTo && (
                            <p className="text-[12px] text-white/40 mt-2 leading-relaxed">
                              {sentBy === "email" ? (
                                <>
                                  Sent by email to <span className="text-white/65">{sentTo}</span>.
                                  WhatsApp could not take it this time, so check your inbox.
                                </>
                              ) : (
                                <>
                                  Sent on WhatsApp to <span className="text-white/65">{sentTo}</span>.
                                </>
                              )}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={sendCode}
                            disabled={cooldown > 0 || busy !== null}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-ink disabled:text-white/30 transition-colors"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            {cooldown > 0 ? `Resend in ${cooldown}s` : "Send another code"}
                          </button>

                          <button
                            type="button"
                            onClick={() => checkCodeNow(code)}
                            disabled={code.length < CODE_LENGTH || busy !== null}
                            className="btn-primary text-sm py-2.5 px-5 disabled:opacity-60"
                          >
                            {busy === "verify" ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                Verify
                                <ArrowRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {error && <p className="text-sm text-red-400 leading-relaxed">{error}</p>}

                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setStep("personal");
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back
                    </button>
                  </div>
                )}

                {/* -------------------------------------------- step three */}
                {step === "security" && (
                  <form className="space-y-4" onSubmit={createAccount}>
                    <div className="flex items-center gap-2.5 rounded-2xl border border-accent/25 bg-accent/8 p-3.5">
                      <CheckCircle className="w-[18px] h-[18px] text-accent-ink shrink-0" />
                      <p className="text-[12.5px] text-white/65 leading-relaxed">
                        {displayWaNumber(phone)} is verified. One last thing.
                      </p>
                    </div>

                    <div>
                      <label className={label}>Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          autoComplete="new-password"
                          className={`${field} pr-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {error && <p className="text-sm text-red-400 leading-relaxed">{error}</p>}

                    <button
                      type="submit"
                      disabled={busy !== null}
                      className="btn-primary w-full justify-center py-3.5 text-base disabled:opacity-60"
                    >
                      {busy === "account" ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          Create account
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setStep("verify");
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Use a different number
                    </button>
                  </form>
                )}

                <p className="text-center text-sm text-white/50 mt-5">
                  Already have an account?{" "}
                  <Link
                    href="/auth/login"
                    className="text-accent-ink font-medium hover:text-[#00CC6A] transition-colors"
                  >
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * useSearchParams makes the tree under it client-rendered, and a statically
 * prerendered route has to say where that starts. Without this the
 * production build fails outright on this page — it works in development,
 * where every route is rendered on demand, which is exactly how it got
 * missed.
 */
export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--app-bg)]" />}>
      <RegisterForm />
    </Suspense>
  );
}
