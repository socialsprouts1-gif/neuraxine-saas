import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { listConnections, optionLabel } from "@/lib/connections";
import { EmptyState } from "@/components/ui/primitives";
import ConversationList, {
  type ConversationRow,
  type Teammate,
} from "./ConversationList";
import Thread, { type ThreadMessage } from "./Thread";
import type { LeadStage } from "@/types/portal";

// WhatsApp only delivers free-form replies within 24 hours of the customer's
// last inbound message. Outside it, only an approved template goes through.
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whether a free-form reply would still deliver to this contact. */
function isWindowOpen(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - Date.parse(lastInboundAt) < SERVICE_WINDOW_MS;
}

// The message body is stored as the raw type-specific payload Meta sent, so
// rendering has to cope with more than plain text.
function renderBody(type: string, content: Record<string, unknown>): string {
  if (type === "text") return String(content.body ?? "");
  if (type === "template") return `Template: ${String(content.template_name ?? "—")}`;
  if (type === "image" || type === "video" || type === "document" || type === "audio") {
    const caption = content.caption ? ` — ${String(content.caption)}` : "";
    return `[${type}]${caption}`;
  }
  if (type === "interactive" || type === "button") {
    const c = content as {
      body?: string;
      button_reply?: { title?: string };
      list_reply?: { title?: string };
    };
    // Inbound: the customer tapped a button, so the title is the message.
    // Outbound: we sent the buttons, so the body is.
    return String(c.button_reply?.title ?? c.list_reply?.title ?? c.body ?? "[interactive]");
  }
  return `[${type}]`;
}

