// What the emails say.
//
// Pure, so the wording can be tested and so nothing here can accidentally
// reach a mailbox from a unit test. Every message is built in both HTML
// and plain text: a text part is what keeps a message out of the spam
// folder and readable in a client that refuses HTML, and writing it as an
// afterthought is how it ends up empty.
//
// Deliberately plain markup. Inline styles only, no images, no external
// stylesheet, a single column — because Gmail strips <style> blocks,
// Outlook ignores most of what survives, and a layout that needs either
// one is a layout that breaks in the client most businesses actually use.

export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

export interface EmailBrand {
  /** "Neura Chat". */
  name: string;
  /** Where the buttons point, with no trailing slash. */
  appUrl: string;
  /** Who replies go to. */
  supportEmail: string;
  /**
   * An absolute https URL to the logo, or null for the wordmark.
   *
   * Absolute because a mail client has no page to resolve a relative path
   * against, and public because it is fetched by Gmail's image proxy with
   * no session — an image behind a login renders as a broken box in every
   * inbox that receives it.
   */
  logoUrl?: string | null;
  /**
   * Where the footer's unsubscribe points, when the message is one that
   * may be refused. Unset on account mail, which has no unsubscribe.
   *
   * A header alone is not enough: it only reaches people whose client
   * renders it as a button. Somebody who cannot find a way out marks the
   * message as spam instead, which costs far more than losing them.
   */
  unsubscribeUrl?: string | null;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The shell every message shares.
 *
 * Built to look like it came from a company rather than a script, within
 * what email actually renders. That rules out a great deal: Gmail strips
 * <style> blocks, so every rule is inline; Outlook renders through Word,
 * so the whole thing is nested tables rather than divs, and gradients and
 * shadows are given a flat fallback colour underneath. What is left that
 * still reads as designed is a dark banner, generous spacing, one clear
 * action, and a footer that looks deliberate.
 *
 * `preheader` is the line a mail client shows beside the subject. Left
 * unset it takes whatever text comes first, which is usually the logo's
 * alt text — so it is set deliberately and then hidden.
 */
function layout(
  brand: EmailBrand,
  preheader: string,
  body: string,
  action?: { label: string; href: string }
): string {
  // A real <a> with its own padding rather than a styled table cell, so the
  // whole shape is clickable. Outlook ignores border-radius and renders a
  // square button, which is fine — a square button still works.
  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0 8px;"><tr>
        <td align="center" bgcolor="#00E08F" style="border-radius:10px;background:#00E08F;">
          <a href="${escape(action.href)}" style="display:inline-block;padding:14px 30px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#06251A;text-decoration:none;border-radius:10px;letter-spacing:0.01em;">${escape(action.label)}</a>
        </td></tr></table>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#EEF1F5;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF1F5;padding:36px 14px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">

    <!-- Banner. The flat bgcolor is what Outlook shows; everything else
         gets the gradient over the top of it. -->
    <tr><td bgcolor="#0B1220" style="background:#0B1220;background-image:linear-gradient(135deg,#0B1220 0%,#12203A 55%,#0E2A24 100%);border-radius:16px 16px 0 0;padding:30px 34px 26px;">
      ${header(brand)}
    </td></tr>

    <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:34px 34px 30px;font-family:Helvetica,Arial,sans-serif;">
      <div style="font-size:15.5px;line-height:1.68;color:#1F2A37;">${body}</div>
      ${button}
    </td></tr>

    <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:0 0 16px 16px;padding:0 34px 30px;font-family:Helvetica,Arial,sans-serif;">
      <div style="border-top:1px solid #E7EBF0;padding-top:22px;font-size:12.5px;line-height:1.65;color:#7C8898;">
        Questions? Just reply to this email — it reaches a person — or write to
        <a href="mailto:${escape(brand.supportEmail)}" style="color:#5B6675;">${escape(brand.supportEmail)}</a>.
      </div>
    </td></tr>

    <tr><td style="padding:18px 34px 0;font-family:Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.6;color:#98A3B3;" align="center">
      <a href="${escape(brand.appUrl)}" style="color:#98A3B3;text-decoration:none;">${escape(brand.name)}</a>${
        brand.unsubscribeUrl
          ? ` &nbsp;·&nbsp; <a href="${escape(brand.unsubscribeUrl)}" style="color:#98A3B3;text-decoration:underline;">Unsubscribe from these reminders</a>`
          : ""
      }
    </td></tr>

  </table>
</td></tr></table>
</body></html>`;
}

/**
 * The logo, or the name set in type when there is none.
 *
 * It sits on the dark banner, which is what the mark was drawn for — the
 * PNG is composed on that same dark square, so the two meet cleanly.
 *
 * Height is the attribute and the width is left to scale: Outlook ignores
 * CSS height on an image and needs the attribute, and giving both a fixed
 * value squashes a logo whose aspect ratio is not what was guessed here.
 *
 * The alt text is the brand name, not "logo". Images are off by default in
 * a good share of inboxes, and what belongs in that space is the company's
 * name rather than the word logo.
 */
function header(brand: EmailBrand): string {
  const logo = brand.logoUrl?.trim();
  if (!logo || !/^https:\/\//i.test(logo)) {
    return `<span style="font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;">${escape(brand.name)}</span>`;
  }

  // color is on the image deliberately: when images are off, the alt text
  // is what renders, and it inherits from here. Without it the brand name
  // comes out near-black on the dark banner and reads as an empty box.
  return `<img src="${escape(logo)}" alt="${escape(brand.name)}" height="40" style="height:40px;width:auto;max-width:200px;border:0;outline:none;text-decoration:none;display:block;color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;">`;
}

function plain(lines: string[], action?: { label: string; href: string }): string {
  const body = lines.filter(Boolean).join("\n\n");
  return action ? `${body}\n\n${action.label}: ${action.href}` : body;
}

const p = (text: string) => `<p style="margin:0 0 14px;">${text}</p>`;

/** "3 days" / "1 day" / "today", for a sentence rather than a number. */
export function inDays(days: number): string {
  if (days <= 0) return "today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

// --- the messages ---------------------------------------------------------

export function welcomeEmail(brand: EmailBrand, input: { trialDays: number }): EmailBody {
  const action = { label: "Open the dashboard", href: `${brand.appUrl}/overview` };
  const lines = [
    "Your workspace is ready.",
    `You have ${input.trialDays} days free — every feature, no card needed. Connect a WhatsApp number to start.`,
    "The fastest first step is Integrations → Connect WhatsApp. It takes about two minutes.",
  ];

  return {
    subject: `Welcome to ${brand.name}`,
    html: layout(brand, `${input.trialDays} days free, starting now.`, lines.map(p).join(""), action),
    text: plain(lines, action),
  };
}

export function trialEndingEmail(brand: EmailBrand, input: { daysLeft: number }): EmailBody {
  const when = inDays(input.daysLeft);
  const action = { label: "See plans", href: `${brand.appUrl}/billing` };
  const lines = [
    `Your free trial ends ${when}.`,
    "Pick a plan to keep your number connected, your automations running and your history where it is. Nothing is deleted if you do not — it simply stops sending.",
  ];

  return {
    subject:
      input.daysLeft <= 0
        ? `Your ${brand.name} trial ends today`
        : `Your ${brand.name} trial ends ${when}`,
    html: layout(brand, `Choose a plan to keep sending.`, lines.map(p).join(""), action),
    text: plain(lines, action),
  };
}

export function trialExpiredEmail(
  brand: EmailBrand,
  input: { fromPrice?: string | null } = {}
): EmailBody {
  const action = { label: "Pick a plan and pay", href: `${brand.appUrl}/billing` };
  const lines = [
    "Your free trial has ended, and sending is paused.",
    "Your workspace, your contacts and every conversation are exactly where you left them. Nothing has been deleted.",
    input.fromPrice
      ? `Plans start at ${input.fromPrice}. Paying takes a minute and everything starts again immediately.`
      : "Choose a plan and everything picks up where it stopped.",
  ];

  return {
    subject: `Your ${brand.name} trial has ended`,
    html: layout(brand, "Your data is safe. Pick a plan to carry on.", lines.map(p).join(""), action),
    text: plain(lines, action),
  };
}

/**
 * The reminders after that, on a schedule that slows down.
 *
 * Written to be readable the tenth time as well as the first, which means
 * no escalation and no invented deadline. Somebody who has not paid after
 * a month has not forgotten — they have decided, and a message that keeps
 * insisting otherwise is the one that gets marked as spam.
 */
export function trialFollowUpEmail(
  brand: EmailBrand,
  input: { step: number; daysSince: number; fromPrice?: string | null }
): EmailBody {
  const action = { label: "See plans", href: `${brand.appUrl}/billing` };

  // Three angles, cycled, so a sequence of ten does not read as one
  // message sent ten times.
  const openings = [
    "Your workspace is still here whenever you want it back.",
    "Your contacts and chat history are still saved — nothing has been removed.",
    "Still thinking it over? Your account is exactly as you left it.",
  ];

  const lines = [
    openings[input.step % openings.length],
    input.fromPrice
      ? `Plans start at ${input.fromPrice}, monthly, and you can cancel any time.`
      : "Pick a plan whenever you are ready; you can cancel any time.",
    "If Neura Chat is not right for you, just ignore this — no reply needed.",
  ];

  return {
    subject: `Your ${brand.name} workspace is waiting`,
    html: layout(brand, "Nothing has been deleted.", lines.map(p).join(""), action),
    text: plain(lines, action),
  };
}

/**
 * The first bot. Worth marking, because it is the moment the product
 * stops being a signup and starts being a thing that does work.
 */
export function firstChatbotEmail(brand: EmailBrand, input: { botName: string }): EmailBody {
  const name = input.botName.trim() || "your first bot";
  const action = { label: "Open the builder", href: `${brand.appUrl}/chatbot` };
  const lines = [
    `You've built ${escape(name)} — your first chatbot.`,
    "Switch it on and it answers customers on WhatsApp without you, day or night. Anything it cannot handle lands in your inbox with the whole conversation attached, so nobody is left waiting.",
    "Worth doing next: send yourself a message on the connected number and watch it reply. It is the fastest way to see what a customer will see.",
  ];

