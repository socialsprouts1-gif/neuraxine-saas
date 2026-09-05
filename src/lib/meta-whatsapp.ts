import "server-only";

import { assertUsableAccessToken } from "@/lib/access-token";

// Pin the Graph API version in one place — every call goes through
// META_GRAPH_BASE_URL rather than hardcoding "v21.0" per call site.
export const META_API_VERSION = "v21.0";
export const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export class MetaApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`Meta Graph API error (${status}): ${JSON.stringify(body)}`);
    this.name = "MetaApiError";
    this.status = status;
    this.body = body;
  }
}

export interface MetaTemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: "quick_reply" | "url" | "catalog" | "flow";
  index?: number;
  parameters?: Array<Record<string, unknown>>;
}

export interface MetaReplyButton {
  id: string;
  title: string;
}

export interface MetaSendMessageResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

interface MetaMediaResponse {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
}

async function postToMessagesEndpoint(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>
): Promise<MetaSendMessageResponse> {
  // A token with a smart quote or an em dash makes fetch throw a ByteString
  // TypeError that names a character index and nothing else. Fail with a
  // sentence instead, before the request is built.
  assertUsableAccessToken(accessToken);

  const response = await fetch(`${META_GRAPH_BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new MetaApiError(response.status, data);
  }
  return data as MetaSendMessageResponse;
}

export function sendTextMessage(
  phoneNumberId: string,
  to: string,
  body: string,
  accessToken: string
): Promise<MetaSendMessageResponse> {
  return postToMessagesEndpoint(phoneNumberId, accessToken, {
    to,
    type: "text",
    text: { body },
  });
}

export function sendTemplateMessage(
  phoneNumberId: string,
  to: string,
  templateName: string,
  language: string,
  components: MetaTemplateComponent[],
  accessToken: string
): Promise<MetaSendMessageResponse> {
  return postToMessagesEndpoint(phoneNumberId, accessToken, {
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  });
}

// Interactive reply buttons — what a chatbot flow node with choices
// renders as. Meta caps this at 3 buttons with 20-character titles and
// rejects the whole message if either is exceeded, so both are enforced
// here rather than discovered as a 400 at runtime.
export const MAX_REPLY_BUTTONS = 3;
export const MAX_BUTTON_TITLE_LENGTH = 20;

export function sendInteractiveButtons(
  phoneNumberId: string,
  to: string,
  body: string,
  buttons: MetaReplyButton[],
  accessToken: string
): Promise<MetaSendMessageResponse> {
  return postToMessagesEndpoint(phoneNumberId, accessToken, {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.slice(0, MAX_REPLY_BUTTONS).map((button) => ({
          type: "reply",
          reply: {
            id: button.id,
            title: button.title.slice(0, MAX_BUTTON_TITLE_LENGTH),
          },
        })),
      },
    },
  });
}

export interface MetaListRow {
  id: string;
  title: string;
  description?: string;
}

export interface MetaListSection {
  title: string;
  rows: MetaListRow[];
}

// Interactive list menus. Meta caps a list at 10 rows across all sections,
// row titles at 24 characters and descriptions at 72; exceeding any of them
// rejects the whole message, so all three are clamped here.
export const MAX_LIST_ROWS = 10;

export function sendInteractiveList(
  phoneNumberId: string,
  to: string,
  body: string,
  buttonText: string,
  sections: MetaListSection[],
  accessToken: string,
  options: { header?: string; footer?: string } = {}
): Promise<MetaSendMessageResponse> {
  let remaining = MAX_LIST_ROWS;
  const clamped = sections
    .map((section) => {
      const rows = section.rows.slice(0, Math.max(0, remaining)).map((row) => ({
        id: row.id,
        title: row.title.slice(0, 24),
        ...(row.description ? { description: row.description.slice(0, 72) } : {}),
      }));
      remaining -= rows.length;
      return { title: section.title.slice(0, 24), rows };
    })
    .filter((section) => section.rows.length > 0);

  return postToMessagesEndpoint(phoneNumberId, accessToken, {
    to,
    type: "interactive",
    interactive: {
      type: "list",
      ...(options.header ? { header: { type: "text", text: options.header } } : {}),
      body: { text: body },
      ...(options.footer ? { footer: { text: options.footer } } : {}),
      action: { button: buttonText.slice(0, 20), sections: clamped },
    },
  });
}

export type MetaMediaType = "image" | "video" | "document" | "audio";

export function sendMediaMessage(
  phoneNumberId: string,
  to: string,
  mediaType: MetaMediaType,
  link: string,
  accessToken: string,
  options: { caption?: string; filename?: string } = {}
): Promise<MetaSendMessageResponse> {
  // Audio takes no caption and only documents take a filename — sending
  // either where it is not allowed is a 400 rather than a silent ignore.
  const media: Record<string, unknown> = { link };
  if (options.caption && mediaType !== "audio") media.caption = options.caption;
  if (options.filename && mediaType === "document") media.filename = options.filename;

  return postToMessagesEndpoint(phoneNumberId, accessToken, {
    to,
    type: mediaType,
    [mediaType]: media,
  });
}

// A single button that opens a URL. Distinct from quick replies: the tap
// leaves WhatsApp, so there is no reply event and no path to branch on.
export function sendCtaUrl(
  phoneNumberId: string,
  to: string,
  body: string,
  buttonText: string,
  url: string,
  accessToken: string,
  options: { header?: string; footer?: string } = {}
): Promise<MetaSendMessageResponse> {
  return postToMessagesEndpoint(phoneNumberId, accessToken, {
    to,
    type: "interactive",
    interactive: {
      type: "cta_url",
      ...(options.header ? { header: { type: "text", text: options.header } } : {}),
      body: { text: body },
      ...(options.footer ? { footer: { text: options.footer } } : {}),
      action: {
        name: "cta_url",
        parameters: { display_text: buttonText.slice(0, 20), url },
      },
    },
  });
}

// Resolves a media ID to its short-lived download URL. The URL itself
// still requires the same `Authorization: Bearer` header to fetch.
export interface MetaPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  platform_type?: string;
  /**
   * Meta's own word for whether the number can send: CONNECTED,
   * PENDING, FLAGGED, RESTRICTED, DISCONNECTED… A number that is present
   * on the account but not CONNECTED looks perfectly connected in every
   * other field, which is exactly how a dead number goes unnoticed.
   */
  status?: string;
  name_status?: string;
}

/**
 * Reads the connected phone number back from Meta.
 *
 * This is the cheapest possible proof that a stored token can actually act on
 * a number: it touches the same object a send touches and needs the same
 * asset assignment, but changes nothing. Without it the only way to test
 * credentials is to send a real message to a real person and read the logs.
 */
export async function getPhoneNumber(
  phoneNumberId: string,
  accessToken: string
): Promise<MetaPhoneNumber> {
  assertUsableAccessToken(accessToken);

  const fields =
    "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,status,name_status";
  const response = await fetch(
    `${META_GRAPH_BASE_URL}/${phoneNumberId}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new MetaApiError(response.status, data);
  }
  return data as MetaPhoneNumber;
}

