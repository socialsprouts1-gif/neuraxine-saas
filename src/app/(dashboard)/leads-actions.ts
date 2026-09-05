"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { LEAD_STAGES, type LeadStage } from "@/types/portal";
import type { ActionResult } from "./actions";

// Leads, meetings and customer transactions. All three read from data the
// inbox already writes — moving a lead here is the same column the inbox's
// stage dropdown sets, so the board and the conversation never disagree.

export async function moveLeadStage(
  contactId: string,
  stage: LeadStage
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  if (!LEAD_STAGES.includes(stage)) return { ok: false, error: "Unknown stage." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ lead_stage: stage, updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/leads/board");
  revalidatePath("/leads/status");
  return { ok: true };
}

export async function setLeadOwner(
  contactId: string,
  userId: string | null
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  // A lead is owned through its conversation, which is where assignment
  // already lives — a second owner column would be a second truth.
  const { error } = await supabase
    .from("conversations")
    .update({ assigned_to: userId })
    .eq("contact_id", contactId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/leads/board");
  return { ok: true };
}

// --- meetings -------------------------------------------------------------

export async function saveMeeting(formData: FormData): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();

  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  if (!title) return { ok: false, error: "Give the meeting a title." };
  if (!startsAt) return { ok: false, error: "Pick a date and time." };

  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "That date is not valid." };

  const duration = Number(formData.get("duration_minutes") ?? 30);
  if (!Number.isFinite(duration) || duration < 5 || duration > 8 * 60) {
    return { ok: false, error: "Duration must be between 5 minutes and 8 hours." };
  }

  const contactId = String(formData.get("contact_id") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.from("meetings").insert({
    org_id: orgId,
    created_by: user.id,
    contact_id: contactId || null,
    title,
    notes: String(formData.get("notes") ?? "").trim() || null,
    location: String(formData.get("location") ?? "").trim() || null,
    starts_at: when.toISOString(),
    duration_minutes: Math.round(duration),
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/meetings");
  return { ok: true, message: "Meeting scheduled." };
}

export async function setMeetingStatus(
  id: string,
  status: "scheduled" | "completed" | "cancelled" | "no_show"
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("meetings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/meetings");
  return { ok: true };
}

export async function deleteMeeting(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("meetings")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/meetings");
  return { ok: true, message: "Meeting removed." };
}

// --- transactions ---------------------------------------------------------

export async function saveTransaction(formData: FormData): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();

  // Typed in rupees, stored in paise. Parsing to an integer here is what
  // keeps every sum on this screen exact.
  const amount = Number(formData.get("amount") ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }

  const occurredAt = String(formData.get("occurred_at") ?? "").trim();
  const when = occurredAt ? new Date(occurredAt) : new Date();
  if (Number.isNaN(when.getTime())) return { ok: false, error: "That date is not valid." };

  const contactId = String(formData.get("contact_id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "in") === "out" ? "out" : "in";

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert({
    org_id: orgId,
    created_by: user.id,
    contact_id: contactId || null,
    amount_cents: Math.round(amount * 100),
    currency: String(formData.get("currency") ?? "INR").trim().toUpperCase() || "INR",
    direction,
    status: (String(formData.get("status") ?? "paid") as "pending" | "paid" | "failed" | "refunded"),
    method: String(formData.get("method") ?? "").trim() || null,
    reference: String(formData.get("reference") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    occurred_at: when.toISOString(),
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/transactions");
  return { ok: true, message: "Transaction recorded." };
}

export async function setTransactionStatus(
  id: string,
  status: "pending" | "paid" | "failed" | "refunded"
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ status })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/transactions");
  return { ok: true };
}

export async function deleteTransaction(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/transactions");
  return { ok: true, message: "Transaction removed." };
}
