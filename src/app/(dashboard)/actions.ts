"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { resolveConnection } from "@/lib/connections";
import { encryptToken, decryptToken } from "@/lib/crypto";
import { checkAccessToken } from "@/lib/access-token";
import { headers } from "next/headers";
import {
  EMBEDDED_SIGNUP_SETUP_MESSAGE,
  createSignupState,
  embeddedSignupUrl,
  getEmbeddedSignupEnv,
  wabaIdsForToken,
} from "@/lib/embedded-signup";
import {
  MetaApiError,
  InvalidAccessTokenError,
  describeMetaError,
  getPhoneNumber,
  listWabaPhoneNumbers,
  getWabaDetails,
  createMessageTemplate,
} from "@/lib/meta-whatsapp";

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

// Every action re-derives the org server-side from the session. The org is
// never taken from the form, so a tampered payload cannot write into another
// tenant even before RLS gets involved.

export async function connectWaba(formData: FormData): Promise<ActionResult> {
  const { orgId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only owners and admins can connect a WhatsApp number." };
  }

  const wabaId = String(formData.get("waba_id") ?? "").trim();
  const phoneNumberId = String(formData.get("phone_number_id") ?? "").trim();
  const metaAppId = String(formData.get("meta_app_id") ?? "").trim();
  const accessTokenRaw = String(formData.get("access_token") ?? "");

  if (!wabaId || !phoneNumberId || !metaAppId || !accessTokenRaw.trim()) {
    return { ok: false, error: "All fields are required." };
  }

  // A token carrying a smart quote or an em dash cannot go in an HTTP header,
  // so it would be stored happily and then fail every send with a TypeError
  // naming a character index. Refuse it here, where the paste just happened
  // and the fix is obvious.
  const check = checkAccessToken(accessTokenRaw);
  if (!check.ok) return { ok: false, error: check.error! };
  const accessToken = check.token!;

  let encrypted: string;
  try {
    encrypted = encryptToken(accessToken);
  } catch (err) {
    // Surface the real reason. Swallowing it made a missing variable and a
    // mis-pasted one look identical, which is the difference between "add
    // it" and "fix it".
    return {
      ok: false,
      error: `Can't store the access token securely — ${
        err instanceof Error ? err.message : "encryption failed"
      } Add it in Vercel → Settings → Environment Variables, then redeploy.`,
    };
  }

  const supabase = await createClient();

  // Reuse the existing verify token when this number is already connected.
  // Regenerating it on every save silently breaks a webhook already
  // registered with Meta — reconnecting to rotate an expiring access token
  // would invalidate the handshake, and Meta's only feedback is a generic
  // "couldn't be validated". The token is a handshake secret, not a
  // credential that needs rotating alongside the access token.
  const { data: existing } = await supabase
    .from("waba_connections")
    .select("webhook_verify_token")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  const { error } = await supabase.from("waba_connections").upsert(
    {
      org_id: orgId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      meta_app_id: metaAppId,
      access_token_encrypted: encrypted,
      // Generated here rather than typed by the user: it is a shared secret
      // Meta echoes back during verification, so it should be unguessable.
      webhook_verify_token:
        existing?.webhook_verify_token ?? randomBytes(24).toString("base64url"),
      status: "active",
    },
    { onConflict: "phone_number_id" }
  );

  if (error) return { ok: false, error: error.message };

  // Pasting a token is the fix for a credential rejection, so clear the
  // recorded failure. Kept out of the upsert above deliberately: these
  // columns are newer than the table, and a database that has not run the
  // latest migration must still be able to store a token — that is the one
  // operation someone needs when their number has stopped sending.
  await supabase
    .from("waba_connections")
    .update({ last_error: null, last_error_at: null })
    .eq("org_id", orgId)
    .eq("phone_number_id", phoneNumberId);

  revalidatePath("/settings");
  revalidatePath("/integrations");
  const message = existing
    ? "WhatsApp number updated. The verify token is unchanged, so your webhook stays registered."
    : "WhatsApp number connected.";
  return { ok: true, message: check.warning ?? message };
}

