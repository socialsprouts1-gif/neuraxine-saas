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

// ------------------------------------------------ Shiprocket: pushing out

export interface CreatedShipment {
  shiprocketOrderId: string;
  shipmentId: string | null;
  /** Present only when a courier was assigned at creation. Usually not. */
  awb: string | null;
  courier: string | null;
}

/**
 * Creates the order on Shiprocket.
 *
 * "adhoc" is their word for an order that did not come from a connected
 * storefront, which is exactly what ours are.
 *
 * A created order has no AWB yet: Shiprocket assigns one when a courier
 * is picked, which is a separate call and sometimes a manual choice in
 * their dashboard. So this returns what exists now and the caller stores
 * it; the AWB arrives later.
 */
export async function createShiprocketOrder(
  credentials: ShiprocketCredentials,
  payload: Record<string, unknown>
): Promise<{ ok: true; created: CreatedShipment } | { ok: false; error: string }> {
  const auth = await shiprocketToken(credentials);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await providerFetch(`${SHIPROCKET_BASE}/orders/create/adhoc`, {
    method: "POST",
    headers: jsonHeaders(`Bearer ${auth.token}`),
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    return { ok: false, error: describeShiprocketRejection(result) };
  }

  const body = result.body as {
    order_id?: number | string;
    shipment_id?: number | string;
    awb_code?: string | null;
    courier_name?: string | null;
    status?: string;
  } | null;

  if (!body?.order_id) {
    return {
      ok: false,
      error: "Shiprocket accepted the request but returned no order id, so nothing was created.",
    };
  }

  return {
    ok: true,
    created: {
      shiprocketOrderId: String(body.order_id),
      shipmentId: body.shipment_id ? String(body.shipment_id) : null,
      awb: body.awb_code?.trim() || null,
      courier: body.courier_name?.trim() || null,
    },
  };
}

/**
 * Shiprocket's validation errors, in one readable line.
 *
 * They answer a bad order with a 422 and an object keyed by field name,
 * each holding an array of sentences. Printing "Request failed" throws
 * away the one thing that says what to fix.
 */
function describeShiprocketRejection(result: {
  status?: number;
  error?: string | null;
  body?: unknown;
}): string {
  const body = result.body as { message?: string; errors?: Record<string, unknown> } | null;

  const fields = body?.errors;
  if (fields && typeof fields === "object") {
    const lines = Object.entries(fields)
      .map(([field, detail]) => {
        const text = Array.isArray(detail) ? detail.join(" ") : String(detail);
        return `${field}: ${text}`;
      })
      .slice(0, 4);
    if (lines.length > 0) return `Shiprocket refused the order — ${lines.join("; ")}`;
  }

  if (body?.message) return `Shiprocket refused the order — ${body.message}`;
  return result.error || "Shiprocket refused the order.";
}

/** The pickup locations on the account, since an order must name one. */
export async function listPickupLocations(
  credentials: ShiprocketCredentials
): Promise<{ ok: true; locations: string[] } | { ok: false; error: string }> {
  const auth = await shiprocketToken(credentials);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await providerFetch(`${SHIPROCKET_BASE}/settings/company/pickup`, {
    headers: jsonHeaders(`Bearer ${auth.token}`),
  });

  if (!result.ok) return { ok: false, error: result.error ?? "Shiprocket refused the request." };

  const data = (result.body as {
    data?: { shipping_address?: Array<{ pickup_location?: string }> };
  } | null)?.data;

  const locations = (data?.shipping_address ?? [])
    .map((entry) => entry.pickup_location?.trim())
    .filter((name): name is string => Boolean(name));

  return { ok: true, locations };
}

export interface RemoteOrder {
  shiprocketOrderId: string;
  reference: string;
  customerName: string | null;
  customerPhone: string | null;
  status: string | null;
  totalRupees: number | null;
  awb: string | null;
  courier: string | null;
  createdAt: string | null;
}

/** Orders that already exist on Shiprocket, newest first. */
export async function listShiprocketOrders(
  credentials: ShiprocketCredentials,
  limit = 25
): Promise<{ ok: true; orders: RemoteOrder[] } | { ok: false; error: string }> {
  const auth = await shiprocketToken(credentials);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await providerFetch(
    `${SHIPROCKET_BASE}/orders?per_page=${Math.min(Math.max(limit, 1), 100)}`,
    { headers: jsonHeaders(`Bearer ${auth.token}`) }
  );

  if (!result.ok) return { ok: false, error: result.error ?? "Shiprocket refused the request." };

  const rows = (result.body as {
    data?: Array<{
      id?: number | string;
      channel_order_id?: string;
      customer_name?: string;
      customer_phone?: string;
      status?: string;
      total?: number | string;
      created_at?: string;
      shipments?: Array<{ awb?: string; courier?: string }>;
    }>;
  } | null)?.data;

  return {
    ok: true,
    orders: (rows ?? []).map((row) => {
      const shipment = row.shipments?.[0];
      return {
        shiprocketOrderId: String(row.id ?? ""),
        reference: row.channel_order_id?.trim() || String(row.id ?? ""),
        customerName: row.customer_name?.trim() || null,
        customerPhone: row.customer_phone?.trim() || null,
        status: row.status?.trim() || null,
        totalRupees: row.total === undefined ? null : Number(row.total),
        awb: shipment?.awb?.trim() || null,
        courier: shipment?.courier?.trim() || null,
        createdAt: row.created_at ?? null,
      };
    }),
  };
}

// -------------------------------------- Shiprocket: courier, label, invoice

/**
 * Asks Shiprocket to assign a courier and an AWB to a shipment.
 *
 * Their cheapest recommended courier unless one is named. This is the
 * step that turns an order into a trackable parcel, and until it runs
 * there is no AWB to send anybody.
 */
export async function assignAwb(
  credentials: ShiprocketCredentials,
  shipmentId: string,
  courierId?: string | null
): Promise<
  { ok: true; awb: string; courier: string | null } | { ok: false; error: string }
> {
  const auth = await shiprocketToken(credentials);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await providerFetch(`${SHIPROCKET_BASE}/courier/assign/awb`, {
    method: "POST",
    headers: jsonHeaders(`Bearer ${auth.token}`),
    body: JSON.stringify({
      shipment_id: Number(shipmentId),
      ...(courierId ? { courier_id: Number(courierId) } : {}),
    }),
  });

  if (!result.ok) return { ok: false, error: describeShiprocketRejection(result) };

  // Shiprocket answers this one in two shapes depending on whether the
  // courier was picked by them or by us.
  const body = result.body as {
    awb_assign_status?: number;
    response?: { data?: { awb_code?: string; courier_name?: string } };
  } | null;

  const data = body?.response?.data;
  const awb = data?.awb_code?.trim();

  if (!awb) {
    return {
      ok: false,
      error:
        "Shiprocket did not return an AWB. Usually it means no courier serves that pincode at this weight, or the account has no balance — check the order in Shiprocket.",
    };
  }

  return { ok: true, awb, courier: data?.courier_name?.trim() || null };
}

/**
 * The shipping label, as a URL to a PDF Shiprocket hosts.
 *
 * Generated on their side rather than drawn here: a label carries the
 * courier's own barcode and routing code, and anything we drew would be
 * a picture of a label rather than one a courier will scan.
 */
export async function generateLabel(
  credentials: ShiprocketCredentials,
  shipmentId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await shiprocketToken(credentials);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await providerFetch(`${SHIPROCKET_BASE}/courier/generate/label`, {
    method: "POST",
    headers: jsonHeaders(`Bearer ${auth.token}`),
    body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
  });

  if (!result.ok) return { ok: false, error: describeShiprocketRejection(result) };

  const url = (result.body as { label_url?: string } | null)?.label_url?.trim();
  if (!url) {
    return {
      ok: false,
      error: "Shiprocket returned no label. A label can only be made once an AWB has been assigned.",
    };
  }
  return { ok: true, url };
}

/** The tax invoice for an order, as a URL to a PDF Shiprocket hosts. */
export async function generateInvoice(
  credentials: ShiprocketCredentials,
  shiprocketOrderId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await shiprocketToken(credentials);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await providerFetch(`${SHIPROCKET_BASE}/orders/print/invoice`, {
    method: "POST",
    headers: jsonHeaders(`Bearer ${auth.token}`),
    body: JSON.stringify({ ids: [Number(shiprocketOrderId)] }),
  });

  if (!result.ok) return { ok: false, error: describeShiprocketRejection(result) };

  const url = (result.body as { invoice_url?: string } | null)?.invoice_url?.trim();
  if (!url) return { ok: false, error: "Shiprocket returned no invoice for that order." };
  return { ok: true, url };
}

/** Books the courier to come and collect. */
export async function requestPickup(
  credentials: ShiprocketCredentials,
  shipmentId: string
): Promise<{ ok: true; scheduledFor: string | null } | { ok: false; error: string }> {
  const auth = await shiprocketToken(credentials);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await providerFetch(`${SHIPROCKET_BASE}/courier/generate/pickup`, {
    method: "POST",
    headers: jsonHeaders(`Bearer ${auth.token}`),
    body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
  });

  if (!result.ok) return { ok: false, error: describeShiprocketRejection(result) };

  const body = result.body as {
    response?: { pickup_scheduled_date?: string; pickup_token_number?: string };
  } | null;

  return { ok: true, scheduledFor: body?.response?.pickup_scheduled_date?.trim() || null };
}
