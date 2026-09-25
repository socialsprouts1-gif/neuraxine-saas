import "server-only";
import type { RunnerClient } from "./whatsapp-send";

// Which thread to send a business message into.
//
// A workspace with two WhatsApp numbers has two threads with the same
// person, so `select ... eq(contact_id).maybeSingle()` is wrong twice over:
// PostgREST refuses the row when more than one matches, and the caller then
// reports "there is no conversation with this contact yet" — which is the
// opposite of true. Invoices, payment charges and appointment reminders all
// had that shape.
//
// The most recently active thread is the right default: it is the number the
// customer last used, which is the one they will recognise the reply from.

export interface ContactThread {
  id: string;
  last_inbound_at: string | null;
}

/**
 * The conversation to reach a contact through, or null if they have never
 * written in.
 *
 * `preferId` wins when it is a real thread with this contact — an invoice or
 * an order raised from inside a thread should answer in that same thread
 * even if the customer has since written to another of your numbers.
 */
export async function findContactConversation(
  supabase: RunnerClient,
  orgId: string,
  contactId: string,
  preferId?: string | null
): Promise<ContactThread | null> {
  if (preferId) {
    const { data } = await supabase
      .from("conversations")
      .select("id, last_inbound_at")
      .eq("org_id", orgId)
      .eq("contact_id", contactId)
      .eq("id", preferId)
      .maybeSingle();
    if (data) return data;
  }

  // nullsFirst: false keeps a thread that has never had a message from
  // outranking one that is simply older.
  const { data } = await supabase
    .from("conversations")
    .select("id, last_inbound_at")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}
