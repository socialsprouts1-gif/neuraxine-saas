import "server-only";

import { randomBytes } from "node:crypto";
import { META_API_VERSION, META_GRAPH_BASE_URL, MetaApiError } from "@/lib/meta-whatsapp";

// Meta Embedded Signup.
//
// The manual path asks an operator for four values — WABA ID, phone number
// ID, app ID, access token — that they have to hunt for across three Meta
// screens, and then leaves them to discover `subscribed_apps`, which has no
// UI anywhere in Meta's dashboard and without which no webhook is ever
// delivered. Embedded Signup replaces all of it: Meta runs the dialog, the
// operator picks or creates a number there, and we get back a code that we
// exchange for a token scoped to exactly the assets they granted.
//
// What this cannot do is skip Meta's approval. Connecting *someone else's*
// number requires the app to be an approved Tech Provider with Advanced
// Access to whatsapp_business_management and whatsapp_business_messaging.
// Until then the dialog works only for numbers in your own business.

export interface EmbeddedSignupEnv {
  appId: string;
  appSecret: string;
  configId: string;
}

export function getEmbeddedSignupEnv(): EmbeddedSignupEnv | null {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
  if (!appId || !appSecret || !configId) return null;
  return { appId, appSecret, configId };
}

export const EMBEDDED_SIGNUP_SETUP_MESSAGE =
  "Embedded Signup is not configured. Set NEXT_PUBLIC_META_APP_ID, META_APP_SECRET and META_EMBEDDED_SIGNUP_CONFIG_ID, then redeploy.";

// State signing lives in its own module because it is pure and
// security-relevant — it is what authorises a write against an org.
export { createSignupState, readSignupState } from "@/lib/signup-state";

// --- the dialog -----------------------------------------------------------

export function embeddedSignupUrl(input: {
  env: EmbeddedSignupEnv;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.env.appId,
    config_id: input.env.configId,
    redirect_uri: input.redirectUri,
    state: input.state,
    // Without both of these Meta returns an implicit-flow access token in
    // the fragment, which never reaches the server.
    response_type: "code",
    override_default_response_type: "true",
    // sessionInfoVersion 3 is what makes Meta register the number for the
    // Cloud API as part of the dialog instead of leaving it to us.
    extras: JSON.stringify({ setup: {}, featureType: "", sessionInfoVersion: "3" }),
  });

  return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params}`;
}

// --- graph calls ----------------------------------------------------------

async function graph<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new MetaApiError(response.status, data);
  return data as T;
}

/**
 * Trades the one-time code for a business integration system user token.
 *
 * This token does not expire and is scoped to the assets the operator
 * granted in the dialog — which is exactly what we want to store per org.
 */
export async function exchangeCodeForToken(
  code: string,
  env: EmbeddedSignupEnv,
  redirectUri: string
): Promise<string> {
  const params = new URLSearchParams({
    client_id: env.appId,
    client_secret: env.appSecret,
    code,
    // Meta compares this against the value used to open the dialog and
    // rejects the exchange if they differ.
    redirect_uri: redirectUri,
  });

  const data = await graph<{ access_token?: string }>(
    `${META_GRAPH_BASE_URL}/oauth/access_token?${params}`
  );
  if (!data.access_token) {
    throw new Error("Meta returned no access token for that code.");
  }
  return data.access_token;
}

interface DebugTokenResponse {
  data?: {
    granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
  };
}

/**
 * Finds the WhatsApp Business Accounts the token can act on.
 *
 * The redirect flow gives us no session info message, so the granted assets
 * have to be read back off the token itself.
 */
export async function wabaIdsForToken(
  token: string,
  env: EmbeddedSignupEnv
): Promise<string[]> {
  const params = new URLSearchParams({
    input_token: token,
    access_token: `${env.appId}|${env.appSecret}`,
  });

  const data = await graph<DebugTokenResponse>(`${META_GRAPH_BASE_URL}/debug_token?${params}`);
  const scopes = data.data?.granular_scopes ?? [];

  const ids = new Set<string>();
  for (const scope of scopes) {
    if (scope.scope !== "whatsapp_business_management" && scope.scope !== "whatsapp_business_messaging") {
      continue;
    }
    for (const id of scope.target_ids ?? []) ids.add(id);
  }
  return [...ids];
}

export interface SignupPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  code_verification_status?: string;
  quality_rating?: string;
}

export async function phoneNumbersForWaba(
  wabaId: string,
  token: string
): Promise<SignupPhoneNumber[]> {
  const fields = "id,display_phone_number,verified_name,code_verification_status,quality_rating";
  const data = await graph<{ data?: SignupPhoneNumber[] }>(
    `${META_GRAPH_BASE_URL}/${wabaId}/phone_numbers?fields=${fields}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data.data ?? [];
}

/**
 * Subscribes our app to the WABA's webhooks.
 *
 * This is the step with no UI anywhere in Meta's dashboard, and the reason a
 * correctly configured callback URL can still receive nothing at all. Doing
 * it here is most of the value of Embedded Signup. Idempotent.
 */
export async function subscribeAppToWaba(wabaId: string, token: string): Promise<void> {
  await graph(`${META_GRAPH_BASE_URL}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Registers a number for Cloud API messaging.
 *
 * Best effort by design: with sessionInfoVersion 3 Meta usually registers
 * the number inside the dialog, so the common outcome here is an "already
 * registered" error that must not fail the connection. Returns the problem
 * rather than throwing so the caller can report it as a follow-up.
 */
export async function registerPhoneNumber(
  phoneNumberId: string,
  token: string,
  pin: string
): Promise<string | null> {
  try {
    await graph(`${META_GRAPH_BASE_URL}/${phoneNumberId}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    return null;
  } catch (error) {
    if (error instanceof MetaApiError) {
      const body = JSON.stringify(error.body).toLowerCase();
      // Already usable. Not a failure.
      if (body.includes("already") || body.includes("registered")) return null;
      return `Meta would not register this number for the Cloud API: ${
        (error.body as { error?: { message?: string } })?.error?.message ?? "unknown error"
      }`;
    }
    return error instanceof Error ? error.message : "Unknown registration failure";
  }
}

/** Six digits, used as the number's two-step verification PIN. */
export function generateRegistrationPin(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
