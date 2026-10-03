import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailBody, EmailBrand } from "@/lib/email-templates";
import type { EmailTransport } from "@/lib/deliverability";
import { suppressible, unsubscribeUrl } from "@/lib/email-kinds";

// Sending mail, and remembering that we did.
//
// Over Resend's REST API with fetch rather than its SDK, for the same
// reason every other outbound call here does: one fewer dependency to keep
// current, and the request is four lines.
//
// The remembering matters more than the sending. These go out on a
// schedule nobody watches, and a sweep that runs twice — a retried cron, a
// redeploy mid-run — would send the same "your trial ends tomorrow" again.
// So the log row is written *before* the request, with a unique index on
// the dedupe key doing the work: a second attempt loses the insert and
// stops there, rather than both attempts checking, both finding nothing,
// and both sending.

export interface SendResult {
  ok: boolean;
  skipped?: "duplicate" | "not_configured" | "no_address" | "unsubscribed";
  error?: string;
}

export function emailBrand(): EmailBrand {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://neurachat.in").replace(/\/+$/, "");
  return {
    name: process.env.EMAIL_BRAND_NAME ?? "Neura Chat",
    appUrl,
    supportEmail: process.env.EMAIL_SUPPORT ?? "support@neurachat.in",
  };
}

/**
 * How this deployment sends mail.
 *
 * Two ways, because tying the product to one vendor's REST API would mean
 * anybody who already has a mailbox — Google Workspace, Zoho, a host's
 * own server — has to sign up for another service to send six emails a
 * day. SMTP is the protocol all of them speak.
 *
 * Resend wins when both are set, on the grounds that somebody who
 * configured an API key meant to use it.
 */
type Transport =
  | { kind: "resend"; apiKey: string; from: string }
  | {
      kind: "smtp";
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      from: string;
    };

function config(): Transport | null {
  const from = process.env.EMAIL_FROM;
  if (!from) return null;

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) return { kind: "resend", apiKey, from };

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;

  // 465 is implicit TLS; 587 and 25 start plain and upgrade with
  // STARTTLS. Getting this backwards is the single most common reason an
  // otherwise correct SMTP setup times out with no useful error.
  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    kind: "smtp",
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: port === 465,
    user,
    pass,
    from,
  };
}

/** Whether mail can be sent at all, for a screen that wants to say so. */
export function isEmailConfigured(): boolean {
  return config() !== null;
}

/** Which way, for a diagnostic that wants to name it. */
export function emailTransportName(): string | null {
  return config()?.kind ?? null;
}

/**
 * What this deployment sends as, for a screen that has to judge whether it
 * can land. No secrets: the from address and the host are both public the
 * moment a message goes out.
 */
export function emailIdentity(): {
  transport: EmailTransport;
  from: string;
  smtpHost: string | null;
} | null {
  const settings = config();
  if (!settings) return null;
  return {
    transport: settings.kind,
    from: settings.from,
    smtpHost: settings.kind === "smtp" ? settings.host : null,
  };
}

/**
 * Sends one message, at most once per dedupe key.
 *
 * Never throws. Every caller is either a webhook or a cron sweep, where an
 * exception costs something far more important than an email — a payment
 * confirmation must not be able to fail the payment.
 */
