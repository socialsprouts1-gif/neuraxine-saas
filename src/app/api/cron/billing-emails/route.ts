import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isCronAuthorised } from "@/lib/cron-auth";
import { isEmailConfigured } from "@/lib/email";
import { sweepBillingEmails } from "@/lib/billing-emails";

// Trial and renewal mail, on a timer.
//
// Daily is the right cadence and running it more often is harmless: the
// unique index on the dedupe key means a second sweep in the same period
// sends nothing.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEmailConfigured()) {
    // 200 rather than an error: a deployment that has not set up mail yet
    // is not broken, and a red cron every night for a feature nobody has
    // turned on is how real failures stop being noticed.
    return NextResponse.json({
      skipped:
        "Email is not configured, so nothing was sent. Set EMAIL_FROM, plus either RESEND_API_KEY or the four SMTP_* variables.",
    });
  }

  return NextResponse.json(await sweepBillingEmails());
}
