import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { updateTicket } from "../actions";
import ActionForm from "@/components/ui/ActionForm";
import { PageHeader, StatCard, Badge, Table, Td, EmptyState, statusTone } from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";

const PRIORITY_TONE = { urgent: "red", high: "amber", normal: "grey", low: "grey" } as const;

export default async function AdminTicketsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data: tickets, error } = await supabase
    .from("support_tickets")
    .select("*, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  const all = tickets ?? [];
  const counts = {
    open: all.filter((t) => t.status === "open").length,
    pending: all.filter((t) => t.status === "pending").length,
    urgent: all.filter((t) => t.priority === "urgent" && t.status !== "closed").length,
  };

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="Support tickets" subtitle="Raised by tenants from their Settings page." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Open" value={counts.open} />
        <StatCard label="Pending" value={counts.pending} />
        <StatCard label="Urgent" value={counts.urgent} />
        <StatCard label="Total" value={all.length} />
      </div>

      {error ? (
        <EmptyState title="Couldn't load tickets" description={error.message} />
      ) : all.length > 0 ? (
        <Table head={["Subject", "Organization", "Priority", "Status", "Raised", "Update"]}>
          {all.map((t) => {
            const org = t.organizations as { name: string } | null;
            return (
              <tr key={t.id} className="hover:bg-white/3 transition-colors align-top">
                <Td>
                  <div className="font-medium">{t.subject}</div>
                  <div className="text-xs text-white/45 mt-0.5 max-w-md line-clamp-2">{t.body}</div>
                </Td>
                <Td className="whitespace-nowrap">{org?.name ?? "—"}</Td>
                <Td>
                  <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                </Td>
                <Td>
                  <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                </Td>
                <Td className="text-white/40 text-xs whitespace-nowrap">{formatDate(t.created_at)}</Td>
                <Td>
                  <ActionForm action={updateTicket} submitLabel="Update" compact>
                    <input type="hidden" name="id" value={t.id} />
                    <select
                      name="status"
                      defaultValue={t.status}
                      className="bg-white/5 border border-white/12 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#A855F7]/50 mb-2 w-full"
                    >
                      {["open", "pending", "resolved", "closed"].map((s) => (
                        <option key={s} value={s} className="bg-[var(--surface-3)]">
                          {s}
                        </option>
                      ))}
                    </select>
                  </ActionForm>
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <EmptyState
          title="No tickets"
          description="Nothing has been raised yet. Tenants create tickets from Settings → Support."
        />
      )}
    </div>
  );
}
