// Meta's Graph API returns every failure as HTTP 4xx with a JSON body whose
// `code` says what actually went wrong. Dumping that JSON into the UI — which
// is what we did until a real token expiry landed
// {"error":{"message":"Authentication Error","code":190,...}} in a customer's
// chat thread — tells the operator nothing they can act on. This module turns
// the codes we recognise into a sentence that names the fix, and falls back to
// Meta's own message (never the raw envelope) for the ones we don't.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.

export interface MetaErrorDetail {
  code: number | null;
  subcode: number | null;
  type: string | null;
  /** Meta's own wording, preferring the more specific error_data.details. */
  detail: string | null;
  /** error_user_title — a short label like "Template Name Already Exists". */
  userTitle: string | null;
  /** error_user_msg — the sentence Meta shows in its own dashboard. */
  userMessage: string | null;
}

interface RawMetaError {
  code?: unknown;
  error_subcode?: unknown;
  type?: unknown;
  message?: unknown;
  error_data?: { details?: unknown } | null;
  error_user_title?: unknown;
  error_user_msg?: unknown;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function metaErrorDetail(body: unknown): MetaErrorDetail {
  const error =
    body && typeof body === "object" && "error" in body
      ? ((body as { error: unknown }).error as RawMetaError | null)
      : null;

  if (!error || typeof error !== "object") {
    return { code: null, subcode: null, type: null, detail: null, userTitle: null, userMessage: null };
  }

  return {
    code: asNumber(error.code),
    subcode: asNumber(error.error_subcode),
    type: asString(error.type),
    // error_data.details is the field that says "template name does not
    // exist" where message only says "Invalid parameter".
    detail: asString(error.error_data?.details) ?? asString(error.message),
    // Where Meta actually explains a template rejection. `message` stays the
    // generic "Invalid parameter" while these carry the reason, so ignoring
    // them turns every distinct template fault into the same dead end.
    userTitle: asString(error.error_user_title),
    userMessage: asString(error.error_user_msg),
  };
}

/**
 * Meta's own id for this exact request.
 *
 * The one value WhatsApp support can act on: it finds the request in
 * Meta's logs, including the part of the refusal they never send back. A
 * refusal this app has exhausted its own checks on is precisely when it
 * matters, and the message has been telling people to quote it while
 * nothing here ever pulled it out of the envelope.
 *
 * Read from the error object or the response root, because Meta puts it
 * in either depending on the endpoint.
 */
export function fbtraceId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;

  const root = body as Record<string, unknown>;
  const error = root.error;

  const fromError =
    error && typeof error === "object"
      ? (error as Record<string, unknown>).fbtrace_id
      : undefined;

  const found = fromError ?? root.fbtrace_id;
  return typeof found === "string" && found.trim() ? found.trim() : null;
}

// Codes that mean "the stored credentials are no longer usable" as opposed
// to "this particular message was wrong". These are the ones worth recording
// against the connection, because every subsequent send will fail the same
// way until someone pastes a new token.
const AUTH_ERROR_CODES = new Set([0, 10, 102, 190, 200, 3]);

export function isMetaAuthError(status: number, body: unknown): boolean {
  const { code, type } = metaErrorDetail(body);
  if (code !== null) return AUTH_ERROR_CODES.has(code);
  // No parsable code: fall back to the envelope. OAuthException on a 401 is
  // unambiguous even when the body shape is one we have not seen.
  return status === 401 && type === "OAuthException";
}