export async function regenerateVerifyToken(formData: FormData): Promise<ActionResult> {
  const { orgId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only owners and admins can regenerate the verify token." };
  }

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("waba_connections")
    .update({ webhook_verify_token: randomBytes(24).toString("base64url") })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return {
    ok: true,
    message: "New verify token generated. Re-register the webhook in Meta with the new value.",
  };
}

export async function disconnectWaba(formData: FormData): Promise<ActionResult> {
  const { orgId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only owners and admins can disconnect a number." };
  }

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("waba_connections").delete().eq("id", id).eq("org_id", orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, message: "Number disconnected." };
}

export async function renameOrganization(formData: FormData): Promise<ActionResult> {
  const { orgId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only owners and admins can rename the organization." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name cannot be empty." };

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ name }).eq("id", orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, message: "Organization renamed." };
}

export async function createContact(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const waId = String(formData.get("wa_id") ?? "").replace(/[^\d]/g, "");
  const name = String(formData.get("name") ?? "").trim();
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (!waId) return { ok: false, error: "A WhatsApp number is required (digits only, with country code)." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .upsert({ org_id: orgId, wa_id: waId, name: name || null, tags }, { onConflict: "org_id,wa_id" });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/contacts");
  return { ok: true, message: "Contact saved." };
}

export async function deleteContact(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id).eq("org_id", orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/contacts");
  return { ok: true, message: "Contact deleted." };
}

export async function createAutomation(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  const triggerType = String(formData.get("trigger_type") ?? "keyword");
  const keyword = String(formData.get("keyword") ?? "").trim();
  const reply = String(formData.get("reply") ?? "").trim();

  if (!name) return { ok: false, error: "Automation name is required." };
  if (triggerType === "keyword" && !keyword) {
    return { ok: false, error: "A keyword is required for keyword triggers." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("automation_flows").insert({
    org_id: orgId,
    name,
    trigger_type: triggerType,
    trigger_config: triggerType === "keyword" ? { keyword } : {},
    actions_json: reply ? [{ type: "send_text", body: reply }] : [],
    is_active: true,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/automations");
  return { ok: true, message: "Automation created." };
}

export async function toggleAutomation(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("automation_flows")
    .update({ is_active: !isActive })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/automations");
  return { ok: true };
}

export async function createSupportTicket(formData: FormData): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const priority = String(formData.get("priority") ?? "normal");

  if (!subject || !body) return { ok: false, error: "Subject and message are required." };

  const supabase = await createClient();
  const { error } = await supabase.from("support_tickets").insert({
    org_id: orgId,
    created_by: user.id,
    subject,
    body,
    priority: priority as "low" | "normal" | "high" | "urgent",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, message: "Support ticket raised." };
}

// ---------------------------------------------------------------- Inbox

/** Marks a thread read for the whole team. Unread is derived from this. */
export async function markConversationRead(id: string): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Hands a thread to a teammate, or back to the unassigned pile. */
export async function assignConversation(
  id: string,
  userId: string | null
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  if (userId) {
    // Assigning to someone outside the org would hide the thread from
    // everyone who can actually see it.
    const { data: member } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return { ok: false, error: "That person is not in this workspace." };
  }

  const { error } = await supabase
    .from("conversations")
    .update({ assigned_to: userId })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true, message: userId ? "Assigned." : "Unassigned." };
}

export async function setConversationStatus(
  id: string,
  status: "open" | "pending" | "resolved" | "closed"
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ status })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true, message: `Marked ${status}.` };
}

/** Renames the person behind a thread — the pencil beside their name. */
export async function renameContact(id: string, name: string): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give the contact a name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true, message: "Contact renamed." };
}

/**
 * The opt-in switch in the thread header.
 *
 * Opting out stops campaigns and broadcasts reaching this person. It does
 * not gag a reply inside an open service window — that is a response to a
 * message they sent, and withholding it would be the rude read of consent.
 */
