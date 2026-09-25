import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Megaphone, Phone, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { listConnections } from "@/lib/connections";
import { optionLabel } from "@/lib/number-identity";
import {
  updateContactGroup,
  deleteContactGroup,
  addContactsToGroup,
  removeContactFromGroup,
  setGroupMemberRole,
  broadcastToGroup,
} from "../../manage-actions";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { planBroadcast, describePlan, explainSkip } from "@/lib/group-broadcast";
import { readRole, sortMembers, type GroupRole } from "@/lib/group-identity";
import GroupAvatar from "../GroupAvatar";
import IconPicker from "../IconPicker";
import LogoField from "../LogoField";
import ContactPicker from "../ContactPicker";
import BroadcastFields from "../BroadcastFields";

/**
 * One group: who is in it, who speaks for it, and sending to them.
 *
 * Worth saying once here rather than in three tooltips: this is not a
 * WhatsApp group. Meta's Cloud API has no group endpoints — groups exist
 * only in the consumer and Business apps — so what this does is send each
 * member their own message. That is also what a business wants, because a
 * reply comes back as a private conversation rather than to an audience.
 */
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: group }, { data: memberRows }, { data: contacts }, connections, { data: history }] =
    await Promise.all([
      supabase.from("contact_groups").select("*").eq("id", id).eq("org_id", orgId).maybeSingle(),
      supabase
        .from("contact_group_members")
        .select("contact_id, role, contacts(id, name, wa_id, opted_out)")
        .eq("group_id", id)
        .eq("org_id", orgId)
        .limit(500),
      supabase.from("contacts").select("id, name, wa_id").eq("org_id", orgId).order("name").limit(500),
      listConnections(supabase, orgId),
      supabase
        .from("group_broadcasts")
        .select("id, body, sent_count, skipped_count, failed_count, created_at")
        .eq("group_id", id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  if (!group) notFound();

  const rows = memberRows ?? [];
  const memberIds = new Set(rows.map((row) => row.contact_id));
  const active = connections.filter((connection) => connection.status === "active");
  const defaultNumber = group.connection_id ? active.find((c) => c.id === group.connection_id) : null;

  // The window is per conversation, so who can be reached right now is a
  // live question — answered here rather than after a send half-fails.
  const { data: conversations } = memberIds.size
    ? await supabase
        .from("conversations")
        .select("id, contact_id, last_inbound_at")
        .eq("org_id", orgId)
        .in("contact_id", [...memberIds])
    : { data: [] };

  const threadByContact = new Map((conversations ?? []).map((row) => [row.contact_id, row]));

  const members = sortMembers(
    rows.map((row) => {
      const contact = row.contacts as
        | { id: string; name: string | null; wa_id: string; opted_out: boolean | null }
        | null;
      const thread = threadByContact.get(row.contact_id);
      return {
        contactId: row.contact_id,
        role: readRole(row.role) as GroupRole,
        name: contact?.name ?? null,
        waId: contact?.wa_id ?? "",
        optedOut: Boolean(contact?.opted_out),
        conversationId: thread?.id ?? null,
        lastInboundAt: thread?.last_inbound_at ?? null,
      };
    })
  );

  const admins = members.filter((member) => member.role === "admin").length;
  const plan = planBroadcast(members);
  const skipReason = new Map(plan.skipped.map((entry) => [entry.member.contactId, entry.why]));
  const notYetIn = (contacts ?? []).filter((contact) => !memberIds.has(contact.id));

  return (
    <div className="p-6 md:p-8">
      <Link
        href="/groups"
        className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-4 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All groups
      </Link>

      {/* The group's own header rather than the generic PageHeader: with a
          picture and a name side by side it reads as a thing, which is
          what makes a groups screen feel like a groups screen. */}
      <div className="flex items-start gap-4 mb-7">
        <GroupAvatar
          name={group.name}
          colour={group.colour}
          icon={group.icon}
          imageUrl={group.image_url}
          size="lg"
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <h1 className="text-2xl font-semibold tracking-tight truncate">{group.name}</h1>
          <p className="text-sm text-white/45 mt-1">
            {group.description || "A named list of customers."}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Badge tone="grey">
              {members.length} member{members.length === 1 ? "" : "s"}
            </Badge>
            {admins > 0 && <Badge tone="purple">{admins} key contact{admins === 1 ? "" : "s"}</Badge>}
            {defaultNumber ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-white/40">
                <Phone className="w-3 h-3" />
                {optionLabel(defaultNumber)}
              </span>
            ) : (
              <span className="text-[11px] text-white/30">No default number</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="space-y-6 order-2 lg:order-1">
          <Card>
            <div className="flex flex-wrap items-center gap-2.5 mb-1">
              <h2 className="font-semibold">Members</h2>
              <Badge tone="grey">{members.length}</Badge>
            </div>
            <p className="text-sm text-white/45 mb-4 leading-relaxed">{describePlan(plan)}</p>

            {members.length === 0 ? (
              <EmptyState
                title="Nobody in this group yet"
                description="Add contacts on the right, or fill it from a tag on the groups page."
              />
            ) : (
              <ul className="divide-y divide-white/6">
                {members.map((member) => {
                  const why = skipReason.get(member.contactId);
                  const isAdmin = member.role === "admin";

                  return (
                    <li
                      key={member.contactId}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate flex items-center gap-1.5">
                          {isAdmin && (
                            <Star className="w-3 h-3 flex-shrink-0 fill-[#A855F7] text-[#A855F7]" />
                          )}
                          {member.name || member.waId}
                        </div>
                        <div className="text-[11px] text-white/35 tabular-nums">
                          {member.waId}
                          {why && <span className="text-white/30"> · {explainSkip(why)}</span>}
                        </div>
                      </div>

                      {!why && <Badge tone="green">reachable now</Badge>}

                      {/* Promote and demote as the same control, because
                          the state is binary and a dropdown for two values
                          is a dropdown too many. */}
                      <ActionForm
                        action={setGroupMemberRole}
                        submitLabel={isAdmin ? "Unmark" : "Key contact"}
                        compact
                      >
                        <input type="hidden" name="group_id" value={group.id} />
                        <input type="hidden" name="contact_id" value={member.contactId} />
                        <input type="hidden" name="role" value={isAdmin ? "member" : "admin"} />
                      </ActionForm>

                      <ActionForm action={removeContactFromGroup} submitLabel="Remove" compact>
                        <input type="hidden" name="group_id" value={group.id} />
                        <input type="hidden" name="contact_id" value={member.contactId} />
                      </ActionForm>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="text-[11px] text-white/30 mt-4 leading-relaxed">
              A key contact is the person who speaks for the group — the owner in a dealer list,
              the secretary on a committee. They sit at the top here and can be messaged without
              messaging everybody. It is not a WhatsApp group admin; there is no WhatsApp group.
            </p>
          </Card>

          {(history ?? []).length > 0 && (
            <Card>
              <h2 className="font-semibold mb-3">Recently sent</h2>
              <ul className="space-y-3">
                {(history ?? []).map((entry) => (
                  <li key={entry.id} className="text-xs">
                    <div className="text-white/65 leading-relaxed line-clamp-2">{entry.body}</div>
                    <div className="text-[11px] text-white/35 mt-1">
                      {new Date(entry.created_at).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {entry.sent_count} sent
                      {entry.skipped_count > 0 && `, ${entry.skipped_count} skipped`}
                      {entry.failed_count > 0 && `, ${entry.failed_count} failed`}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6 order-1 lg:order-2">
          <Card>
            <h2 className="font-semibold mb-1">Send to this group</h2>
            <p className="text-xs text-white/45 mb-4 leading-relaxed">
              Each member gets their own message — WhatsApp has no group to post into, and a
              private reply is what you want anyway. Anyone who last wrote over 24 hours ago needs
              an approved template, which is what a campaign is for.
            </p>

            {/* When nobody is reachable, the panel used to state the
                rule and stop. "Use a campaign instead" is correct advice
                and was a dead end: it meant leaving for another screen and
                finding this group again in a dropdown. */}
            {members.length > 0 && plan.send.length === 0 && (
              <div className="mb-4 p-3 rounded-xl border border-[#FACC15]/25 bg-[#FACC15]/5">
                <p className="text-xs text-[#FACC15] leading-relaxed mb-2.5">
                  None of these {members.length} can be sent a plain message right now — they last
                  wrote more than 24 hours ago, or have never written. WhatsApp only allows free
                  text inside that window. An approved template reaches them regardless.
                </p>
                <Link
                  href={`/campaigns?group=${group.id}`}
                  className="btn-secondary text-xs inline-flex"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  Send a template to this group
                </Link>
              </div>
            )}

            <ActionForm action={broadcastToGroup} submitLabel="Send now" resetOnSuccess>
              <input type="hidden" name="group_id" value={group.id} />

              <BroadcastFields admins={admins} total={members.length} />

              {active.length > 1 && (
                <SelectField
                  label="Send from"
                  name="connection_id"
                  defaultValue={group.connection_id ?? ""}
                  options={active.map((connection) => ({
                    value: connection.id,
                    label: optionLabel(connection),
                  }))}
                />
              )}

              <TextareaField
                label="Message"
                name="body"
                required
                rows={5}
                placeholder="New stock landed this morning — reply STOCK and I'll send photos."
              />
            </ActionForm>
          </Card>

          <Card>
            <h2 className="font-semibold mb-3">Add contacts</h2>
            {notYetIn.length === 0 ? (
              <p className="text-xs text-white/40 leading-relaxed">
                Every contact in this workspace is already in this group. New contacts can be added
                here the moment they exist.
              </p>
            ) : (
              <ActionForm action={addContactsToGroup} submitLabel="Add to group">
                <input type="hidden" name="group_id" value={group.id} />
                <ContactPicker contacts={notYetIn} />
                <label className="flex items-center gap-2.5 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="role"
                    value="admin"
                    className="accent-[var(--accent)] w-4 h-4"
                  />
                  <span className="text-xs text-white/60">Add these as key contacts</span>
                </label>
              </ActionForm>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold mb-1">Group settings</h2>
            <p className="text-xs text-white/45 mb-4">
              Name, picture and default number. All of it changeable at any time.
            </p>

            <ActionForm action={updateContactGroup} submitLabel="Save">
              <input type="hidden" name="id" value={group.id} />
              <div className="space-y-4">
                <Field label="Name" name="name" required defaultValue={group.name} />
                <Field
                  label="Description"
                  name="description"
                  defaultValue={group.description ?? ""}
                />

                <SelectField
                  label="Colour"
                  name="colour"
                  defaultValue={group.colour}
                  options={[
                    { value: "#00FF87", label: "Green" },
                    { value: "#00D4FF", label: "Cyan" },
                    { value: "#A855F7", label: "Purple" },
                    { value: "#FACC15", label: "Amber" },
                    { value: "#F87171", label: "Red" },
                  ]}
                />

                <IconPicker defaultValue={group.icon} colour={group.colour} groupName={group.name} />

                <LogoField defaultValue={group.image_url} orgId={orgId} colour={group.colour} />

                {active.length > 0 ? (
                  <SelectField
                    label="Default number"
                    name="connection_id"
                    defaultValue={group.connection_id ?? ""}
                    options={[
                      { value: "", label: "No default" },
                      ...active.map((connection) => ({
                        value: connection.id,
                        label: optionLabel(connection),
                      })),
                    ]}
                  />
                ) : (
                  <p className="text-[11px] text-white/35 leading-relaxed">
                    No WhatsApp number is connected yet. Connect one on{" "}
                    <Link href="/numbers" className="text-accent-ink hover:underline">
                      Numbers
                    </Link>{" "}
                    and it can be set as this group&apos;s default.
                  </p>
                )}
              </div>
            </ActionForm>
          </Card>

          <Card className="border-red-500/15">
            <h2 className="font-semibold mb-1">Delete this group</h2>
            <p className="text-xs text-white/45 mb-4 leading-relaxed">
              Removes the list and its send history. The {members.length} contact
              {members.length === 1 ? "" : "s"} in it stay in your workspace, with their
              conversations and tags untouched.
            </p>
            <ActionForm action={deleteContactGroup} submitLabel="Delete group" compact>
              <input type="hidden" name="id" value={group.id} />
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}
