import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { HeroHeader, EmptyState } from "@/components/ui/primitives";
import LeadBoard, { type LeadCard } from "./LeadBoard";
import type { LeadStage } from "@/types/portal";

export default async function LeadBoardPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, wa_id, name, lead_stage, lead_score, deal_value, source")
    .eq("org_id", orgId)
    .order("lead_score", { ascending: false, nullsFirst: false })
    .limit(500);

  // The conversation carries the owner and is what "Open chat" links to.
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, contact_id, assigned_to")
    .eq("org_id", orgId);

  const { data: members } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId);
  const memberIds = (members ?? []).map((member) => member.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", memberIds)
    : { data: [] };

  const leads: LeadCard[] = (contacts ?? []).map((contact) => {
    const conversation = (conversations ?? []).find((row) => row.contact_id === contact.id);
    const profile = (profiles ?? []).find((row) => row.user_id === conversation?.assigned_to);
    return {
      contactId: contact.id,
      conversationId: conversation?.id ?? null,
      name: contact.name || contact.wa_id,
      waId: contact.wa_id,
      stage: (contact.lead_stage ?? "new") as LeadStage,
      score: contact.lead_score,
      owner: profile?.full_name || profile?.email || null,
      dealValue: contact.deal_value,
      source: contact.source,
    };
  });

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Lead board"
        subtitle="Every contact by stage. Drag a card to move it — the same stage the inbox shows."
      />

      {error ? (
        <EmptyState
          title="Couldn't load leads"
          description={`${error.message}. If this mentions a missing column, run the latest migration in supabase/setup.sql.`}
        />
      ) : leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Every contact who messages your WhatsApp number becomes a lead here, starting at New."
        />
      ) : (
        <LeadBoard leads={leads} />
      )}
    </div>
  );
}
