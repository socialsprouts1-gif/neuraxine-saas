import Link from "next/link";
import { ChevronRight, Phone, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { saveContactGroup, fillGroupFromTag } from "../manage-actions";
import { listConnections } from "@/lib/connections";
import { optionLabel } from "@/lib/number-identity";
import ActionForm, { Field, SelectField } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, EmptyState, Badge } from "@/components/ui/primitives";
import { readRole } from "@/lib/group-identity";
import GroupAvatar from "./GroupAvatar";
import IconPicker from "./IconPicker";

export default async function GroupsPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const [{ data: groups, error }, { data: members }, { data: contacts }, connections] =
    await Promise.all([
      supabase.from("contact_groups").select("*").eq("org_id", orgId).order("name"),
      supabase.from("contact_group_members").select("group_id, role").eq("org_id", orgId),
      supabase.from("contacts").select("tags").eq("org_id", orgId).limit(500),
      listConnections(supabase, orgId),
    ]);

  const active = connections.filter((connection) => connection.status === "active");
  const numberLabel = new Map(active.map((connection) => [connection.id, optionLabel(connection)]));

  const all = groups ?? [];

  // Counted once here rather than filtered per card: a workspace with
  // forty groups would otherwise walk the membership list forty times.
  const counts = new Map<string, { total: number; admins: number }>();
  for (const row of members ?? []) {
    const tally = counts.get(row.group_id) ?? { total: 0, admins: 0 };
    tally.total += 1;
    if (readRole(row.role) === "admin") tally.admins += 1;
    counts.set(row.group_id, tally);
  }

  // Tags are the fastest way to fill a group, so offer the ones that exist
  // rather than making people remember them.
  const tags = [...new Set((contacts ?? []).flatMap((c) => c.tags ?? []))].sort();
  const admins = [...counts.values()].reduce((sum, tally) => sum + tally.admins, 0);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Groups"
        subtitle="Named lists of customers. Each member gets their own message."
      />

      {/* Said once, here, rather than in three tooltips. People reasonably
          expect a "group" to become a WhatsApp group, and it cannot: Meta's
          Cloud API has no group endpoints at all. */}
      <Card className="mb-6 border-white/10">
        <p className="text-sm text-white/55 leading-relaxed">
          <span className="text-white/80">
            These are not WhatsApp groups, and nothing here will appear as a group on your phone.
          </span>{" "}
          Meta&apos;s Cloud API has no way to create one or post into one — groups exist only in
          the WhatsApp app itself, and every tool that claims otherwise is driving an unofficial
          library that gets numbers banned. A group here is a named list of customers, and sending
          to it delivers a separate message to each person. That is usually what you want anyway:
          replies come back as private conversations, nobody sees anybody else&apos;s number, and
          one member cannot mute it for everyone.
        </p>

        {/* Saying only what a group is not leaves the obvious question
            unanswered, and somebody who cannot send to one reasonably
            concludes the whole screen is pointless. */}
        <div className="mt-4 pt-4 border-t border-white/8">
          <p className="text-xs font-medium text-white/70 mb-2">What a group is for</p>
          <ul className="text-sm text-white/50 leading-relaxed space-y-1.5 list-disc pl-4">
            <li>
              <span className="text-white/70">As a campaign audience.</span> This is the main one.
              Pick a group in{" "}
              <Link href="/campaigns" className="text-accent-ink hover:underline">
                Campaigns
              </Link>{" "}
              and an approved template goes to everyone in it — which works whether or not they
              have written to you recently.
            </li>
            <li>
              <span className="text-white/70">For a quick note to people already talking to you.</span>{" "}
              Plain text only reaches someone who wrote within the last 24 hours. That is
              WhatsApp&apos;s rule, not ours, and the group page says who qualifies before you
              send.
            </li>
            <li>
              <span className="text-white/70">To keep a list straight.</span> Key contacts, a
              default number, and a record of what was last sent to them.
            </li>
          </ul>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Groups" value={all.length} />
        <StatCard label="Memberships" value={members?.length ?? 0} />
        <StatCard label="Key contacts" value={admins} />
        <StatCard label="Tags available" value={tags.length} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="order-2 lg:order-1 space-y-3">
          {error ? (
            <EmptyState
              title="Couldn't load groups"
              description={`${error.message}. If this mentions a missing relation or column, run supabase/updates/run-me-latest.sql in the Supabase SQL editor.`}
            />
          ) : all.length > 0 ? (
            all.map((group) => {
              const tally = counts.get(group.id) ?? { total: 0, admins: 0 };
              const from = group.connection_id ? numberLabel.get(group.connection_id) : null;

              return (
                <Card key={group.id} className="hover:border-white/15 transition-colors">
                  <div className="flex items-start gap-3.5">
                    <GroupAvatar
                      name={group.name}
                      colour={group.colour}
                      icon={group.icon}
                      imageUrl={group.image_url}
                    />

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/groups/${group.id}`}
                        className="font-medium hover:text-accent-ink transition-colors inline-flex items-center gap-1 group/link"
                      >
                        {group.name}
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover/link:opacity-60 transition-opacity" />
                      </Link>

                      {group.description && (
                        <p className="text-sm text-white/45 mt-0.5 line-clamp-1">
                          {group.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-white/35">
                        <span className="tabular-nums">
                          {tally.total} contact{tally.total === 1 ? "" : "s"}
                        </span>
                        {tally.admins > 0 && (
                          <span className="inline-flex items-center gap-1 text-white/50">
                            <Star className="w-3 h-3 fill-current" />
                            {tally.admins} key contact{tally.admins === 1 ? "" : "s"}
                          </span>
                        )}
                        {from && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {from}
                          </span>
                        )}
                      </div>
                    </div>

                    <Link
                      href={`/groups/${group.id}`}
                      className="btn-secondary text-xs flex-shrink-0 hidden sm:inline-flex"
                    >
                      Open
                    </Link>
                  </div>

                  {tags.length > 0 && (
                    <div className="mt-3.5 pt-3.5 border-t border-white/6">
                      <ActionForm action={fillGroupFromTag} submitLabel="Add from tag" compact>
                        <input type="hidden" name="group_id" value={group.id} />
                        <SelectField
                          label=""
                          name="tag"
                          options={tags.map((t) => ({ value: t, label: t }))}
                        />
                      </ActionForm>
                    </div>
                  )}
                </Card>
              );
            })
          ) : (
            <EmptyState
              title="No groups yet"
              description="Create one on the right, then fill it from a tag or add contacts by hand."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">New group</h2>
          <p className="text-sm text-white/50 mb-5">
            Groups are static — a contact stays in until you take them out. Everything here can be
            changed later.
          </p>

          <ActionForm action={saveContactGroup} submitLabel="Create group" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Name" name="name" required placeholder="Wholesale buyers" />
              <Field label="Description" name="description" placeholder="Bulk order customers" />

              {/* Which number, asked at creation rather than found later
                  in a settings panel — it is the first thing anybody
                  running two numbers wants to say about a group. */}
              {active.length > 0 && (
                <SelectField
                  label="Usually messaged from"
                  name="connection_id"
                  defaultValue={active.length === 1 ? active[0].id : ""}
                  options={[
                    { value: "", label: "No default" },
                    ...active.map((connection) => ({
                      value: connection.id,
                      label: optionLabel(connection),
                    })),
                  ]}
                />
              )}

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

              <IconPicker colour="#00FF87" groupName="" />
            </div>
          </ActionForm>

          {active.length === 0 && (
            <p className="text-[11px] text-white/35 mt-4 leading-relaxed">
              No WhatsApp number is connected yet, so there is nothing to pick. Connect one on{" "}
              <Link href="/numbers" className="text-accent-ink hover:underline">
                Numbers
              </Link>{" "}
              and it will appear here.
            </p>
          )}
        </Card>
      </div>

      {all.length > 0 && (
        <p className="text-[11px] text-white/30 mt-6">
          Open a group to change its picture, add or remove people, mark key contacts, or send to
          it. <Badge tone="grey">Deleting</Badge> a group is on its own page too — it only removes
          the list, never the contacts.
        </p>
      )}
    </div>
  );
}
