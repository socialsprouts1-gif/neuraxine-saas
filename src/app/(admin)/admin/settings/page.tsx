import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import Link from "next/link";
import { savePlatformSetting } from "../actions";
import ActionForm, { Field, TextareaField } from "@/components/ui/ActionForm";
import { PageHeader, Card, EmptyState } from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";
import KnownSettings from "../_components/KnownSettings";

// What is left once everything with a real form has a screen of its own.
//
// This page was nine sections in one scroll — features, email, WhatsApp,
// pricing, payments, the gateway, the raw rows and two notes — and finding
// any of them meant opening it and scrolling past the other eight. Each
// now has its own entry in the nav, and what stays here is the part that
// genuinely has no better home: the handful of settings with a plain form,
// the raw JSON for anything added by hand, and the note about granting
// admin access.

export const dynamic = "force-dynamic";

/** Everything that now has a screen or a form of its own. */
const HAS_A_HOME = new Set([
  "billing",
  "branding",
  "signups",
  "feature_defaults",
  "feature_kill",
  "platform_payment_org",
  "wallet_rates",
  "platform_whatsapp",
]);

const ELSEWHERE = [
  { href: "/admin/features", label: "Features", hint: "What a workspace starts with" },
  { href: "/admin/payments", label: "Payments", hint: "The gateway that takes your money" },
  { href: "/admin/pricing", label: "Message pricing", hint: "What a send costs a workspace" },
  { href: "/admin/whatsapp", label: "WhatsApp messages", hint: "Codes, welcomes, receipts" },
  { href: "/admin/email", label: "Email setup", hint: "How this deployment sends mail" },
];

export default async function AdminSettingsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data: settings, error } = await supabase
    .from("platform_settings")
    .select("*")
    .order("key");

  // Two editors for one value is how they end up disagreeing, and the JSON
  // one is the one that can corrupt it.
  const advanced = (settings ?? []).filter((row) => !HAS_A_HOME.has(row.key));

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Advanced settings"
        subtitle="The rows with no form of their own. Everything else has its own screen in the nav."
      />

      {/* Said here because somebody who came looking for pricing or the
          gateway came to this page first for months. */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-1">Looking for something else?</h2>
        <p className="text-sm text-white/50 mb-4 leading-relaxed">
          These used to live on this page and now have their own screens.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {ELSEWHERE.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col gap-0.5 px-3.5 py-3 rounded-xl border border-white/10 bg-white/3 hover:border-[#A855F7]/35 transition-colors"
            >
              <span className="text-sm font-medium">{item.label}</span>
              <span className="text-[11.5px] text-white/40">{item.hint}</span>
            </Link>
          ))}
        </div>
      </Card>

      <KnownSettings />

      <div className="space-y-6">
        {error ? (
          <EmptyState title="Couldn't load settings" description={error.message} />
        ) : advanced.length > 0 ? (
          advanced.map((s) => (
            <Card key={s.key}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 className="font-semibold font-mono text-sm">{s.key}</h2>
                <span className="text-[12px] text-white/35">
                  updated {formatDate(s.updated_at)}
                </span>
              </div>
              {s.description && <p className="text-sm text-white/50 mb-4">{s.description}</p>}
              <ActionForm action={savePlatformSetting} submitLabel="Save">
                <input type="hidden" name="key" value={s.key} />
                <TextareaField
                  label="Value (JSON)"
                  name="value"
                  rows={4}
                  placeholder={JSON.stringify(s.value, null, 2)}
                />
                <p className="text-[12px] text-white/35 mt-2">
                  Current: <code className="text-white/60">{JSON.stringify(s.value)}</code>
                </p>
              </ActionForm>
            </Card>
          ))
        ) : (
          <EmptyState
            title="Nothing else to configure"
            description="Every setting this deployment uses has a screen of its own. Anything added by hand will appear here."
          />
        )}

        <Card>
          <h2 className="font-semibold mb-1">Add a setting</h2>
          <p className="text-sm text-white/50 mb-5">
            Values are stored as JSON, so a setting can hold a whole object.
          </p>
          <ActionForm action={savePlatformSetting} submitLabel="Create setting" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Key" name="key" required placeholder="feature_flags" />
              <TextareaField
                label="Value (JSON)"
                name="value"
                rows={3}
                required
                placeholder='{"new_inbox": true}'
              />
            </div>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="font-semibold mb-2">Granting admin access</h2>
          <p className="text-sm text-white/50 mb-4">
            Platform admin is deliberately not grantable from this UI — an account with access
            cannot mint more. Add the row directly in the SQL editor:
          </p>
          <pre className="bg-[var(--surface-1)] border border-white/10 rounded-xl p-4 overflow-x-auto text-xs">
            <code className="text-white/80">{`insert into platform_admins (user_id)
select id from auth.users where email = 'you@example.com';`}</code>
          </pre>
        </Card>
      </div>
    </div>
  );
}
