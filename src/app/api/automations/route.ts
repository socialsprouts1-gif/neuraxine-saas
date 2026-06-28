import { createRule, ensureLoaded, listRules, persist, type AutomationRule } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await ensureLoaded();
  return Response.json({ rules: listRules() });
}

export async function POST(request: Request): Promise<Response> {
  await ensureLoaded();
  let body: Partial<AutomationRule>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name) return Response.json({ ok: false, error: "`name` is required" }, { status: 400 });

  const rule = createRule({
    name: body.name,
    enabled: body.enabled ?? true,
    triggerType: body.triggerType ?? "keyword",
    keywords: body.keywords ?? [],
    matchType: body.matchType ?? "contains",
    responseType: body.responseType ?? "text",
    responseText: body.responseText,
    responseTemplate: body.responseTemplate,
    priority: body.priority ?? 10,
  });
  await persist();
  return Response.json({ ok: true, rule }, { status: 201 });
}
