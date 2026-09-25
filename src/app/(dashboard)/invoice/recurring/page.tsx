import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { loadInvoiceSettings, readScheduleItems } from "@/lib/invoice-engine";
import { invoiceTotals, todayIn } from "@/lib/invoices";
import { HeroHeader, StatCard } from "@/components/ui/primitives";
import RecurringBrowser, { type ScheduleRow } from "./RecurringBrowser";

// The schedules that raise an invoice again next month.
//
// A schedule holds its lines rather than pointing at a template invoice: a
// retainer whose amount changes should change from the date it changes, not
// retroactively rewrite the invoices already sent.

export default async function RecurringInvoicePage() {
  const { orgId, role } = await requireFeature("invoicing");
  const supabase = await createClient();
  const canManage = role === "owner" || role === "admin";

  const settings = await loadInvoiceSettings(supabase, orgId);
  const today = todayIn(settings.timezone);

  const [schedulesResult, contactsResult] = await Promise.all([
    supabase
      .from("recurring_invoices")
      .select("*")
      .eq("org_id", orgId)
      .order("next_run_on")
      .limit(200),
    supabase
      .from("contacts")
      .select("id, name, wa_id, custom_fields")
      .eq("org_id", orgId)
      .order("name")
      .limit(500),
  ]);

  const migrated = !schedulesResult.error;

  const contactNames = new Map(
    (contactsResult.data ?? []).map((contact) => [
      contact.id,
      contact.name || contact.wa_id,
    ])
  );

  const schedules: ScheduleRow[] = (schedulesResult.data ?? []).map((row) => {
    const lines = readScheduleItems(row.items, settings);
    // What each run will bill, computed here so the card can show it — the
    // alternative is a schedule whose amount nobody knows until it fires.
    const totals = invoiceTotals(lines, {
      interState: false,
      roundToRupee: settings.round_to_rupee,
    });

    return {
      id: row.id,
      title: row.title,
      interval: row.interval,
      nextRunOn: row.next_run_on,
      lastRunOn: row.last_run_on,
      occurrencesLimit: row.occurrences_limit,
      occurrencesDone: row.occurrences_done,
      isActive: row.is_active,
      autoSend: row.auto_send,
      termsDays: row.terms_days,
      notes: row.notes,
      contactId: row.contact_id,
      contactName: row.contact_id ? (contactNames.get(row.contact_id) ?? null) : null,
      estimatedTotalCents: totals.totalCents,
      lines: lines.map((line) => ({
        description: line.description,
        hsnCode: line.hsnCode ?? "",
        quantity: String(line.quantity),
        price: String(line.unitPriceCents / 100),
        tax: String(line.taxPercent),
        discount: String(line.discountPercent ?? 0),
      })),
    };
  });

  const active = schedules.filter((schedule) => schedule.isActive);
  const dueNow = active.filter((schedule) => schedule.nextRunOn <= today);
  const monthly = active.reduce((total, schedule) => {
    // Normalised to a month, so the number means something across a mix of
    // weekly and yearly schedules.
    const perMonth =
      schedule.interval === "weekly"
        ? schedule.estimatedTotalCents * 4.33
        : schedule.interval === "fortnightly"
          ? schedule.estimatedTotalCents * 2.17
          : schedule.interval === "monthly"
            ? schedule.estimatedTotalCents
            : schedule.interval === "quarterly"
              ? schedule.estimatedTotalCents / 3
              : schedule.estimatedTotalCents / 12;
    return total + perMonth;
  }, 0);

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Recurring invoices"
        subtitle="A retainer, a subscription, a rent. Set it once and it raises itself."
      />

      {migrated && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Active" value={active.length} />
          <StatCard label="Due now" value={dueNow.length} />
          <StatCard
            label="Roughly per month"
            value={new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: settings.currency,
              maximumFractionDigits: 0,
            }).format(Math.round(monthly) / 100)}
            hint="Every schedule, normalised"
          />
          <StatCard label="Paused" value={schedules.length - active.length} />
        </div>
      )}

      <RecurringBrowser
        schedules={schedules}
        migrated={migrated}
        migrationError={schedulesResult.error?.message ?? null}
        canManage={canManage}
        today={today}
        contacts={(contactsResult.data ?? []).map((contact) => {
          const custom = (contact.custom_fields ?? {}) as Record<string, string>;
          return {
            id: contact.id,
            label: contact.name || contact.wa_id,
            gstin: custom.gstin ?? custom.GSTIN ?? null,
          };
        })}
        defaultTax={Number(settings.default_tax_percent) || 0}
        defaultTerms={settings.default_terms_days}
        currency={settings.currency}
      />
    </div>
  );
}
