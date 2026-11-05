// Whether a from address can survive the journey to an inbox.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// A provider accepting a message says only that it took it. What decides
// whether it lands is whether the receiving server believes the sender is
// allowed to send as that domain — SPF and DKIM, tied together by DMARC.
// Get that wrong and mail is accepted, queued, and then quietly filed in
// spam or dropped, which looks exactly like nothing happening.

export type EmailTransport = "resend" | "smtp";

export interface Deliverability {
  /** broken: it will not land. risky: it may not. ok: nothing structural. */
  level: "broken" | "risky" | "ok";
  summary: string;
  fix: string;
}

/**
 * Mailbox providers whose domains publish a DMARC policy and are never
 * yours to send as from somewhere else.
 */
const FREE_MAIL: Record<string, string> = {
  "gmail.com": "smtp.gmail.com",
  "googlemail.com": "smtp.gmail.com",
  "yahoo.com": "smtp.mail.yahoo.com",
  "outlook.com": "smtp-mail.outlook.com",
  "hotmail.com": "smtp-mail.outlook.com",
  "live.com": "smtp-mail.outlook.com",
  "icloud.com": "smtp.mail.me.com",
};

/** The domain out of "Name <a@b.com>" or a bare address. */
export function domainOf(from: string): string | null {
  const match = /<([^>]+)>\s*$/.exec(from.trim());
  const address = (match ? match[1] : from).trim();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  const domain = address.slice(at + 1).toLowerCase();
  return domain.includes(".") ? domain : null;
}

export function checkFrom(
  from: string,
  transport: EmailTransport,
  smtpHost?: string | null
): Deliverability {
  const domain = domainOf(from);

  if (!domain) {
    return {
      level: "broken",
      summary: "EMAIL_FROM is not an email address.",
      fix: 'It must be an address, either bare (hello@yourdomain.com) or with a name ("Neura Chat <hello@yourdomain.com>").',
    };
  }

  const ownHost = FREE_MAIL[domain];

  if (ownHost) {
    if (transport === "resend") {
      return {
        level: "broken",
        summary: `Mail is being sent through Resend but claims to come from ${domain}, which only ${domain}'s own servers may send as.`,
        fix: `Gmail and the other mailbox providers publish a DMARC record saying so, and the receiving server checks it. The message is accepted by Resend, then filed as spam or dropped on arrival — which is why the log says sent and nothing turns up. Verify your own domain at resend.com/domains and set EMAIL_FROM to an address on it, such as hello@neurachat.in.`,
      };
    }

    // Sent through that provider's own server, so it really is allowed to
    // send as that domain. Structurally fine — but a free mailbox is still
    // a consumer account being used for bulk mail.
    if (smtpHost && smtpHost.toLowerCase() === ownHost) {
      return {
        level: "risky",
        summary: `Sending as ${domain} through its own server is allowed, but it is a personal mailbox rather than a sending domain.`,
        fix: "Expect the Promotions tab rather than Primary, a daily send limit of a few hundred, and no way to see bounces. Check Spam, Promotions and All Mail before assuming a message was lost. A verified domain of your own fixes all three.",
      };
    }

    return {
      level: "broken",
      summary: `Mail claims to come from ${domain} but is not being sent through ${ownHost}.`,
      fix: `Only ${ownHost} may send as ${domain}. Either point SMTP_HOST at it, or send from a domain you own.`,
    };
  }

  return {
    level: "ok",
    summary: `Sending as ${domain}.`,
    fix:
      transport === "resend"
        ? "Make sure this domain shows as verified at resend.com/domains, with its DKIM records still in place."
        : "Make sure this domain's SPF record lists the server in SMTP_HOST.",
  };
}

/**
 * What "sent" in the log actually means.
 *
 * Kept as one string because it is the sentence that was missing: the
 * status records that the provider took the message, and nothing after
 * that point. Reading it as "delivered" is the mistake this exists to stop.
 */
export const ACCEPTED_NOT_DELIVERED =
  "Accepted means the provider took the message, not that it reached an inbox. A message can be accepted and then filed as spam, sorted into Promotions, or bounced by the receiving server.";
