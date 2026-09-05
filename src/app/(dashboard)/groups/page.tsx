import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { saveContactGroup, deleteContactGroup, fillGroupFromTag } from "../manage-actions";
import ActionForm, { Field, SelectField } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui/primitives";

export default async function GroupsPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const [{ data: groups, error }, { data: members }, { data: contacts }] = await Promise.all([
    supabase.from("contact_groups").select("*").eq("org_id", orgId).order("name"),
    supabase.from("contact_group_members").select("group_id").eq("org_id", orgId),
    supabase.from("contacts").select("tags").eq("org_id", orgId).limit(500),
  ]);

  const all = groups ?? [];
  const counts = new Map<string, number>();
  for (const m of members ?? []) counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);

  // Tags are the fastest way to fill a group, so offer the ones that exist
  // rather than making people remember them.
  const tags = [...new Set((contacts ?? []).flatMap((c) => c.tags ?? []))].sort();

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Groups"
        subtitle="Named segments of contacts you can target with a campaign."
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Groups" value={all.length} />
        <StatCard label="Memberships" value={members?.length ?? 0} />
        <StatCard label="Tags available" value={tags.length} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="order-2 lg:order-1 space-y-3">
          {error ? (
            <EmptyState
              title="Couldn't load groups"
              description={`${error.message}. If this mentions a missing relation, run supabase/setup.sql again.`}
            />
          ) : all.length > 0 ? (
            all.map((group) => (
              <Card key={group.id}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex items-start gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: group.colour }}
                    />
                    <div className="min-w-0">
                      <div className="font-medium">{group.name}</div>
                      {group.description && (
                        <p className="text-sm text-white/45 mt-0.5">{group.description}</p>
                      )}
                      <div className="text-[11px] text-white/35 mt-1">
                        {counts.get(group.id) ?? 0} contact{(counts.get(group.id) ?? 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <ActionForm action={deleteContactGroup} submitLabel="Delete" compact>
                    <input type="hidden" name="id" value={group.id} />
                  </ActionForm>
                </div>

                {tags.length > 0 && (
                  <ActionForm action={fillGroupFromTag} submitLabel="Add from tag" compact>
                    <input type="hidden" name="group_id" value={group.id} />
                    <SelectField
                      label=""
                      name="tag"
                      options={tags.map((t) => ({ value: t, label: t }))}
                    />
                  </ActionForm>
                )}
              </Card>
            ))
          ) : (
            <EmptyState
              title="No groups yet"
              description="Create a group, then fill it from a tag or add contacts one by one."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">New group</h2>
          <p className="text-sm text-white/50 mb-5">Groups are static — a contact stays until removed.</p>
          <ActionForm action={saveContactGroup} submitLabel="Create group" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Name" name="name" required placeholder="Wholesale buyers" />
              <Field label="Description" name="description" placeholder="Bulk order customers" />
              <SelectField
                label="Colour"
                name="colour"
                defaultValue="#00FF87"
                options={[
                  { value: "#00FF87", label: "Green" },
                  { value: "#00D4FF", label: "Cyan" },
                  { value: "#A855F7", label: "Purple" },
                  { value: "#FACC15", label: "Amber" },
                  { value: "#F87171", label: "Red" },
                ]}
              />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
