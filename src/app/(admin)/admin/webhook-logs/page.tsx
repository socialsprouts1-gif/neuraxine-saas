import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader, StatCard, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";

export default async function AdminWebhookLogsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data: logs, error } = await supabase
    .from("webhook_logs")
    .select("*, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const all = logs ?? [];
  const rejected = all.filter((l) => !l.signature_valid).length;
  const errored = all.filter((l) => l.error).length;
  const unmatched = all.filter((l) => l.signature_valid && !l.org_id).length;

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Webhook logs"
        subtitle="The last 100 inbound deliveries from Meta, with signature verification results."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Deliveries" value={all.length} />
        <StatCard label="Signature rejected" value={rejected} hint="Failed HMAC check" />
        <StatCard label="Unmatched number" value={unmatched} hint="No waba_connections row" />
        <StatCard label="Processing errors" value={errored} />
      </div>

      {error ? (
        <EmptyState title="Couldn't load webhook logs" description={error.message} />
      ) : all.length > 0 ? (
        <Table head={["Received", "Organization", "Phone number ID", "Event", "Signature", "Error"]}>
          {all.map((l) => (
            <tr key={l.id} className="hover:bg-white/3 transition-colors">
              <Td className="text-xs text-white/50 whitespace-nowrap">
                {new Date(l.created_at).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Td>
              <Td className="whitespace-nowrap">
                {(l.organizations as { name: string } | null)?.name ?? (
                  <span className="text-white/30">unmatched</span>
                )}
              </Td>
              <Td className="font-mono text-[11px] text-white/60">{l.phone_number_id ?? "—"}</Td>
              <Td className="text-xs">{l.event_type ?? "—"}</Td>
              <Td>
                <Badge tone={l.signature_valid ? "green" : "red"}>
                  {l.signature_valid ? "valid" : "rejected"}
                </Badge>
              </Td>
              <Td className="text-xs text-red-400 max-w-xs truncate">{l.error ?? ""}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState
          title="No deliveries yet"
          description="Entries appear here as soon as Meta calls the webhook, including calls that fail signature verification."
        />
      )}
    </div>
  );
}