export async function setContactOptIn(id: string, optedIn: boolean): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const { error } = await supabase
    .from("contacts")
    .update({
      opted_out: !optedIn,
      opted_out_at: optedIn ? null : new Date().toISOString(),
      opt_out_reason: optedIn ? null : "Set from the inbox",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true, message: optedIn ? "Opted in." : "Opted out of campaigns." };
}

export async function toggleConversationBot(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const id = String(formData.get("id") ?? "");
  const enable = String(formData.get("bot_enabled") ?? "") !== "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    // Turning the bot back on also clears any half-finished flow, so it
    // resumes by matching the next message fresh rather than replying from
    // wherever the customer abandoned it before a human stepped in.
    .update({
      bot_enabled: enable,
      bot_flow_id: null,
      bot_node_id: null,
      status: enable ? "open" : "pending",
    })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return {
    ok: true,
    message: enable ? "Automated replies resumed." : "Automated replies paused for this chat.",
  };
}

/**
 * Asks Meta whether the stored credentials can actually act on this number.
 *
 * Every credential fault so far — an expired token, a token mangled by
 * autocorrect, a System User without the WhatsApp Account assigned — could
 * only be discovered by sending a real message to a real phone and then
 * reading the server logs. This does the same permission check against the
 * same object without sending anything, and reports what Meta said.
 */
export async function verifyWabaConnection(formData: FormData): Promise<ActionResult> {
  const { orgId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only owners and admins can test the connection." };
  }

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { data: connection, error } = await supabase
    .from("waba_connections")
    .select("id, phone_number_id, waba_id, meta_app_id, access_token_encrypted")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !connection) {
    return { ok: false, error: error?.message ?? "That connection no longer exists." };
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(connection.access_token_encrypted);
  } catch (err) {
    return {
      ok: false,
      error: `The stored token could not be decrypted — ${
        err instanceof Error ? err.message : "unknown error"
      }. Paste it again with Update access token.`,
    };
  }

  try {
    const number = await getPhoneNumber(connection.phone_number_id, accessToken);

    // Proof the credentials work, so any recorded failure is stale — and
    // keep what Meta said, so every screen can show +91 92724 47307 rather
    // than the 15-digit id nobody recognises.
    await supabase
      .from("waba_connections")
      .update({
        display_phone_number: number.display_phone_number ?? null,
        verified_name: number.verified_name ?? null,
        quality_rating: number.quality_rating ?? null,
        last_checked_at: new Date().toISOString(),
        last_error: null,
        last_error_at: null,
      })
      .eq("id", connection.id);
    revalidatePath("/integrations");
    revalidatePath("/numbers");

    const name = number.verified_name ? ` as "${number.verified_name}"` : "";
    const shown = number.display_phone_number ? ` (${number.display_phone_number})` : "";
    const quality = number.quality_rating ? ` Quality rating: ${number.quality_rating}.` : "";

    // Sending works off the phone number id alone, so everything above can
    // pass with a waba_id that belongs to a different account entirely.
    // Templates and flows are the only things that read it, which is why a
    // wrong one stays invisible until the first template comes back refused
    // with an error that names nothing. Check it here instead.
    const waba = await describeWabaMembership(
      connection.waba_id,
      connection.phone_number_id,
      connection.meta_app_id,
      accessToken
    );

    if (waba) {
      await supabase
        .from("waba_connections")
        .update({ last_error: waba, last_error_at: new Date().toISOString() })
        .eq("id", connection.id);
      revalidatePath("/integrations");
      revalidatePath("/numbers");
      return { ok: false, error: waba };
    }

    return {
      ok: true,
      message: `Meta accepted the token and returned this number${shown}${name}.${quality} The WhatsApp Business Account checks out too, so sending and templates should both work.`,
    };
  } catch (err) {
    const message =
      err instanceof MetaApiError
        ? describeMetaError(err.status, err.body)
        : err instanceof InvalidAccessTokenError
          ? err.message
          : `Could not reach Meta — ${err instanceof Error ? err.message : "unknown error"}.`;

    await supabase
      .from("waba_connections")
      .update({ last_error: message, last_error_at: new Date().toISOString() })
      .eq("id", connection.id);
    revalidatePath("/integrations");

    return { ok: false, error: message };
  }
}