// Only codes where we can say something more useful than Meta does. Anything
// absent falls through to Meta's own message, which is usually adequate.
const META_ERROR_HELP: Record<number, string> = {
  0: "WhatsApp could not read the access token at all. Reconnect the number in Integrations with a freshly generated token.",
  3: "This Meta app has not been granted the permission this call needs. Check App Review → Permissions and features, then reconnect the number so a new token carries it.",
  10: "The access token does not carry the permission this call needs — sending, managing templates and reading a catalogue are three separate grants. A token only ever holds what the app has been approved for, so check App Review first, then reconnect the number so a new token is issued.",
  100: "Meta rejected one of the message's fields.",
  102: "The access token is no longer valid. Generate a new one in Meta and reconnect the number in Integrations.",
  190: "The stored WhatsApp access token has expired or been revoked. Generate a new token in Meta and reconnect the number in Integrations — a System User token does not expire, the one on the API Setup page lasts 24 hours.",
  200: "The access token lacks the permission this call needs. Granting it to the app is not enough on its own — a token is issued with the permissions held at the moment it was created, so reconnect the number afterwards to get a new one.",
  // The account mismatch that used to cause most of these is now prevented
  // before the call — a form is always sent from a number on its own
  // account — so the remaining causes are about the flow itself.
  131009:
    "WhatsApp refused a parameter on this message. For a form, check it still exists at Meta and has not been deprecated or blocked, and that its first screen still has the name this message asks to open. Re-syncing the form usually settles it.",
  130429: "Meta is rate limiting this number — too many messages in too short a window. Sends will succeed again shortly.",
  131005: "Meta denied access to this phone number. Check that the number still belongs to the connected WhatsApp Business Account.",
  131016: "WhatsApp's service is temporarily unavailable. This one is Meta's end, not yours.",
  131026: "WhatsApp could not deliver to this number — it may not have WhatsApp, or it is not reachable from this business number.",
  131030: "This recipient is not on the app's allowed list. Test numbers can only message numbers added under Meta → WhatsApp → API Setup → \"To\". Add the number there, or move to a verified production number.",
  131031: "The WhatsApp Business Account is locked or restricted. Check Meta Business Suite for a required action.",
  131042: "The WhatsApp Business Account has a billing problem — add a payment method in Meta Business Suite before sending again.",
  131047: "Outside WhatsApp's 24-hour service window. Only an approved template can reach this contact now.",
  131056: "Too many messages to this contact in a short window. Meta will accept sends again shortly.",
  132000: "The template was sent with the wrong number of variables.",
  132001: "That template does not exist in this WhatsApp Business Account, or is not approved in the language requested.",
  132015: "That template is paused by Meta because of poor delivery quality and cannot be sent right now.",
  132016: "That template has been disabled by Meta and can no longer be sent.",
  133010: "This phone number is not registered for the Cloud API. Register it from the WhatsApp Numbers screen, or under Meta → WhatsApp → API Setup, before sending.",
  133005: "That two-step verification PIN is wrong. It is set in Meta under WhatsApp → Two-step verification, and is not your login password.",
  133016:
    "Meta has locked registration for this number — ten attempts in 72 hours. Wait for the window to pass before trying again.",
  // Integrity blocks are account-level, not message-level. Retrying the
  // same send, or editing the message, changes nothing — which is exactly
  // what an operator will try first unless the text says otherwise.
  139000:
    "Meta has restricted this WhatsApp Business Account (\"Blocked by Integrity\"). This is a block on the account, not on this message — retrying or editing it will not help. Open Meta Business Suite → Account Quality to see the restriction and request a review. Unverified businesses and accounts that have sent unsolicited messages are the usual triggers.",
  139001:
    "Meta has restricted this WhatsApp Business Account. Check Meta Business Suite → Account Quality for the restriction and how to appeal it.",
};

