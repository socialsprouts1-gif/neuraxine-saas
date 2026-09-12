import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui/primitives";

export default async function TagsPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("tags, opted_out")
    .eq("org_id", orgId)
    .limit(2000);

  // Tags have no table of their own: they live on the contact, so the list
  // is derived. A tag with no contacts on it does not exist, which is the
  // behaviour you want — no orphaned labels to tidy up later.
  const counts = new Map<string, number>();
  for (const contact of contacts ?? []) {
    for (const tag of contact.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const tagged = (contacts ?? []).filter((c) => (c.tags ?? []).length > 0).length;
  const busiest = tags[0]?.[1] ?? 0;

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Tags"
        subtitle="Every label in use across your contacts, and how many carry it."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Distinct tags" value={tags.length} />
        <StatCard label="Tagged contacts" value={tagged} />
        <StatCard label="Untagged" value={(contacts?.length ?? 0) - tagged} />
        <StatCard label="Largest tag" value={busiest} />
      </div>

      {error ? (
        <EmptyState
          title="Couldn't load tags"
          description={`${error.message}. If this mentions a missing column, run supabase/setup.sql again.`}
        />
      ) : tags.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tags.map(([tag, count]) => (
            <Card key={tag} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{tag}</div>
                <div className="text-[11px] text-white/35 mt-0.5">
                  {count} contact{count === 1 ? "" : "s"}
                  {busiest > 0 && ` · ${Math.round((count / busiest) * 100)}% of the largest`}
                </div>
              </div>
              <div
                className="h-1.5 rounded-full bg-accent/60 flex-shrink-0"
                style={{ width: `${Math.max(8, Math.round((count / Math.max(busiest, 1)) * 80))}px` }}
              />
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No tags in use"
          description="Add tags when you create a contact, or have a chatbot's Update Tag node apply them automatically."
          action={
            <Link href="/contacts" className="btn-primary text-sm">
              Go to Contacts
            </Link>
          }
        />
      )}

      <Card className="mt-6">
        <h2 className="font-semibold mb-1">Where tags come from</h2>
        <p className="text-sm text-white/50 leading-relaxed">
          Tags are set by hand on the Contacts screen, or automatically by a chatbot&apos;s{" "}
          <strong className="text-white/75">Update Tag</strong> node — so a flow can label someone
          who asked about pricing without anyone typing it. Use them to fill a group, or to target
          a campaign.
        </p>
      </Card>
    </div>
  );
}
