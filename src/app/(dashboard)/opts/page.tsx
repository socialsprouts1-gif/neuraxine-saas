import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { setOptOut } from "../manage-actions";
import ActionForm from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";
import { formatDateTime } from "@/types/admin";

export default async function OptsPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const [{ data: contacts, error }, { count: total }] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, wa_id, name, opted_out, opted_out_at, opt_out_reason")
      .eq("org_id", orgId)
      .order("opted_out", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);

  const all = contacts ?? [];
  const optedOut = all.filter((c) => c.opted_out);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Opts management"
        subtitle="Who has asked not to be messaged. Consent is tracked on its own, not as a tag."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Contacts" value={total ?? 0} />
        <StatCard label="Opted out" value={optedOut.length} />
        <StatCard label="Opted in" value={(total ?? 0) - optedOut.length} />
        <StatCard
          label="Opt-out rate"
          value={total ? `${Math.round((optedOut.length / total) * 100)}%` : "0%"}
        />
      </div>

      <Card className="mb-6">
        <h2 className="font-semibold mb-1">Why this is separate from tags</h2>
        <p className="text-sm text-white/50 leading-relaxed">
          A tag can be removed by accident and nothing notices. An opt-out is a commitment you
          made to a person, and Meta enforces it too — repeated messaging after an opt-out is how
          numbers get restricted. It gets its own column, its own timestamp, and its own screen.
        </p>
      </Card>

      {error ? (
        <EmptyState
          title="Couldn't load contacts"
          description={`${error.message}. If this mentions a missing column, run supabase/setup.sql again.`}
        />
      ) : all.length > 0 ? (
        <Table head={["Contact", "Number", "Status", "Since", "Reason", ""]}>
          {all.map((contact) => (
            <tr key={contact.id} className="hover:bg-white/3 transition-colors">
              <Td className="font-medium">{contact.name || "—"}</Td>
              <Td className="font-mono text-xs text-white/60">{contact.wa_id}</Td>
              <Td>
                <Badge tone={contact.opted_out ? "red" : "green"}>
                  {contact.opted_out ? "opted out" : "opted in"}
                </Badge>
              </Td>
              <Td className="text-white/40 text-xs whitespace-nowrap">
                {contact.opted_out ? formatDateTime(contact.opted_out_at) : "—"}
              </Td>
              <Td className="text-white/45 text-xs">{contact.opt_out_reason ?? "—"}</Td>
              <Td>
                <ActionForm
                  action={setOptOut}
                  submitLabel={contact.opted_out ? "Opt back in" : "Opt out"}
                  compact
                >
                  <input type="hidden" name="id" value={contact.id} />
                  <input type="hidden" name="opted_out" value={String(contact.opted_out)} />
                </ActionForm>
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState
          title="No contacts yet"
          description="Contacts appear here as soon as someone messages your number."
        />
      )}
    </div>
  );
}
