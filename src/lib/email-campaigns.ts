import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailBrand } from "@/lib/email";
import { customEmail } from "@/lib/email-templates";
import { fillIn, paragraphs, preheaderFrom } from "@/lib/email-compose";
import { formatMoney } from "@/types/admin";

// Writing to some of your customers rather than all of them.
//
// The product could send to exactly one audience — everybody — which in
// practice means it could not be used. An operator with eleven customers
// whose trial ended last month should not have to choose between writing
// to those eleven and writing to four hundred.
//
// Two kinds of audience, and both earn their place. A segment is a
// question about the data — who is on a trial right now — and is
// therefore correct on the day it is sent rather than on the day it was
// defined. A group is a list somebody curated, and is the right answer
// when the thing they have in common is not in the database: the ones who
// came from a particular reseller, the ones who asked about a feature.

export interface Recipient {
  orgId: string;
  orgName: string;
  email: string;
}

export interface Audience {
  /** What the send is stored as, and what the picker posts back. */
  value: string;
  label: string;
  hint: string;
}

/** The questions the data can answer, without anybody curating a list. */
export const SEGMENTS: Audience[] = [
  { value: "everyone", label: "Every workspace", hint: "Everybody with an account here" },
  { value: "trialing", label: "On a trial now", hint: "Still inside their free days" },
  { value: "trial_ended", label: "Trial ended, never paid", hint: "The ones worth winning back" },
  { value: "paying", label: "Paying customers", hint: "On an active plan" },
  { value: "past_due", label: "Payment overdue", hint: "A plan that did not renew" },
];

/**
 * Who a value means, resolved now rather than when it was chosen.
 *
 * Addresses come back de-duplicated. One person owning four workspaces is
 * one person, and four copies of the same announcement landing together
 * is the fastest way to be marked as spam — the same reason the nightly
 * sweep collapses by recipient.
 */
export async function resolveAudience(
  value: string
): Promise<{ label: string; recipients: Recipient[] }> {
  const admin = createAdminClient();

  const orgIds = await orgIdsFor(admin, value);
  if (!orgIds) return { label: "Nobody", recipients: [] };

  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, suspended_at")
    .in("id", orgIds.ids.length > 0 ? orgIds.ids : ["00000000-0000-0000-0000-000000000000"]);

  const { data: optOuts } = await admin.from("email_optouts").select("email");
  const refused = new Set((optOuts ?? []).map((row) => row.email.trim().toLowerCase()));

  const owners = await ownerEmails(
    admin,
    (orgs ?? []).filter((org) => !org.suspended_at).map((org) => org.id)
  );

  const seen = new Set<string>();
  const recipients: Recipient[] = [];

  for (const org of orgs ?? []) {
    // A workspace that has been suspended is in a dispute, and a cheerful
    // announcement arriving in the middle of one reads as nobody being
    // in charge.
    if (org.suspended_at) continue;

    const email = owners.get(org.id);
    if (!email) continue;

    const key = email.trim().toLowerCase();
    if (seen.has(key) || refused.has(key)) continue;

    seen.add(key);
    recipients.push({ orgId: org.id, orgName: org.name, email });
  }

  recipients.sort((a, b) => a.orgName.localeCompare(b.orgName));
  return { label: orgIds.label, recipients };
}

/**
 * Every owner's address, in two queries rather than two per workspace.
 *
 * ownerEmail() asks for one, which is right for the nightly sweep where
 * the loop is over a handful of workspaces that are actually owed
 * something. Resolving an audience is the other shape: four hundred
 * workspaces, every one of them needed, and eight hundred round trips to
 * find that out is a screen that times out rather than loads.
 *
 * The owner, and only the owner — the same rule the sweep follows. A
 * workspace with no owner on file simply has no address and is skipped.
 */
