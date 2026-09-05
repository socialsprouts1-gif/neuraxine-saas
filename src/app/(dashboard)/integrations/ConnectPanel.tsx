"use client";

import { AlertTriangle, Check } from "lucide-react";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { Badge, type Tone } from "@/components/ui/primitives";
import { CAPABILITY_HELP, CAPABILITY_LABEL, type IntegrationDef } from "@/lib/integrations";
import { connectIntegration, disconnectIntegration } from "../portal-actions";

const CAPABILITY_TONE: Record<IntegrationDef["capability"], Tone> = {
  live: "green",
  via_webhook: "blue",
  credentials: "amber",
};

// What a card opens into: what this integration actually does today, what
// has to exist on the provider's side first, and the credential form.
export default function ConnectPanel({
  def,
  connected,
  canManage,
}: {
  def: IntegrationDef;
  connected: boolean;
  canManage: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Badge tone={CAPABILITY_TONE[def.capability]}>{CAPABILITY_LABEL[def.capability]}</Badge>
        <Badge tone="grey">{def.category}</Badge>
      </div>
      <p className="text-xs text-white/45 leading-relaxed mb-5">
        {CAPABILITY_HELP[def.capability]}
      </p>

      {def.fields.length === 0 ? (
        <p className="text-sm text-white/50 flex items-start gap-2">
          <Check className="w-4 h-4 text-accent-ink flex-shrink-0 mt-0.5" />
          Always on. There is nothing to connect — this one works the moment you point something
          at it.
        </p>
      ) : connected ? (
        <>
          <div className="flex items-start gap-2.5 rounded-xl border border-accent/25 bg-accent/8 p-4 mb-5">
            <Check className="w-4 h-4 text-accent-ink flex-shrink-0 mt-0.5" />
            <p className="text-xs text-white/60 leading-relaxed">
              Connected. Credentials are stored encrypted and are never shown again — to change
              them, disconnect and connect again with the new ones.
            </p>
          </div>
          {canManage ? (
            <ActionForm action={disconnectIntegration} submitLabel="Disconnect" compact>
              <input type="hidden" name="provider" value={def.slug} />
            </ActionForm>
          ) : (
            <p className="text-sm text-white/40">Only owners and admins can change this.</p>
          )}
        </>
      ) : canManage ? (
        <>
          {def.prerequisite && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[#FACC15]/25 bg-[#FACC15]/8 p-4 mb-5">
              <AlertTriangle className="w-4 h-4 text-[#FACC15] flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-[#FACC15] mb-1">Do this first</div>
                <p className="text-xs text-white/55 leading-relaxed">{def.prerequisite}</p>
              </div>
            </div>
          )}

          <ActionForm action={connectIntegration} submitLabel="Save connection">
            <input type="hidden" name="provider" value={def.slug} />
            <div className="space-y-4">
              {def.fields.map((field) => (
                <Field
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  type={field.type}
                  required={field.required}
                  placeholder={field.placeholder}
                  hint={field.hint}
                />
              ))}
            </div>
          </ActionForm>
        </>
      ) : (
        <p className="text-sm text-white/40">Only owners and admins can connect integrations.</p>
      )}
    </div>
  );
}
