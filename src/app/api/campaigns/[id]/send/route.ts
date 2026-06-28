import { runCampaign } from "@/lib/automation";
import { db, ensureLoaded } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Send (broadcast) an existing campaign now. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  await ensureLoaded();
  const { id } = await ctx.params;
  const campaign = db().campaigns.find((c) => c.id === id);
  if (!campaign) return Response.json({ ok: false, error: "Not found" }, { status: 404 });

  const updated = await runCampaign(campaign);
  return Response.json({ ok: true, campaign: updated });
}
