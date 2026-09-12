import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { graphOf, findNode } from "@/lib/flow-engine";
import { runFlow, type FlowContext } from "@/lib/flow-runner";
import { loadOrgConnection } from "@/lib/whatsapp-send";
import type { ChatbotFlow } from "@/types/portal";

// The scheduler behind the Delay node.
//
// A flow that hits a delay longer than we run inline parks with a time and a
// node to come back to. Nothing was ever coming back for it, so the rest of
// the flow was silently dropped. This is what comes back.
//
// Deliberately not wired to a vercel.json cron: a once-a-minute schedule is
// a Pro feature, and declaring one on Hobby makes Vercel refuse the whole
// deployment rather than just ignoring the cron. Drive it from outside
// instead — any pinger that can send a header will do:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        https://your-domain/api/cron/resume-flows
//
// On Pro, add vercel.json back with { "crons": [{ "path":
// "/api/cron/resume-flows", "schedule": "* * * * *" }] } and drop the pinger.

// Service role: this runs on a timer with no user session, and it has to see
// every org's parked conversations. Nothing here takes input from a request
// body — the only thing it acts on is rows whose own resume time has passed.
export const dynamic = "force-dynamic";

// One run should finish inside a serverless invocation, so it takes a slice
// and leaves the rest for the next minute rather than timing out on a backlog.
const BATCH = 25;

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("conversations")
    .select("id, org_id, contact_id, bot_flow_id, bot_resume_node_id, bot_variables, bot_enabled")
    .lte("bot_resume_at", now)
    .not("bot_resume_at", "is", null)
    .not("bot_resume_node_id", "is", null)
    .limit(BATCH);

  if (error) {
    console.error("Could not read conversations due to resume", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let resumed = 0;
  let skipped = 0;

  for (const conversation of due ?? []) {
    // Clear the claim first. A slow send must not let the next minute's run
    // pick the same conversation up and send everything twice.
    await supabase
      .from("conversations")
      .update({ bot_resume_at: null, bot_resume_node_id: null })
      .eq("id", conversation.id);

    // Automation switched off while it was waiting — the pause wins.
    if (!conversation.bot_enabled || !conversation.bot_flow_id) {
      skipped += 1;
      continue;
    }

    try {
      const handled = await resumeOne(supabase, conversation);
      if (handled) resumed += 1;
      else skipped += 1;
    } catch (failure) {
      console.error("Failed to resume a parked flow", conversation.id, failure);
      skipped += 1;
    }
  }

  return NextResponse.json({ due: due?.length ?? 0, resumed, skipped });
}

/**
 * Vercel signs its cron calls with a header. CRON_SECRET lets the endpoint be
 * driven from anywhere else — an external uptime pinger, a manual curl —
 * without leaving it open to the internet.
 */
function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header === `Bearer ${secret}`) return true;
  }
  // Vercel sets this on its own scheduled invocations and strips it from
  // anything arriving from outside.
  return request.headers.get("x-vercel-cron") !== null;
}

type DueConversation = {
  id: string;
  org_id: string;
  contact_id: string;
  bot_flow_id: string | null;
  bot_resume_node_id: string | null;
  bot_variables: Record<string, string> | null;
};

async function resumeOne(
  supabase: ReturnType<typeof createAdminClient>,
  conversation: DueConversation
): Promise<boolean> {
  const [{ data: flow }, { data: contact }, { data: org }] = await Promise.all([
    supabase.from("chatbot_flows").select("*").eq("id", conversation.bot_flow_id!).maybeSingle(),
    supabase.from("contacts").select("wa_id, name").eq("id", conversation.contact_id).maybeSingle(),
    supabase.from("organizations").select("name").eq("id", conversation.org_id).maybeSingle(),
  ]);

  if (!flow || !contact) return false;

  const graph = graphOf(flow as ChatbotFlow);
  const start = findNode(graph, conversation.bot_resume_node_id!);
  // The node was deleted while the conversation waited. Nothing to send.
  if (!start) return false;

  const connection = await loadOrgConnection(supabase, conversation.org_id, {
    conversationId: conversation.id,
  });
  if (!connection) return false;

  const context: FlowContext = {
    supabase,
    connection,
    orgId: conversation.org_id,
    conversationId: conversation.id,
    contactId: conversation.contact_id,
    contactWaId: contact.wa_id,
    contactName: contact.name,
    orgName: org?.name ?? "the business",
    // The delay ended the turn, so there is no new inbound text or tap. A
    // node that interpolates {{...}} still has the variables the run stored.
    inboundText: "",
    buttonId: null,
  };

  const outcome = await runFlow(graph, start, context, conversation.bot_variables ?? {});

  await supabase
    .from("conversations")
    .update({
      bot_flow_id: outcome.parkedAt || outcome.resumeNodeId ? flow.id : null,
      bot_node_id: outcome.parkedAt,
      bot_resume_at: outcome.resumeAt,
      bot_resume_node_id: outcome.resumeNodeId,
    })
    .eq("id", conversation.id);

  // The run is recorded like any other, so a delayed reply shows up in the
  // same audit trail as an immediate one.
  await supabase.from("bot_runs").insert({
    org_id: conversation.org_id,
    conversation_id: conversation.id,
    contact_id: conversation.contact_id,
    matched_kind: "flow_step",
    matched_id: flow.id,
    matched_label: `${flow.name} · resumed after delay`,
    outcome: outcome.error ? "failed" : "replied",
    error: outcome.error,
    reply_text: outcome.lastReply,
  });

  return !outcome.error;
}
