import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { loadInvoiceSettings } from "@/lib/invoice-engine";
import { HeroHeader } from "@/components/ui/primitives";
import InvoiceSettingsForm from "./InvoiceSettingsForm";

// Who is issuing, and how the numbers run.
//
// First of the three Invoice screens because nothing else works without it:
// an invoice with no business name and no GSTIN is not a document anybody
// can file.

export default async function InvoiceSettingsPage() {
  const { orgId, role } = await requireFeature("invoicing");
  const supabase = await createClient();
  const canManage = role === "owner" || role === "admin";

  const settings = await loadInvoiceSettings(supabase, orgId);

  // The settings loader falls back to defaults, which is right for issuing
  // but hides a missing table from the person who has to run the migration.
  const probe = await supabase
    .from("invoice_settings")
    .select("org_id", { head: true, count: "exact" })
    .eq("org_id", orgId);

  const issued = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .not("number", "is", null);

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Invoice settings"
        subtitle="The business as it appears on the document, and how the numbers run."
      />

      <InvoiceSettingsForm
        settings={settings}
        canManage={canManage}
        migrated={!probe.error}
        migrationError={probe.error?.message ?? null}
        issuedCount={issued.error ? 0 : (issued.count ?? 0)}
      />
    </div>
  );
}