export async function sendEmail(input: {
  to: string;
  orgId: string | null;
  kind: string;
  /** Unique per thing-being-notified-about. A repeat is refused by the index. */
  dedupeKey: string;
  /**
   * The message, or a function that builds it.
   *
   * A function is what lets a marketing template carry an unsubscribe link
   * for this recipient: the caller does not know it, because the link is
   * signed over the address and is therefore different every time. Passing
   * a plain body stays valid and simply has no link.
   */
  body: EmailBody | ((brand: EmailBrand) => EmailBody);
}): Promise<SendResult> {
  const to = input.to?.trim();
  if (!to) return { ok: false, skipped: "no_address" };

  const settings = config();
  if (!settings) return { ok: false, skipped: "not_configured" };

  const supabase = createAdminClient();

  // Refusing before the claim, so an unsubscribe does not burn the dedupe
  // key — if they resubscribe later the message can still go.
  if (suppressible(input.kind) && (await hasUnsubscribed(supabase, to))) {
    return { ok: true, skipped: "unsubscribed" };
  }

  // Claim the send first. Losing this race is the correct outcome, not an
  // error: it means another run already has it.
  const { error: claimError } = await supabase.from("email_log").insert({
    org_id: input.orgId,
    to_email: to,
    kind: input.kind,
    dedupe_key: input.dedupeKey,
    status: "sending",
    // Kept because a message that is accepted and never arrives is decided
    // by these two and nothing else on the row.
    transport: settings.kind,
    from_email: settings.from,
  });

  if (claimError) {
    // 23505 is the unique index doing its job.
    if (claimError.code === "23505") return { ok: true, skipped: "duplicate" };
    console.error("Could not claim an email send", claimError);
    return { ok: false, error: claimError.message };
  }

  // What a mail client needs to offer its own unsubscribe button, and what
  // Gmail and Yahoo look for on bulk mail: the absence of these is itself a
  // spam signal. Only on marketing — a receipt with an unsubscribe on it
  // invites somebody to turn off their own receipts.
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  const optOut =
    suppressible(input.kind) && key ? unsubscribeUrl(emailBrand().appUrl, to, key) : null;

  const headers: Record<string, string> = optOut
    ? {
        "List-Unsubscribe": `<${optOut}>`,
        // RFC 8058. Without this the client shows a link rather than a
        // button, and the one-click POST is never sent.
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : {};

  // Replies should reach a person. Left unset they go to the from address,
  // which on a no-reply sender is a mailbox nobody reads.
  const replyTo = emailBrand().supportEmail;

  // The logo the operator uploaded under Landing page -> Brand, which is
  // already a public URL on Supabase storage and therefore exactly what a
  // mail client can fetch. Read here rather than in emailBrand() because
  // it needs the database, and emailBrand() is called from places that
  // have no business awaiting one.
  const logoUrl = await brandLogo(supabase);

  const message =
    typeof input.body === "function"
      ? input.body({ ...emailBrand(), logoUrl, unsubscribeUrl: optOut })
      : input.body;

  try {
    if (settings.kind === "resend") {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${settings.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: settings.from,
          to: [to],
          reply_to: replyTo,
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        await mark(input.dedupeKey, "failed", `${response.status} ${detail}`.slice(0, 500));
        return { ok: false, error: `Resend refused the message: ${response.status}` };
      }
    } else {
      // Imported here rather than at the top of the file so a deployment
      // using Resend never loads it. It reaches for Node's net and tls,
      // which is dead weight in a bundle that will never open a socket.
      const { createTransport } = await import("nodemailer");

      await createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: { user: settings.user, pass: settings.pass },
      }).sendMail({
        from: settings.from,
        to,
        replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      });
    }

    await mark(input.dedupeKey, "sent", null);
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown send failure";
    await mark(input.dedupeKey, "failed", reason.slice(0, 500));
    return { ok: false, error: reason };
  }
}

/**
 * Records how it went.
 *
 * A failed row is left in place rather than deleted, so a broken API key
 * shows up as a list of failures somebody can look at — and so a retry
 * storm cannot be caused by the retry itself clearing the lock.
 */
async function mark(dedupeKey: string, status: string, error: string | null): Promise<void> {
  try {
    await createAdminClient()
      .from("email_log")
      .update({ status, error, sent_at: status === "sent" ? new Date().toISOString() : null })
      .eq("dedupe_key", dedupeKey);
  } catch (problem) {
    console.error("Could not record an email send", problem);
  }
}

/**
 * Whether this address has asked to be left alone.
 *
 * A failure to answer is treated as "not unsubscribed": a database blip
 * must not silently stop every message, which would look exactly like the
 * mail being broken and take just as long to find.
 */
async function hasUnsubscribed(
  supabase: ReturnType<typeof createAdminClient>,
  email: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("email_optouts")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("Could not read the unsubscribe list", error);
    return false;
  }
  return Boolean(data);
}

/**
 * The uploaded logo, or null.
 *
 * Failure is null rather than an exception: a message that goes out with
 * the wordmark instead of the logo is a small cosmetic loss, and one that
 * does not go out at all because a settings read failed is not.
 */
async function brandLogo(
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("site_content")
      .select("value")
      .eq("key", "brand")
      .maybeSingle();

    const url = (data?.value as { logoUrl?: unknown } | null)?.logoUrl;
    if (typeof url === "string" && /^https:\/\//i.test(url.trim())) return url.trim();
  } catch {
    // Falls through to the bundled mark.
  }

  return bundledLogo();
}

/**
 * The NX mark that ships with the app.
 *
 * So an email has the logo on it before anybody has uploaded anything —
 * which is the state every deployment starts in, and the state this one
 * was in while its mail went out with the name in type instead.
 *
 * A PNG rather than public/logo.svg: Gmail, Outlook and Yahoo all strip
 * SVG from a message body. Regenerate it with
 * `node scripts/build-email-logo.mjs` after changing the mark.
 */
function bundledLogo(): string | null {
  const appUrl = emailBrand().appUrl;
  // Only an https origin is worth pointing a mail client at. On a local
  // http dev server the wordmark is the honest answer.
  return /^https:\/\//i.test(appUrl) ? `${appUrl}/logo-email.png` : null;
}
