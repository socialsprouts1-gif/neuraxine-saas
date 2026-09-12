import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { renameOrganization, createSupportTicket } from "../actions";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { PageHeader, Card, Badge, statusTone } from "@/components/ui/primitives";
import { formatMoney, formatDate } from "@/types/admin";
import { loadEntitlement } from "@/lib/entitlement";
import TeamPanel from "./TeamPanel";

export default async function SettingsPage() {
  const { orgId, orgName, role, user } = await requireOrg();
  const supabase = await createClient();

  const [
    { data: connections },
    { data: members },
    { data: subscription },
    { data: tickets },
    { data: invites },
  ] =
    await Promise.all([
      supabase.from("waba_connections").select("*").eq("org_id", orgId).order("created_at"),
      supabase.from("org_members").select("user_id, role, created_at").eq("org_id", orgId),
      supabase.from("subscriptions").select("*, plans(name, price_cents, currency)").eq("org_id", orgId).maybeSingle(),
      supabase
        .from("support_tickets")
        .select("id, subject, status, priority, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("org_invites")
        .select("id, email, role, expires_at")
        .eq("org_id", orgId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
    ]);

  // Names for the team list. profiles has no declared foreign key to
  // org_members, so PostgREST cannot embed one in the other.
  const memberIds = (members ?? []).map((member) => member.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("user_id, email, full_name").in("user_id", memberIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((row) => [row.user_id, row]));

  const entitlement = await loadEntitlement(supabase, orgId);
  const seatLimit = entitlement.limits.seat_limit;
  const seatsUsed = (members?.length ?? 0) + (invites?.length ?? 0);
  const seatsLeft = seatLimit === null ? null : Math.max(0, seatLimit - seatsUsed);

  const canManage = role === "owner" || role === "admin";
  const plan = subscription?.plans as { name: string; price_cents: number; currency: string } | null | undefined;

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader title="Settings" subtitle="Organization, WhatsApp connection, team and billing." />

      <div className="space-y-6">
        {/* ---------------- WhatsApp connection ---------------- */}
        {/* The connection lives on Integrations now — WhatsApp is the first
            thing you connect, so it belongs with the other connections
            rather than buried in account settings. Two copies of the same
            form would drift, so this is a pointer, not a duplicate. */}
        <Card>
          <h2 className="font-semibold mb-1">WhatsApp connection</h2>
          <p className="text-sm text-white/50 mb-5">
            {connections && connections.length > 0
              ? `${connections.length} number${connections.length === 1 ? "" : "s"} connected. Manage them, and copy the webhook values Meta asks for, on Integrations.`
              : "No number connected yet. Connect one on Integrations to start receiving messages."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/integrations" className="btn-primary text-sm">
              Go to Integrations
            </Link>
            {connections?.map((c) => (
              <Badge key={c.id} tone={statusTone(c.status)}>
                {c.phone_number_id} · {c.status}
              </Badge>
            ))}
          </div>
        </Card>

        {/* ---------------- Organization ---------------- */}
        <Card>
          <h2 className="font-semibold mb-1">Organization</h2>
          <p className="text-sm text-white/50 mb-5">The name shown across the workspace.</p>
          {canManage ? (
            <ActionForm action={renameOrganization} submitLabel="Save name">
              <Field label="Organization name" name="name" required defaultValue={orgName} />
            </ActionForm>
          ) : (
            <p className="text-sm">{orgName}</p>
          )}
        </Card>

        {/* ---------------- Plan ---------------- */}
        <Card>
          <h2 className="font-semibold mb-1">Plan</h2>
          <p className="text-sm text-white/50 mb-5">Your current subscription.</p>
          {subscription ? (
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="text-lg font-semibold">{plan?.name ?? "Custom"}</div>
                <div className="text-sm text-white/50">
                  {plan ? formatMoney(plan.price_cents, plan.currency) : "—"} · renews{" "}
                  {formatDate(subscription.current_period_end)}
                </div>
              </div>
              <Badge tone={statusTone(subscription.status)}>{subscription.status}</Badge>
            </div>
          ) : (
            <p className="text-sm text-white/40">
              No subscription on this organization yet. Platform staff assign plans from the
              admin panel.
            </p>
          )}
        </Card>

        {/* ---------------- Team ---------------- */}
        <Card>
          <TeamPanel
            members={(members ?? []).map((member) => {
              const profile = profileById.get(member.user_id);
              return {
                userId: member.user_id,
                email: profile?.email ?? profile?.full_name ?? null,
                role: member.role,
                isSelf: member.user_id === user.id,
              };
            })}
            invites={(invites ?? []).map((invite) => ({
              id: invite.id,
              email: invite.email,
              role: invite.role,
              expiresAt: invite.expires_at,
            }))}
            canManage={canManage}
            isOwner={role === "owner"}
            seatsLeft={seatsLeft}
            seatLimit={seatLimit}
          />
        </Card>

        {/* ---------------- Support ---------------- */}
        <Card>
          <h2 className="font-semibold mb-1">Support</h2>
          <p className="text-sm text-white/50 mb-5">Raise a ticket with the Neura Chat team.</p>

          <ActionForm action={createSupportTicket} submitLabel="Raise ticket" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Subject" name="subject" required placeholder="Messages not sending" />
              <SelectField
                label="Priority"
                name="priority"
                defaultValue="normal"
                options={[
                  { value: "low", label: "Low" },
                  { value: "normal", label: "Normal" },
                  { value: "high", label: "High" },
                  { value: "urgent", label: "Urgent" },
                ]}
              />
              <TextareaField label="Message" name="body" required rows={4} placeholder="What's happening?" />
            </div>
          </ActionForm>

          {tickets && tickets.length > 0 && (
            <div className="mt-6 pt-5 border-t border-white/8 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2">
                Recent tickets
              </div>
              {tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{t.subject}</span>
                  <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