// Some codes only mean something with their subcode. Meta reuses code 100
// for "you sent a bad field" and for "that object does not exist or you
// cannot see it", which need completely different fixes — the generic text
// for 100 actively misleads on subcode 33.
const META_SUBCODE_HELP: Record<string, string> = {
  // Deliberately does not name a phone number. This code is returned for
  // whatever object the request was about — a phone number, a flow, a
  // template, a catalogue — and naming the wrong one sends people to fix a
  // setting that was never broken. A flow uploaded with the wrong number's
  // token lands here, and "check your System User assets" is the wrong
  // advice for it entirely.
  // The generic 139000 is an account-level block. This subcode is
  // narrower and arrives from one place only — publishing a Flow — so it
  // is worth telling apart: the account is not restricted, it simply has
  // not cleared the bar Meta sets before a Flow may go live.
  "139000:4233020":
    "Meta will not publish a Flow from this WhatsApp Business Account yet. Publishing a Flow requires the business to be verified and the account to be in good standing — a draft can still be tested against numbers on the account, which is what the Test send button does. Complete Business verification in Meta Business Suite → Business settings → Security Centre, and check Account Quality shows no restriction. Nothing in the form itself needs changing.",

  "100:33":
    "Meta cannot see that item with this access token. Usually it belongs to a different WhatsApp Business Account than the number being used — check you are on the number it was created on. Otherwise the token's System User has not been given that account as an asset: assigning assets does not update an existing token, so add the WhatsApp Account in Business settings → Users → System users → Add assets, then generate a new token and paste that one.",
  "100:44":
    "That WhatsApp template does not exist in this account under the name and language requested.",
  "100:2388023":
    "Meta could not read the sample file for the header. Re-upload it, and check the file is a JPEG, PNG, MP4 or PDF that Meta's own limits accept.",
  "100:2388042":
    "A template with this name and language already exists on the WhatsApp Business Account. Delete it in Meta, or submit under a different name.",
  // Meta's own wording is "WhatsApp accounts cannot be used with this API",
  // which is about the WhatsApp Business Account being posted to rather than
  // anything in the template — so the fields are the wrong place to look.
  // What it does not say is which of several account-level gates is shut, so
  // this names them in the order they actually occur and leaves the finding
  // to the check that runs alongside it.
  "100:2388339":
    "This is about the WhatsApp Business Account, not the template — nothing in the name, body or buttons will change it. Meta refuses template creation on an account that has not passed review, on a business that is not verified, and on an account the stored token may send from but not manage. The check below says which.",
  "100:2388043":
    "A template with this name already exists on the WhatsApp Business Account. Delete it in Meta, or submit under a different name.",
};

// Faults Meta explains only in the message text.
//
// A code and a subcode are the usual way in, but some refusals arrive as a
// generic code with the real reason written in prose — and those are the
// ones where a hint keyed off the code alone says something confidently
// wrong. Matched on the wording because Meta gives nothing else to match
// on; ordered, so the first rule that fits wins.
const META_DETAIL_HELP: Array<{ match: RegExp; help: string }> = [
  {
    // WhatsApp Pay. `order_details` is the interactive type the customer
    // pays inside, and Meta refuses it outright on an account that has no
    // payment configuration — with error 131009, the same code a broken
    // Flow returns. The per-code text is written for Flows, so this
    // failure used to tell the operator to go and re-sync a form, which
    // has nothing to do with what they were doing and does not exist on
    // the screen they were on.
    match: /Unsupported Interactive Message type/i,
    help:
      "This number is not set up to take payments inside WhatsApp. The name saved under Commerce → Payments has to match a payment configuration that actually exists at Meta: open WhatsApp Manager → Payment configurations → India, add one linking your Razorpay or PayU account, and save that exact name here. Until it exists at Meta, switch the method to Payment link — the customer pays on the gateway's own page and the order is marked paid the same way.",
  },
  {
    // The catalogue read, refused. Meta reports a node it will not let
    // the token see as a node that has no such edge, so "nonexisting
    // field (products)" is almost never a wrong id — it is the same
    // refusal as the SMB one below, arriving through a different door.
    // Said separately because the fix is the same and the wording is
    // not: this one fires on the import, where the CSV is right there.
    match: /nonexisting field \(products\)/i,
    help:
      "Meta will not let this app read that catalogue's items — on a number that runs alongside the WhatsApp Business app it refuses this outright, whatever the permissions say. Sending product cards still works once the catalogue is linked; only the automatic import is blocked. Use \u201cImport from a Commerce Manager export\u201d below instead: it brings the names, prices, images and content IDs, and needs nobody's approval.",
  },
  {
    // Coexistence. The WhatsApp Business account Meta creates for a number
    // kept on the Business app is of type SMB, and the catalogue endpoints
    // refuse it outright — no permission, no App Review and no token
    // changes that. Worth naming precisely, because every other reading of
    // a bare "#10" sends someone to fix a permission that is not the
    // problem and would not help if it were.
    match: /SMB business type/i,
    help:
      "This number runs alongside the WhatsApp Business app, and Meta does not allow catalogue operations through the API on that kind of account — no permission or App Review approval changes it. Manage the catalogue in Meta Commerce Manager and link it here by its ID instead; sending product messages works normally once it is linked.",
  },
];

