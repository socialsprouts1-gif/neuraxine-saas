"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { LEAD_STAGES, type LeadStage } from "@/types/portal";
import type { ActionResult } from "./actions";
import { loadOrgConnection, sendAndLogText } from "@/lib/whatsapp-send";
import { readPlatform, checkLink, confirmationMessage } from "@/lib/meeting-platform";

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
  const { orgId, orgName, user } = await requireOrg();

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
  const connectionId = String(formData.get("connection_id") ?? "").trim();
  const platform = readPlatform(String(formData.get("platform") ?? ""));
  const meetingUrl = String(formData.get("meeting_url") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const tellCustomer = formData.get("notify") !== null;

  // Checked before the row is written. A meeting saved with a Zoom platform
  // and a Google link is one whose confirmation sends the customer to the
  // wrong place, and the confirmation cannot be taken back.
  if (platform) {
    const link = checkLink(platform, meetingUrl);
    if (!link.ok) return { ok: false, error: link.error };
  }

  const supabase = await createClient();
  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      org_id: orgId,
      created_by: user.id,
      contact_id: contactId || null,
      connection_id: connectionId || null,
      title,
      notes: String(formData.get("notes") ?? "").trim() || null,
      location: location || null,
      platform,
      meeting_url: meetingUrl || null,
      starts_at: when.toISOString(),
      duration_minutes: Math.round(duration),
    })
    .select("id")
    .single();

  if (error || !meeting) return { ok: false, error: error?.message ?? "Could not save the meeting." };

  revalidatePath("/meetings");

  if (!tellCustomer || !contactId) {
    return { ok: true, message: "Meeting scheduled." };
  }

  const told = await tellCustomerAboutMeeting(supabase, {
    orgId,
    orgName,
    meetingId: meeting.id,
    contactId,
    connectionId: connectionId || null,
    title,
    when,
    durationMinutes: Math.round(duration),
    platform,
    meetingUrl: meetingUrl || null,
    location: location || null,
  });

  // The meeting is saved either way. A confirmation that could not be sent
  // is worth saying out loud, but it is not a reason to lose the booking.
  return told.ok
    ? { ok: true, message: "Meeting scheduled, and the customer has been told on WhatsApp." }
    : { ok: true, message: `Meeting scheduled. The confirmation did not send: ${told.error}` };
}

/**
 * Sends the customer their confirmation.
 *
 * Free text inside WhatsApp's 24-hour service window, which is what a
 * business booking a meeting with somebody already in conversation has.
 * Outside it this cannot go at all without an approved template, and
 * saying so beats a Meta error nobody sees.
 */
async function tellCustomerAboutMeeting(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    orgId: string;
    orgName: string;
    meetingId: string;
    contactId: string;
    connectionId: string | null;
    title: string;
    when: Date;
    durationMinutes: number;
    platform: ReturnType<typeof readPlatform>;
    meetingUrl: string | null;
    location: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const stamp = async (error: string | null) => {
    await supabase
      .from("meetings")
      .update({
        confirmation_sent_at: error ? null : new Date().toISOString(),
        confirmation_error: error,
      })
      .eq("id", input.meetingId);
  };

  const { data: contact } = await supabase
    .from("contacts")
    .select("wa_id")
    .eq("id", input.contactId)
    .eq("org_id", input.orgId)
    .maybeSingle();

  if (!contact?.wa_id) {
    const error = "that contact has no WhatsApp number.";
    await stamp(error);
    return { ok: false, error };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, last_inbound_at")
    .eq("org_id", input.orgId)
    .eq("contact_id", input.contactId)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation) {
    const error = "there is no WhatsApp conversation with them yet, so a plain message cannot be sent.";
    await stamp(error);
    return { ok: false, error };
  }

  const connection = await loadOrgConnection(supabase, input.orgId, {
    connectionId: input.connectionId,
    conversationId: conversation.id,
  });

  if (!connection) {
    const error = "no active WhatsApp number to send from.";
    await stamp(error);
    return { ok: false, error };
  }

  const body = confirmationMessage({
    businessName: input.orgName,
    title: input.title,
    whenText: input.when.toLocaleString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
    durationMinutes: input.durationMinutes,
    platform: input.platform,
    meetingUrl: input.meetingUrl,
    location: input.location,
  });

  const sent = await sendAndLogText({
    supabase,
    connection,
    conversationId: conversation.id,
    toWaId: contact.wa_id,
    body,
    lastInboundAt: conversation.last_inbound_at,
  });

  if (!sent.ok) {
    const error = sent.error ?? "WhatsApp refused the message.";
    await stamp(error);
    return { ok: false, error };
  }

  await stamp(null);
  return { ok: true };
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
