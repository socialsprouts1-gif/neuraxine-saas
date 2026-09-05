import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { listActiveConnections, optionLabel } from "@/lib/connections";
import {
  PageHeader,
  Card,
  StatCard,
  Badge,
  Table,
  Td,
  EmptyState,
  statusTone,
} from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";
import { variablesIn } from "@/lib/template-spec";
import { TemplateToolbar, DeleteTemplateButton, EditTemplateButton } from "./TemplateToolbar";

export default async function TemplatesPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const [{ data: templates, error }, connections] = await Promise.all([
    supabase
      .from("message_templates")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    listActiveConnections(supabase, orgId),
  ]);

  const all = templates ?? [];

  // The WABA id travels with the option: a template lands on an account, and
  // when Meta refuses one at account level the id is the first thing worth
  // checking against Meta's own dashboard.
  // Templates from every account land in one list, so each row has to say
  // which account it is on — two accounts can each hold a "marketing_".
  const accountLabels = new Map<string, string>();
  for (const connection of connections) {
    if (!accountLabels.has(connection.wabaId)) {
      accountLabels.set(connection.wabaId, optionLabel(connection));
    }
  }

  const numbers = connections.map((connection) => ({
    id: connection.id,
    label: optionLabel(connection),
    wabaId: connection.wabaId,
    isDefault: connection.isDefault,
  }));

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="WhatsApp templates"
        subtitle="Pre-approved messages you can send outside the 24-hour window."
        action={<TemplateToolbar numbers={numbers} />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Templates" value={all.length} />
        <StatCard label="Approved" value={all.filter((t) => t.status === "approved").length} />
        <StatCard label="In review" value={all.filter((t) => t.status === "pending").length} />
        <StatCard label="Rejected" value={all.filter((t) => t.status === "rejected").length} />
      </div>

      {/* Without a connected number there is no WhatsApp account to submit
          to, so say that rather than letting the builder fail at the end. */}
      {connections.length === 0 && (
        <Card className="mb-6 border-[#FACC15]/25">
          <h2 className="font-semibold mb-1">Connect a WhatsApp number first</h2>
          <p className="text-sm text-white/50 leading-relaxed">
            Templates live on your WhatsApp Business account. Connect a number under
            Integrations and this screen will submit templates to Meta for you.
          </p>
        </Card>
      )}

      {error ? (
        <EmptyState
          title="Couldn't load templates"
          description={`${error.message}. If this mentions a missing relation, run supabase/setup.sql again.`}
        />
      ) : all.length > 0 ? (
        <Table head={["Name", "Account", "Preview", "Category", "Language", "Status", "Created", ""]}>
          {all.map((template) => {
            const body = template.body_text ?? "";
            return (
              <tr key={template.id} className="hover:bg-white/3 transition-colors align-top">
                <Td>
                  <EditTemplateButton
                    template={template}
                    liveAtMeta={Boolean(template.waba_template_id)}
                    variant="name"
                    numbers={numbers}
                  />
                  {template.rejected_reason && (
                    <div className="text-[11px] text-[#F87171] mt-1 max-w-xs">
                      {template.rejected_reason}
                    </div>
                  )}
                </Td>
                <Td className="text-xs">
                  {accountLabels.get(template.waba_id ?? "") ? (
                    <span className="text-white/55">
                      {accountLabels.get(template.waba_id ?? "")}
                    </span>
                  ) : (
                    <span className="text-white/25">
                      {template.waba_id || "unknown"}
                    </span>
                  )}
                </Td>
                <Td className="text-white/55 text-xs max-w-sm">
                  <span className="line-clamp-2">
                    {body || <span className="text-white/25">Created in WhatsApp Manager</span>}
                  </span>
                  {variablesIn(body).length > 0 && (
                    <span className="block text-[11px] text-white/35 mt-1">
                      {variablesIn(body).length} variable
                      {variablesIn(body).length === 1 ? "" : "s"}
                    </span>
                  )}
                </Td>
                <Td>
                  <Badge tone="purple">{template.category}</Badge>
                </Td>
                <Td className="text-white/60 text-xs">{template.language}</Td>
                <Td>
                  <Badge tone={statusTone(template.status)}>{template.status}</Badge>
                </Td>
                <Td className="text-white/40 text-xs whitespace-nowrap">
                  {formatDate(template.created_at)}
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <EditTemplateButton
                    template={template}
                    liveAtMeta={Boolean(template.waba_template_id)}
                    variant="icon"
                    numbers={numbers}
                  />
                  <DeleteTemplateButton id={template.id} name={template.name} />
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <EmptyState
          title="No templates yet"
          description="Create one here and it goes to Meta for review. Approval usually takes a few minutes; marketing templates can take a day."
        />
      )}

      <p className="text-xs text-white/35 mt-4 max-w-2xl leading-relaxed">
        Click a template&apos;s name to reopen it. Meta reviews every template and does not
        notify us when the verdict lands — press Sync with Meta to pull the current status,
        including templates created directly in WhatsApp Manager.
      </p>
    </div>
  );
}
