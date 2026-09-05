import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { listActiveConnections, optionLabel } from "@/lib/connections";
import BotToolbar from "./BotToolbar";
import ChatbotTable, { type BotRow } from "./ChatbotTable";
import { HeroHeader, EmptyState } from "@/components/ui/primitives";
import type { FlowNode } from "@/types/flow";

export default async function ChatbotPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const numbers = (await listActiveConnections(supabase, orgId)).map((connection) => ({
    id: connection.id,
    label: optionLabel(connection),
  }));

  const { data: flows, error } = await supabase
    .from("chatbot_flows")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const rows: BotRow[] = (flows ?? []).map((flow) => ({
    id: flow.id,
    name: flow.name,
    is_active: flow.is_active,
    trigger_type: flow.trigger_type,
    trigger_value: flow.trigger_value,
    nodes: (Array.isArray(flow.nodes) ? flow.nodes : []) as FlowNode[],
    edges: Array.isArray(flow.edges) ? flow.edges : [],
    version: flow.version,
    connection_id: flow.connection_id,
  }));

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Chatbots"
        subtitle="Build and manage conversational chatbot flows."
      />

      <div className="mb-5">
        <BotToolbar />
      </div>

      {error ? (
        <EmptyState
          title="Couldn't load chatbots"
          description={`${error.message}. If this mentions a missing relation or column, run supabase/setup.sql again — the flow builder added columns.`}
        />
      ) : rows.length > 0 ? (
        <ChatbotTable bots={rows} numbers={numbers} />
      ) : (
        <EmptyState
          title="No chatbots yet"
          description="Describe one in plain language and have it built, start from the example, or create an empty one and drag components onto the canvas."
        />
      )}
    </div>
  );
}
