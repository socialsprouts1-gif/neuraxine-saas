import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { ensureLoaded, getSettings, persist, updateSettings, type Settings } from "@/lib/store";
import { persistenceMode } from "@/lib/persistence";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await ensureLoaded();
  return Response.json({
    settings: getSettings(),
    whatsappConfigured: isWhatsAppConfigured(),
    webhookPath: "/api/whatsapp/webhook",
    persistence: persistenceMode(),
  });
}

export async function PATCH(request: Request): Promise<Response> {
  await ensureLoaded();
  let patch: Partial<Settings>;
  try {
    patch = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const settings = updateSettings(patch);
  await persist();
  return Response.json({ ok: true, settings });
}
