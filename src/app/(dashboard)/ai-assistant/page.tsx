import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { listActiveConnections, optionLabel } from "@/lib/connections";
import { HeroHeader, EmptyState } from "@/components/ui/primitives";
import AssistantTable, { type AssistantRow } from "./AssistantTable";
import type { AiAssistant } from "@/types/portal";

export default async function AiAssistantPage() {
  const { orgId } = await requireFeature("ai_assistant");
  const supabase = await createClient();

  const numbers = (await listActiveConnections(supabase, orgId)).map((connection) => ({
    id: connection.id,
    label: optionLabel(connection),
  }));

  const { data, error } = await supabase
    .from("ai_assistants")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const assistants: AssistantRow[] = ((data ?? []) as AiAssistant[]).map((assistant) => ({
    id: assistant.id,
    name: assistant.name,
    role: assistant.role,
    provider: assistant.provider,
    model: assistant.model,
    is_active: assistant.is_active,
    connection_id: assistant.connection_id,
  }));

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        eyebrow="Intelligence"
        title="AI assistants"
        subtitle="An assistant reads what the customer actually wrote and answers in their language. Give it a persona, a model and the things it is allowed to say."
        scene="agent"
        stats={[
          { label: assistants.length === 1 ? "Assistant" : "Assistants", value: assistants.length },
          { label: "Switched on", value: assistants.filter((row) => row.is_active).length },
          { label: numbers.length === 1 ? "Number" : "Numbers", value: numbers.length },
        ]}
      />

      {error ? (
        <EmptyState
          title="Couldn't load assistants"
          description={`${error.message}. If this mentions a missing column, run the latest migration in supabase/setup.sql.`}
        />
      ) : (
        <AssistantTable assistants={assistants} numbers={numbers} />
      )}
    </div>
  );
}
