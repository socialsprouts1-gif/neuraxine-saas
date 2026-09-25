import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { EmptyState } from "@/components/ui/primitives";
import FlowBuilder from "./FlowBuilder";
import { repairScreens, type FormScreen } from "@/lib/flow-json";
import { listActiveConnections, optionLabel } from "@/lib/connections";

export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireFeature("forms");
  const supabase = await createClient();

  const { data: flow } = await supabase
    .from("whatsapp_flows")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!flow) notFound();

  // A Flow belongs to a WhatsApp Business Account, so which number it is
  // built on decides which customers can ever open it.
  const numbers = (await listActiveConnections(supabase, orgId)).map((connection) => ({
    id: connection.id,
    label: optionLabel(connection),
    wabaId: connection.wabaId,
    isDefault: Boolean(connection.isDefault),
  }));

  // Forms saved before screen ids were known to reject digits carry ids
  // Meta refuses on every upload. Repairing on the way in fixes them the
  // next time the author presses Update Flow.
  const screens = repairScreens((flow.screens ?? []) as unknown as FormScreen[]);

  // A form imported from WhatsApp Manager has no editable screens here.
  // Opening it in an empty builder would overwrite the real thing on the
  // first save, so it stays read-only instead.
  if (screens.length === 0 && flow.meta_flow_id) {
    return (
      <div className="p-6 md:p-8">
        <EmptyState
          title={`"${flow.name}" was built in WhatsApp Manager`}
          description="It can be sent from here, but editing it in this builder would replace it with a blank form. Edit it in WhatsApp Manager, or create a new form here."
        />
      </div>
    );
  }

  return (
    <FlowBuilder
      id={flow.id}
      initialName={flow.name}
      initialCategory={flow.categories?.[0] ?? "LEAD_GENERATION"}
      initialScreens={screens}
      initialDescription={flow.description ?? ""}
      initialInvitation={flow.invitation ?? ""}
      initialButtonText={flow.button_text ?? "Open form"}
      status={flow.status}
      previewUrl={flow.preview_url}
      metaFlowId={flow.meta_flow_id}
      numbers={numbers}
      initialConnectionId={flow.connection_id}
      wabaId={flow.waba_id}
    />
  );
}
