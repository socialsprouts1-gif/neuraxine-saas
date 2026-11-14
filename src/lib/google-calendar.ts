import "server-only";

import { loadIntegration } from "@/lib/integration-store";
import type { RunnerClient } from "@/lib/whatsapp-send";

// Putting a booking in the business's own calendar.
//
// Google's refresh tokens are long-lived and its access tokens last an hour,
// so every call starts by trading one for the other. No caching: a serverless
// invocation may not be the same process next time, and the extra round trip
// is cheaper than a token held somewhere it can go stale.
//
// The event id is stored on the meeting, so a second push updates the event
// the customer already has in their diary rather than creating a duplicate
// next to it.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const TIMEOUT_MS = 12_000;

export interface GoogleCalendarCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Which calendar to write to. "primary" unless the tenant says otherwise. */
  calendarId: string;
}

export interface CalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  /** The customer, invited so the event appears in their diary too. */
  attendeeEmail?: string | null;
}

async function call(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; body: unknown; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (response.ok) return { ok: true, body, error: null };

    // Google's message is under error.message for the API and
    // error_description for OAuth, and neither is where the other looks.
    const detail =
      (body as { error?: { message?: string }; error_description?: string } | null) ?? {};
    return {
      ok: false,
      body,
      error:
        detail.error?.message ??
        detail.error_description ??
        `Google returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      body: null,
      error:
        error instanceof Error && error.name === "AbortError"
          ? `Google did not answer within ${TIMEOUT_MS / 1000}s`
          : error instanceof Error
            ? error.message
            : "Request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function accessToken(
  credentials: GoogleCalendarCredentials
): Promise<{ token: string } | { error: string }> {
  const result = await call(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  const token = (result.body as { access_token?: string } | null)?.access_token;
  if (token) return { token };

  return {
    error:
      result.error === "invalid_grant"
        ? "Google rejected the refresh token. It expires if unused for six months, or if the OAuth consent screen is still in Testing mode — publish the app or generate a new token."
        : (result.error ?? "Google would not issue an access token."),
  };
}

/** Checks the credentials work, and names the calendar if they do. */
export async function testGoogleCalendar(
  credentials: GoogleCalendarCredentials
): Promise<{ ok: true; calendarName: string } | { ok: false; error: string }> {
  const auth = await accessToken(credentials);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await call(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(credentials.calendarId)}`,
    { headers: { Authorization: `Bearer ${auth.token}` } }
  );

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === "Not Found"
          ? `No calendar with the id “${credentials.calendarId}”. Use "primary", or the calendar's id from Google Calendar → Settings → Integrate calendar.`
          : (result.error ?? "Google refused the request."),
    };
  }

  const name = (result.body as { summary?: string } | null)?.summary;
  return { ok: true, calendarName: name ?? credentials.calendarId };
}

/**
 * Creates or updates the event for a booking.
 *
 * `existingEventId` is what makes this idempotent: pushing the same booking
 * twice moves one event rather than leaving two in the diary.
 */
export async function upsertCalendarEvent(
  credentials: GoogleCalendarCredentials,
  event: CalendarEvent,
  existingEventId?: string | null
): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
  const auth = await accessToken(credentials);
  if ("error" in auth) return { ok: false, error: auth.error };

  const start = new Date(event.startsAt);
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);

  const body: Record<string, unknown> = {
    summary: event.summary,
    ...(event.description ? { description: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
    // Sending the zone alongside the instant means the event reads correctly
    // in the business's own calendar rather than in whatever zone the server
    // happens to be in.
    start: { dateTime: start.toISOString(), timeZone: event.timezone },
    end: { dateTime: end.toISOString(), timeZone: event.timezone },
  };

  // Only when we have an address. Google rejects an attendee without one,
  // and a WhatsApp contact usually has no email at all.
  if (event.attendeeEmail) {
    body.attendees = [{ email: event.attendeeEmail }];
  }

  const path = `${CALENDAR_BASE}/calendars/${encodeURIComponent(credentials.calendarId)}/events`;
  const result = existingEventId
    ? await call(`${path}/${encodeURIComponent(existingEventId)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    : await call(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

  if (!result.ok) return { ok: false, error: result.error ?? "Google refused the event." };

  const id = (result.body as { id?: string } | null)?.id ?? existingEventId;
  if (!id) return { ok: false, error: "Google accepted the event but returned no id." };
  return { ok: true, eventId: id };
}

/** Removes an event, for a booking that was cancelled. */
export async function deleteCalendarEvent(
  credentials: GoogleCalendarCredentials,
  eventId: string
): Promise<{ ok: boolean; error: string | null }> {
  const auth = await accessToken(credentials);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await call(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(
      credentials.calendarId
    )}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${auth.token}` } }
  );

  // An event already gone is the state we wanted.
  if (!result.ok && result.error === "Not Found") return { ok: true, error: null };
  return { ok: result.ok, error: result.error };
}

/**
 * The org's Google Calendar connection, credentials decrypted.
 *
 * Returns null rather than throwing when the integration is absent or its
 * credentials will not decrypt: a calendar that cannot be reached must not
 * cost the customer their booking.
 */
export async function loadGoogleCalendar(
  supabase: RunnerClient,
  orgId: string
): Promise<GoogleCalendarCredentials | null> {
  const stored = await loadIntegration(supabase, orgId, "google-calendar");
  if (!stored) return null;

  const { values, config } = stored;
  // A half-filled connection is worse than none: it would fail on the first
  // booking with an error about a missing field rather than about not being
  // connected.
  if (!values.client_id || !values.client_secret || !values.refresh_token) return null;

  return {
    clientId: values.client_id,
    clientSecret: values.client_secret,
    refreshToken: values.refresh_token,
    calendarId: config.calendar_id?.trim() || "primary",
  };
}
