import ActionForm, { Field } from "@/components/ui/ActionForm";
import { Badge } from "@/components/ui/primitives";
import { createWebhook, deleteWebhook } from "../portal-actions";
import type { OutgoingWebhook } from "@/types/portal";

// The outgoing-webhook manager. It used to sit as its own section under the
// catalogue; it lives behind the Outgoing Webhooks card now, which is where
// someone looking for it would actually click.
export default function WebhooksPanel({
  webhooks,
  canManage,
}: {
  webhooks: OutgoingWebhook[];
  canManage: boolean;
}) {
  return (
    <div>
      {webhooks.length > 0 && (
        <div className="space-y-3 mb-6">
          {webhooks.map((webhook) => (
            <div key={webhook.id} className="rounded-xl border border-white/10 bg-white/3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{webhook.name}</span>
                    <Badge tone={webhook.is_active ? "green" : "grey"}>
                      {webhook.is_active ? "active" : "paused"}
                    </Badge>
                  </div>
                  <code className="text-xs text-accent2-ink break-all block mb-2">
                    {webhook.target_url}
                  </code>
                  <div className="flex flex-wrap gap-1">
                    {webhook.events.map((event) => (
                      <Badge key={event} tone="purple">
                        {event}
                      </Badge>
                    ))}
                  </div>
                </div>
                {canManage && (
                  <ActionForm action={deleteWebhook} submitLabel="Delete" compact>
                    <input type="hidden" name="id" value={webhook.id} />
                  </ActionForm>
                )}
              </div>

              <div className="mt-3.5 pt-3.5 border-t border-white/8">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                  Signing secret
                </div>
                <code className="text-[11px] text-white/50 break-all">{webhook.secret}</code>
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        <>
          <h4 className="text-sm font-semibold mb-1">
            {webhooks.length > 0 ? "Add another" : "Create your first webhook"}
          </h4>
          <p className="text-xs text-white/45 mb-4">HTTPS endpoints only.</p>

          <ActionForm action={createWebhook} submitLabel="Create webhook" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Name" name="name" required placeholder="Zapier — new leads" />
              <Field
                label="Target URL"
                name="target_url"
                type="url"
                required
                placeholder="https://hooks.zapier.com/…"
              />
              <fieldset>
                <legend className="text-xs font-medium text-white/70 mb-2">Events</legend>
                <div className="space-y-2">
                  {[
                    ["message.received", "Inbound message"],
                    ["message.status", "Delivery status change"],
                    ["contact.created", "New contact"],
                  ].map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2.5 text-sm text-white/70">
                      <input
                        type="checkbox"
                        name={value}
                        defaultChecked={value === "message.received"}
                        className="accent-[#00FF87] w-4 h-4"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </ActionForm>
        </>
      ) : (
        <p className="text-sm text-white/40">Only owners and admins can add webhooks.</p>
      )}
    </div>
  );
}
