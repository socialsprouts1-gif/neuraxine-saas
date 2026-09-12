import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { isAssistantConfigured } from "@/lib/ai-assistant";
import type { AiAssistant, AssistantKnowledge } from "@/types/portal";
import AssistantEditor from "./AssistantEditor";

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
    .select("id, name, description, status")
    .eq("org_id", orgId)
    .not("meta_flow_id", "is", null)
    .order("name");

  return (
    <AssistantEditor
      assistant={assistant as AiAssistant}
      knowledge={(knowledge ?? []) as AssistantKnowledge[]}
      forms={forms ?? []}
      // Resolved here because it needs the decryption key and the env, and
      // neither may cross to the client.
      hasKey={isAssistantConfigured(assistant as AiAssistant)}
    />
  );
}
