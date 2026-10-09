import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { graphOf, findNode } from "@/lib/flow-engine";
import { runFlow, type FlowContext } from "@/lib/flow-runner";
import { loadOrgConnection } from "@/lib/whatsapp-send";
import type { ChatbotFlow } from "@/types/portal";

// Coming back to a flow that parked on a Delay node.
//
// Extracted from the cron route so the scheduler can call it in process.
// It used to be reachable only over HTTP, which meant the one URL that
// drives every job had to authenticate to itself — and could not run at
// all without a shared secret being set.

// One run should finish inside a serverless invocation, so it takes a
// slice and leaves the rest for the next run rather than timing out on a
// backlog.
const BATCH = 25;

export interface ResumeResult {
  due: number;
  resumed: number;
  skipped: number;
  error?: string;
}

/**
 * Comes back for every flow whose delay has run out.
 *
 * `orgId` narrows it to one workspace, which is what the app's own sweep
 * and the inbound webhook pass. Without it every parked flow in the
 * product is considered, which is what the nightly cron wants.
 */
export async function resumeParkedFlows(orgId?: string): Promise<ResumeResult> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  let pending = supabase
    .from("conversations")
    .select("id, org_id, contact_id, bot_flow_id, bot_resume_node_id, bot_variables, bot_enabled")
    .lte("bot_resume_at", now)
    .not("bot_resume_at", "is", null)
    .not("bot_resume_node_id", "is", null)
    .limit(BATCH);

  if (orgId) pending = pending.eq("org_id", orgId);

  const { data: due, error } = await pending;

  if (error) {
    console.error("Could not read conversations due to resume", error);
    return { due: 0, resumed: 0, skipped: 0, error: error.message };
  }

  let resumed = 0;
  let skipped = 0;

  for (const conversation of due ?? []) {
    // Clear the claim first. A slow send must not let the next run pick the
    // same conversation up and send everything twice.
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

  return { due: due?.length ?? 0, resumed, skipped };
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
