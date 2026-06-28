import { createContact, listContacts } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ contacts: listContacts() });
}

export async function POST(request: Request): Promise<Response> {
  let body: { name?: string; phone?: string; email?: string; tags?: string[]; status?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const phone = body.phone?.replace(/[^\d]/g, "");
  if (!body.name || !phone) {
    return Response.json({ ok: false, error: "`name` and `phone` are required" }, { status: 400 });
  }

  const contact = createContact({
    name: body.name,
    phone,
    email: body.email,
    tags: body.tags ?? [],
    status: (body.status as never) ?? "lead",
  });
  return Response.json({ ok: true, contact }, { status: 201 });
}
