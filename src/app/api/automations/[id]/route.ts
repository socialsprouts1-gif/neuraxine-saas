import { deleteRule, ensureLoaded, persist, updateRule, type AutomationRule } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  await ensureLoaded();
  const { id } = await ctx.params;
  let patch: Partial<AutomationRule>;
  try {
    patch = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const rule = updateRule(id, patch);
  if (!rule) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  await persist();
  return Response.json({ ok: true, rule });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  await ensureLoaded();
  const { id } = await ctx.params;
  deleteRule(id);
  await persist();
  return Response.json({ ok: true });
}
