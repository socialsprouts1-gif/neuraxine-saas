import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { isAssistantConfigured } from "@/lib/ai-assistant";
import type { AiAssistant, AssistantKnowledge } from "@/types/portal";
import AssistantEditor from "./AssistantEditor";
import { listConnections } from "@/lib/connections";
import { optionLabel } from "@/lib/number-identity";

export default async function AssistantEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireFeature("ai_assistant");
  const supabase = await createClient();

  const { data: assistant } = await supabase
    .from("ai_assistants")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!assistant) notFound();

  // Org-wide entries and this assistant's own, which is exactly what the
  // runner will send with a reply.
  const { data: knowledge } = await supabase
    .from("assistant_knowledge")
    .select("*")
    .eq("org_id", orgId)
    .or(`assistant_id.is.null,assistant_id.eq.${id}`)
    .order("created_at", { ascending: false });

  // Only forms that exist at Meta. One that has never been uploaded cannot
  // open in a chat, so offering it to the assistant would be offering it a
  // way to fail in front of a customer.
  const { data: forms } = await supabase
    .from("whatsapp_flows")
    .select("id, name, description, status, waba_id")
    .eq("org_id", orgId)
    .not("meta_flow_id", "is", null)
    .order("name");

  // Which number each form is on. The assistant replies on whichever number
  // the customer wrote to, so unlike a bot it is not pinned to one — but a
  // form only opens for customers on its own account, and that is worth
  // saying next to the tick box rather than discovering in a chat.
  const numberFor = new Map(
    (await listConnections(supabase, orgId))
      .filter((connection) => connection.status === "active")
      .map((connection) => [connection.wabaId, optionLabel(connection)])
  );

  return (
    <AssistantEditor
      assistant={assistant as AiAssistant}
      knowledge={(knowledge ?? []) as AssistantKnowledge[]}
      forms={(forms ?? []).map((form) => ({
        id: form.id,
        name: form.name,
        description: form.description,
        status: form.status,
        numberLabel: form.waba_id ? (numberFor.get(form.waba_id) ?? null) : null,
      }))}
      // Resolved here because it needs the decryption key and the env, and
      // neither may cross to the client.
      hasKey={isAssistantConfigured(assistant as AiAssistant)}
    />
  );
}
