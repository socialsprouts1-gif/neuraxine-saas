"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** While something is waiting to go out. */
const BUSY_MS = 60_000;
/** While the queue is empty. Still checks, but stops being a nuisance. */
const IDLE_MS = 5 * 60_000;

/**
 * The product's heartbeat, beating in the browser.
 *
 * It pushes two queues: messages scheduled for a time, and chatbots parked
 * on a Delay node waiting for one.
 *
 * Vercel's Hobby plan runs a cron once a day. A message scheduled for a
 * quarter past three therefore sat until the small hours, which is not
 * what "delivered at the time you pick" means to anybody — and the person
 * watching it sit at "pending" past its time reasonably concluded the
 * feature was broken.
 *
 * This lives in the dashboard layout for the same reason ReminderWatcher
 * does: a scheduler that only runs on the page about scheduling is one
 * nobody is looking at. Anywhere in the app now pushes the queue along
 * every minute.
 *
 * Safe to fire as often as it likes. Both queues only touch rows whose
 * time has already passed, each row is claimed before it is sent, and the
 * endpoint is scoped to the caller's own workspace.
 */
export default function ScheduleTicker() {
  const router = useRouter();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let live = true;

    const tick = async () => {
      let next = IDLE_MS;

      try {
        // A background tab gets throttled by the browser anyway, and its
        // request would only compete with the visible one. Skip it and
        // come back on the next beat.
        if (document.visibilityState === "visible") {
          const response = await fetch("/api/scheduled/run", { method: "POST" });
          const body = (await response.json().catch(() => null)) as
            | {
                sent?: number;
                failed?: number;
                stale?: number;
                resumed?: number;
                pending?: number;
              }
            | null;

          if (body) {
            if (body.pending) next = BUSY_MS;
            // Something actually moved, so whatever page is open is now
            // showing a stale row. Let it redraw.
            if (body.sent || body.failed || body.stale || body.resumed) router.refresh();
          }
        } else {
          next = BUSY_MS;
        }
      } catch {
        // Offline, or a deploy swapping underneath. Nothing to report to
        // somebody who did not ask for this to happen — try again later.
      }

      if (live) timer.current = window.setTimeout(() => void tick(), next);
    };

    void tick();

    return () => {
      live = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