/** Quick-reply buttons the bot attached, in the {id, title} shape Meta took. */
function renderButtons(content: Record<string, unknown>): string[] {
  const buttons = (content as { buttons?: Array<{ title?: string }> }).buttons;
  if (!Array.isArray(buttons)) return [];
  return buttons.map((button) => button?.title).filter((title): title is string => Boolean(title));
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { orgId, user } = await requireOrg();
  const { c: selectedId } = await searchParams;
  const supabase = await createClient();

  // Only worth naming the receiving number when there is more than one to
  // confuse it with; a single-number workspace does not need the noise.
  const connections = await listConnections(supabase, orgId);
  const numberById = new Map(
    connections.map((connection) => [connection.id, optionLabel(connection)])
  );
  const showNumbers = connections.length > 1;

  const { data: conversations, error } = await supabase
    .from("conversations")
    .select(
      "id, status, last_message_at, last_read_at, last_inbound_at, assigned_to, contact_id, connection_id, bot_enabled, ai_mode, priority, closed_at, needs_human, needs_human_reason, ai_summary, ai_next_action, ai_intent, ai_sentiment, contacts(id, wa_id, name, tags, opted_out, lead_stage, lead_score, lead_score_reasons, source, campaign, deal_value, created_at)"
    )
    .eq("org_id", orgId)
    // Closed threads leave the active inbox; the "closed" view brings them
    // back when someone needs one.
    .is("closed_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <EmptyState
          title="Couldn't load conversations"
          description={`${error.message}. If this mentions a missing column, run the latest migration in supabase/setup.sql — the inbox added assignment and read tracking.`}
        />
      </div>
    );
  }

  const list = conversations ?? [];

  if (list.length === 0) {
    return (
      <div className="p-6 md:p-8">
        <EmptyState
          title="No conversations yet"
          description="Conversations appear here as soon as Meta delivers an inbound message. If you have connected a number and nothing arrives, the webhook registration is the usual cause — Admin → Webhook logs shows whether Meta has ever called."
          action={
            <div className="flex flex-wrap gap-2 justify-center">
              <Link href="/integrations" className="btn-primary text-sm">
                WhatsApp connection
              </Link>
              <Link href="/admin/webhook-logs" className="btn-secondary text-sm">
                Check webhook logs
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const active = selectedId ? list.find((row) => row.id === selectedId) : list[0];

  // The preview line wants the last message of every thread, which is one
  // query for the lot rather than one per row.
  const { data: recent } = await supabase
    .from("messages")
    .select("conversation_id, type, content, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(600);

  const previews = new Map<string, string>();
  for (const message of recent ?? []) {
    if (!previews.has(message.conversation_id)) {
      previews.set(message.conversation_id, renderBody(message.type, message.content));
    }
  }

  const [{ data: members }, { data: canned }, { data: templates }, { data: media }, { data: pendingReminders }] =
    await Promise.all([
      supabase.from("org_members").select("user_id").eq("org_id", orgId),
      supabase
        .from("canned_messages")
        .select("id, shortcut, title, body")
        .eq("org_id", orgId)
        .order("use_count", { ascending: false })
        .limit(50),
      supabase
        .from("message_templates")
        .select("id, name, language, category")
        .eq("org_id", orgId)
        .eq("status", "approved")
        .order("name"),
      supabase
        .from("media_assets")
        .select("id, name, url, media_type")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("reminders")
        .select("conversation_id")
        .eq("org_id", orgId)
        .eq("status", "pending"),
    ]);

  const withReminder = new Set(
    (pendingReminders ?? [])
      .map((reminder) => reminder.conversation_id)
      .filter((id): id is string => Boolean(id))
  );

  // Names come from profiles rather than the join: org_members has no
  // declared foreign key to it, so PostgREST cannot embed one in the other.
  const memberIds = (members ?? []).map((member) => member.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", memberIds)
    : { data: [] };

  const teammates: Teammate[] = (members ?? []).map((member) => {
    const profile = (profiles ?? []).find((row) => row.user_id === member.user_id);
    return {
      userId: member.user_id,
      // A user id is not a name. Fall back through what we have rather than
      // showing a raw uuid in an assignment menu.
      name: profile?.full_name || profile?.email || `Member ${member.user_id.slice(0, 6)}`,
    };
  });

  const rows: ConversationRow[] = list.map((row) => {
    const contact = row.contacts as {
      id: string;
      wa_id: string;
      name: string | null;
      tags: string[];
      opted_out: boolean;
      lead_stage: string;
      lead_score: number | null;
    } | null;

    return {
      id: row.id,
      contactId: contact?.id ?? "",
      name: contact?.name || contact?.wa_id || "Unknown",
      waId: contact?.wa_id ?? "",
      tags: contact?.tags ?? [],
      preview: previews.get(row.id) ?? "",
      connectionId: row.connection_id,
      lastMessageAt: row.last_message_at,
      // Never read, or a message arrived since it was last opened.
      unread:
        Boolean(row.last_message_at) &&
        (!row.last_read_at || Date.parse(row.last_message_at!) > Date.parse(row.last_read_at)),
      status: row.status,
      assignedTo: row.assigned_to,
      assignedName: teammates.find((mate) => mate.userId === row.assigned_to)?.name ?? null,
      score: contact?.lead_score ?? null,
      stage: contact?.lead_stage ?? "new",
      needsHuman: row.needs_human,
      hasReminder: withReminder.has(row.id),
      priority: row.priority,
    };
  });

  const allTags = [...new Set(rows.flatMap((row) => row.tags))].sort();

  const { data: messages } = active
    ? await supabase
        .from("messages")
        .select("id, direction, type, content, status, created_at")
        .eq("conversation_id", active.id)
        .order("created_at")
        .limit(300)
    : { data: null };

  const activeContact = active?.contacts as {
    id: string;
    wa_id: string;
    name: string | null;
    opted_out: boolean;
    tags: string[];
    lead_stage: LeadStage;
    lead_score: number | null;
    lead_score_reasons: string[];
    source: string | null;
    campaign: string | null;
    deal_value: number | null;
    created_at: string;
  } | null;

  // Notes, the timeline and the last bot run only matter for the open thread.
  const { data: lastRun } = active
    ? await supabase
        .from("bot_runs")
        .select("outcome, matched_label, error")
        .eq("conversation_id", active.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const [{ data: notes }, { data: events }] = active
    ? await Promise.all([
        supabase
          .from("conversation_notes")
          .select("id, body, author_id, created_at")
          .eq("conversation_id", active.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("conversation_events")
          .select("id, label, created_at")
          .eq("conversation_id", active.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ])
    : [{ data: null }, { data: null }];

  const windowOpen = isWindowOpen(active?.last_inbound_at ?? null);

  const threadMessages: ThreadMessage[] = (messages ?? []).map((message) => ({
    id: message.id,
    direction: message.direction as "inbound" | "outbound",
    body: renderBody(message.type, message.content),
    buttons: message.direction === "outbound" ? renderButtons(message.content) : [],
    status: message.status,
    createdAt: message.created_at,
  }));

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <ConversationList
        rows={rows}
        activeId={active?.id ?? null}
        teammates={teammates}
        allTags={allTags}
        currentUserId={user.id}
        orgId={orgId}
        numbers={connections
          .filter((connection) => connection.status === "active")
          .map((connection) => ({
            id: connection.id,
            label: optionLabel(connection),
            status: connection.status,
          }))}
      />

      {active && activeContact ? (
        <Thread
          orgId={orgId}
          conversationId={active.id}
          contactId={activeContact.id}
          name={activeContact.name ?? ""}
          waId={activeContact.wa_id}
          viaNumber={
            showNumbers && active.connection_id
              ? (numberById.get(active.connection_id) ?? null)
              : null
          }
          optedIn={!activeContact.opted_out}
          aiMode={active.ai_mode}
          botEnabled={active.bot_enabled}
          lastBotRun={
            lastRun
              ? {
                  outcome: lastRun.outcome,
                  label: lastRun.matched_label,
                  error: lastRun.error,
                }
              : null
          }
          priority={active.priority}
          closed={Boolean(active.closed_at)}
          needsHuman={active.needs_human}
          needsHumanReason={active.needs_human_reason}
          windowOpen={windowOpen}
          assignedTo={active.assigned_to}
          unread={rows.find((row) => row.id === active.id)?.unread ?? false}
          teammates={teammates}
          messages={threadMessages}
          customer={{
            conversationId: active.id,
            contactId: activeContact.id,
            name: activeContact.name ?? "",
            waId: activeContact.wa_id,
            tags: activeContact.tags ?? [],
            stage: activeContact.lead_stage,
            score: activeContact.lead_score,
            scoreReasons: activeContact.lead_score_reasons ?? [],
            intent: active.ai_intent,
            sentiment: active.ai_sentiment,
            summary: active.ai_summary,
            nextAction: active.ai_next_action,
            source: activeContact.source,
            campaign: activeContact.campaign,
            dealValue: activeContact.deal_value,
            createdAt: activeContact.created_at,
            notes: (notes ?? []).map((note) => ({
              id: note.id,
              body: note.body,
              author:
                teammates.find((mate) => mate.userId === note.author_id)?.name ?? "Someone",
              createdAt: note.created_at,
            })),
            events: (events ?? []).map((event) => ({
              id: event.id,
              label: event.label,
              createdAt: event.created_at,
            })),
          }}
          canned={canned ?? []}
          templates={templates ?? []}
          media={(media ?? []).map((asset) => ({
            id: asset.id,
            name: asset.name,
            url: asset.url,
            type: asset.media_type,
          }))}
        />
      ) : (
        <div className="flex-1 grid place-items-center text-sm text-white/40">
          Select a conversation
        </div>
      )}
    </div>
  );
}
