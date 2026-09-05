import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { createApiKey, revokeApiKey } from "../portal-actions";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { PageHeader, Card, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/messages/send",
    summary: "Send a text or template message to a contact",
    body: `{
  "orgId": "<your-org-id>",
  "contactId": "<contact-uuid>",
  "body": "Hello from the API"
}`,
  },
  {
    method: "GET",
    path: "/api/webhooks/whatsapp",
    summary: "Meta's verification handshake (called by Meta, not by you)",
    body: null,
  },
  {
    method: "POST",
    path: "/api/webhooks/whatsapp",
    summary: "Inbound message and status delivery (called by Meta)",
    body: null,
  },
];

export default async function ApiEndpointsPage() {
  const { orgId, role } = await requireOrg();
  const supabase = await createClient();
  const canManage = role === "owner" || role === "admin";

  const { data: keys, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, revoked_at, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const host = (await headers()).get("host") ?? "your-domain";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const base = `${proto}://${host}`;

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="API Endpoints"
        subtitle="Drive Neura Chat from your own code, or from any tool that can call an HTTP endpoint."
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="order-2 lg:order-1 space-y-6">
          {/* -------- Keys -------- */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-3">
              API keys
            </h2>
            {error ? (
              <EmptyState
                title="Couldn't load API keys"
                description={`${error.message}. If this mentions a missing relation, the portal migration hasn't been applied yet.`}
              />
            ) : keys && keys.length > 0 ? (
              <Table head={["Name", "Key", "Scopes", "Last used", "State", ""]}>
                {keys.map((k) => {
                  const revoked = Boolean(k.revoked_at);
                  return (
                    <tr key={k.id} className="hover:bg-white/3 transition-colors">
                      <Td className="font-medium">{k.name}</Td>
                      <Td>
                        <code className="text-[11px] text-white/60">{k.key_prefix}…</code>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <Badge key={s} tone="purple">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </Td>
                      <Td className="text-white/40 text-xs whitespace-nowrap">
                        {k.last_used_at ? formatDate(k.last_used_at) : "never"}
                      </Td>
                      <Td>
                        <Badge tone={revoked ? "red" : "green"}>
                          {revoked ? "revoked" : "active"}
                        </Badge>
                      </Td>
                      <Td>
                        {!revoked && canManage && (
                          <ActionForm action={revokeApiKey} submitLabel="Revoke" compact>
                            <input type="hidden" name="id" value={k.id} />
                          </ActionForm>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            ) : (
              <EmptyState
                title="No API keys yet"
                description="Create one to call the API from your own backend, or from Zapier, Make or n8n."
              />
            )}
          </div>

          {/* -------- Endpoint reference -------- */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-3">
              Endpoints
            </h2>
            <div className="space-y-3">
              {ENDPOINTS.map((e) => (
                <Card key={`${e.method}-${e.path}`}>
                  <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                    <Badge tone={e.method === "GET" ? "blue" : "green"}>{e.method}</Badge>
                    <code className="text-sm text-white/85 break-all">{e.path}</code>
                  </div>
                  <p className="text-sm text-white/50 mb-3">{e.summary}</p>
                  {e.body && (
                    <pre className="bg-[var(--surface-1)] border border-white/10 rounded-xl p-3.5 overflow-x-auto">
                      <code className="text-[11px] text-white/70">{e.body}</code>
                    </pre>
                  )}
                </Card>
              ))}
            </div>
          </div>

          {/* -------- Example -------- */}
          <Card>
            <h2 className="font-semibold mb-3">Example request</h2>
            <pre className="bg-[var(--surface-1)] border border-white/10 rounded-xl p-4 overflow-x-auto">
              <code className="text-[11px] text-white/75">{`curl -X POST ${base}/api/messages/send \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer nc_live_…" \\
  -d '{"orgId":"${orgId}","contactId":"<uuid>","body":"Hi!"}'`}</code>
            </pre>
            <p className="text-[11px] text-white/35 mt-3 leading-relaxed">
              The send endpoint currently authenticates with your signed-in session. Bearer-token
              auth using these keys is the next step — the keys are real and stored hashed, but
              the route does not accept them yet.
            </p>
          </Card>
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">New API key</h2>
          <p className="text-sm text-white/50 mb-5">
            The full key is shown once, right after you create it. We only store a hash, so it
            cannot be recovered later.
          </p>
          {canManage ? (
            <ActionForm action={createApiKey} submitLabel="Generate key" resetOnSuccess>
              <Field label="Key name" name="name" required placeholder="Zapier production" />
            </ActionForm>
          ) : (
            <p className="text-sm text-white/40">Only owners and admins can create API keys.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
