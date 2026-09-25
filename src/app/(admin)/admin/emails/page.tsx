import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader, StatCard, Card, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";
import { explainEmailFailure, NEVER_ATTEMPTED } from "@/lib/email-errors";
import { checkFrom, ACCEPTED_NOT_DELIVERED } from "@/lib/deliverability";
import { isEmailConfigured, emailIdentity } from "@/lib/email";
import { sendWelcomeToEveryone, runBillingEmailsNow } from "../actions";
import { previewBillingEmails } from "@/lib/billing-emails";
import ActionForm from "@/components/ui/ActionForm";

/**
 * Every message this deployment tried to send, and what came back.
 *
 * Built because "I signed up and got no email" was unanswerable. The cause
 * was already being written to email_log on every failure and nothing read
 * it, so diagnosing a real signup meant reading server logs nobody has
 * access to — or guessing, which is worse.
 *
 * Service role deliberately: this is every workspace's mail, which is the
 * whole point of a platform-wide view.
 */
export default async function AdminEmailsPage() {
  await requirePlatformAdmin();
  const supabase = createAdminClient();

  const { data: logs, error } = await supabase
    .from("email_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const all = logs ?? [];

  // Names fetched separately rather than embedded. An embed depends on
  // PostgREST spotting the foreign key, and a log that fails to load
  // because of a relationship hint is a diagnostic screen that cannot
  // diagnose anything.
  const orgIds = [...new Set(all.map((row) => row.org_id).filter(Boolean))] as string[];
  const { data: orgs } = orgIds.length
    ? await supabase.from("organizations").select("id, name").in("id", orgIds)
    : { data: [] };
  const orgName = new Map((orgs ?? []).map((org) => [org.id, org.name]));
  const failed = all.filter((row) => row.status === "failed");
  const sent = all.filter((row) => row.status === "sent").length;
  // A row stuck on "sending" means the process died between claiming the
  // send and recording the outcome. It is not a failure and not a success,
  // and it blocks a retry, so it needs to be visible rather than counted
  // into one of the other two.
  const stuck = all.filter((row) => row.status === "sending").length;

  // The newest distinct failure reason, explained once at the top. One
  // cause usually accounts for every failure on the list, and repeating it
  // on two hundred rows buries it.
  const leading = failed.map((row) => explainEmailFailure(row.error)).find(Boolean) ?? null;

  const configured = isEmailConfigured();

  // How many workspaces a catch-up send would reach, shown before it is
  // pressed. "Send to everyone" with no number next to it is a button
  // nobody can consent to.
  const { count: workspaces } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true });

  // What the schedule owes right now. The countdown starts six days before
  // a trial ends, so for the first day of a seven-day trial the honest
  // answer is "nothing yet" — and that needs saying, because it is
  // otherwise indistinguishable from nothing being wired up.
  const due = configured ? await previewBillingEmails() : [];

  // Whether what this deployment sends as can actually land. A provider
  // accepting a message and an inbox receiving one are different events,
  // and everything between them is decided by the from address.
  const identity = emailIdentity();
  const posture = identity
    ? checkFrom(identity.from, identity.transport, identity.smtpHost)
    : null;

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Email log"
        subtitle="The last 200 messages this deployment tried to send, and what the provider said."
      />

      {!configured && (
        <Card className="mb-6 border-[#FACC15]/25">
          <h2 className="font-semibold mb-1">Email is not configured on this deployment</h2>
          <p className="text-sm text-white/55 leading-relaxed">
            Nothing is being attempted at all, which is why this list may be empty rather than
            full of failures. Set <code className="text-white/70">EMAIL_FROM</code> plus either{" "}
            <code className="text-white/70">RESEND_API_KEY</code> or the{" "}
            <code className="text-white/70">SMTP_*</code> variables, then redeploy.
          </p>
        </Card>
      )}

      {posture && posture.level !== "ok" && (
        <Card
          className={`mb-6 ${posture.level === "broken" ? "border-[#F87171]/25" : "border-[#FACC15]/25"}`}
        >
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            <h2 className="font-semibold">
              {posture.level === "broken"
                ? "Accepted here, refused on arrival"
                : "Accepted, but easily filtered"}
            </h2>
            <Badge tone={posture.level === "broken" ? "red" : "amber"}>
              {identity?.from}
            </Badge>
          </div>
          <p className="text-sm text-white/75 leading-relaxed mb-2">{posture.summary}</p>
          <p className="text-sm text-white/50 leading-relaxed">{posture.fix}</p>
        </Card>
      )}

      {sent > 0 && (
        <Card className="mb-6">
          <h2 className="font-semibold mb-1">What &ldquo;sent&rdquo; means here</h2>
          <p className="text-sm text-white/50 leading-relaxed">
            {ACCEPTED_NOT_DELIVERED} Before treating one as lost, look in{" "}
            <span className="text-white/70">Spam</span>,{" "}
            <span className="text-white/70">Promotions</span> and{" "}
            <span className="text-white/70">All Mail</span> — Gmail&apos;s Primary tab is not the
            whole inbox.
          </p>
        </Card>
      )}

      {leading && (
        <Card className="mb-6 border-[#F87171]/25">
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            <h2 className="font-semibold">Why these are failing</h2>
            <Badge tone="red">{failed.length} failed</Badge>
          </div>
          <p className="text-sm text-white/75 leading-relaxed mb-2">{leading.summary}</p>
          <p className="text-sm text-white/50 leading-relaxed">{leading.fix}</p>
        </Card>
      )}

      {configured && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-2.5 mb-1">
            <h2 className="font-semibold">Trial countdown and follow-ups</h2>
            <Badge tone={due.length > 0 ? "green" : "grey"}>
              {due.length > 0 ? `${due.length} due now` : "nothing due"}
            </Badge>
          </div>
          <p className="text-sm text-white/50 mb-4 leading-relaxed">
            The countdown runs every day from six days left down to one, then the payment message
            on the day the trial ends, then a follow-up every three days for a month and weekly
            after that. It fires from a daily schedule — this runs it now instead of waiting.
          </p>

          {due.length > 0 ? (
            <ul className="text-xs space-y-1.5 mb-4">
              {due.map((row, index) => (
                <li key={`${row.orgName}-${index}`} className="flex flex-wrap items-center gap-2">
                  <Badge tone="purple">{row.kind.replace(/_/g, " ")}</Badge>
                  <span className="text-white/70">{row.orgName}</span>
                  <span className="text-white/35">{row.email ?? "no address on file"}</span>
                  <span className="text-white/30">
                    {row.daysLeft >= 0
                      ? `${row.daysLeft} day${row.daysLeft === 1 ? "" : "s"} left`
                      : `${-row.daysLeft} day${row.daysLeft === -1 ? "" : "s"} since it ended`}
                  </span>
                  {row.alreadySent && <Badge tone="grey">already sent</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-white/40 mb-4 leading-relaxed">
              Nothing is owed today. On a fresh seven-day trial the first countdown message is due
              on the sixth day, so this staying empty for a day is the schedule working.
            </p>
          )}

          <ActionForm action={runBillingEmailsNow} submitLabel="Run the sweep now">
            <span className="sr-only">Sends whatever the schedule owes today.</span>
          </ActionForm>
          <p className="text-[11px] text-white/30 mt-2.5 leading-relaxed">
            Safe to press twice — every message is keyed to the workspace, the period and the day,
            so a repeat is refused rather than sent.
          </p>
        </Card>
      )}

      {configured && (workspaces ?? 0) > 0 && (
        <Card className="mb-6">
          <h2 className="font-semibold mb-1">Send the welcome again, to everyone</h2>
          <p className="text-sm text-white/50 mb-4 leading-relaxed">
            One message to each of your{" "}
            <span className="text-white/75">{workspaces} workspace{workspaces === 1 ? "" : "s"}</span>
            . For the people who signed up before the sending domain was verified and whose
            welcome went to spam. Suspended workspaces, unsubscribed addresses and two workspaces
            belonging to the same person are all left out, and running it twice in a day sends
            nothing the second time.
          </p>
          <p className="text-[11px] text-[#FACC15] mb-4 leading-relaxed">
            Email cannot be recalled, and identical mail to a whole list is how a new sending
            domain earns a bad reputation. Worth doing once, not routinely.
          </p>
          <ActionForm action={sendWelcomeToEveryone} submitLabel="Send to everyone">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" name="confirm" className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
              <span className="text-sm text-white/75">
                Yes, email all {workspaces} workspace{workspaces === 1 ? "" : "s"} now
              </span>
            </label>
          </ActionForm>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Attempted" value={all.length} />
        <StatCard label="Accepted by provider" value={sent} hint="Not proof of delivery" />
        <StatCard label="Failed" value={failed.length} />
        <StatCard label="Never finished" value={stuck} hint="Claimed but never recorded" />
      </div>

      {error ? (
        <EmptyState
          title="Couldn't load the email log"
          description={`${error.message}. If this mentions a missing relation, run supabase/updates/2026-09.sql — the email_log table comes from it.`}
        />
      ) : all.length > 0 ? (
        <Table head={["When", "To", "What", "Workspace", "Status", "Sent as", "What came back"]}>
          {all.map((row) => {
            const explained = explainEmailFailure(row.error);
            return (
              <tr key={row.id} className="hover:bg-white/3 transition-colors align-top">
                <Td className="text-xs text-white/45 whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Td>
                <Td className="text-xs">{row.to_email}</Td>
                <Td>
                  <Badge tone="purple">{row.kind.replace(/_/g, " ")}</Badge>
                </Td>
                <Td className="text-xs text-white/45">
                  {row.org_id ? (orgName.get(row.org_id) ?? "—") : "—"}
                </Td>
                <Td>
                  <Badge
                    tone={
                      row.status === "sent" ? "green" : row.status === "failed" ? "red" : "amber"
                    }
                  >
                    {row.status}
                  </Badge>
                </Td>
                <Td className="text-xs">
                  {row.from_email ? (
                    <>
                      <div className="text-white/55 break-all">{row.from_email}</div>
                      {row.transport && (
                        <div className="text-[10px] text-white/30">over {row.transport}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-white/25">not recorded</span>
                  )}
                </Td>
                <Td className="text-xs max-w-md">
                  {row.error ? (
                    <>
                      {explained && (
                        <div className="text-white/70 mb-1 leading-relaxed">
                          {explained.summary}
                        </div>
                      )}
                      {/* The provider's own words are kept, always. An
                          explanation that turns out to be wrong must never
                          be the only thing on screen. */}
                      <div className="text-white/35 font-mono text-[10px] leading-relaxed break-all">
                        {row.error}
                      </div>
                    </>
                  ) : row.status === "sent" ? (
                    <span className="text-white/30">
                      accepted by {row.transport ?? "the provider"}
                    </span>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <EmptyState
          title="Nothing has been sent yet"
          description={configured ? NEVER_ATTEMPTED : "Configure email above and this fills in."}
        />
      )}
    </div>
  );
}
