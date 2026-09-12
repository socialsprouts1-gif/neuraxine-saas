"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SidebarBrand, SidebarNav } from "./Sidebar";

/**
 * The navigation on a phone.
 *
 * The rail is 240px wide, which on a 390px screen left the actual page a
 * sliver — every card clipped, every heading cut off mid-word. So below the
 * lg breakpoint the rail is not rendered at all and this takes over: a
 * button in the top bar, and a drawer over the page.
 *
 * It closes on navigation, on Escape, and on a tap outside. A menu you have
 * to find the button again to dismiss is the thing people complain about.
 */
export default function MobileNav({
  isPlatformAdmin = false,
  features = {},
}: {
  isPlatformAdmin?: boolean;
  features?: Record<string, boolean>;
}) {
  // The drawer remembers the path it was opened on, and is open only while
  // that is still the path. Navigating therefore closes it with no effect
  // and no cascading render — including via the back button, which no
  // onClick handler ever sees.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const pathname = usePathname();
  const open = openedAt !== null && openedAt === pathname;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenedAt(null);
    };
    document.addEventListener("keydown", onKeyDown);

    // The page behind must not scroll under the drawer: on iOS that reads
    // as the drawer itself being broken.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenedAt(pathname)}
        aria-label="Open menu"
        aria-expanded={open}
        className="lg:hidden -ml-2 p-2.5 rounded-xl text-white/60 hover:text-white hover:bg-white/8 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Through a portal to <body>, not rendered in place.
          The top bar carries backdrop-blur, and a backdrop-filter makes an
          element a containing block for its fixed-position descendants — so
          "fixed inset-0" resolved to the 64px header rather than the
          screen, and the drawer came out as a squashed strip with the page
          showing through it. Nothing in the CSS can fix that from inside;
          the drawer has to leave the blurred subtree. */}
      {open &&
        createPortal(
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpenedAt(null)}
            aria-hidden="true"
          />

          <aside
            className="relative flex flex-col w-[17rem] max-w-[85vw] bg-[var(--surface-1)] border-r border-white/8 h-full shadow-2xl animate-[slideIn_0.18s_ease-out]"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="relative">
              <SidebarBrand />
              <button
                type="button"
                onClick={() => setOpenedAt(null)}
                aria-label="Close menu"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-xl text-white/45 hover:text-white hover:bg-white/8 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <SidebarNav
              isPlatformAdmin={isPlatformAdmin}
              features={features}
              onNavigate={() => setOpenedAt(null)}
            />
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}
