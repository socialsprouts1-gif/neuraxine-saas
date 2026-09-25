import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchScheduledMessages } from "@/lib/scheduled-dispatch";
import { resumeParkedFlows } from "@/lib/flow-resume";

// Letting the app push its own queue along.
//
// The daily cron is the backstop, not the mechanism. On Vercel's Hobby
// plan a cron may run once a day, so a message scheduled for a quarter
// past three would sit until the small hours — which is not what
// "delivered at the time you pick" means to anybody.
//
// So the app calls this every minute while somebody has it open, which
// for a business tool is most of the working day. Scoped to the caller's
// own workspace: a signed-in person may push their own queue and nobody
// else's.
//
// It pushes two queues, not one. A chatbot sitting on a Delay node parks
// with a time to come back at, and had exactly the same problem: a two
// hour wait ended at three in the morning because that was when the cron
// ran. Both are "work whose time has come", so both move on the same beat.

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const ctx = await requireOrg();

  // Nothing here is destructive on its own — dispatch only sends messages
  // whose time has already passed, and each row is claimed before it goes,
  // so two tabs racing cannot double-send.
  // Together: a slow campaign send must not hold up a chatbot that has
  // been waiting two hours already, and vice versa.
  const [result, resumed] = await Promise.all([
    dispatchScheduledMessages(new Date(), ctx.orgId),
    resumeParkedFlows(ctx.orgId),
  ]);

  const admin = createAdminClient();

  // Told back to the caller so it can slow down. A workspace that has
  // never scheduled anything should not be asking once a minute for ever.
  // A conversation parked on a Delay counts as pending too: the tab has to
  // keep beating until the bot has said its piece.
  const [messages, parked] = await Promise.all([
    admin
      .from("scheduled_messages")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("status", "pending"),
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .not("bot_resume_at", "is", null),
  ]);

  return NextResponse.json({
    ...result,
    resumed: resumed.resumed,
    pending: (messages.count ?? 0) + (parked.count ?? 0),
  });
}
