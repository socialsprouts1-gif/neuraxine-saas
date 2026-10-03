// Carrying a chosen plan from the public site through to payment.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// The old marketing site said "Start free trial" on every button and sent
// everybody to /auth/register, where the plan they had just spent a minute
// choosing was forgotten. They landed in a trial, and the only way to pay
// was to find Billing later and choose all over again.
//
// So the slug travels: pricing card -> sign-up -> billing -> the payment
// window. Three URLs, one chain, and each hop validates the slug against
// the plans that actually exist rather than believing the address bar.

/** A yearly plan is the monthly slug plus this. */
const YEARLY_SUFFIX = "-yearly";

/** The query parameter the slug rides in, in every link below. */
export const PLAN_PARAM = "plan";

/** A slug at all: lowercase letters, digits and dashes, nothing exotic. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The yearly row of a tier, given its monthly slug. */
export function yearlySlug(slug: string): string {
  return slug.endsWith(YEARLY_SUFFIX) ? slug : `${slug}${YEARLY_SUFFIX}`;
}

/** Whichever row of the tier matches the interval on screen. */
export function slugForInterval(slug: string, yearly: boolean): string {
  const monthly = slug.endsWith(YEARLY_SUFFIX) ? slug.slice(0, -YEARLY_SUFFIX.length) : slug;
  return yearly ? yearlySlug(monthly) : monthly;
}

/**
 * Where a "Choose plan" button goes: straight to the payment window.
 *
 * It used to go to sign-up. That put a form in front of somebody who had
 * their card out and had already decided — so the gateway opens first
 * now, and the account is created afterwards from the name, email and
 * phone the payment itself collects.
 */
export function planSignupHref(slug: string): string {
  if (!SLUG.test(slug)) return "/#pricing";
  return `/checkout?${PLAN_PARAM}=${encodeURIComponent(slug)}`;
}

/** Where somebody lands once a guest payment has gone through. */
export function claimHref(token: string): string {
  return `/auth/register?claim=${encodeURIComponent(token)}`;
}

/** Where they go once they have an account: billing, with the window opening. */
export function planCheckoutHref(slug: string): string {
  if (!SLUG.test(slug)) return "/billing";
  return `/billing?${PLAN_PARAM}=${encodeURIComponent(slug)}`;
}

/**
 * The slug to trust, given what arrived in the URL.
 *
 * Checked against the plans that exist, never used as it came. It reaches
 * the app from a link anybody can edit, and it decides what a person is
 * about to be charged for.
 */
export function planFromParam(
  value: string | null | undefined,
  known: readonly string[]
): string | null {
  const slug = (value ?? "").trim().toLowerCase();
  if (!slug || !SLUG.test(slug)) return null;
  return known.includes(slug) ? slug : null;
}

/**
 * The sign-in destination that keeps the plan.
 *
 * Supabase sends an email confirmation through /auth/callback, which
 * forwards to whatever `next` says. Without this the link lands on the
 * overview and the choice is lost between clicking Choose plan and
 * reading the email.
 */
export function authNextFor(slug: string | null): string {
  return slug ? planCheckoutHref(slug) : "/overview";
}
