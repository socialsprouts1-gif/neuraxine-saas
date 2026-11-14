import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW_COOKIE } from "@/lib/brand-server";

// Seeing a brand before it has a domain.
//
// A white-label front door needs two things outside this codebase before
// it answers: a wildcard domain on the hosting project, and a DNS record.
// Neither is instant, both are easy to get wrong, and until they are
// right the brand that was just created appears not to exist — which is
// indistinguishable from the feature not working.
//
// So: /b/acme puts this browser behind that front door for a few hours.
// Same pages, same brand, no DNS. It is how you check the logo and the
// colour before handing an agency their address, and it is the answer to
// "is it me or is it the domain".
//
// A route handler rather than a page, because nothing is rendered here.
// It sets a cookie and sends you to the front page, which is the brand's
// front page from that moment on.

/** Long enough to look properly, short enough not to be a surprise later. */
const PREVIEW_HOURS = 8;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const home = new URL("/", request.url);

  // Leaving the preview. A route rather than a button somewhere, so the
  // way out is a URL somebody can be given.
  if (slug === "off") {
    const response = NextResponse.redirect(home);
    response.cookies.delete(PREVIEW_COOKIE);
    return response;
  }

  let id: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("brands")
      .select("id")
      .eq("slug", slug.toLowerCase())
      .eq("is_active", true)
      .maybeSingle();
    id = data?.id ?? null;
  } catch {
    id = null;
  }

  // No such brand. Straight to the platform's own front page rather than
  // a 404: a mistyped preview link is not an error page's worth of event.
  if (!id) return NextResponse.redirect(home);

  const response = NextResponse.redirect(home);
  response.cookies.set(PREVIEW_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PREVIEW_HOURS * 60 * 60,
  });
  return response;
}
