import { currentBrand } from "@/lib/brand-server";
import { wordmark } from "@/lib/brand";

// A line across the top while a preview is on.
//
// Without it the preview is a trap. Somebody clicks a preview link,
// forgets, comes back to their own site tomorrow and finds an agency's
// logo on it — and the obvious conclusion is that the product is broken
// rather than that a cookie is doing exactly what it was asked to.
//
// Renders nothing at all on a real brand domain, and nothing on the
// platform's own site. It only appears for the one person who asked for
// the preview, in the one browser they asked in.

export default async function BrandPreviewBar() {
  const brand = await currentBrand();
  if (!brand || brand.source !== "preview") return null;

  return (
    <div className="sticky top-0 z-[150] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center bg-[#A855F7] text-[#FFFFFF] text-[12px] font-medium">
      <span>
        Previewing the <strong className="font-semibold">{wordmark(brand)}</strong> front door.
        Only you see this.
      </span>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
          /b/off is a route handler, not a page: it clears the cookie and
          redirects. next/link would navigate on the client, which neither
          sends the request that clears it nor re-renders what the cookie
          was changing. A real navigation is the whole point. */}
      <a href="/b/off" className="underline underline-offset-2 hover:opacity-80">
        Leave preview
      </a>
    </div>
  );
}
