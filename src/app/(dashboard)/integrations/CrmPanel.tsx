"use client";

import { AlertTriangle, Check, RefreshCw, Users } from "lucide-react";
import ActionForm from "@/components/ui/ActionForm";
import { Badge } from "@/components/ui/primitives";
import { CAPABILITY_HELP, CAPABILITY_LABEL, type IntegrationDef } from "@/lib/integrations";
import { CRM_RECORD_LABEL, type CrmProvider } from "@/lib/crm";
import ConnectPanel from "./ConnectPanel";
import { disconnectIntegration, syncCrmContacts, testCrm } from "../portal-actions";

/**
 * A CRM card, once it is connected.
 *
 * The credential form is the same one every integration uses, so an
 * unconnected CRM falls straight through to it. What is different is what
 * comes after connecting: the two things an operator actually needs, which
 * are "do these credentials work" and "send the contacts I already have".
 */
export default function CrmPanel({
  def,
  provider,
  connected,
  canManage,
  lastError,
  syncedCount,
  totalCount,
  lastSyncedAt,
  recentFailure,
}: {
  def: IntegrationDef;
  provider: CrmProvider;
  connected: boolean;
  canManage: boolean;
  lastError: string | null;
  /** Contacts that have reached a connected CRM at least once. */
  syncedCount: number;
  totalCount: number;
  lastSyncedAt: string | null;
  /** The most recent failed push, if there is one. */
  recentFailure: string | null;
}) {
  if (!connected) {
    return <ConnectPanel def={def} connected={false} canManage={canManage} />;
  }

  const record = CRM_RECORD_LABEL[provider];
  const pending = Math.max(0, totalCount - syncedCount);

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
          Connected. Every new WhatsApp contact becomes a {record} in {def.name} the moment their
          first message arrives, matched on phone number so nobody is created twice. Credentials
          are stored encrypted and are never shown again — to change them, disconnect and connect
          again.
        </p>
      </div>

      {/* Whatever went wrong last, in the CRM's own words. A connection that
          has stopped working looks identical to one that was never used, so
          not showing this is how a broken sync stays broken. */}
      {(lastError || recentFailure) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/8 p-4 mb-5">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-white/65 leading-relaxed min-w-0">
            <div className="font-semibold text-amber-200 mb-0.5">Last attempt failed</div>
            <p className="break-words">{lastError ?? recentFailure}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Stat label="Contacts" value={totalCount.toLocaleString("en-IN")} />
        <Stat label="Synced" value={syncedCount.toLocaleString("en-IN")} />
        <Stat
          label="Not sent yet"
          value={pending.toLocaleString("en-IN")}
          tone={pending > 0 ? "amber" : "plain"}
        />
      </div>

      {lastSyncedAt && (
        <p className="text-xs text-white/40 mb-5">
          Last contact reached {def.name} on{" "}
          {new Date(lastSyncedAt).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </p>
      )}

      {canManage ? (
        <div className="space-y-3">
          <ActionForm action={testCrm} submitLabel="Test connection" compact>
            <input type="hidden" name="provider" value={provider} />
            <p className="text-xs text-white/45 leading-relaxed flex items-start gap-2">
              <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              Calls {def.name} with the stored credentials and reports exactly what came back.
            </p>
          </ActionForm>

          <ActionForm action={syncCrmContacts} submitLabel={`Send contacts to ${def.name}`} compact>
            <input type="hidden" name="provider" value={provider} />
            <p className="text-xs text-white/45 leading-relaxed flex items-start gap-2">
              <Users className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              For the contacts you already had before connecting. New ones go across on their own.
              Runs in batches — if there are more left over, run it again.
            </p>
          </ActionForm>

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

function Stat({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "amber";
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
      <div
        className={`text-lg font-bold tabular-nums ${
          tone === "amber" ? "text-amber-300" : "text-white"
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] text-white/45 mt-0.5">{label}</div>
    </div>
  );
}
