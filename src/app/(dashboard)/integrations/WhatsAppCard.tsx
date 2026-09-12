import { AlertTriangle, KeyRound, CheckCircle2 } from "lucide-react";
import ConnectWhatsApp from "./ConnectWhatsApp";
import DiagnoseTemplates from "./DiagnoseTemplates";
import { connectWaba, disconnectWaba, regenerateVerifyToken, verifyWabaConnection } from "../actions";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { Badge, statusTone } from "@/components/ui/primitives";

// The panel behind the WhatsApp Business card. It is one tile among the
// others in the grid, but it carries the whole connection lifecycle rather
// than a credential form: signup outcome, per-number health, the webhook
// values to paste into Meta, and token rotation.

type Connection = {
  id: string;
  waba_id: string;
  phone_number_id: string;
  meta_app_id: string;
  webhook_verify_token: string;
  status: string;
  display_phone_number: string | null;
  verified_name: string | null;
  label: string | null;
  is_default: boolean;
  last_error: string | null;
  last_error_at: string | null;
};

export default function WhatsAppCard({
  connections,
  webhookUrl,
  canManage,
  loadError,
  healthUnavailable,
  signup,
}: {
  connections: Connection[];
  webhookUrl: string;
  canManage: boolean;
  /** Set when the connection query itself failed — usually a pending migration. */
  loadError?: string | null;
  /** Connections loaded, but the health columns are not there yet. */
  healthUnavailable?: boolean;
  /** Result of a just-completed Embedded Signup, read off the URL. */
  signup?: { connected?: string; error?: string; note?: string };
}) {
  const connected = connections.length > 0;

  return (
    <div>
      {signup?.connected && (
        <div className="flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/8 p-4 mb-4">
          <CheckCircle2 className="w-4 h-4 text-accent-ink flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-accent-ink mb-0.5">
              Connected {signup.connected}
            </div>
            <p className="text-xs text-white/60 leading-relaxed">
              Meta issued the token, subscribed this app to your WhatsApp Business Account, and
              registered the number. Nothing else to paste — message the number to test it.
              {signup.note ? ` ${signup.note}` : ""}
            </p>
          </div>
        </div>
      )}

      {signup?.error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/8 p-4 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-red-300 mb-0.5">
              The connection did not complete
            </div>
            <p className="text-xs text-white/60 leading-relaxed">{signup.error}</p>
          </div>
        </div>
      )}

      {loadError ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#FF5C5C]/30 bg-[#FF5C5C]/8 p-4">
          <AlertTriangle className="w-4 h-4 text-[#FF5C5C] flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-[#FF8A8A] mb-1">
              Couldn&apos;t read the WhatsApp connection
            </div>
            <p className="text-xs text-white/60 leading-relaxed mb-2">
              Your number may well be connected — this is the lookup failing, not the
              connection. If the message below mentions a missing column, run{" "}
              <span className="font-mono text-white/75">supabase/setup.sql</span> again;
              connection health tracking added two columns.
            </p>
            <p className="text-xs text-white/40 font-mono break-words">{loadError}</p>
          </div>
        </div>
      ) : connected ? (
        <div className="space-y-3">
          {connections.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 bg-white/4 border border-white/10 rounded-xl p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {/* The number people recognise, with the id kept below —
                      Meta asks for the id, humans read the number. */}
                  <span className="font-semibold text-sm tabular-nums">
                    {c.display_phone_number ?? c.phone_number_id}
                  </span>
                  {(c.label ?? c.verified_name) && (
                    <span className="text-sm text-white/50">{c.label ?? c.verified_name}</span>
                  )}
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                  {c.is_default && <Badge tone="blue">default</Badge>}
                </div>
                {/* The app id belongs here with the rest. A number whose
                    WABA sits under a different Meta app fails only on
                    templates and forms, and without seeing all three ids
                    together there is no way to spot that they disagree. */}
                <div className="text-xs text-white/40 font-mono">
                  WABA {c.waba_id} · Number ID {c.phone_number_id} · App {c.meta_app_id}
                </div>
              </div>

              {/* Asks Meta the same permission question a send asks, without
                  sending. Every credential fault so far could only be found
                  by messaging a real person and reading server logs. */}
              {canManage && (
                <ActionForm action={verifyWabaConnection} submitLabel="Test connection" compact>
                  <input type="hidden" name="id" value={c.id} />
                </ActionForm>
              )}

              {canManage && <DiagnoseTemplates id={c.id} />}

              {/* Rotating an access token is routine — Meta's API Setup
                  token dies every 24 hours — and it must not go through
                  Disconnect, which deletes the row and with it the verify
                  token Meta was registered against. connectWaba upserts on
                  phone_number_id and keeps that token, so the fix stays a
                  single paste. */}
              {canManage && (
                <details className="w-full group">
                  <summary className="cursor-pointer text-xs text-accent2-ink hover:text-accent-ink transition-colors list-none flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    Update access token
                    <span className="text-white/30">— keeps your verify token</span>
                  </summary>
                  <div className="mt-3 pt-3 border-t border-white/8">
                    <ActionForm action={connectWaba} submitLabel="Save token">
                      <input type="hidden" name="waba_id" value={c.waba_id} />
                      <input type="hidden" name="phone_number_id" value={c.phone_number_id} />
                      <input type="hidden" name="meta_app_id" value={c.meta_app_id} />
                      <Field
                        name="access_token"
                        label="New access token"
                        type="password"
                        required
                        placeholder="EAAO…"
                        hint="A System User token never expires. The one on Meta's API Setup page lasts 24 hours."
                      />
                    </ActionForm>
                  </div>
                </details>
              )}

              {/* A credential rejection breaks every send, not one message,
                  so it belongs here rather than only in whichever chat
                  thread happened to hit it first. */}
              {c.last_error && (
                <div className="w-full flex items-start gap-2.5 rounded-lg border border-[#FF5C5C]/30 bg-[#FF5C5C]/8 p-3">
                  <AlertTriangle className="w-4 h-4 text-[#FF5C5C] flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#FF8A8A] mb-0.5">
                      Meta refused the last send
                      {c.last_error_at && (
                        <span className="text-white/35 font-normal">
                          {" · "}
                          {new Date(c.last_error_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/60 leading-relaxed">{c.last_error}</p>
                  </div>
                </div>
              )}

              {canManage && (
                <details className="w-full">
                  <summary className="cursor-pointer text-xs text-white/35 hover:text-white/60 transition-colors list-none">
                    Disconnect this number
                  </summary>
                  <div className="mt-3 pt-3 border-t border-white/8 flex flex-wrap items-center gap-3">
                    <p className="text-xs text-white/45 leading-relaxed flex-1 min-w-[16rem]">
                      This deletes the connection, including its verify token. Reconnecting
                      generates a new one, so you would have to re-register the webhook with
                      Meta. To change the access token, use{" "}
                      <span className="text-white/70">Update access token</span> above instead.
                    </p>
                    <ActionForm action={disconnectWaba} submitLabel="Disconnect" compact>
                      <input type="hidden" name="id" value={c.id} />
                    </ActionForm>
                  </div>
                </details>
              )}
            </div>
          ))}

          {healthUnavailable && (
            <p className="text-[11px] text-white/35 leading-relaxed">
              Connection health tracking is off — run{" "}
              <span className="font-mono text-white/55">supabase/setup.sql</span> to add the
              two columns it needs. Everything else on this page works without it.
            </p>
          )}

          {/* Embedded Signup is not only for the first number. Adding a
              second one, or moving to a number in a different business,
              are both ordinary things to want — and the previous version
              only offered this to orgs with no connection at all, which
              made it unreachable the moment you succeeded once. */}
          {canManage && (
            <div className="rounded-xl border border-accent/25 bg-accent/8 p-5 mt-4">
              <h3 className="text-sm font-semibold mb-1">Add another number through Meta</h3>
              <p className="text-xs text-white/55 leading-relaxed mb-4 max-w-2xl">
                Meta walks you through choosing or adding a number, and we receive the
                credentials directly — including the webhook subscription that has no button
                anywhere in Meta&apos;s own dashboard. Reconnecting an existing number this way
                is safe: it keeps the verify token below, so your webhook stays registered.
              </p>
              <ConnectWhatsApp label="Connect another number" />
            </div>
          )}

          {canManage && <ManualConnect />}

          {/* Storing credentials does not tell Meta where to deliver
              messages — that is a separate step in their dashboard, and
              the two values it asks for are shown here so nobody has to
              query the database for them. */}
          <div className="bg-[var(--surface-1)] border border-accent/20 rounded-xl p-5 mt-4">
            <div className="text-sm font-semibold text-accent-ink mb-1">
              Register this webhook with Meta
            </div>
            <p className="text-xs text-white/50 mb-4">
              Inbound messages will not reach your inbox until you paste both values into
              Meta → your app → WhatsApp → Configuration, and subscribe to the{" "}
              <code className="text-white/70">messages</code> field.
            </p>

            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                  Callback URL
                </div>
                <code className="block text-xs text-accent2-ink break-all bg-white/3 border border-white/8 rounded-lg p-2.5">
                  {webhookUrl}
                </code>
              </div>

              {connections.map((c) => (
                <div key={`vt-${c.id}`}>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                      Verify token
                      <span className="text-white/25 normal-case tracking-normal font-normal">
                        {" "}
                        · for {c.phone_number_id}
                      </span>
                    </div>
                    {canManage && (
                      <ActionForm
                        action={regenerateVerifyToken}
                        submitLabel="Regenerate"
                        compact
                      >
                        <input type="hidden" name="id" value={c.id} />
                      </ActionForm>
                    )}
                  </div>
                  <code className="block text-xs text-accent-ink break-all bg-white/3 border border-white/8 rounded-lg p-2.5">
                    {c.webhook_verify_token}
                  </code>
                  <p className="text-[10px] text-white/30 mt-1.5">
                    {c.webhook_verify_token.length} characters. Meta rejects the handshake
                    unless this matches exactly — it is not your access token.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : canManage ? (
        <div className="space-y-5">
          {/* The one-button path. Everything the form below asks for is
              derived from what Meta hands back, including subscribed_apps,
              which the operator cannot do from Meta's dashboard at all. */}
          <div className="rounded-xl border border-accent/25 bg-accent/8 p-5">
            <h3 className="text-sm font-semibold mb-1">Connect through Meta</h3>
            <p className="text-xs text-white/55 leading-relaxed mb-4 max-w-2xl">
              Meta walks you through choosing or adding a number, and we receive the credentials
              directly — no IDs to look up, no token to paste, and the webhook subscription that
              has no button anywhere in Meta&apos;s own dashboard is done for you.
            </p>
            <ConnectWhatsApp />
          </div>

          <ManualConnect />
        </div>
      ) : (
        <p className="text-sm text-white/40">
          No number connected. Ask an owner or admin to connect one.
        </p>
      )}
    </div>
  );
}


/**
 * The System User token path.
 *
 * Embedded Signup covers numbers you can reach through Meta's dialog. It
 * does not cover the case an agency actually has: a client's WhatsApp
 * Business Account, shared into your business portfolio as a Partner, which
 * a System User token can act on today without waiting on Tech Provider
 * approval. That is the only way to attach those numbers, so it has to stay
 * reachable after the first connection — hiding it once one number existed
 * made the whole path unreachable exactly when it was needed.
 */
function ManualConnect() {
  return (
    <details className="group">
      <summary className="cursor-pointer text-xs text-white/45 hover:text-white/70 transition-colors list-none">
        Connect with a System User token instead
        <span className="text-white/25"> — for a client account shared with your business</span>
      </summary>
      <div className="mt-4 pt-4 border-t border-white/8">
        <p className="text-xs text-white/45 leading-relaxed mb-4 max-w-2xl">
          Use this when the WhatsApp Business Account belongs to someone else and they have
          added your business portfolio as a Partner. Meta&apos;s dialog cannot reach those
          accounts until your app is an approved Tech Provider; a System User token can.
        </p>
        <p className="text-xs text-[#FACC15]/80 leading-relaxed mb-4 max-w-2xl">
          This path does not subscribe your app to the WhatsApp Business Account, and there is
          no button for that anywhere in Meta&apos;s dashboard. Until it is done through the
          API, inbound messages are never delivered no matter how the callback URL is set up.
        </p>
        <ActionForm action={connectWaba} submitLabel="Connect number" resetOnSuccess>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="WABA ID" name="waba_id" required placeholder="123456789012345" />
            <Field
              label="Phone number ID"
              name="phone_number_id"
              required
              placeholder="098765432109876"
              hint="Meta → WhatsApp → API Setup"
            />
            <Field label="Meta App ID" name="meta_app_id" required placeholder="1234567890" />
            <Field
              label="Access token"
              name="access_token"
              type="password"
              required
              placeholder="EAAG…"
              hint="Use a permanent System User token, not the 24-hour one"
            />
          </div>
        </ActionForm>
      </div>
    </details>
  );
}
