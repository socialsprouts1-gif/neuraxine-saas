"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import type { ActionResult } from "./actions";
import type { ContactColumnType } from "@/types/portal";

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

  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_groups")
    .insert({ org_id: orgId, name, description: description || null, colour });

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
