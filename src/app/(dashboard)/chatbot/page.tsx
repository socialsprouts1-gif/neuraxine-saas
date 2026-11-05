import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { listActiveConnections, optionLabel } from "@/lib/connections";
import BotToolbar from "./BotToolbar";
import ChatbotTable, { type BotRow } from "./ChatbotTable";
import { HeroHeader, EmptyState } from "@/components/ui/primitives";
import type { FlowNode } from "@/types/flow";

// Build with AI is a Server Action invoked from this page, and a Server
// Action inherits its time limit from the page it is called on. The default
// is ten seconds, which is not long enough to write a whole bot — the
// function was being killed mid-generation, which is why pressing the
// button two or three times in a row produced nothing each time.
export const maxDuration = 120;

export default async function ChatbotPage() {
  const { orgId } = await requireFeature("chatbot");
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
      {/* The counts belong up here rather than being arrived at by
          scanning the table: "six bots" and "six bots, one of them
          switched on" are different situations, and the second one is
          the reason somebody says the automation is not replying. */}
      <HeroHeader
        eyebrow="Automation"
        title="Chatbots"
        subtitle="A flow answers on its own — a keyword arrives, it runs, it replies. Build one by describing it, or drag the steps onto a canvas."
        scene="flow"
        stats={[
          { label: rows.length === 1 ? "Flow" : "Flows", value: rows.length },
          { label: "Switched on", value: rows.filter((row) => row.is_active).length },
          { label: numbers.length === 1 ? "Number" : "Numbers", value: numbers.length },
        ]}
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
