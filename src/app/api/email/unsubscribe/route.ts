import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyEmail } from "@/lib/email-kinds";
import { emailBrand } from "@/lib/email";

// Honouring the unsubscribe link.
//
// POST is what RFC 8058 one-click does: Gmail and Yahoo send it themselves
// when somebody presses the unsubscribe button in their own interface, with
// no human ever seeing this endpoint. GET is the same link opened in a
// browser, from the footer of the message.
//
// Both are unauthenticated by necessity — the person is in their mailbox,
// not signed in — so the address carries a signature over it. Without that,
// the link is an address in a URL and anyone holding one could unsubscribe
// every customer by editing it.

export const dynamic = "force-dynamic";

function secret(): string | null {
  // The same key the tokens are signed with. Its absence must not turn
  // into a working unsubscribe for everybody.
  return process.env.TOKEN_ENCRYPTION_KEY ?? null;
}

async function record(email: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("email_optouts")
    .insert({ email: email.trim().toLowerCase(), source: "link" });

  // 23505 is the unique index: already unsubscribed, which is a success
  // from the person's point of view and must not read as a failure.
  return !error || error.code === "23505";
}

function check(request: Request): { email: string } | { status: number; reason: string } {
  const key = secret();
  if (!key) return { status: 503, reason: "Unsubscribe is not configured on this deployment." };

  const url = new URL(request.url);
  const email = (url.searchParams.get("e") ?? "").trim();
  const token = (url.searchParams.get("t") ?? "").trim();

  if (!email || !token) return { status: 400, reason: "This link is incomplete." };
  if (!verifyEmail(email, token, key)) {
    return { status: 403, reason: "This link is not valid for that address." };
  }
  return { email };
}

/** One-click, sent by the mail client itself. No page, no confirmation. */
export async function POST(request: Request): Promise<NextResponse> {
  const checked = check(request);
  if ("status" in checked) {
    return NextResponse.json({ ok: false, error: checked.reason }, { status: checked.status });
  }

  const done = await record(checked.email);
  return NextResponse.json({ ok: done }, { status: done ? 200 : 500 });
}

/** The same link, opened in a browser. Unsubscribes, then says so. */
export async function GET(request: Request): Promise<Response> {
  const checked = check(request);
  const brand = emailBrand();

  if ("status" in checked) {
    return page(brand.name, "That link did not work", checked.reason, checked.status);
  }

  const done = await record(checked.email);
  return done
    ? page(
        brand.name,
        "You are unsubscribed",
        `${checked.email} will get no more trial reminders or follow-ups. Anything about your account itself — a receipt, or your subscription ending — still comes through, because those are not marketing.`,
        200
      )
    : page(brand.name, "Something went wrong", "Please write to us and we will do it by hand.", 500);
}

/**
 * Deliberately a whole page rather than a redirect into the app.
 *
 * Somebody clicking this is not signed in and may not have an account any
 * more. Sending them to a login screen to finish unsubscribing is how an
 * unsubscribe turns into a spam report.
 */
function page(brandName: string, title: string, body: string, status: number): Response {
  const esc = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return new Response(
    `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
</head>
<body style="margin:0;background:#F4F6F8;font-family:Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:12vh auto;padding:36px 32px;background:#fff;border-radius:14px;">
  <div style="font-size:17px;font-weight:700;color:#0B1220;margin-bottom:20px;">${esc(brandName)}</div>
  <h1 style="font-size:20px;color:#0B1220;margin:0 0 12px;">${esc(title)}</h1>
  <p style="font-size:15px;line-height:1.65;color:#25303F;margin:0;">${esc(body)}</p>
</div>
</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}
