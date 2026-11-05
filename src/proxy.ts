import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Renamed from `middleware` per Next.js 16 (the `middleware` file
// convention is deprecated in favor of `proxy`).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
