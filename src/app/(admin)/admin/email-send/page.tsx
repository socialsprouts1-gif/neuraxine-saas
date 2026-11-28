import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/primitives";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import GroupEditor from "../_components/GroupEditor";
import TemplateEditor from "../_components/TemplateEditor";
import { saveEmailGroup, sendEmailCampaign, sendTemplateTest } from "../actions";
import { listAudiences, listWorkspaces, resolveAudience } from "@/lib/email-campaigns";
import { isEmailConfigured } from "@/lib/email";
import { fillIn, paragraphs } from "@/lib/email-compose";
import { formatDateTime } from "@/types/admin";
import { Pencil, Users } from "lucide-react";

// Writing to some of your customers.
//
// Everything on this screen exists because the product had exactly one
// audience — everybody — and one message, the welcome, to send to it. An
// operator who wants to tell eleven people about a feature should not have
// to choose between eleven and four hundred.
//
// The choosing is a plain GET form and the sending is a POST, which is
// what lets the page state a real number before anything goes out. The
// count beside the confirm box is the audience actually resolved —
// suspended workspaces, unsubscribed addresses and workspaces with nobody
// on file already removed — rather than the size of the segment.

export const dynamic = "force-dynamic";

/** Sample values, so the preview reads like a message and not a form. */
const SAMPLE = {
  brand: "Neura Chat",
  price: "₹999 a month",
  plan: "Growth",
  days_left: "3",
  days_since: "12",
  renews_on: "16 October 2026",
  trial_days: "7",
  bot_name: "Support Sam",
  amount: "₹999",
};

