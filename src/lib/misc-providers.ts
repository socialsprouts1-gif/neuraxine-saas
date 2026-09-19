import "server-only";

import { jsonHeaders, providerFetch } from "@/lib/provider-http";

// The two integrations that do one thing each: Shiprocket for where a parcel
// is, Calendly for what can be booked.
//
// Both are here for the same reason as the others — a card that says
// "connected" and does nothing is worse than one that says it is not built,
// because it invites somebody to rely on it.

// ----------------------------------------------------------- Shiprocket

const SHIPROCKET_BASE = "https://apiv2.shiprocket.in/v1/external";

export interface ShiprocketCredentials {
  email: string;
  password: string;
}

/**
 * Shiprocket issues a bearer token from an email and password.
 *
 * The token lasts ten days. Not cached: a serverless invocation may not be
 * the same process next time, and Shiprocket rate-limits the login endpoint
 * rather than the API, so one extra call per operation is the cheap side of
 * the trade.
 */
async function shiprocketToken(
  credentials: ShiprocketCredentials
): Promise<{ token: string } | { error: string }> {
  const result = await providerFetch(`${SHIPROCKET_BASE}/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  });

  const token = (result.body as { token?: string } | null)?.token;
  if (token) return { token };

  return {
    error:
      result.status === 403
        ? "Shiprocket rejected the login. Use an API user created under Settings → API → Configure, not your dashboard login — the dashboard account is refused here."
        : (result.error ?? "Shiprocket would not issue a token."),
  };
}

export async function testShiprocket(
  credentials: ShiprocketCredentials
): Promise<string | null> {
  const auth = await shiprocketToken(credentials);
  return "error" in auth ? auth.error : null;
}

export interface ShipmentStatus {
  awb: string;
  status: string;
  courier: string | null;
  /** The most recent scan, as the courier worded it. */
  lastUpdate: string | null;
  expectedDelivery: string | null;
  trackingUrl: string | null;
}

/** Where a parcel is, by air waybill number. */
export async function trackShipment(
  credentials: ShiprocketCredentials,
  awb: string
): Promise<{ ok: true; shipment: ShipmentStatus } | { ok: false; error: string }> {
  const auth = await shiprocketToken(credentials);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await providerFetch(
    `${SHIPROCKET_BASE}/courier/track/awb/${encodeURIComponent(awb)}`,
    { headers: jsonHeaders(`Bearer ${auth.token}`) }
  );

  if (!result.ok) return { ok: false, error: result.error ?? "Shiprocket refused the request." };

  // Shiprocket wraps the useful part two levels deep, and returns the
  // wrapper with an empty body for an AWB it has never seen.
  const data = (
    result.body as {
      tracking_data?: {
        track_status?: number;
        shipment_track?: Array<{
          awb_code?: string;
          current_status?: string;
          courier_name?: string;
          edd?: string;
        }>;
        shipment_track_activities?: Array<{ activity?: string; date?: string }>;
        track_url?: string;
      };
    } | null
  )?.tracking_data;

  const track = data?.shipment_track?.[0];
  if (!track) {
    return {
      ok: false,
      error: `Shiprocket has no tracking for ${awb}. A freshly created shipment can take a few hours to appear.`,
    };
  }

  const activity = data?.shipment_track_activities?.[0];
  return {
    ok: true,
    shipment: {
      awb: track.awb_code ?? awb,
      status: track.current_status ?? "Unknown",
      courier: track.courier_name ?? null,
      lastUpdate: activity?.activity
        ? `${activity.activity}${activity.date ? ` · ${activity.date}` : ""}`
        : null,
      expectedDelivery: track.edd ?? null,
      trackingUrl: data?.track_url ?? null,
    },
  };
}

// -------------------------------------------------------------- Calendly

const CALENDLY_BASE = "https://api.calendly.com";

export interface CalendlyEventType {
  name: string;
  durationMinutes: number;
  schedulingUrl: string;
  active: boolean;
}

/**
 * Calendly's booking links, which are what there is to share on WhatsApp.
 *
 * Every request needs the current user's URI first, which is one extra call
 * Calendly gives no way around.
 */
export async function fetchCalendlyEventTypes(
  token: string
): Promise<{ ok: true; owner: string; types: CalendlyEventType[] } | { ok: false; error: string }> {
  const me = await providerFetch(`${CALENDLY_BASE}/users/me`, {
    headers: jsonHeaders(`Bearer ${token}`),
  });

  if (!me.ok) {
    return {
      ok: false,
      error:
        me.status === 401
          ? "Calendly rejected the token. Personal access tokens are created under Integrations → API & Webhooks, and are shown once."
          : (me.error ?? "Calendly refused the request."),
    };
  }

  const user = (me.body as { resource?: { uri?: string; name?: string } } | null)?.resource;
  if (!user?.uri) {
    return { ok: false, error: "Calendly accepted the token but returned no user." };
  }

  const result = await providerFetch(
    `${CALENDLY_BASE}/event_types?user=${encodeURIComponent(user.uri)}&count=50`,
    { headers: jsonHeaders(`Bearer ${token}`) }
  );

  if (!result.ok) return { ok: false, error: result.error ?? "Calendly refused the request." };

  const collection =
    (
      result.body as {
        collection?: Array<{
          name?: string;
          duration?: number;
          scheduling_url?: string;
          active?: boolean;
        }>;
      } | null
    )?.collection ?? [];

  return {
    ok: true,
    owner: user.name ?? "your Calendly account",
    types: collection.map((entry) => ({
      name: entry.name ?? "Untitled",
      durationMinutes: entry.duration ?? 30,
      schedulingUrl: entry.scheduling_url ?? "",
      active: entry.active !== false,
    })),
  };
}

export async function testCalendly(token: string): Promise<string | null> {
  const result = await fetchCalendlyEventTypes(token);
  return result.ok ? null : result.error;
}
