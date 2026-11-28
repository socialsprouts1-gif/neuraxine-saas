import "server-only";
import {
  MetaApiError,
  describeMetaError,
  getPhoneNumber,
  getWabaDetails,
  listWabaPhoneNumbers,
  listMessageTemplates,
} from "@/lib/meta-whatsapp";
import {
  WABA_MANAGEMENT_SCOPE,
  getEmbeddedSignupEnv,
  wabaScopesForToken,
} from "@/lib/embedded-signup";

// Why Meta refused to create a template.
//
// Meta answers this with "Invalid parameter" and a subcode, which sends
// every operator to edit a body that was never at fault. Every real cause
// is one level up, at the account: the account is under review, the
// business is unverified, the token may send from the account but not
// manage it, or the ids disagree. None of those are visible from the
// template dialog, and all of them are one Graph call away.
//
// Returns a sentence when it can name the gate, null when everything it
// can see is in order — silence here means "not this", never "fine".

export interface TemplateAccess {
  wabaId: string;
  phoneNumberId: string;
  /** The Meta app the token belongs to. The scope check needs it to match. */
  appId: string;
  accessToken: string;
}

export async function diagnoseTemplateAccess(input: TemplateAccess): Promise<string | null> {
  const { wabaId, phoneNumberId, accessToken } = input;

  let numbers: Awaited<ReturnType<typeof listWabaPhoneNumbers>>;
  try {
    numbers = await listWabaPhoneNumbers(wabaId, accessToken);
  } catch (error) {
    const why =
      error instanceof MetaApiError
        ? describeMetaError(error.status, error.body)
        : "Meta did not answer.";
    return `Meta would not open WhatsApp Business Account ${wabaId} with this token at all, so templates and forms cannot be created on it. ${why}`;
  }

  if (!numbers.some((number) => number.id === phoneNumberId)) {
    const listed = numbers
      .map((number) => number.display_phone_number ?? number.id)
      .filter(Boolean)
      .join(", ");
    return `This number sends fine, but it is not on WhatsApp Business Account ${wabaId} — that account holds ${
      listed || "no numbers"
    }. Templates are created on the account, so they will keep failing until the WABA id is corrected under Integrations. Find the right one in Meta → WhatsApp Manager, on the account that lists this number.`;
  }

  // Order matters: the token is checked before the account, because a
  // token that cannot manage the account is also the reason the account's
  // own fields may read as fine.
  const fromScope = await describeTokenScope(input);
  if (fromScope) return fromScope;

  const standing = await describeWabaStanding(wabaId, accessToken);
  if (standing) return standing;

  // Probed rather than inferred. The scope check above answers only for a
  // connection on this deployment's own Meta app; this one answers for
  // every connection, by asking Meta to do the read half of the same
  // permission the create needs.
  const probe = await probeTemplateManagement(wabaId, accessToken);
  if (probe.can === false) return probe.why;

  return await describeCoexistence(phoneNumberId, accessToken);
}

/**
 * What kind of account this is, in Meta's own words.
 *
 * "WhatsApp accounts cannot be used with this API" is a statement about
 * the account's kind, and the one field that describes that —
 * ownership_type — was being fetched by getWabaDetails and thrown away.
 * A portfolio can hold the WhatsApp Business app alongside real Cloud API
 * accounts, and several accounts with the same name, so "which of these
 * four am I posting to" is a genuine question with a readable answer.
 *
 * Reported rather than judged. Meta's enum here is not documented
 * stably enough to branch on, and guessing which values are fatal is how
 * an error message ends up confidently wrong — this session has already
 * had three of those. The name and the type are facts; what they mean is
 * left to the operator and to Meta's support, who can act on them.
 */
/**
 * Whether this token may manage templates on this account at all.
 *
 * Reading and writing templates need the same permission —
 * whatsapp_business_management — so GET /message_templates answers
 * "could a create ever work here" without creating anything.
 *
 * This exists because the scope check above goes silent whenever the
 * connection belongs to a different Meta app than this deployment's, and
 * a silent check is indistinguishable from a passing one. The summary
 * shown on a refusal claimed "the token may manage it" in both cases,
 * which is an assertion about something never actually tested. A probe
 * that runs for every connection is worth more than an inference that
 * runs for some.
 */
export type ManageProbe =
  | { can: true }
  | { can: false; why: string }
  | { can: null; why: string };

export async function probeTemplateManagement(
  wabaId: string,
  accessToken: string
): Promise<ManageProbe> {
  try {
    await listMessageTemplates(wabaId, accessToken);
    return { can: true };
  } catch (error) {
    if (!(error instanceof MetaApiError)) {
      return { can: null, why: "Meta did not answer, so this could not be established." };
    }

    return {
      can: false,
      why: `Meta will not even list the templates on account ${wabaId} with this token, so creating one was never going to work. ${describeMetaError(
        error.status,
        error.body
      )} Reading and writing templates need the same permission — whatsapp_business_management — which is separate from the one that sends messages. That is why the inbox and campaigns work and this does not.`,
    };
  }
}

