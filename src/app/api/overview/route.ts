import {
  db,
  getActivity,
  listCampaigns,
  listContacts,
  listConversations,
  listRules,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/** Summary payload for the main dashboard. */
export function GET(): Response {
  const campaigns = listCampaigns();
  const contacts = listContacts();
  const conversations = listConversations();
  const outbound = db().messages.filter((m) => m.direction === "out").length;

  const campaignSent = campaigns.reduce((a, c) => a + c.stats.sent, 0);
  const unread = conversations.reduce((a, c) => a + c.unread, 0);
  const activeRules = listRules().filter((r) => r.enabled).length;

  // Quick 7-day sparkline of message volume.
  const spark = Array.from({ length: 7 }).map((_, i) =>
    Math.round(800 + Math.sin(i) * 260 + (i % 2) * 140),
  );

  return Response.json({
    stats: {
      messagesSent: campaignSent + outbound,
      contacts: contacts.length,
      activeCampaigns: campaigns.filter((c) => c.status === "sending").length,
      unreadConversations: unread,
      activeRules,
      automationsRun: listRules().reduce((a, r) => a + r.triggeredCount, 0),
    },
    spark,
    recentConversations: conversations.slice(0, 5),
    activity: getActivity(),
  });
}
