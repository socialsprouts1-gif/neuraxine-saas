import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/primitives";
import ActionForm from "@/components/ui/ActionForm";
import TemplateEditor, { type TemplateRow } from "../_components/TemplateEditor";
import { saveEmailAutomation } from "../actions";
import { AUTOMATIC_KINDS, readSwitches } from "@/lib/email-automation";
import Link from "next/link";
import { Mail, Send } from "lucide-react";

// What the product says, and whether it says it at all.
//
// Every email was a function in the source, which is right for a payment
// receipt and wrong for a trial follow-up: the wording of a follow-up is
// a marketing decision, and the person making it cannot deploy. So the
// wording is editable, and each automatic message can be switched off.
//
// Nothing is copied at save time. An override is one row, and deleting it
// puts the built-in wording back — which means the default can never be
// lost by editing, and "reset" is just a delete.

export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  const [{ data: setting }, { data: templates, error }] = await Promise.all([
    admin.from("platform_settings").select("value").eq("key", "email_automation").maybeSingle(),
    admin.from("email_templates").select("*").order("name"),
  ]);

  const switches = readSwitches(setting?.value);
  const rows = (templates ?? []) as TemplateRow[];
  const overrides = new Map(
    rows.filter((row) => row.overrides_kind).map((row) => [row.overrides_kind!, row])
  );
  const library = rows.filter((row) => !row.overrides_kind);

  // A missing table is the one error worth explaining rather than
  // printing: it means the migration has not been run, and every other
  // symptom on this screen follows from that.
  const needsMigration = error?.code === "42P01";

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Email templates"
        subtitle="What each message says, and which of them send at all."
        action={
          <Link href="/admin/email-send" className="btn-quiet text-sm">
            <Send className="w-4 h-4" />
            Send one now
          </Link>
        }
      />

      {needsMigration && (
        <Card className="mb-6 border-[#FACC15]/25">
          <h2 className="font-semibold mb-1">The tables are not there yet</h2>
          <p className="text-sm text-white/55 leading-relaxed">
            Run <code className="text-white/75">supabase/updates/run-me-latest.sql</code> in the
            Supabase SQL editor. Until then the product sends the wording built into it, which is
            what it has always done — nothing is broken, it just cannot be changed from here.
          </p>
        </Card>
      )}

      {/* --- the automatic messages ------------------------------------- */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-1">Messages that send themselves</h2>
        <p className="text-sm text-white/50 mb-5 leading-relaxed">
          Untick one and it stops going out — to everybody, from the next send on. Rewrite one and
          your words replace the built-in message; delete your version and the original comes
          back.
        </p>

        <ActionForm action={saveEmailAutomation} submitLabel="Save what sends">
          <div className="divide-y divide-white/6">
            {AUTOMATIC_KINDS.map((row) => {
              const mine = overrides.get(row.kind);
              return (
                <div
                  key={row.kind}
                  className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3.5 first:pt-0"
                >
                  <label className="flex items-start gap-3 cursor-pointer min-w-0 flex-1">
                    <input
                      type="checkbox"
                      name="on"
                      value={row.kind}
                      defaultChecked={switches[row.kind]}
                      disabled={!row.canSwitchOff}
                      className="accent-[var(--accent)] w-4 h-4 mt-0.5 flex-shrink-0 disabled:opacity-40"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{row.label}</span>
                        {mine && <Badge tone="purple">your wording</Badge>}
                        {!row.canSwitchOff && <Badge tone="grey">always sends</Badge>}
                      </span>
                      <span className="block text-[12px] text-white/40 mt-0.5 leading-relaxed">
                        {row.when}
                        {!row.canSwitchOff &&
                          " Somebody who paid is owed a record of it, so this one cannot be switched off."}
                      </span>
                      {mine && (
                        <span className="block text-[12px] text-white/55 mt-1.5 leading-relaxed">
                          &ldquo;{mine.subject}&rdquo;
                        </span>
                      )}
                    </span>
                  </label>

                  <div className="flex-shrink-0">
                    <TemplateEditor
                      template={mine ?? undefined}
                      overridesKind={row.kind}
                      defaultName={row.label}
                      trigger={mine ? "edit" : "write"}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ActionForm>
      </Card>

      {/* --- the library ------------------------------------------------ */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h2 className="font-semibold">Templates for one-off sends</h2>
          <TemplateEditor trigger="new" />
        </div>
        <p className="text-sm text-white/50 mb-5 leading-relaxed">
          Written once, sent whenever you want, to whoever you choose. The five that come with the
          product are ordinary templates — edit them, rename them, delete them.
        </p>

        {library.length === 0 ? (
          <EmptyState
            title="No templates yet"
            description={
              needsMigration
                ? "Run the migration and five starting points appear here."
                : "Write one and it is ready to send from the next screen."
            }
          />
        ) : (
          <div className="divide-y divide-white/6">
            {library.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-3 py-3.5 first:pt-0">
                <Mail className="w-4 h-4 text-white/25 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{row.name}</div>
                  <div className="text-[12px] text-white/40 truncate">{row.subject}</div>
                </div>
                {row.action_label && <Badge tone="blue">{row.action_label}</Badge>}
                <TemplateEditor template={row} trigger="edit" />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
