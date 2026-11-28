"use server";

import { createClient } from "@/lib/supabase/server";
import { normaliseWaNumber } from "@/lib/whatsapp-link";
import { sendPlatformEvent } from "@/lib/platform-message";

// Catching up the customers who signed up before there was anywhere to put
// a WhatsApp number.
//
// New accounts no longer come through here: sign-up proves the number with
// a code and the account is created on the server, which is also where the
// welcome is sent from. What is left is everybody who already has an
// account and no number on it — none of whom can be sent anything until
// somebody asks them once. The sign-in form asks, and this is where the
// answer lands.

/**
 * Records the WhatsApp number of somebody who already had an account.
 *
 * Only ever onto the caller's own account, and only when it is still
 * empty, so a typo at a shared machine cannot overwrite a number that was
 * already right.
 *
 * Not verified with a code, unlike sign-up — this is a signed-in person
 * filling in their own account, and stopping a sign-in to run a code
 * exchange is a tax on everybody to prevent somebody mistyping their own
 * number. The number they are trusted with is their own.
 */
export async function saveMyWhatsAppNumber(
  input: string
): Promise<{ ok: boolean; error?: string }> {
  const waId = normaliseWaNumber(input ?? "");
  if (!waId) {
    return { ok: false, error: "That number does not look right. Include the country code." };
  }

  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return { ok: false, error: "Sign in first." };

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const existing = normaliseWaNumber(
      typeof metadata.whatsapp_number === "string" ? metadata.whatsapp_number : ""
    );
    if (existing) return { ok: true };

    const { error } = await supabase.auth.updateUser({
      data: { ...metadata, whatsapp_number: waId, phone: waId },
    });
    if (error) return { ok: false, error: error.message };

    // Hello, to somebody who has just told us where to reach them. Sent
    // with the number from this request rather than by re-reading the
    // account, which has only this second been written to. It cannot fail
    // loudly: sendPlatformEvent returns a reason and never throws, and a
    // message that did not go out must not stop somebody signing in.
    const welcome = await sendPlatformEvent("signup", {
      waId,
      name: typeof metadata.full_name === "string" ? metadata.full_name : null,
    });
    if (!welcome.sent && welcome.reason) {
      console.info("No welcome message was sent", welcome.reason);
    }

    return { ok: true };
  } catch (error) {
    console.error("Could not save a WhatsApp number", error);
    return { ok: false, error: "That could not be saved just now." };
  }
}