export default async function EmailSendPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; to?: string }>;
}) {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { template: templateId, to } = await searchParams;

  const [{ data: templates, error }, audiences, workspaces, { data: groups }, { data: recent }] =
    await Promise.all([
      admin.from("email_templates").select("*").is("overrides_kind", null).order("name"),
      listAudiences(),
      listWorkspaces(),
      admin.from("email_groups").select("id, name, description").order("name"),
      admin
        .from("email_campaigns")
        .select("id, subject, audience_label, sent, skipped, failed, created_at")
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  const needsMigration = error?.code === "42P01";
  const library = templates ?? [];
  const chosen = library.find((row) => row.id === templateId) ?? null;

  // Only the chosen one is resolved. Doing it for every option would be
  // several queries each for a number nobody has asked for yet.
  const audience = to ? await resolveAudience(to) : null;

  const { data: members } = await admin.from("email_group_members").select("group_id, org_id");
  const byGroup = new Map<string, string[]>();
  for (const row of members ?? []) {
    byGroup.set(row.group_id, [...(byGroup.get(row.group_id) ?? []), row.org_id]);
  }

  const preview = chosen
    ? {
        subject: fillIn(chosen.subject, { ...SAMPLE, workspace: "umm clothing" }),
        blocks: paragraphs(fillIn(chosen.body, { ...SAMPLE, workspace: "umm clothing" })),
      }
    : null;

  const ready = Boolean(chosen && audience && audience.recipients.length > 0);

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Send an email"
        subtitle="Pick what to say, pick who gets it, see the number, then send."
        action={
          <Link href="/admin/email-templates" className="btn-quiet text-sm">
            <Pencil className="w-4 h-4" />
            Edit templates
          </Link>
        }
      />

      {!isEmailConfigured() && (
        <Card className="mb-6 border-[#FACC15]/25">
          <h2 className="font-semibold mb-1">Email is not configured</h2>
          <p className="text-sm text-white/55 leading-relaxed">
            Nothing can be sent until <code className="text-white/75">EMAIL_FROM</code> and a
            provider are set. <Link href="/admin/email" className="text-accent-ink hover:underline">Email setup</Link>{" "}
            has the details.
          </p>
        </Card>
      )}

      {needsMigration && (
        <Card className="mb-6 border-[#FACC15]/25">
          <h2 className="font-semibold mb-1">The tables are not there yet</h2>
          <p className="text-sm text-white/55 leading-relaxed">
            Run <code className="text-white/75">supabase/updates/run-me-latest.sql</code> in the
            Supabase SQL editor, then come back.
          </p>
        </Card>
      )}

      {/* --- choose ------------------------------------------------------ */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-1">What, and to whom</h2>
        <p className="text-sm text-white/50 mb-5 leading-relaxed">
          Choosing changes nothing and sends nothing — it works out who would receive it so you
          can see the number first.
        </p>

        <form method="get" className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <label className="block min-w-0">
            <span className="block text-xs font-medium text-white/70 mb-1.5">Template</span>
            <select
              name="template"
              defaultValue={templateId ?? ""}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
            >
              <option value="">Choose a template…</option>
              {library.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="block text-xs font-medium text-white/70 mb-1.5">Goes to</span>
            <select
              name="to"
              defaultValue={to ?? ""}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
            >
              <option value="">Choose an audience…</option>
              <optgroup label="Who they are right now">
                {audiences
                  .filter((row) => !row.group)
                  .map((row) => (
                    <option key={row.value} value={row.value}>
                      {row.label} ({row.size})
                    </option>
                  ))}
              </optgroup>
              {audiences.some((row) => row.group) && (
                <optgroup label="Your groups">
                  {audiences
                    .filter((row) => row.group)
                    .map((row) => (
                      <option key={row.value} value={row.value}>
                        {row.label} ({row.size})
                      </option>
                    ))}
                </optgroup>
              )}
              <optgroup label="One workspace">
                {workspaces.map((row) => (
                  <option key={row.id} value={`org:${row.id}`}>
                    {row.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <button type="submit" className="btn-quiet text-sm justify-center">
            Work it out
          </button>
        </form>
      </Card>

      {/* --- preview and send -------------------------------------------- */}
      {chosen && preview && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold">{chosen.name}</h2>
            <div className="flex flex-wrap gap-2">
              <ActionForm action={sendTemplateTest} submitLabel="Send me a test" variant="quiet" compact>
                <input type="hidden" name="template" value={chosen.id} />
              </ActionForm>
              <TemplateEditor template={chosen} trigger="edit" />
            </div>
          </div>

          {/* Sample values, not this audience's: a preview that greets one
              particular customer by name reads as if that is who it is
              going to. */}
          <div className="rounded-xl border border-white/10 bg-[var(--surface-2)] p-5 mb-5">
            <div className="text-sm font-semibold mb-3">{preview.subject}</div>
            <div className="space-y-2.5">
              {preview.blocks.map((block, index) => (
                <p key={index} className="text-sm text-white/60 leading-relaxed whitespace-pre-line">
                  {block}
                </p>
              ))}
            </div>
            {chosen.action_label && (
              <span className="inline-block mt-4 px-4 py-2 rounded-lg bg-accent text-[#050508] text-xs font-semibold">
                {chosen.action_label}
              </span>
            )}
            <p className="text-[12px] text-white/25 mt-4">
              Shown with sample values. Each person gets their own.
            </p>
          </div>

          {audience ? (
            audience.recipients.length === 0 ? (
              <p className="text-sm text-white/55 leading-relaxed">
                Nobody in <span className="text-white/80">{audience.label}</span> can be written
                to. Suspended workspaces, addresses that have unsubscribed and workspaces with no
                owner on file are all left out.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                  <span className="text-2xl font-bold">{audience.recipients.length}</span>
                  <span className="text-sm text-white/55">
                    {audience.recipients.length === 1 ? "person" : "people"} in{" "}
                    <span className="text-white/80">{audience.label}</span>
                  </span>
                </div>
                <p className="text-[12px] text-white/35 mb-4 leading-relaxed">
                  {audience.recipients
                    .slice(0, 4)
                    .map((row) => row.email)
                    .join(", ")}
                  {audience.recipients.length > 4 &&
                    ` and ${audience.recipients.length - 4} more`}
                  . One message each — somebody who owns several workspaces is still one person.
                </p>

                <p className="text-[12px] text-[#FACC15] mb-4 leading-relaxed">
                  Email cannot be recalled. Send yourself a test first; it is the only way to see
                  what Gmail will actually do with it.
                </p>

                <ActionForm action={sendEmailCampaign} submitLabel={`Send to ${audience.recipients.length}`}>
                  <input type="hidden" name="template" value={chosen.id} />
                  <input type="hidden" name="audience" value={to ?? ""} />
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      name="confirm"
                      className="accent-[var(--accent)] w-4 h-4 mt-0.5"
                    />
                    <span className="text-sm text-white/75">
                      Yes, email {audience.recipients.length}{" "}
                      {audience.recipients.length === 1 ? "person" : "people"} now
                    </span>
                  </label>
                </ActionForm>
              </>
            )
          ) : (
            <p className="text-sm text-white/40">Choose who it goes to and the number appears here.</p>
          )}
        </Card>
      )}

      {!ready && !chosen && library.length === 0 && !needsMigration && (
        <EmptyState
          title="No templates yet"
          description="Write one under Email templates and it appears in the list above."
        />
      )}

      {/* --- groups ------------------------------------------------------ */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-1">Your groups</h2>
        <p className="text-sm text-white/50 mb-5 leading-relaxed">
          A list of workspaces with a name on it, for when what they have in common is not
          something the database knows — the ones from a reseller, the ones who asked about a
          feature. Segments like &ldquo;on a trial now&rdquo; are worked out fresh each time and
          need no list.
        </p>

        {(groups ?? []).length > 0 && (
          <div className="divide-y divide-white/6 mb-5">
            {(groups ?? []).map((group) => (
              <div key={group.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                <Users className="w-4 h-4 text-white/25 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{group.name}</div>
                  {group.description && (
                    <div className="text-[12px] text-white/40 truncate">{group.description}</div>
                  )}
                </div>
                <GroupEditor
                  group={{
                    id: group.id,
                    name: group.name,
                    description: group.description,
                    memberIds: byGroup.get(group.id) ?? [],
                  }}
                  workspaces={workspaces}
                />
              </div>
            ))}
          </div>
        )}

        <ActionForm action={saveEmailGroup} submitLabel="Create group" variant="quiet" resetOnSuccess>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" name="name" required placeholder="Reseller customers" />
            <Field label="What it is for" name="description" placeholder="Optional" />
          </div>
        </ActionForm>
      </Card>

      {/* --- what has gone out ------------------------------------------- */}
      {(recent ?? []).length > 0 && (
        <Card>
          <h2 className="font-semibold mb-1">Already sent</h2>
          <p className="text-sm text-white/50 mb-5">
            Every message is in the{" "}
            <Link href="/admin/emails" className="text-accent-ink hover:underline">
              email log
            </Link>{" "}
            as well, with what the provider said.
          </p>
          <div className="divide-y divide-white/6">
            {(recent ?? []).map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0">
                <span className="text-sm truncate min-w-0 flex-1">{row.subject}</span>
                <Badge tone="grey">{row.audience_label}</Badge>
                <span className="text-[12px] text-accent-ink">{row.sent} sent</span>
                {row.failed > 0 && <span className="text-[12px] text-[#F87171]">{row.failed} failed</span>}
                <span className="text-[12px] text-white/30">{formatDateTime(row.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
