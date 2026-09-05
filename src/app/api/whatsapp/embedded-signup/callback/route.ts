import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/crypto";
import { randomBytes } from "node:crypto";
import { MetaApiError, describeMetaError } from "@/lib/meta-whatsapp";
import {
  exchangeCodeForToken,
  generateRegistrationPin,
  getEmbeddedSignupEnv,
  phoneNumbersForWaba,
  readSignupState,
  registerPhoneNumber,
  subscribeAppToWaba,
  wabaIdsForToken,
} from "@/lib/embedded-signup";

// Where Meta sends the operator once they finish the dialog. Everything the
// manual form used to ask for is derived here instead: the token comes from
// the code, the WABA from the token, the numbers from the WABA.
//
// Uses the service-role client on purpose — this is a redirect back from
// facebook.com and carries no Supabase session cookie for the tenant. The
// signed state is what proves which org the flow belongs to.

export const dynamic = "force-dynamic";

function back(request: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL("/integrations", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export function redirectUriFor(origin: string): string {
  return `${origin}/api/whatsapp/embedded-signup/callback`;
}

export async function GET(request: NextRequest) {
  const env = getEmbeddedSignupEnv();
  if (!env) {
    return back(request, { wa_error: "Embedded Signup is not configured on this deployment." });
  }

  const params = request.nextUrl.searchParams;

  // The operator pressed Cancel, or Meta refused. Both arrive here.
  const metaError = params.get("error_description") ?? params.get("error");
  if (metaError) {
    return back(request, { wa_error: `Meta cancelled the connection: ${metaError}` });
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return back(request, { wa_error: "Meta redirected back without an authorization code." });
  }

  const parsed = readSignupState(state, env.appSecret);
  if (!parsed) {
    return back(request, {
      wa_error: "That connection link is invalid or expired. Start the connection again.",
    });
  }

  const redirectUri = redirectUriFor(request.nextUrl.origin);

  try {
    const token = await exchangeCodeForToken(code, env, redirectUri);

    const wabaIds = await wabaIdsForToken(token, env);
    if (wabaIds.length === 0) {
      return back(request, {
        wa_error:
          "Meta granted a token with no WhatsApp Business Account attached. Run the connection again and make sure you select a business.",
      });
    }

    const supabase = createAdminClient();
    const encrypted = encryptToken(token);
    const connected: string[] = [];
    const notes: string[] = [];

    for (const wabaId of wabaIds) {
      // The step with no UI in Meta's dashboard, and the reason a correct
      // callback URL can still deliver nothing.
      await subscribeAppToWaba(wabaId, token);

      const numbers = await phoneNumbersForWaba(wabaId, token);
      if (numbers.length === 0) {
        notes.push(`No phone number is attached to WABA ${wabaId} yet.`);
        continue;
      }

      for (const number of numbers) {
        const problem = await registerPhoneNumber(number.id, token, generateRegistrationPin());
        if (problem) notes.push(problem);

        // Reuse the verify token if this number was connected before, so a
        // reconnect does not invalidate a webhook already registered.
        const { data: existing } = await supabase
          .from("waba_connections")
          .select("webhook_verify_token")
          .eq("phone_number_id", number.id)
          .maybeSingle();

        const { error } = await supabase.from("waba_connections").upsert(
          {
            org_id: parsed.orgId,
            waba_id: wabaId,
            phone_number_id: number.id,
            meta_app_id: env.appId,
            access_token_encrypted: encrypted,
            webhook_verify_token:
              existing?.webhook_verify_token ?? randomBytes(24).toString("base64url"),
            status: "active",
            last_error: null,
            last_error_at: null,
          },
          { onConflict: "phone_number_id" }
        );

        if (error) {
          console.error("Embedded Signup stored no connection", error);
          return back(request, { wa_error: `Could not save the connection: ${error.message}` });
        }

        connected.push(number.display_phone_number ?? number.id);
      }
    }

    if (connected.length === 0) {
      return back(request, {
        wa_error: notes[0] ?? "Meta returned no phone numbers to connect.",
      });
    }

    return back(request, {
      wa_connected: connected.join(", "),
      ...(notes.length > 0 ? { wa_note: notes.join(" ") } : {}),
    });
  } catch (error) {
    if (error instanceof MetaApiError) {
      console.error("Embedded Signup failed", error.body);
      return back(request, { wa_error: describeMetaError(error.status, error.body) });
    }
    console.error("Embedded Signup failed", error);
    return back(request, {
      wa_error: error instanceof Error ? error.message : "The connection could not be completed.",
    });
  }
}