/**
 * Checks the stored WABA is real and actually holds this number.
 *
 * Returns a sentence when something is wrong, null when it is fine. Both
 * faults it catches are silent everywhere else: a WABA the token cannot see,
 * and a WABA that exists but belongs to a different set of numbers.
 */
async function describeWabaMembership(
  wabaId: string,
  phoneNumberId: string,
  appId: string,
  accessToken: string
): Promise<string | null> {
  let numbers: Awaited<ReturnType<typeof listWabaPhoneNumbers>>;

  try {
    numbers = await listWabaPhoneNumbers(wabaId, accessToken);
  } catch (err) {
    const why =
      err instanceof MetaApiError ? describeMetaError(err.status, err.body) : "Meta did not answer.";
    return `This number works, but Meta would not open WhatsApp Business Account ${wabaId} with this token, so templates and forms cannot be created. ${why}`;
  }

  if (numbers.some((number) => number.id === phoneNumberId)) {
    const scope = await describeTokenScope(wabaId, appId, accessToken);
    if (scope) return scope;

    // The number belongs to the account, so the ids agree. What is left is
    // whether the account is allowed to do anything: an unapproved or
    // unverified account sends messages perfectly well and refuses template
    // creation with a bare code 100 that names nothing.
    return describeWabaStanding(wabaId, accessToken);
  }

  const listed = numbers
    .map((number) => number.display_phone_number ?? number.id)
    .filter(Boolean)
    .join(", ");

  return `This number sends fine, but it is not on WhatsApp Business Account ${wabaId} — that account holds ${
    listed || "no numbers"
  }. Templates and forms are created on the account, so they will keep failing until the WABA id is corrected under Integrations. Find the right one in Meta → WhatsApp Manager, on the account that lists this number.`;
}

/**
 * Whether the token itself was granted this account as an asset.
 *
 * With Standard access, whatsapp_business_management covers only the
 * accounts a token has actually been granted. Reads often pass on the app's
 * permission alone, so a token missing the asset sends messages, lists
 * numbers and reads templates — and is refused the moment it tries to create
 * one, with an error that names no field.
 *
 * Meta reports the grants on the token itself, so this asks. Silent unless
 * it can answer: the check needs the app secret, which is only available
 * when the connection belongs to this deployment's own Meta app.
 */
async function describeTokenScope(
  wabaId: string,
  appId: string,
  accessToken: string
): Promise<string | null> {
  const env = getEmbeddedSignupEnv();
  if (!env || env.appId !== appId) return null;

  let granted: string[];
  try {
    granted = await wabaIdsForToken(accessToken, env);
  } catch {
    return null;
  }

  // No grants listed at all means Meta reported nothing useful, not that the
  // token is empty — an app-scoped token has no granular scopes to report.
  if (granted.length === 0 || granted.includes(wabaId)) return null;

  return `This number sends fine, but the stored token has not been granted WhatsApp Business Account ${wabaId}, so it cannot create templates or forms on it — only ${granted.join(", ")}. Assign that account to the token's System User in Business settings → Users → System users → Add assets, then generate a NEW token: assigning an asset does not change a token that already exists. Paste it here with Update access token.`;
}

