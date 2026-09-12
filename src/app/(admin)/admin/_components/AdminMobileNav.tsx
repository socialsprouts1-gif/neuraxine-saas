"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AdminBrand, AdminNav } from "./AdminSidebar";

/**
 * The admin navigation on a phone. Same shape as the workspace drawer —
 * the rail is not rendered below lg, and this is the way in.
 */
export default function AdminMobileNav() {
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
            aria-label="Admin navigation"
          >
            <div className="relative">
              <AdminBrand />
              <button
                type="button"
                onClick={() => setOpenedAt(null)}
                aria-label="Close menu"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-xl text-white/45 hover:text-white hover:bg-white/8 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <AdminNav onNavigate={() => setOpenedAt(null)} />
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}
