import "server-only";

// One way of talking to somebody else's API.
//
// Every integration needs the same four things and gets them wrong
// differently: a deadline, no thrown exceptions, the provider's own error
// wording rather than a bare status code, and a body parsed whether or not
// the provider bothered to send JSON.
//
// The deadline matters more than it looks. Several of these run inside
// webhook processing, where Meta redelivers anything it does not get a
// prompt 200 for — and a redelivered webhook is a second message to the
// customer. A provider that hangs must cost us twelve seconds, not the
// request.

/** Long enough for a slow gateway, short enough not to hold a webhook. */
export const PROVIDER_TIMEOUT_MS = 12_000;

export interface ProviderResponse {
  ok: boolean;
  status: number;
  body: unknown;
  /** Null when ok. Otherwise the provider's own words where there are any. */
  error: string | null;
}

/**
 * The keys providers bury their real error message under.
 *
 * Collected by walking the body rather than reading one path, because no two
 * of them agree: Razorpay nests under error.description, Shopify returns a
 * bare `errors` string, WooCommerce uses `message`, Google uses
 * error.message for the API and error_description for OAuth, and Zoho puts
 * the useful part in `details`.
 */
const MESSAGE_KEYS = [
  "message",
  "description",
  "error_description",
  "errorMessage",
  "error_message",
  "detail",
  "details",
  "errors",
  "reason",
  "title",
];

/** Whatever the provider said, as one line. */
export function describeProviderError(status: number, body: unknown): string {
  const seen = new Set<string>();

  const collect = (value: unknown, depth = 0): void => {
    if (depth > 4 || value === null || value === undefined) return;
    if (typeof value === "string") {
      if (value.trim() && depth > 0) seen.add(value.trim());
      return;
    }
    if (typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry, depth + 1);
      return;
    }

    const record = value as Record<string, unknown>;
    for (const key of MESSAGE_KEYS) {
      const found = record[key];
      if (typeof found === "string" && found.trim()) seen.add(found.trim());
      else if (found && typeof found === "object") collect(found, depth + 1);
    }
    // Only descend through error-ish containers. Walking every value turns a
    // successful-looking payload into a soup of unrelated strings.
    for (const key of ["error", "errors", "data", "meta"]) {
      if (record[key] && typeof record[key] === "object") collect(record[key], depth + 1);
    }
  };

  collect(body);

  const detail = [...seen].slice(0, 2).join(" — ");
  if (detail) return `${detail} (HTTP ${status})`;
  if (typeof body === "string" && body.trim()) {
    return `${body.trim().slice(0, 200)} (HTTP ${status})`;
  }
  return `HTTP ${status}`;
}

/**
 * fetch with a deadline, and no way to throw.
 *
 * A caller inside a webhook cannot afford an exception, and a caller behind
 * a button wants the provider's reason on screen rather than "something went
 * wrong".
 */
export async function providerFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = PROVIDER_TIMEOUT_MS
): Promise<ProviderResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // An HTML error page or a plain string. Kept as-is: it is often the
      // only clue, and discarding it leaves the operator with a status code.
      body = text;
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
      error: response.ok ? null : describeProviderError(response.status, body),
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `No answer within ${Math.round(timeoutMs / 1000)}s`
        : error instanceof Error
          ? error.message
          : "Request failed";
    return { ok: false, status: 0, body: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** HTTP Basic, which is how most payment gateways and stores authenticate. */
export function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

/** JSON request headers, with whatever authorization the caller has. */
export function jsonHeaders(authorization?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(authorization ? { Authorization: authorization } : {}),
  };
}
