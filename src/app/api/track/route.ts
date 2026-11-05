import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isKnownEvent } from "@/lib/analytics";

// Where a visitor's events land.
//
// Public and unauthenticated, because the people it measures have no
// account — which means everything it accepts has to be treated as hostile
// and nothing it stores may identify anybody.
//
// What it does not record is the point: the request's IP address is
// available here and is deliberately dropped, along with the user-agent
// string. The only durable identifier is the random value the browser
// generated for itself.
//
// It answers 204 to everything, including rubbish. A tracking endpoint
// that reports back what it rejected is a tracking endpoint somebody can
// use to find out what the database looks like, and the browser has
// nothing useful to do with the answer in either case.

export const runtime = "nodejs";

/** Long enough for a real value, short enough that nobody stores a novel. */
const LIMITS: Record<string, number> = {
  visitor: 64,
  session: 64,
  event: 32,
  path: 256,
  label: 64,
  referrer: 128,
  source: 64,
  medium: 64,
  campaign: 64,
  device: 16,
};

function clean(value: unknown, field: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, LIMITS[field] ?? 64);
}

// One browser cannot write more than this in a minute. A loop in somebody
// else's code — or a bored person with curl — should cost one row a
// second, not a table.
const RATE = new Map<string, { count: number; until: number }>();
const PER_MINUTE = 120;

function tooMany(visitor: string): boolean {
  const now = Date.now();
  const seen = RATE.get(visitor);

  if (!seen || seen.until < now) {
    RATE.set(visitor, { count: 1, until: now + 60_000 });
    // The map is per instance and short-lived, but a long-running one
    // should not grow without limit either.
    if (RATE.size > 5000) {
      for (const [key, value] of RATE) if (value.until < now) RATE.delete(key);
    }
    return false;
  }

  seen.count += 1;
  return seen.count > PER_MINUTE;
}

export async function POST(request: Request) {
  // 204 from every path below, so the shape of the answer never says
  // which check it was that refused.
  const no = () => new NextResponse(null, { status: 204 });

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return no();

    const input = body as Record<string, unknown>;
    const visitor = clean(input.visitor, "visitor");
    const session = clean(input.session, "session");
    const event = clean(input.event, "event");

    if (!visitor || !session || !event) return no();
    if (!isKnownEvent(event)) return no();
    if (tooMany(visitor)) return no();

    await createAdminClient()
      .from("site_events")
      .insert({
        visitor_id: visitor,
        session_id: session,
        event,
        path: clean(input.path, "path"),
        label: clean(input.label, "label"),
        referrer_host: clean(input.referrer, "referrer"),
        source: clean(input.source, "source"),
        medium: clean(input.medium, "medium"),
        campaign: clean(input.campaign, "campaign"),
        device: clean(input.device, "device"),
      });

    return no();
  } catch {
    // A missing table means the migration has not been run. Measurement
    // is the one thing that must never take the site down with it.
    return no();
  }
}
