import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import {
  PageHeader,
  Card,
  StatCard,
  Badge,
  Table,
  Td,
  EmptyState,
} from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";
import { FormsToolbar, DeleteFormButton } from "./FormsToolbar";
import { formatAnswer } from "@/lib/flow-reply";
import type { FormScreen } from "@/lib/flow-json";

export default async function FormsPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const [{ data: flows, error }, { data: connection }, { data: responses }] = await Promise.all([
    supabase
      .from("whatsapp_flows")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("waba_connections")
      .select("id")
      .eq("org_id", orgId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("flow_responses")
      .select("id, flow_id, wa_id, answers, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const all = flows ?? [];
  const byFlow = new Map(all.map((flow) => [flow.id, flow.name]));

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="WhatsApp forms"
        subtitle="Forms people fill in without leaving the chat."
        action={<FormsToolbar />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Forms" value={all.length} />
        <StatCard label="Published" value={all.filter((f) => f.status === "published").length} />
        <StatCard label="Drafts" value={all.filter((f) => f.status === "draft").length} />
        <StatCard label="Recent replies" value={responses?.length ?? 0} />
      </div>

      {!connection && (
        <Card className="mb-6 border-[#FACC15]/25">
          <h2 className="font-semibold mb-1">Connect a WhatsApp number first</h2>
          <p className="text-sm text-white/50 leading-relaxed">
            Forms live on your WhatsApp Business account. You can build one here now, but it
            can&apos;t be published or sent until a number is connected under Integrations.
          </p>
        </Card>
      )}

      {error ? (
        <EmptyState
          title="Couldn't load forms"
          description={`${error.message}. If this mentions a missing relation, run supabase/setup.sql again.`}
        />
      ) : all.length > 0 ? (
        <Table head={["Form", "Category", "Screens", "Status", "Created", ""]}>
          {all.map((flow) => {
            const screens = (flow.screens ?? []) as unknown as FormScreen[];
            const fields = screens.reduce((sum, screen) => sum + screen.fields.length, 0);

            return (
              <tr key={flow.id} className="hover:bg-white/3 transition-colors">
                <Td>
                  <Link href={`/forms/${flow.id}`} className="font-medium hover:text-accent-ink">
                    {flow.name}
                  </Link>
                  {flow.meta_flow_id && (
                    <div className="text-[11px] text-white/30 mt-0.5 font-mono">
                      {flow.meta_flow_id}
                    </div>
                  )}
                </Td>
                <Td>
                  <Badge tone="purple">
                    {(flow.categories?.[0] ?? "OTHER").replace(/_/g, " ").toLowerCase()}
                  </Badge>
                </Td>
                <Td className="text-white/55 text-xs">
                  {screens.length === 0 ? (
                    <span className="text-white/30">built in WhatsApp Manager</span>
                  ) : (
                    `${screens.length} screen${screens.length === 1 ? "" : "s"} · ${fields} field${fields === 1 ? "" : "s"}`
                  )}
                </Td>
                <Td>
                  <Badge tone={flowTone(flow.status)}>{flow.status}</Badge>
                </Td>
                <Td className="text-white/40 text-xs whitespace-nowrap">
                  {formatDate(flow.created_at)}
                </Td>
                <Td className="text-right">
                  <DeleteFormButton
                    id={flow.id}
                    name={flow.name}
                    published={flow.status === "published"}
                  />
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <EmptyState
          title="No forms yet"
          description="Build a form here, publish it to WhatsApp, and send it in a chat or from a chatbot."
        />
      )}

      {responses && responses.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold mb-3">Recent submissions</h2>
          <Table head={["Form", "From", "Answers", "When"]}>
            {responses.map((response) => (
              <tr key={response.id} className="hover:bg-white/3 transition-colors align-top">
                <Td className="text-xs">
                  {response.flow_id ? (
                    (byFlow.get(response.flow_id) ?? <span className="text-white/30">—</span>)
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </Td>
                <Td className="text-xs font-mono text-white/55">{response.wa_id ?? "—"}</Td>
                <Td className="text-xs text-white/70 max-w-md">
                  {Object.entries(response.answers ?? {})
                    .map(([key, value]) => `${key}: ${formatAnswer(value)}`)
                    .join(" · ")}
                </Td>
                <Td className="text-white/40 text-xs whitespace-nowrap">
                  {formatDate(response.created_at)}
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <p className="text-xs text-white/35 mt-4 max-w-2xl leading-relaxed">
        A draft form can be opened only by numbers on your own WhatsApp account, which is what
        makes Test send useful before you publish. Publishing is one-way — a published form is
        frozen at WhatsApp, so an edit is uploaded and republished as a new version. To send a
        form from a chatbot, add a <strong className="text-white/55">Send Form</strong> node and
        type the form&apos;s name into it.
      </p>
    </div>
  );
}

function flowTone(status: string) {
  if (status === "published") return "green" as const;
  if (status === "draft") return "amber" as const;
  if (status === "blocked") return "red" as const;
  return "grey" as const;
}
