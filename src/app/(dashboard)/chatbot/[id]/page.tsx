import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { listConnections, optionLabel } from "@/lib/connections";
import type { FlowEdge, FlowNode } from "@/types/flow";
import FlowBuilder from "./FlowBuilder";
import BuiltBanner from "./BuiltBanner";

export default async function FlowBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // Set when Build with AI has just landed here, carrying anything the
  // generator had to repair.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const built = Array.isArray(query.built) ? query.built[0] : query.built;
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const numbers = (await listConnections(supabase, orgId)).map((connection) => ({
    id: connection.id,
    label: optionLabel(connection),
    status: connection.status,
  }));

  const { data: flow } = await supabase
    .from("chatbot_flows")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!flow) notFound();

  // Flows created by the old single-reply form have a node with no position
  // and no edges. Give that node a position so it renders on the canvas
  // instead of stacking at the origin.
  const nodes: FlowNode[] = (Array.isArray(flow.nodes) ? flow.nodes : []).map(
    (node, index) => {
      const n = node as Partial<FlowNode> & { type?: string; body?: string; buttons?: string[] };
      return {
        id: n.id ?? `node_${index}`,
        kind: n.kind ?? "send_text",
        position: n.position ?? { x: 320 + index * 340, y: 160 },
        data:
          n.data ??
          // Legacy shape: body and buttons sat directly on the node.
          ({
            body: n.body ?? "",
            buttons: (n.buttons ?? []).map((title, i) => ({ id: `btn_${i}`, title })),
          } as Record<string, unknown>),
      };
    }
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-4 flex-shrink-0">
        <Link
          href="/chatbot"
          className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All bots
        </Link>
      </div>

      {built && (
        <BuiltBanner warnings={built === "1" ? [] : built.split("\n").filter(Boolean)} />
      )}
      <div className="flex-1 min-h-0">
        <FlowBuilder
          flowId={flow.id}
          initialName={flow.name}
          initialActive={flow.is_active}
          initialNodes={nodes}
          initialEdges={(Array.isArray(flow.edges) ? flow.edges : []) as FlowEdge[]}
          numbers={numbers}
        />
      </div>
    </div>
  );
}
