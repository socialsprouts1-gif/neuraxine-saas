import { createTemplate, listTemplates, type TemplateCategory } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ templates: listTemplates() });
}

export async function POST(request: Request): Promise<Response> {
  let body: { name?: string; category?: TemplateCategory; language?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name || !body.body) {
    return Response.json({ ok: false, error: "`name` and `body` are required" }, { status: 400 });
  }

  const variableCount = (body.body.match(/\{\{\s*\d+\s*\}\}/g) ?? []).length;
  const template = createTemplate({
    name: body.name.toLowerCase().replace(/\s+/g, "_"),
    category: body.category ?? "utility",
    language: body.language ?? "en_US",
    body: body.body,
    variableCount,
  });
  return Response.json({ ok: true, template }, { status: 201 });
}
