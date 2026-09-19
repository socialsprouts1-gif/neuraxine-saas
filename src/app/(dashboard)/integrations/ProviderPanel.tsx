"use client";

import { AlertTriangle, Check, Download, RefreshCw, Search, Users } from "lucide-react";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { Badge } from "@/components/ui/primitives";
import { CAPABILITY_HELP, CAPABILITY_LABEL, type IntegrationDef } from "@/lib/integrations";
import ConnectPanel from "./ConnectPanel";
// Two files, because connecting lives with the other credential handling
// and the per-provider operations live with each other. A "use server" file
// may not re-export, so this is the import list rather than a bridge.
import { disconnectIntegration } from "../portal-actions";
import {
  importLeads,
  importProducts,
  listCalendlyLinks,
  testIntegration,
  trackParcel,
} from "../integration-actions";

/**
 * A connected integration, and the one real thing it does.
 *
 * Every provider gets a Test button, because connecting only encrypts what
 * was typed — nothing checks it until the first customer arrives, and by then
 * the failure is a line in a log nobody is watching. What comes after Test
 * depends on the capability: importing, a lookup, or nothing but the sync
 * that already runs on its own.
 */
export default function ProviderPanel({
  def,
  connected,
  canManage,
  lastError,
  webhookUrl,
}: {
  def: IntegrationDef;
  connected: boolean;
  canManage: boolean;
  lastError: string | null;
  /** Where this provider should send its own notifications, if it has any. */
  webhookUrl?: string | null;
}) {
  if (!connected) {
    return <ConnectPanel def={def} connected={false} canManage={canManage} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Badge tone="green">{CAPABILITY_LABEL[def.capability]}</Badge>
        <Badge tone="grey">{def.category}</Badge>
      </div>
      <p className="text-xs text-white/45 leading-relaxed mb-5">
        {CAPABILITY_HELP[def.capability]}
      </p>

      <div className="flex items-start gap-2.5 rounded-xl border border-accent/25 bg-accent/8 p-4 mb-5">
        <Check className="w-4 h-4 text-accent-ink flex-shrink-0 mt-0.5" />
        <p className="text-xs text-white/60 leading-relaxed">
          Connected. Credentials are stored encrypted and are never shown again — to change them,
          disconnect and connect again with the new ones.
        </p>
      </div>

      {/* Whatever the last real attempt did. A connection that has stopped
          working looks identical to one nobody has used yet, so not showing
          this is how a broken integration stays broken. */}
      {lastError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/8 p-4 mb-5">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-white/65 leading-relaxed min-w-0">
            <div className="font-semibold text-amber-200 mb-0.5">Last attempt failed</div>
            <p className="break-words">{lastError}</p>
          </div>
        </div>
      )}

      {webhookUrl && (
        <div className="rounded-xl border border-white/10 bg-white/4 p-4 mb-5">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
            Webhook to set on {def.name}
          </div>
          <code className="text-xs text-accent-ink break-all">{webhookUrl}</code>
          <p className="text-[11px] text-white/40 mt-2 leading-relaxed">
            Paste the signing secret from {def.name} into the Webhook secret field above.
            Without it a payment clears at the gateway and no order is ever marked paid.
          </p>
        </div>
      )}

      {canManage ? (
        <div className="space-y-3">
          <ActionForm action={testIntegration} submitLabel="Test connection" compact>
            <input type="hidden" name="provider" value={def.slug} />
            <p className="text-xs text-white/45 leading-relaxed flex items-start gap-2">
              <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              Calls {def.name} with the stored credentials and reports exactly what came back.
            </p>
          </ActionForm>

          {/* Shops: pull the products in. */}
          {(def.slug === "shopify" || def.slug === "woocommerce") && (
            <ActionForm action={importProducts} submitLabel={`Import products`} compact>
              <input type="hidden" name="provider" value={def.slug} />
              <p className="text-xs text-white/45 leading-relaxed flex items-start gap-2">
                <Download className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Name, price, stock and photo into your Commerce catalogue. Keyed on the
                shop&rsquo;s own id, so running it again updates rather than duplicating.
              </p>
            </ActionForm>
          )}

          {/* Lead sources: pull the enquiries in as contacts. */}
          {(def.slug === "facebook-lead-ads" || def.slug === "indiamart") && (
            <ActionForm action={importLeads} submitLabel="Import leads now" compact>
              <input type="hidden" name="provider" value={def.slug} />
              <p className="text-xs text-white/45 leading-relaxed flex items-start gap-2">
                <Users className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                New enquiries become contacts, ready to message. Anyone already in your contacts is
                left untouched — what your team has learned about them is worth more than what the
                form said.
              </p>
            </ActionForm>
          )}

          {def.slug === "shiprocket" && (
            <ActionForm action={trackParcel} submitLabel="Track" compact>
              <Field
                label="AWB number"
                name="awb"
                placeholder="1234567890"
                hint="From the shipment in Shiprocket. A freshly created one can take a few hours to appear."
              />
            </ActionForm>
          )}

          {def.slug === "calendly" && (
            <ActionForm action={listCalendlyLinks} submitLabel="Show my booking links" compact>
              <p className="text-xs text-white/45 leading-relaxed flex items-start gap-2">
                <Search className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Lists your active Calendly links so you can paste the right one into a
                conversation.
              </p>
            </ActionForm>
          )}

          <div className="pt-3 border-t border-white/8">
            <ActionForm action={disconnectIntegration} submitLabel="Disconnect" compact>
              <input type="hidden" name="provider" value={def.slug} />
            </ActionForm>
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/40">Only owners and admins can change this.</p>
      )}
    </div>
  );
}