export async function describeWabaKind(
  wabaId: string,
  accessToken: string
): Promise<string | null> {
  let waba;
  try {
    waba = await getWabaDetails(wabaId, accessToken);
  } catch {
    return null;
  }

  const parts = [`Meta calls this account "${waba.name ?? wabaId}" (id ${wabaId})`];
  if (waba.ownership_type) parts.push(`and reports its ownership type as ${waba.ownership_type}`);

  return `${parts.join(" ")}. If you have more than one WhatsApp account in this business portfolio, check in Meta → WhatsApp Manager that this is the one you meant — templates belong to an account, so creating one on the wrong account is a refusal that looks like a broken form.`;
}

/**
 * Whether the token was granted this account, and for what.
 *
 * Sending and managing are separate grants. A token holding only
 * whatsapp_business_messaging on an account runs the inbox perfectly and
 * is refused the instant it creates a template — the single most
 * confusing shape this failure takes, because everything else works.
 *
 * Silent unless it can answer: the check needs the app secret, which is
 * only available when the connection belongs to this deployment's app.
 */
async function describeTokenScope(input: TemplateAccess): Promise<string | null> {
  const env = getEmbeddedSignupEnv();
  if (!env || env.appId !== input.appId) return null;

  let granted: Map<string, Set<string>>;
  try {
    granted = await wabaScopesForToken(input.accessToken, env);
  } catch {
    return null;
  }

  // Nothing listed means Meta reported no granular scopes — an app-scoped
  // token has none — not that the token holds nothing.
  if (granted.size === 0) return null;

  const held = granted.get(input.wabaId);
  if (!held) {
    return `The stored token has not been granted WhatsApp Business Account ${
      input.wabaId
    }, so it cannot create templates on it — only ${[...granted.keys()].join(
      ", "
    )}. Assign that account to the token's System User in Business settings → Users → System users → Add assets, then generate a NEW token: assigning an asset does not change a token that already exists.`;
  }

  if (!held.has(WABA_MANAGEMENT_SCOPE)) {
    // Reconnecting alone will not fix this if the Embedded Signup
    // configuration never asks for the permission — the dialog can only
    // grant what the configuration requests, so the operator would repeat
    // the connection and get the identical token back.
    return `The stored token may send from WhatsApp Business Account ${input.wabaId} but not manage it — Meta granted it messaging access and not whatsapp_business_management. That is exactly why the inbox works and templates do not. Check the Embedded Signup configuration in Meta → WhatsApp → Configurations actually requests whatsapp_business_management; the dialog can only grant what the configuration asks for, so reconnecting without that change returns the same token. Then reconnect this number under Integrations.`;
  }

  return null;
}

/**
 * Account-level gates that block templates while sending keeps working.
 *
 * Both of these are the normal state of an account connected minutes ago,
 * which is exactly when someone tries their first template.
 */
async function describeWabaStanding(
  wabaId: string,
  accessToken: string
): Promise<string | null> {
  let waba;
  try {
    waba = await getWabaDetails(wabaId, accessToken);
  } catch {
    return null;
  }

  const review = waba.account_review_status?.toUpperCase();
  if (review && review !== "APPROVED") {
    return `Meta has not approved WhatsApp Business Account ${wabaId} — it reports the review status as ${waba.account_review_status}. Templates cannot be created until that clears. Check Meta Business Suite → Account Quality.`;
  }

  const verification = waba.business_verification_status?.toLowerCase();
  if (verification && verification !== "verified") {
    return `The business behind WhatsApp Business Account ${wabaId} is not verified with Meta (${waba.business_verification_status}). Template creation is limited until verification completes — Meta Business Suite → Security Centre → Start verification.`;
  }

  return null;
}

/**
 * Whether this number is running alongside the WhatsApp Business app.
 *
 * Not a fault on its own — coexistence numbers send templates normally —
 * but Meta creates a fresh WhatsApp Business Account for them, and a
 * brand-new account is the one most likely to be sitting behind a review
 * or verification gate. Worth saying so the operator knows which account
 * in WhatsApp Manager to go and look at, and that it is not the one their
 * other numbers use.
 */
async function describeCoexistence(
  phoneNumberId: string,
  accessToken: string
): Promise<string | null> {
  let platform: string | undefined;
  try {
    platform = (await getPhoneNumber(phoneNumberId, accessToken)).platform_type;
  } catch {
    return null;
  }

  if (!platform || platform.toUpperCase() === "CLOUD_API") return null;

  return `Meta reports this number's platform as ${platform} — it is running alongside the WhatsApp Business app, on a WhatsApp Business Account Meta created for it rather than the one your other numbers use. Open that account in Meta → WhatsApp Manager → Message templates and try creating the same template there. If Meta refuses it in its own dashboard too, the restriction is on the account and nothing here can send it.`;
}
