import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import StaffBoard from "./StaffBoard";

// The page a waiter keeps open on their phone.
//
// No login, because a waiter is not going to have one, and a shared
// password on the counter iPad is a worse idea than a link that can be
// taken back. The token in the URL carries the authority, the same shape
// as the public invoice page.
//
// It can do exactly one thing: fire an event this workspace has already
// written a rule for. It cannot read a contact, open a conversation, or
// see anything else — so a link left on a phone in a taxi costs the
// business some nuisance messages and nothing more.

export const dynamic = "force-dynamic";

export default async function StaffPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const admin = createAdminClient();

  const { data: link } = await admin
    .from("staff_links")
    .select("id, org_id, name, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!link || link.revoked_at) notFound();

  const [{ data: org }, { data: rules }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", link.org_id).maybeSingle(),
    admin
      .from("event_automations")
      .select("id, name, event_name")
      .eq("org_id", link.org_id)
      .eq("is_active", true)
      .order("name"),
  ]);

  // One button per event, not per rule. Two rules listening for
  // bill.paid are one thing that happened, and a waiter should not be
  // choosing between them.
  const seen = new Map<string, string>();
  for (const rule of rules ?? []) {
    if (!seen.has(rule.event_name)) seen.set(rule.event_name, rule.name);
  }

  const buttons = [...seen.entries()].map(([event, name]) => ({ event, name }));

  return (
    <StaffBoard
      token={token}
      business={org?.name ?? "Your business"}
      linkName={link.name}
      buttons={buttons}
    />
  );
}