async function ownerEmails(
  admin: ReturnType<typeof createAdminClient>,
  orgIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (orgIds.length === 0) return out;

  const { data: members } = await admin
    .from("org_members")
    .select("org_id, user_id")
    .in("org_id", orgIds)
    .eq("role", "owner");

  const userIds = [...new Set((members ?? []).map((row) => row.user_id))];
  if (userIds.length === 0) return out;

  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, email")
    .in("user_id", userIds);

  const byUser = new Map(
    (profiles ?? [])
      .filter((row) => row.email?.trim())
      .map((row) => [row.user_id, row.email!.trim()])
  );

  for (const row of members ?? []) {
    const email = byUser.get(row.user_id);
    if (email) out.set(row.org_id, email);
  }

  return out;
}

/** The workspace ids behind an audience value, or null when it is unknown. */
async function orgIdsFor(
  admin: ReturnType<typeof createAdminClient>,
  value: string
): Promise<{ label: string; ids: string[] } | null> {
  if (value.startsWith("group:")) {
    const groupId = value.slice("group:".length);
    const [{ data: group }, { data: members }] = await Promise.all([
      admin.from("email_groups").select("name").eq("id", groupId).maybeSingle(),
      admin.from("email_group_members").select("org_id").eq("group_id", groupId),
    ]);
    if (!group) return null;
    return { label: group.name, ids: (members ?? []).map((row) => row.org_id) };
  }

  if (value.startsWith("org:")) {
    const orgId = value.slice("org:".length);
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) return null;
    return { label: org.name, ids: [orgId] };
  }

  const segment = SEGMENTS.find((row) => row.value === value);
  if (!segment) return null;

  if (value === "everyone") {
    const { data } = await admin.from("organizations").select("id");
    return { label: segment.label, ids: (data ?? []).map((row) => row.id) };
  }

  // The three subscription states, and the one that is a state plus a
  // date: a trial that ended is a trialing row whose period is in the
  // past, because nothing moves it to another status when the clock runs
  // out.
  const status =
    value === "paying" ? "active" : value === "past_due" ? "past_due" : "trialing";

  const { data } = await admin
    .from("subscriptions")
    .select("org_id, current_period_end")
    .eq("status", status);

  const now = Date.now();
  const ids = (data ?? [])
    .filter((row) => {
      if (value === "trialing") return new Date(row.current_period_end ?? 0).getTime() > now;
      if (value === "trial_ended") return new Date(row.current_period_end ?? 0).getTime() <= now;
      return true;
    })
    .map((row) => row.org_id);

  return { label: segment.label, ids };
}

export interface CampaignResult {
  sent: number;
  skipped: number;
  failed: number;
  campaignId: string;
}

/**
 * Send a template to an audience.
 *
 * The dedupe key is keyed to this send rather than to the message, which
 * is the whole difference between this and the nightly sweep. The sweep's
 * guard exists so a retried cron cannot send "your trial ends tomorrow"
 * twice; applying that same guard here would mean an operator could write
 * to a customer once and never again, which is not a safety feature, it
 * is a broken product. A human pressing send has decided.
 *
 * Everything else about the send is shared: the same transport, the same
 * log, the same unsubscribe link and the same suppression list, so a
 * campaign cannot reach somebody who has opted out.
 */
