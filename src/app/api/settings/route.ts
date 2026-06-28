import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { getSettings, updateSettings, type Settings } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({
    settings: getSettings(),
    whatsappConfigured: isWhatsAppConfigured(),
    webhookPath: "/api/whatsapp/webhook",
  });
}

export async function PATCH(request: Request): Promise<Response> {
  let patch: Partial<Settings>;
  try {
    patch = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  return Response.json({ ok: true, settings: updateSettings(patch) });
}
