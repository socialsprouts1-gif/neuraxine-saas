import { NextResponse, type NextRequest } from "next/server";
import { authenticate, isAuthed } from "@/lib/api-auth";
import { handleEvent } from "@/lib/event-runner";
import { eventProblem, nameIn, normaliseEventName, phoneIn } from "@/lib/events";

// The door another system knocks on.
//
//   POST /api/v1/events
//   Authorization: Bearer nc_live_…
//
//   { "event": "order.placed",
//     "contact": { "phone": "+919000000000", "name": "Priya" },
//     "data": { "order_id": "T6-1840", "total": 1840, "table": "T6" } }
//
// Written to be callable by somebody's till software, which means two
// things it would not otherwise need.
//
// It never returns a 500 for anything it can describe. The caller is
// often in the middle of taking a payment, and software written against
// an endpoint that sometimes explodes gets a try/catch wrapped round it
// and then nobody ever finds out the messages stopped.
//
// And it answers with what happened — which automations ran, or that
// none are listening — rather than a bare OK. The first thing anybody
// integrating needs is to know whether it worked, and reading it in the
// response beats opening a dashboard.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Caps the body. A till with a bug must not be able to post a megabyte. */
const MAX_BODY = 64 * 1024;

export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!isAuthed(auth)) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json(
      { ok: false, error: "That request body is too large." },
      { status: 413 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return NextResponse.json(
      { ok: false, error: "That is not valid JSON." },
      { status: 400 }
    );
  }

  const problem = eventProblem(body);
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });

  const input = body as Record<string, unknown>;
  const name = normaliseEventName(input.event ?? input.name);
  const phone = phoneIn(input);

  const result = await handleEvent({
    orgId: auth.orgId,
    name,
    data: (input.data as Record<string, unknown>) ?? {},
    phone,
    contactName: nameIn(input),
    email: String((input.contact as Record<string, unknown> | undefined)?.email ?? "") || undefined,
    source: input.test === true ? "test" : "api",
  });

  if (!result.eventId) {
    return NextResponse.json(
      { ok: false, error: result.problem ?? "The event could not be recorded." },
      { status: 503 }
    );
  }

  // 200 even when nothing was listening, and even when a rule failed.
  // The event did arrive and is on the log; a non-2xx would make the
  // sender retry it, which sends the customer the message twice.
  return NextResponse.json({
    ok: true,
    event_id: result.eventId,
    event: name,
    automations_run: result.matched,
    ...(result.problem ? { warning: result.problem } : {}),
    ...(phone ? {} : { warning_contact: "No phone number was included, so nothing could be sent." }),
  });
}

/**
 * A quick check that a key works, for somebody wiring this up.
 *
 * Every integration starts with "is my key right", and answering that
 * with a GET they can paste into a browser's address bar saves an hour
 * of guessing at header spellings.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!isAuthed(auth)) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    ok: true,
    message: `Key “${auth.keyName}” is working. POST an event to this same address.`,
    example: {
      event: "order.placed",
      contact: { phone: "+919000000000", name: "Priya" },
      data: { order_id: "T6-1840", total: 1840, table: "T6" },
    },
  });
}