  return {
    subject: `Your first chatbot is ready`,
    html: layout(brand, "Switch it on and it answers for you.", lines.map(p).join(""), action),
    text: plain(lines, action),
  };
}

export function paymentReceivedEmail(
  brand: EmailBrand,
  input: { planName: string; amount: string; renewsOn: string; interval: string }
): EmailBody {
  const action = { label: "Go to billing", href: `${brand.appUrl}/billing` };
  const lines = [
    `Payment received — you're on ${input.planName}.`,
    `${input.amount} paid. Renews on ${input.renewsOn}, ${input.interval}.`,
    "Everything on the plan is available now. The receipt is on your billing page whenever you need it.",
  ];

  return {
    subject: `Payment received — ${input.planName}`,
    html: layout(brand, `${input.amount} received. ${input.planName} is active.`, lines.map(p).join(""), action),
    text: plain(lines, action),
  };
}

export function renewalReminderEmail(
  brand: EmailBrand,
  input: { planName: string; daysLeft: number; renewsOn: string }
): EmailBody {
  const when = inDays(input.daysLeft);
  const action = { label: "Review billing", href: `${brand.appUrl}/billing` };
  const lines = [
    `Your ${input.planName} plan renews ${when}, on ${input.renewsOn}.`,
    "Nothing is needed from you — this is just so the charge is not a surprise. You can change or cancel the plan before then from your billing page.",
  ];

  return {
    subject: `${input.planName} renews ${when}`,
    // No preheader about paying: this is a courtesy, and a subject line
    // that reads like a demand for money on a plan already paid for is
    // how a working product starts feeling like a debt collector.
    html: layout(brand, `A heads-up, nothing to do.`, lines.map(p).join(""), action),
    text: plain(lines, action),
  };
}

export function subscriptionExpiredEmail(
  brand: EmailBrand,
  input: { planName: string | null }
): EmailBody {
  const plan = input.planName ? `Your ${input.planName} plan` : "Your plan";
  const action = { label: "Renew now", href: `${brand.appUrl}/billing` };
  const lines = [
    `${plan} has ended and sending is paused.`,
    "Your number stays connected and nothing has been deleted. Renew and it starts sending again straight away.",
  ];

  return {
    subject: `${plan} has ended`,
    html: layout(brand, "Sending is paused. Renew to start again.", lines.map(p).join(""), action),
    text: plain(lines, action),
  };
}
