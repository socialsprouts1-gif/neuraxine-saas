import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { createContact, deleteContact, importContacts } from "../actions";
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

        {/* One grid cell holding both panels. Two separate children would
            make a third column on large screens and push the list out of
            shape. */}
        <div className="space-y-6 order-1 lg:order-2">
        <Card>
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

        {/* Importing a list.
            Below the single-contact form rather than above it, because
            somebody adding one person is in a hurry and somebody with a
            spreadsheet is not. */}
        <Card>
          <h2 className="font-semibold mb-1">Import from CSV</h2>
          <p className="text-sm text-white/50 mb-5">
            A file from your phone, your old system or a spreadsheet. The first column should
            hold the WhatsApp number; a <span className="text-white/70">Name</span> and{" "}
            <span className="text-white/70">Tags</span> column are used if they are there.
          </p>

          <ActionForm action={importContacts} submitLabel="Import contacts" resetOnSuccess>
            <div className="space-y-4">
              <label className="block">
                <span className="block text-xs font-medium text-white/70 mb-1.5">CSV file</span>
                <input
                  name="file"
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="w-full text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-white/15"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-medium text-white/70 mb-1.5">
                  Or paste the rows
                </span>
                <textarea
                  name="pasted"
                  rows={4}
                  placeholder={"919876543210,Priya Sharma,vip\n919812345678,Rahul Verma,lead"}
                  className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 font-mono focus:outline-none focus:border-accent/50"
                />
                <span className="block text-xs text-white/40 mt-1.5">
                  Copy the columns straight out of a spreadsheet. Used only when no file is chosen.
                </span>
              </label>

              {/* The single most common way an import goes silently wrong:
                  a list exported from a phone holds ten-digit numbers, and
                  ten digits is not a WhatsApp address. */}
              <Field
                label="Country code for local numbers"
                name="country_code"
                defaultValue="91"
                placeholder="91"
                hint="Added only to numbers that have none. Leave blank if your file already includes it."
              />

              <Field
                label="Tag every imported contact"
                name="import_tag"
                placeholder="imported-november"
                hint="Optional, but it makes the batch easy to find and message later."
              />
            </div>
          </ActionForm>
        </Card>
        </div>
      </div>
    </div>
  );
}