export async function sendCampaign(input: {
  templateId: string;
  audience: string;
  sentBy: string | null;
}): Promise<CampaignResult | { error: string }> {
  const admin = createAdminClient();

  const { data: template } = await admin
    .from("email_templates")
    .select("id, name, subject, body, action_label, action_path")
    .eq("id", input.templateId)
    .maybeSingle();

  if (!template) return { error: "That template no longer exists." };

  const { label, recipients } = await resolveAudience(input.audience);
  if (recipients.length === 0) {
    return {
      error:
        "Nobody in that audience can be written to. Suspended workspaces, addresses that have unsubscribed, and workspaces with no owner on file are all left out.",
    };
  }

  const brand = emailBrand();
  const price = await cheapestPlan(admin);

  // Written before the first message, so a send that dies halfway still
  // leaves a record of what was attempted and who it was aimed at.
  const { data: campaign, error: campaignError } = await admin
    .from("email_campaigns")
    .insert({
      template_id: template.id,
      subject: template.subject,
      audience: input.audience,
      audience_label: label,
      sent_by: input.sentBy,
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    return { error: campaignError?.message ?? "Could not start the send." };
  }

  const result: CampaignResult = { sent: 0, skipped: 0, failed: 0, campaignId: campaign.id };

  for (const person of recipients) {
    const values = {
      workspace: person.orgName,
      email: person.email,
      brand: brand.name,
      app_url: brand.appUrl,
      price,
    };

    const body = fillIn(template.body, values);
    const actionLabel = template.action_label?.trim();
    const actionPath = template.action_path?.trim();

    const outcome = await sendEmail({
      to: person.email,
      orgId: person.orgId,
      kind: "campaign",
      dedupeKey: `campaign:${campaign.id}:${person.orgId}`,
      body: (withOptOut) =>
        customEmail(withOptOut, {
          subject: fillIn(template.subject, values),
          preheader: preheaderFrom(body),
          paragraphs: paragraphs(body),
          action:
            actionLabel && actionPath
              ? { label: actionLabel, href: `${withOptOut.appUrl}${actionPath}` }
              : null,
        }),
    });

    if (outcome.skipped) result.skipped += 1;
    else if (outcome.ok) result.sent += 1;
    else result.failed += 1;
  }

  await admin
    .from("email_campaigns")
    .update({ sent: result.sent, skipped: result.skipped, failed: result.failed })
    .eq("id", campaign.id);

  return result;
}

/** The cheapest monthly plan, for {{price}}. */
async function cheapestPlan(
  admin: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const { data } = await admin
    .from("plans")
    .select("price_cents, currency")
    .eq("is_active", true)
    .eq("billing_interval", "monthly")
    .order("price_cents", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data || typeof data.price_cents !== "number") return null;
  return `${formatMoney(data.price_cents, data.currency)} a month`;
}

export interface AudienceOption extends Audience {
  /** Workspaces, not deliverable addresses — see the note below. */
  size: number;
  group?: boolean;
}

/**
 * Everything that can be written to, with how big it is.
 *
 * The number is workspaces rather than people who will actually receive
 * the message, and the difference is deliberate: working out the second
 * means resolving owners and the suppression list for every audience on
 * the page, which is a handful of queries each for a figure nobody has
 * asked for yet. The chosen audience is resolved properly before the send
 * — that is the number next to the confirm box, and it is the one that
 * counts.
 */
export async function listAudiences(): Promise<AudienceOption[]> {
  const admin = createAdminClient();

  const [segments, groups] = await Promise.all([
    Promise.all(
      SEGMENTS.map(async (segment) => ({
        ...segment,
        size: (await orgIdsFor(admin, segment.value))?.ids.length ?? 0,
      }))
    ),
    (async (): Promise<AudienceOption[]> => {
      const { data: rows, error } = await admin
        .from("email_groups")
        .select("id, name, description")
        .order("name");

      // No table yet means the migration has not been run. Segments still
      // work, so the screen is useful rather than blank.
      if (error || !rows) return [];

      const { data: members } = await admin.from("email_group_members").select("group_id");
      const counts = new Map<string, number>();
      for (const row of members ?? []) {
        counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
      }

      return rows.map((row) => ({
        value: `group:${row.id}`,
        label: row.name,
        hint: row.description ?? "A list you put together",
        size: counts.get(row.id) ?? 0,
        group: true,
      }));
    })(),
  ]);

  return [...segments, ...groups];
}

/** Every workspace, for the tickbox list that builds a group. */
export async function listWorkspaces(): Promise<{ id: string; name: string }[]> {
  const { data } = await createAdminClient()
    .from("organizations")
    .select("id, name")
    .order("name");
  return data ?? [];
}

/** Which workspaces are in a group right now. */
export async function groupMembers(groupId: string): Promise<Set<string>> {
  const { data } = await createAdminClient()
    .from("email_group_members")
    .select("org_id")
    .eq("group_id", groupId);
  return new Set((data ?? []).map((row) => row.org_id));
}
