import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { savePlatformSetting } from "../actions";
import ActionForm, { Field, TextareaField } from "@/components/ui/ActionForm";
import { PageHeader, Card, EmptyState } from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";

export default async function AdminSettingsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data: settings, error } = await supabase
    .from("platform_settings")
    .select("*")
    .order("key");

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Platform settings"
        subtitle="Global configuration stored in the database, editable without a redeploy."
      />

      <div className="space-y-6">
        {error ? (
          <EmptyState title="Couldn't load settings" description={error.message} />
        ) : settings && settings.length > 0 ? (
          settings.map((s) => (
            <Card key={s.key}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 className="font-semibold font-mono text-sm">{s.key}</h2>
                <span className="text-[11px] text-white/35">
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
                <p className="text-[11px] text-white/35 mt-2">
                  Current: <code className="text-white/60">{JSON.stringify(s.value)}</code>
                </p>
              </ActionForm>
            </Card>
          ))
        ) : (
          <EmptyState
            title="No settings yet"
            description="The admin migration seeds branding and signup settings. If this is empty, it hasn't been applied."
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
            Platform admin is deliberately not grantable from this UI — an account with
            access cannot mint more. Add the row directly in the SQL editor:
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
