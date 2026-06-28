import { runCampaign } from "@/lib/automation";
import { createCampaign, listCampaigns } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ campaigns: listCampaigns() });
}

/**
 * Create a campaign. Pass `send: true` to broadcast immediately; otherwise it
 * is saved as a draft (or scheduled, if `scheduledAt` is given).
 */
export async function POST(request: Request): Promise<Response> {
  let body: {
    name?: string;
    templateName?: string;
    audienceTag?: string;
    type?: "broadcast" | "drip" | "trigger";
    send?: boolean;
    scheduledAt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name) return Response.json({ ok: false, error: "`name` is required" }, { status: 400 });

  let campaign = createCampaign({
    name: body.name,
    type: body.type ?? "broadcast",
    status: body.scheduledAt ? "scheduled" : "draft",
    templateName: body.templateName,
    audienceTag: body.audienceTag,
    recipientCount: 0,
    scheduledAt: body.scheduledAt,
  });

  if (body.send) {
    campaign = await runCampaign(campaign);
  }

  return Response.json({ ok: true, campaign }, { status: 201 });
}