function detailHelp(detail: string | null): string | null {
  if (!detail) return null;
  return META_DETAIL_HELP.find((rule) => rule.match.test(detail))?.help ?? null;
}

/** Whether Meta's own wording explains this better than any code lookup. */
export function hasDetailHelp(body: unknown): boolean {
  return detailHelp(metaErrorDetail(body).detail) !== null;
}

/**
 * Sticks two sentences together without running them into one.
 *
 * Meta's descriptions end with a bracketed reference — "(Meta error
 * 131009)" — and appending straight onto that produced "…(Meta error
 * 131009) The order NC-260924-C8N3C was saved", which reads as one
 * sentence that lost its punctuation.
 */
export function andThen(first: string, second: string): string {
  const left = first.trim();
  const right = second.trim();
  if (!left) return right;
  if (!right) return left;
  return /[.!?]$/.test(left) ? `${left} ${right}` : `${left}. ${right}`;
}

/**
 * A sentence an operator can act on. Never returns the raw JSON envelope.
 */
export function describeMetaError(status: number, body: unknown): string {
  const { code, subcode, detail, userTitle, userMessage } = metaErrorDetail(body);

  // The reference to quote when nothing here is specific enough. A bare
  // "code 100" sends someone hunting; a code with its subcode is the thing
  // that finds the answer in Meta's docs and in a support thread.
  const reference =
    code === null
      ? `HTTP ${status}`
      : subcode !== null
        ? `Meta error ${code}/${subcode}`
        : `Meta error ${code}`;

  const subcodeHelp =
    code !== null && subcode !== null ? META_SUBCODE_HELP[`${code}:${subcode}`] : undefined;

  // Meta's own user-facing wording goes first, and our hint after it rather
  // than instead of it. A subcode hint is a guess about why Meta said what
  // it said — worth having, but it used to *replace* Meta's sentence, so an
  // operator whose real fault was something the hint did not cover was sent
  // to check the one thing that was already fine. Meta states the fault;
  // we state what usually causes it.
  const metaSaid = userMessage ?? userTitle;
  if (metaSaid) {
    const both = userTitle && userMessage && userTitle !== userMessage
      ? `${userTitle}: ${userMessage}`
      : metaSaid;
    return `Meta rejected this — ${both}${subcodeHelp ? ` ${subcodeHelp}` : ""} (${reference})`;
  }

  if (subcodeHelp) return `${subcodeHelp} (${reference})`;

  // Ahead of the per-code text, which is a generalisation, and behind
  // error_user_msg, which is Meta speaking directly to the operator.
  const fromDetail = detailHelp(detail);
  if (fromDetail) return `${fromDetail} Meta said: ${detail} (${reference})`;

  const help = code !== null ? META_ERROR_HELP[code] : undefined;

  // Meta's own sentence goes on the end whatever the code. It used to be
  // kept for 100 and 132000 only, which meant a permission refusal printed
  // our guess about which permission and dropped the line where Meta names
  // the actual one — so a catalogue read refused for catalog_management
  // told the operator to fix whatsapp_business_messaging.
  if (help) {
    return `${help}${detail ? ` Meta said: ${detail}` : ""} (${reference})`;
  }

  if (detail) {
    return `WhatsApp rejected the message: ${detail} (${reference})`;
  }

  return `WhatsApp rejected the message with HTTP ${status} and no explanation.`;
}
