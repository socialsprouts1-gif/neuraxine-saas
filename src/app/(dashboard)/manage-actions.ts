"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import type { ActionResult } from "./actions";
import type { ContactColumnType } from "@/types/portal";
import { loadOrgConnection, sendAndLogText } from "@/lib/whatsapp-send";
import { planBroadcast, describePlan, checkBody } from "@/lib/group-broadcast";
import {
  checkIcon,
  checkLogoUrl,
  readRole,
  readAudience,
  describeAudience,
} from "@/lib/group-identity";

// The Manage workspace: saved replies, groups, custom columns, consent.
// Each action re-derives the org from the session rather than trusting the
// form, the same rule as everywhere else.

// --- canned messages -------------------------------------------------------

export async function saveCannedMessage(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  // Normalised so "/Hi", "hi" and " hi " are the same shortcut — the
  // composer matches on what was typed after the slash.
  const shortcut = String(formData.get("shortcut") ?? "")
    .trim()
    .replace(/^\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  if (!title || !body) return { ok: false, error: "Title and message are required." };
  if (!shortcut) return { ok: false, error: "A shortcut is required (letters, numbers, - and _)." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("canned_messages")
    .upsert({ org_id: orgId, shortcut, title, body }, { onConflict: "org_id,shortcut" });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/canned-messages");
  return { ok: true, message: `Saved as /${shortcut}.` };
}

export async function deleteCannedMessage(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("canned_messages")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/canned-messages");
  return { ok: true, message: "Reply deleted." };
}

// --- groups ----------------------------------------------------------------

export async function saveContactGroup(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const colour = String(formData.get("colour") ?? "#00FF87");

  if (!name) return { ok: false, error: "Group name is required." };

  const icon = checkIcon(String(formData.get("icon") ?? ""));
  if (!icon.ok) return { ok: false, error: icon.error };

  const supabase = await createClient();
  const connectionId = String(formData.get("connection_id") ?? "").trim();

  const { error } = await supabase
    .from("contact_groups")
    .insert({
      org_id: orgId,
      name,
      description: description || null,
      colour,
      icon: icon.icon,
      connection_id: connectionId || null,
    });

  if (error) {
    if (error.code === "23505") return { ok: false, error: "A group with that name already exists." };
    return { ok: false, error: error.message };
  }

  revalidatePath("/groups");
  return { ok: true, message: "Group created." };
}

export async function deleteContactGroup(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_groups")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/groups");
  return { ok: true, message: "Group deleted." };
}

/** Renames a group, or changes its picture, colour and default number. */
export async function updateContactGroup(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return { ok: false, error: "No group given." };
  if (!name) return { ok: false, error: "Group name is required." };

  const icon = checkIcon(String(formData.get("icon") ?? ""));
  if (!icon.ok) return { ok: false, error: icon.error };

  const logo = checkLogoUrl(String(formData.get("image_url") ?? ""));
  if (!logo.ok) return { ok: false, error: logo.error };

  const connectionId = String(formData.get("connection_id") ?? "").trim();

  const supabase = await createClient();
  // .select() so a write RLS filtered out is caught. Postgres does not
  // raise on an update that matched no rows, and PostgREST calls that a
  // success — which is how a green "Group updated." can change nothing.
  const { data, error } = await supabase
    .from("contact_groups")
    .update({
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      colour: String(formData.get("colour") ?? "#00FF87"),
      icon: icon.icon,
      image_url: logo.url,
      connection_id: connectionId || null,
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("id");

  if (error) {
    if (error.code === "23505") return { ok: false, error: "A group with that name already exists." };
    if (error.code === "42703") {
      return {
        ok: false,
        error:
          "This database has no icon or logo column yet. Run supabase/updates/run-me-latest.sql in the Supabase SQL editor, then try again.",
      };
    }
    return { ok: false, error: error.message };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: "That group is not in this workspace, so nothing was changed." };
  }

  revalidatePath("/groups");
  revalidatePath(`/groups/${id}`);
  return { ok: true, message: "Group updated." };
}

/**
 * Marks somebody as a key contact for a group, or unmarks them.
 *
 * "Admin" is what people call it, because WhatsApp groups have admins.
 * This is not that — there is no WhatsApp group to administer. It marks
 * the person who speaks for the rest, so they sit at the top of the list
 * and can be messaged without messaging everybody.
 */
export async function setGroupMemberRole(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const groupId = String(formData.get("group_id") ?? "").trim();
  const contactId = String(formData.get("contact_id") ?? "").trim();
  if (!groupId || !contactId) return { ok: false, error: "No membership given." };

  const role = readRole(formData.get("role"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_group_members")
    .update({ role })
    .eq("group_id", groupId)
    .eq("contact_id", contactId)
    .eq("org_id", orgId)
    .select("contact_id");

  if (error) {
    if (error.code === "42703") {
      return {
        ok: false,
        error:
          "This database has no role column on group members yet. Run supabase/updates/run-me-latest.sql in the Supabase SQL editor, then try again.",
      };
    }
    return { ok: false, error: error.message };
  }

  // The table shipped with select, insert and delete policies and no
  // update policy, so this used to report success and change nothing.
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "Nothing changed. If this database has not had supabase/updates/run-me-latest.sql run against it, group members cannot be updated yet.",
    };
  }

  revalidatePath(`/groups/${groupId}`);
  return {
    ok: true,
    message: role === "admin" ? "Marked as a key contact." : "No longer a key contact.",
  };
}

/** Puts named contacts into a group. */
export async function addContactsToGroup(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const groupId = String(formData.get("group_id") ?? "").trim();
  const contactIds = formData.getAll("contact_ids").map((value) => String(value)).filter(Boolean);

  if (!groupId) return { ok: false, error: "No group given." };
  if (contactIds.length === 0) return { ok: false, error: "Pick at least one contact." };

  const supabase = await createClient();

  // Upsert rather than insert: somebody already in the group is not an
  // error, and refusing the whole batch because one of twenty was already
  // there would be a strange way to fail.
  const role = readRole(formData.get("role"));

  const { error } = await supabase.from("contact_group_members").upsert(
    contactIds.map((contactId) => ({
      group_id: groupId,
      contact_id: contactId,
      org_id: orgId,
      role,
    })),
    { onConflict: "group_id,contact_id" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
  return {
    ok: true,
    message:
      role === "admin"
        ? `Added ${contactIds.length} key contact${contactIds.length === 1 ? "" : "s"}.`
        : `Added ${contactIds.length} contact${contactIds.length === 1 ? "" : "s"}.`,
  };
}

/** Takes one out again. The contact itself is untouched. */
export async function removeContactFromGroup(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const groupId = String(formData.get("group_id") ?? "").trim();
  const contactId = String(formData.get("contact_id") ?? "").trim();
  if (!groupId || !contactId) return { ok: false, error: "No membership given." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("contact_id", contactId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
  return { ok: true, message: "Removed from the group. The contact itself is untouched." };
}

/** Adds every contact carrying a tag to a group — the common bulk case. */
export async function fillGroupFromTag(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const groupId = String(formData.get("group_id") ?? "");
  const tag = String(formData.get("tag") ?? "").trim();

  if (!groupId || !tag) return { ok: false, error: "Pick a group and a tag." };

  const supabase = await createClient();
  const { data: contacts, error: readError } = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .contains("tags", [tag]);

  if (readError) return { ok: false, error: readError.message };
  if (!contacts || contacts.length === 0) {
    return { ok: false, error: `No contacts are tagged "${tag}".` };
  }

  const { error } = await supabase.from("contact_group_members").upsert(
    contacts.map((c) => ({ group_id: groupId, contact_id: c.id, org_id: orgId })),
    { onConflict: "group_id,contact_id" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/groups");
  return { ok: true, message: `Added ${contacts.length} contact${contacts.length === 1 ? "" : "s"}.` };
}

// --- custom columns --------------------------------------------------------

export async function saveContactColumn(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const label = String(formData.get("label") ?? "").trim();
  const fieldType = String(formData.get("field_type") ?? "text") as ContactColumnType;
  const options = String(formData.get("options") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (!label) return { ok: false, error: "Column label is required." };
  if (fieldType === "select" && options.length === 0) {
    return { ok: false, error: "A choice column needs at least one option." };
  }

  // The key is derived, not typed: it ends up in {{variables}} and in a
  // jsonb key, and letting people type spaces there produces a field that
  // silently never interpolates.
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  if (!key) return { ok: false, error: "That label produces an empty key — use letters or numbers." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_columns")
    .upsert({ org_id: orgId, key, label, field_type: fieldType, options }, { onConflict: "org_id,key" });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/columns");
  return { ok: true, message: `Saved. Use it as {{${key}}}.` };
}

export async function deleteContactColumn(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_columns")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/columns");
  return {
    ok: true,
    // Values already written onto contacts are left alone deliberately:
    // deleting a column definition should not destroy collected data.
    message: "Column removed. Values already saved on contacts are kept.",
  };
}

// --- consent ---------------------------------------------------------------

export async function setOptOut(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "");
  const optOut = String(formData.get("opted_out") ?? "") !== "true";
  const reason = String(formData.get("reason") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({
      opted_out: optOut,
      opted_out_at: optOut ? new Date().toISOString() : null,
      opt_out_reason: optOut ? reason || "Marked by an agent" : null,
    })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/opts");
  revalidatePath("/contacts");
  return { ok: true, message: optOut ? "Contact opted out." : "Contact opted back in." };
}

/**
 * Sends one message to every member of a group.
 *
 * Not a post into a WhatsApp group — no such thing exists on Meta's Cloud
 * API. Each person receives their own message, which is what a business
 * wants anyway: a reply comes back as a private conversation rather than
 * to an audience.
 *
 * Who can be reached is worked out before anything is sent, so the answer
 * is "14 of 20, and here is why the other six were not" rather than
 * fourteen sends followed by six errors.
 */
export async function broadcastToGroup(formData: FormData): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();

  const groupId = String(formData.get("group_id") ?? "").trim();
  if (!groupId) return { ok: false, error: "No group given." };

  const checked = checkBody(String(formData.get("body") ?? ""));
  if (!checked.ok) return { ok: false, error: checked.error };

  const connectionId = String(formData.get("connection_id") ?? "").trim();
  const audience = readAudience(formData.get("audience"));
  const supabase = await createClient();

  const { data: allRows, error: readError } = await supabase
    .from("contact_group_members")
    .select("contact_id, role, contacts(id, name, wa_id, opted_out)")
    .eq("group_id", groupId)
    .eq("org_id", orgId)
    .limit(500);

  if (readError) return { ok: false, error: readError.message };
  if (!allRows || allRows.length === 0) {
    return { ok: false, error: "This group has no contacts in it yet." };
  }

  // Narrowed before anything else happens, so "key contacts only" over a
  // group with none says so rather than quietly sending to nobody.
  const rows =
    audience === "admins" ? allRows.filter((row) => readRole(row.role) === "admin") : allRows;

  if (rows.length === 0) {
    return { ok: false, error: describeAudience(audience, 0, allRows.length) };
  }

  const contactIds = rows.map((row) => row.contact_id);

  // One query for the whole group rather than one per member: a group of
  // two hundred would otherwise be two hundred round trips before a single
  // message goes out.
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, contact_id, last_inbound_at")
    .eq("org_id", orgId)
    .in("contact_id", contactIds);

  const threadByContact = new Map(
    (conversations ?? []).map((row) => [row.contact_id, row])
  );

  const members = rows.map((row) => {
    const contact = row.contacts as
      | { id: string; name: string | null; wa_id: string; opted_out: boolean | null }
      | null;
    const thread = threadByContact.get(row.contact_id);
    return {
      contactId: row.contact_id,
      name: contact?.name ?? null,
      waId: contact?.wa_id ?? "",
      optedOut: Boolean(contact?.opted_out),
      conversationId: thread?.id ?? null,
      lastInboundAt: thread?.last_inbound_at ?? null,
    };
  });

  const plan = planBroadcast(members);

  if (plan.send.length === 0) {
    return { ok: false, error: describePlan(plan) };
  }

  let sent = 0;
  let failed = 0;

  for (const member of plan.send) {
    const connection = await loadOrgConnection(supabase, orgId, {
      connectionId: connectionId || null,
      conversationId: member.conversationId,
    });

    if (!connection) {
      failed += 1;
      continue;
    }

    const outcome = await sendAndLogText({
      supabase,
      connection,
      conversationId: member.conversationId!,
      toWaId: member.waId,
      body: checked.body,
      lastInboundAt: member.lastInboundAt,
    });

    if (outcome.ok) sent += 1;
    else failed += 1;
  }

  // Recorded so a second look answers "did I already send this" without
  // counting rows in the message log.
  await supabase.from("group_broadcasts").insert({
    org_id: orgId,
    group_id: groupId,
    connection_id: connectionId || null,
    body: checked.body,
    sent_count: sent,
    skipped_count: plan.skipped.length,
    failed_count: failed,
    created_by: user.id,
  });

  revalidatePath(`/groups/${groupId}`);

  const parts = [`Sent to ${sent}.`];
  if (plan.skipped.length > 0) parts.push(describePlan(plan));
  if (failed > 0) parts.push(`${failed} failed — check the inbox for what WhatsApp said.`);

  return { ok: true, message: parts.join(" ") };
}
