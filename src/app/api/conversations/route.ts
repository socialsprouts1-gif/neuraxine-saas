import { listConversations } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ conversations: listConversations() });
}
