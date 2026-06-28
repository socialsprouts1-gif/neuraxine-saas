import { ensureLoaded, listConversations } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await ensureLoaded();
  return Response.json({ conversations: listConversations() });
}
