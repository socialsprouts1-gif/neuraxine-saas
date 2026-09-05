import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { isAssistantConfigured } from "@/lib/ai-assistant";
import type { AiAssistant, AssistantKnowledge } from "@/types/portal";
import AssistantEditor from "./AssistantEditor";

export default async function AssistantEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireOrg();
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

  return (
    <AssistantEditor
      assistant={assistant as AiAssistant}
      knowledge={(knowledge ?? []) as AssistantKnowledge[]}
      // Resolved here because it needs the decryption key and the env, and
      // neither may cross to the client.
      hasKey={isAssistantConfigured(assistant as AiAssistant)}
    />
  );
}
