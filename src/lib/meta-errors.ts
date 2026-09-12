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
  3: "This Meta app is not allowed to call the WhatsApp send API. Add the whatsapp_business_messaging permission to the app, then reconnect.",
  10: "The access token is missing the whatsapp_business_messaging permission. Generate a new token with both WhatsApp permissions and reconnect in Integrations.",
  100: "Meta rejected one of the message's fields.",
  102: "The access token is no longer valid. Generate a new one in Meta and reconnect the number in Integrations.",
  190: "The stored WhatsApp access token has expired or been revoked. Generate a new token in Meta and reconnect the number in Integrations — a System User token does not expire, the one on the API Setup page lasts 24 hours.",
  200: "The access token lacks the WhatsApp permissions this call needs. Regenerate it with whatsapp_business_management and whatsapp_business_messaging, then reconnect.",
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
  "100:33":
    "Meta cannot see that phone number ID with this access token. Either the ID is wrong, or the token's System User has not been given the WhatsApp Account as an asset. Note that assigning assets does not update an existing token — assign the WhatsApp Account in Business settings → Users → System users → Add assets, then generate a new token and paste that one.",
  "100:44":
    "That WhatsApp template does not exist in this account under the name and language requested.",
  "100:2388023":
    "Meta could not read the sample file for the header. Re-upload it, and check the file is a JPEG, PNG, MP4 or PDF that Meta's own limits accept.",
  "100:2388042":
    "A template with this name and language already exists on the WhatsApp Business Account. Delete it in Meta, or submit under a different name.",
  // Meta's own wording is "WhatsApp accounts cannot be used with this API",
  // which is about the account being posted to rather than anything in the
  // template — so the fields are the wrong place to go looking.
  "100:2388339":
    "Meta will not create templates on the WhatsApp Business Account this number is attached to. The account id may not be a WhatsApp Business Account at all — the Business Portfolio id and the phone number id are both easy to paste into that field by mistake — or the account is not one this app may manage. Check the WABA id against Meta → WhatsApp → API Setup, and confirm the token's System User has that WhatsApp Account assigned.",
  "100:2388043":
    "A template with this name already exists on the WhatsApp Business Account. Delete it in Meta, or submit under a different name.",
};

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
  if (subcodeHelp) return `${subcodeHelp} (${reference})`;

  // Meta's own user-facing wording beats our generic text whenever it
  // exists: error_user_msg is what its dashboard shows, and for template
  // rejections it is the only field that names the real fault while
  // `message` stays a useless "Invalid parameter".
  const metaSaid = userMessage ?? userTitle;
  if (metaSaid) {
    const both = userTitle && userMessage && userTitle !== userMessage
      ? `${userTitle}: ${userMessage}`
      : metaSaid;
    return `Meta rejected this — ${both} (${reference})`;
  }

  const help = code !== null ? META_ERROR_HELP[code] : undefined;

  if (help) {
    return code === 100 || code === 132000
      ? `${help}${detail ? ` Meta said: ${detail}` : ""} (${reference})`
      : `${help} (${reference})`;
  }

  if (detail) {
    return `WhatsApp rejected the message: ${detail} (${reference})`;
  }

  return `WhatsApp rejected the message with HTTP ${status} and no explanation.`;
}
