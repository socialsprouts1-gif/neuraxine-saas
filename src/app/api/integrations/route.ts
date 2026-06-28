import { ensureLoaded, listIntegrations, persist, toggleIntegration } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await ensureLoaded();
  return Response.json({ integrations: listIntegrations() });
}

export async function PATCH(request: Request): Promise<Response> {
  await ensureLoaded();
  let body: { id?: string; connected?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) return Response.json({ ok: false, error: "`id` is required" }, { status: 400 });

  const integration = toggleIntegration(body.id, body.connected ?? true);
  if (!integration) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  await persist();
  return Response.json({ ok: true, integration });
}
