import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { createContact, deleteContact } from "../actions";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { PageHeader, Card, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { orgId } = await requireOrg();
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select("id, wa_id, name, tags, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  // Match on either the display name or the number, so a partial phone
  // number finds a contact whose name was never captured.
  if (q) query = query.or(`name.ilike.%${q}%,wa_id.ilike.%${q}%`);

  const { data: contacts, error } = await query;

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Contacts"
        subtitle={`${contacts?.length ?? 0} contact${contacts?.length === 1 ? "" : "s"} in this organization.`}
      />

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-4 order-2 lg:order-1">
          <form method="get" className="flex gap-2">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by name or number…"
              className="flex-1 bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
            />
            <button type="submit" className="btn-secondary text-sm py-2.5">
              Search
            </button>
            {q && (
              <Link href="/contacts" className="btn-secondary text-sm py-2.5">
                Clear
              </Link>
            )}
          </form>

          {error ? (
            <EmptyState
              title="Couldn't load contacts"
              description={`${error.message}. If this mentions a missing relation, the database migrations haven't been applied yet.`}
            />
          ) : contacts && contacts.length > 0 ? (
            <Table head={["Name", "WhatsApp number", "Tags", "Added", ""]}>
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-white/3 transition-colors">
                  <Td className="font-medium">{c.name || <span className="text-white/30">—</span>}</Td>
                  <Td className="font-mono text-xs text-white/70">{c.wa_id}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.length > 0 ? (
                        c.tags.map((t) => (
                          <Badge key={t} tone="blue">
                            {t}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-white/40 text-xs whitespace-nowrap">{formatDate(c.created_at)}</Td>
                  <Td>
                    <ActionForm action={deleteContact} submitLabel="Delete" compact>
                      <input type="hidden" name="id" value={c.id} />
                    </ActionForm>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState
              title={q ? "No matches" : "No contacts yet"}
              description={
                q
                  ? "No contact matches that search. Try a different name or number."
                  : "Add your first contact, or let one be created automatically when someone messages your WhatsApp number."
              }
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">Add contact</h2>
          <p className="text-sm text-white/50 mb-5">Numbers must include the country code.</p>
          <ActionForm action={createContact} submitLabel="Add contact" resetOnSuccess>
            <div className="space-y-4">
              <Field
                label="WhatsApp number"
                name="wa_id"
                required
                placeholder="919876543210"
                hint="Digits only, with country code"
              />
              <Field label="Name" name="name" placeholder="Priya Sharma" />
              <Field label="Tags" name="tags" placeholder="lead, mumbai" hint="Comma separated" />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
