import { NextResponse, after, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Where a tracked button link lands before the real one.
//
// Instagram tells you nothing about a web link being tapped, so the
// number on the automations screen can only be true if the tap passes
// through here. Short path, no query string: Instagram's in-app browser
// has been seen to drop query strings on a redirect.
//
// Redirects first and counts afterwards. Somebody who tapped a button
// is waiting for a page, and a count is never worth a spinner.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://neurachat.in";
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("instagram_links")
    .select("id, rule_id, target_url, click_count")
    .eq("id", id)
    .maybeSingle();

  // An id that is not ours, or one whose automation was deleted. Home is
  // a better answer than a 404 to somebody who tapped a button in good
  // faith.
  if (!link) return NextResponse.redirect(appUrl, { status: 302 });

  after(async () => {
    try {
      await admin
        .from("instagram_links")
        .update({ click_count: link.click_count + 1 })
        .eq("id", link.id);

      if (link.rule_id) {
        const { data: rule } = await admin
          .from("instagram_comment_rules")
          .select("button_click_count")
          .eq("id", link.rule_id)
          .maybeSingle();
        if (rule) {
          await admin
            .from("instagram_comment_rules")
            .update({ button_click_count: (rule.button_click_count ?? 0) + 1 })
            .eq("id", link.rule_id);
        }
      }
    } catch (error) {
      console.error("Could not count a link click", error);
    }
  });

  return NextResponse.redirect(link.target_url, { status: 302 });
}
