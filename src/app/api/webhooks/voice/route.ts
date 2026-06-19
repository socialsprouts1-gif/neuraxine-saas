import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVoiceProvider } from "@/lib/voice";
import { triggerPostCallAnalysis } from "@/lib/gemini/post-call";
import { fanOutWebhooks } from "@/lib/webhooks/fan-out";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-bolna-signature") ?? req.headers.get("x-signature") ?? "";

  const provider = getVoiceProvider();

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = provider.parseWebhookEvent(payload);
  if (!event) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const supabase = createAdminClient();

  // Look up our call by provider_call_id or metadata
  const callId = event.callId;

  // Persist the raw event (idempotent via provider_call_id)
  await supabase.from("call_events").insert({
    call_id: callId,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
    ts: new Date().toISOString(),
  });

  // Update call status based on event type
  if (event.type === "ringing") {
    await supabase.from("calls").update({ status: "ringing" }).eq("id", callId);
  } else if (event.type === "answered") {
    await supabase.from("calls").update({ status: "in_progress", answered_at: event.ts }).eq("id", callId);
  } else if (event.type === "transcript_chunk") {
    await supabase.from("transcripts").insert({
      call_id: callId,
      role: event.role,
      text: event.text,
      seq: event.seq,
      ts: event.ts,
    });
  } else if (event.type === "recording_ready") {
    await supabase.from("calls").update({ recording_url: event.url }).eq("id", callId);
  } else if (event.type === "ended") {
    await supabase.from("calls").update({
      status: "ended",
      ended_at: event.ts,
      duration_sec: event.durationSec,
      disposition: event.disposition as string,
    }).eq("id", callId);

    // Kick off post-call AI analysis (non-blocking)
    triggerPostCallAnalysis(callId).catch(console.error);
  }

  // Fan out to org webhooks
  const { data: call } = await supabase.from("calls").select("org_id").eq("id", callId).single();
  if (call) {
    fanOutWebhooks(call.org_id, `call.${event.type}`, { callId, ...event }).catch(console.error);
  }

  return NextResponse.json({ ok: true });
}
