import { createFlow, listFlows, listJobs, type Flow } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ flows: listFlows(), jobs: listJobs() });
}

export async function POST(request: Request): Promise<Response> {
  let body: Partial<Flow>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name || !body.steps?.length) {
    return Response.json({ ok: false, error: "`name` and at least one step are required" }, { status: 400 });
  }

  const flow = createFlow({
    name: body.name,
    enabled: body.enabled ?? true,
    trigger: body.trigger ?? "on_new_contact",
    keywords: body.keywords ?? [],
    steps: body.steps,
  });
  return Response.json({ ok: true, flow }, { status: 201 });
}