/**
 * Account-level gates that block templates while sending keeps working.
 *
 * Returns a sentence when something is wrong, null when the account is clear.
 * Never fails the test on its own account — a token that cannot read these
 * fields is a narrower permission, not a broken connection.
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
    return `This number sends fine, but Meta has not approved WhatsApp Business Account ${wabaId} — it reports the review status as ${waba.account_review_status}. Templates and forms cannot be created until that clears. Check Meta Business Suite → Account Quality.`;
  }

  const verification = waba.business_verification_status?.toLowerCase();
  if (verification && verification !== "verified") {
    return `This number sends fine, but the business behind WhatsApp Business Account ${wabaId} is not verified with Meta (${waba.business_verification_status}). Template creation is limited until verification completes — Meta Business Suite → Security Centre → Start verification.`;
  }

  return null;
}

/**
 * Asks Meta, in one go, everything that bears on creating a template.
 *
 * Five theories about this failure have now been wrong, each ruled out only
 * after a round trip through a person's browser. Meta states the reason in
 * fields describeMetaError deliberately never shows an operator — subcode,
 * error_data, fbtrace_id — and Vercel's log retention loses them before they
 * can be read.
 *
 * So this runs the real call with the smallest possible template: no header,
 * no buttons, one line of body. If that is refused, nothing about the
 * template's content is at fault and the account or the token is, which is a
 * different search. The whole envelope comes back verbatim.
 */
export async function diagnoseTemplates(
  formData: FormData
): Promise<ActionResult & { report?: string }> {
  const { orgId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only owners and admins can run this." };
  }

  const supabase = await createClient();
  const connection = await resolveConnection(supabase, orgId, {
    connectionId: String(formData.get("id") ?? ""),
  });
  if ("error" in connection) return { ok: false, error: connection.error };

  const lines: string[] = [
    `waba      ${connection.wabaId}`,
    `app       ${connection.metaAppId}`,
    `number    ${connection.phoneNumberId} (${connection.displayPhoneNumber ?? "?"})`,
  ];

  try {
    lines.push(`account   ${JSON.stringify(await getWabaDetails(connection.wabaId, connection.accessToken))}`);
  } catch (error) {
    lines.push(`account   unreadable — ${describeThrown(error)}`);
  }

  const env = getEmbeddedSignupEnv();
  if (env && env.appId === connection.metaAppId) {
    try {
      lines.push(`granted   ${JSON.stringify(await wabaIdsForToken(connection.accessToken, env))}`);
    } catch (error) {
      lines.push(`granted   unreadable — ${describeThrown(error)}`);
    }
  } else {
    lines.push("granted   not checked (this connection is on a different Meta app)");
  }

  // The smallest template Meta accepts. Nothing here can be the fault.
  const name = `neura_diag_${Date.now()}`;
  try {
    const created = await createMessageTemplate(connection.wabaId, connection.accessToken, {
      name,
      language: "en_US",
      category: "UTILITY",
      components: [{ type: "BODY", text: "Diagnostic template. Please ignore." }],
    });
    lines.push(`create    OK — ${name} (${created.status}). Delete it in WhatsApp Manager.`);
  } catch (error) {
    lines.push(
      error instanceof MetaApiError
        ? `create    REFUSED ${error.status} ${JSON.stringify(error.body)}`
        : `create    REFUSED — ${describeThrown(error)}`
    );
  }

  return { ok: true, report: lines.join("\n") };
}

function describeThrown(error: unknown): string {
  if (error instanceof MetaApiError) return `${error.status} ${JSON.stringify(error.body)}`;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Builds the Meta dialog URL for this org and hands it back to the client.
 *
 * The state is signed rather than stored: the callback arrives from
 * facebook.com with no Supabase session cookie, so it needs the org id in a
 * form it can trust, and an abandoned dialog should leave nothing behind.
 */
export async function startEmbeddedSignup(): Promise<ActionResult & { url?: string }> {
  const { orgId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only owners and admins can connect a WhatsApp number." };
  }

  const env = getEmbeddedSignupEnv();
  if (!env) return { ok: false, error: EMBEDDED_SIGNUP_SETUP_MESSAGE };

  const host = (await headers()).get("host");
  if (!host) return { ok: false, error: "Could not work out this deployment's address." };
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;

  return {
    ok: true,
    url: embeddedSignupUrl({
      env,
      // Must match the callback exactly, and must be listed under Valid
      // OAuth Redirect URIs in the Meta app — Meta compares it twice.
      redirectUri: `${origin}/api/whatsapp/embedded-signup/callback`,
      state: createSignupState(orgId, env.appSecret),
    }),
  };
}