export async function getMediaUrl(mediaId: string, accessToken: string): Promise<string> {
  const response = await fetch(`${META_GRAPH_BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new MetaApiError(response.status, data);
  }
  return (data as MetaMediaResponse).url;
}

// Error classification lives in its own module because it is pure — no fetch,
// no env, no server-only — which is what makes it testable. Re-exported here
// so call sites keep a single Meta import.
export {
  InvalidAccessTokenError,
  assertUsableAccessToken,
} from "@/lib/access-token";

export {
  describeMetaError,
  isMetaAuthError,
  metaErrorDetail,
  type MetaErrorDetail,
} from "@/lib/meta-errors";

// --- message templates ----------------------------------------------------

export interface MetaTemplateSummary {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: unknown[];
  rejected_reason?: string;
}

async function graph(
  path: string,
  accessToken: string,
  init?: { method?: string; body?: unknown }
): Promise<unknown> {
  assertUsableAccessToken(accessToken);

  const response = await fetch(`${META_GRAPH_BASE_URL}/${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new MetaApiError(response.status, data);
  return data;
}

/** How big a sample file Meta will take for a template header. */
const MAX_TEMPLATE_SAMPLE_BYTES = 16 * 1024 * 1024;

/**
 * Uploads a file to Meta and returns the handle a template header needs.
 *
 * A media header's `example.header_handle` is not a URL. Meta will not fetch
 * a link — it wants a handle from the Resumable Upload API, produced by
 * sending the actual bytes to an app-scoped upload session. Passing a URL
 * there is accepted by the request and then refused as "Invalid parameter
 * (code 100)", which names no field and reads like the whole template is
 * malformed.
 *
 * Two calls: open a session against the app, then POST the bytes to it. The
 * second uses `Authorization: OAuth` — not Bearer — which is particular to
 * this endpoint and silently 400s if you use the usual header.
 */
export async function uploadTemplateHeaderSample(
  appId: string,
  accessToken: string,
  fileUrl: string
): Promise<string> {
  assertUsableAccessToken(accessToken);

  const source = await fetch(fileUrl, { cache: "no-store" });
  if (!source.ok) {
    throw new Error(
      `The sample file could not be downloaded (${source.status}). Meta has to receive the file itself, so the URL must be publicly reachable.`
    );
  }

  const bytes = new Uint8Array(await source.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("The sample file is empty.");
  }
  if (bytes.byteLength > MAX_TEMPLATE_SAMPLE_BYTES) {
    throw new Error(
      `The sample file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB; Meta allows 16 MB.`
    );
  }

  // Meta matches this against the template's declared format, so a wrong or
  // missing type is rejected even when the file itself is fine.
  const fileType = (source.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!fileType) {
    throw new Error("The sample file was served without a content type, so Meta cannot accept it.");
  }

  const start = new URLSearchParams({
    file_length: String(bytes.byteLength),
    file_type: fileType,
    access_token: accessToken,
  });

  const sessionResponse = await fetch(`${META_GRAPH_BASE_URL}/${appId}/uploads?${start}`, {
    method: "POST",
  });
  const session = await sessionResponse.json().catch(() => ({}));
  if (!sessionResponse.ok) throw new MetaApiError(sessionResponse.status, session);

  const sessionId = (session as { id?: string }).id;
  if (!sessionId) throw new Error("Meta opened no upload session for that file.");

  const uploadResponse = await fetch(`${META_GRAPH_BASE_URL}/${sessionId}`, {
    method: "POST",
    headers: {
      // OAuth, not Bearer. This endpoint is the exception.
      Authorization: `OAuth ${accessToken}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });

  const uploaded = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) throw new MetaApiError(uploadResponse.status, uploaded);

  const handle = (uploaded as { h?: string }).h;
  if (!handle) throw new Error("Meta accepted the upload but returned no file handle.");

  return handle;
}

/**
 * Submits a template for review. Meta returns immediately with a PENDING
 * status; approval takes anywhere from a minute to a day, which is why the
 * sync below exists rather than a callback.
 */
export async function createMessageTemplate(
  wabaId: string,
  accessToken: string,
  payload: {
    name: string;
    language: string;
    category: string;
    components: unknown[];
  }
): Promise<{ id: string; status: string; category: string }> {
  const data = (await graph(`${wabaId}/message_templates`, accessToken, {
    method: "POST",
    body: payload,
  })) as { id: string; status?: string; category?: string };

  return {
    id: data.id,
    status: data.status ?? "PENDING",
    category: data.category ?? payload.category,
  };
}

export interface WabaDetails {
  id: string;
  name?: string;
  /** PENDING / APPROVED / REJECTED — an unapproved account is restricted. */
  account_review_status?: string;
  business_verification_status?: string;
  /** Meta distinguishes accounts onboarded from the WhatsApp Business app. */
  ownership_type?: string;
  country?: string;
  currency?: string;
}

/**
 * The account's own standing with Meta.
 *
 * Reachability and a green number say nothing about whether the account may
 * create templates: review status and business verification are account-level
 * gates, and Meta reports a refusal from them as a bare code 100 that names
 * no field. Reading them turns a dead end into a sentence.
 */
export async function getWabaDetails(
  wabaId: string,
  accessToken: string
): Promise<WabaDetails> {
  const fields =
    "id,name,account_review_status,business_verification_status,ownership_type,country,currency";
  return (await graph(`${wabaId}?fields=${fields}`, accessToken)) as WabaDetails;
}

export interface WabaPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
}

/**
 * The numbers on a WhatsApp Business Account.
 *
 * Used to prove a connection's waba_id and phone_number_id belong together.
 * They are independent fields on the row and only templates and flows read
 * the WABA — so a wrong one passes every send, every webhook and the
 * connection test itself, and first surfaces as an incomprehensible refusal
 * the first time someone writes a template.
 */
export async function listWabaPhoneNumbers(
  wabaId: string,
  accessToken: string
): Promise<WabaPhoneNumber[]> {
  const data = (await graph(
    `${wabaId}/phone_numbers?limit=100&fields=id,display_phone_number,verified_name`,
    accessToken
  )) as { data?: WabaPhoneNumber[] };
  return data.data ?? [];
}

/** Every template on the account, for reconciling status after review. */
export async function listMessageTemplates(
  wabaId: string,
  accessToken: string
): Promise<MetaTemplateSummary[]> {
  const data = (await graph(
    `${wabaId}/message_templates?limit=200&fields=id,name,language,status,category,components,rejected_reason`,
    accessToken
  )) as { data?: MetaTemplateSummary[] };

  return data.data ?? [];
}

export async function deleteMessageTemplate(
  wabaId: string,
  accessToken: string,
  name: string
): Promise<void> {
  await graph(
    `${wabaId}/message_templates?name=${encodeURIComponent(name)}`,
    accessToken,
    { method: "DELETE" }
  );
}

// --- flows ----------------------------------------------------------------

export interface MetaFlowSummary {
  id: string;
  name: string;
  status: string;
  categories?: string[];
  validation_errors?: MetaFlowValidationError[];
  preview?: { preview_url: string; expires_at?: string };
}

export interface MetaFlowValidationError {
  error: string;
  error_type?: string;
  message: string;
  line_start?: number;
  column_start?: number;
  pointers?: Array<{ path?: string }>;
}

/**
 * Creates a flow. It starts as a draft — a draft can be opened from the
 * preview link and sent to a test number, but not sent to customers.
 */
export async function createFlow(
  wabaId: string,
  accessToken: string,
  payload: { name: string; categories: string[] }
): Promise<{ id: string; validation_errors?: MetaFlowValidationError[] }> {
  return (await graph(`${wabaId}/flows`, accessToken, {
    method: "POST",
    body: payload,
  })) as { id: string; validation_errors?: MetaFlowValidationError[] };
}

export async function updateFlowMetadata(
  flowId: string,
  accessToken: string,
  payload: { name?: string; categories?: string[] }
): Promise<void> {
  await graph(flowId, accessToken, { method: "POST", body: payload });
}

/**
 * Replaces a flow's JSON.
 *
 * This one endpoint is multipart rather than JSON — the document goes up as
 * a file part — so it bypasses the graph() helper. Meta answers 200 with a
 * `validation_errors` array even when it refuses the document, so the caller
 * has to read that rather than trusting the status code.
 */
export async function updateFlowJson(
  flowId: string,
  accessToken: string,
  flowJson: unknown
): Promise<{ success: boolean; validation_errors?: MetaFlowValidationError[] }> {
  assertUsableAccessToken(accessToken);

  const body = new FormData();
  body.append("name", "flow.json");
  body.append("asset_type", "FLOW_JSON");
  body.append("messaging_product", "whatsapp");
  body.append(
    "file",
    new Blob([JSON.stringify(flowJson, null, 2)], { type: "application/json" }),
    "flow.json"
  );

  const response = await fetch(`${META_GRAPH_BASE_URL}/${flowId}/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new MetaApiError(response.status, data);
  return data as { success: boolean; validation_errors?: MetaFlowValidationError[] };
}

/** Publishing is one-way: a published flow can be deprecated, never edited. */
export async function publishFlow(flowId: string, accessToken: string): Promise<void> {
  await graph(`${flowId}/publish`, accessToken, { method: "POST" });
}

export async function deprecateFlow(flowId: string, accessToken: string): Promise<void> {
  await graph(`${flowId}/deprecate`, accessToken, { method: "POST" });
}

/** Only a draft can be deleted; a published flow has to be deprecated. */
export async function deleteFlow(flowId: string, accessToken: string): Promise<void> {
  await graph(flowId, accessToken, { method: "DELETE" });
}

const FLOW_FIELDS = "id,name,status,categories,validation_errors";

export async function getFlow(
  flowId: string,
  accessToken: string,
  options: { withPreview?: boolean } = {}
): Promise<MetaFlowSummary> {
  const fields = options.withPreview
    ? `${FLOW_FIELDS},preview.invalidate(false)`
    : FLOW_FIELDS;
  return (await graph(`${flowId}?fields=${fields}`, accessToken)) as MetaFlowSummary;
}

export async function listFlows(
  wabaId: string,
  accessToken: string
): Promise<MetaFlowSummary[]> {
  const data = (await graph(`${wabaId}/flows?limit=200&fields=${FLOW_FIELDS}`, accessToken)) as {
    data?: MetaFlowSummary[];
  };
  return data.data ?? [];
}

/**
 * Sends the message that opens a flow.
 *
 * `mode: "draft"` is what makes an unpublished flow testable — Meta accepts
 * it only for numbers on the account, which is exactly the audience you want
 * while still building.
 */
export function sendFlowMessage(
  phoneNumberId: string,
  to: string,
  accessToken: string,
  options: {
    flowId: string;
    flowToken: string;
    cta: string;
    body: string;
    firstScreen: string;
    header?: string;
    footer?: string;
    draft?: boolean;
    flowMessageVersion?: string;
  }
): Promise<MetaSendMessageResponse> {
  return postToMessagesEndpoint(phoneNumberId, accessToken, {
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      ...(options.header ? { header: { type: "text", text: options.header } } : {}),
      body: { text: options.body },
      ...(options.footer ? { footer: { text: options.footer } } : {}),
      action: {
        name: "flow",
        parameters: {
          flow_message_version: options.flowMessageVersion ?? "3",
          flow_token: options.flowToken,
          flow_id: options.flowId,
          flow_cta: options.cta,
          flow_action: "navigate",
          flow_action_payload: { screen: options.firstScreen },
          ...(options.draft ? { mode: "draft" } : {}),
        },
      },
    },
  });
}

// Reading a flow submission is pure — no fetch, no env, no server-only —
// which is what makes it testable. Re-exported here so call sites keep a
// single Meta import.
export { readFlowReply } from "@/lib/flow-reply";


/**
 * Registers a business number for the Cloud API.
 *
 * A number can sit on a WhatsApp Business Account, show every credential
 * as valid, and still be unregistered — in which case WhatsApp tells
 * everyone who opens the chat that the person is "not on WhatsApp", and no
 * message reaches it. Registration is what turns the number on.
 *
 * The PIN is the account's two-step verification PIN, set in Meta under
 * WhatsApp → Two-step verification. Meta allows ten attempts per number
 * per 72 hours and then locks registration for the rest of the window.
 */
export async function registerPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  pin: string
): Promise<void> {
  await graph(`${phoneNumberId}/register`, accessToken, {
    method: "POST",
    body: { messaging_product: "whatsapp", pin },
  });
}
