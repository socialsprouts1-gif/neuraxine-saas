"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/track-client";

// Mounted once, renders nothing, watches two things.
//
// Page views come from the pathname rather than from a load event, because
// this is a single-page app: moving from the front page to the pricing
// section never reloads, and a load-event counter would record one visit
// for a session that saw six pages.
//
// Clicks are caught by one delegated listener instead of a handler on each
// button. A button only has to carry data-track="nav:trial" to be counted,
// which means a new call-to-action is measured by whoever adds it rather
// than by somebody remembering to wire it up afterwards.

export default function Track() {
  const pathname = usePathname();

  useEffect(() => {
    track("view");

    // Opening the sign-up page is the second step of the funnel, and it
    // is the same event whether they arrived by button, by link in an
    // email, or by typing the address.
    if (pathname?.startsWith("/auth/register")) track("signup_open");
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const tagged = target?.closest?.("[data-track]");
      const label = tagged?.getAttribute("data-track");
      if (label) track("click", label);
    };

    // Capture, so a handler that stops propagation on the way up does not
    // also stop the measurement.
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
