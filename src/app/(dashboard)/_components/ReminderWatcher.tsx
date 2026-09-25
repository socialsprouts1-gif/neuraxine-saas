"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X, Clock } from "lucide-react";
import {
  dueNow,
  pollDelay,
  describeLateness,
  IDLE_POLL_MS,
  type DueCandidate,
} from "@/lib/reminder-due";
import { playChime } from "@/lib/reminder-chime";
import { acknowledgeReminder, snoozeReminder } from "../portal-actions";

/**
 * Raises a reminder on screen the moment it comes due.
 *
 * Mounted in the dashboard layout rather than on the reminders page,
 * because a reminder that only appears on the page about reminders is one
 * nobody will be looking at. It polls — no websocket in this stack — and
 * the interval tightens only when something is actually close, so a
 * workspace with nothing scheduled costs one request a minute.
 */
export default function ReminderWatcher() {
  const router = useRouter();
  const [due, setDue] = useState<DueCandidate[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Ids already raised this session. Without it, a reminder the server has
  // not yet marked sent comes back on the next poll and chimes again.
  const seen = useRef<Set<string>>(new Set());
  const timer = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/reminders/due", { cache: "no-store" });
      if (!response.ok) return IDLE_POLL_MS;

      const body = (await response.json()) as { reminders?: DueCandidate[] };
      const rows = body.reminders ?? [];
      const now = new Date();
      const ready = dueNow(rows, now, seen.current);

      if (ready.length > 0) {
        for (const reminder of ready) seen.current.add(reminder.id);
        setDue((current) => [...current, ...ready]);
        void playChime();
        notify(ready);
      }

      return pollDelay(rows, now);
    } catch {
      // Offline, or a deploy mid-flight. Try again on the slow interval
      // rather than turning a transient failure into a broken page.
      return IDLE_POLL_MS;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loop = async () => {
      const delay = await poll();
      if (cancelled) return;
      timer.current = window.setTimeout(loop, delay);
    };

    void loop();

    return () => {
      cancelled = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [poll]);

  const close = (id: string) => setDue((current) => current.filter((row) => row.id !== id));

  const clear = (id: string) => {
    setBusy(id);
    const data = new FormData();
    data.set("id", id);
    void acknowledgeReminder(data).then(() => {
      setBusy(null);
      close(id);
      router.refresh();
    });
  };

  const snooze = (id: string, minutes: number) => {
    setBusy(id);
    const data = new FormData();
    data.set("id", id);
    data.set("minutes", String(minutes));
    void snoozeReminder(data).then(() => {
      setBusy(null);
      // Taken out of `seen` so it can be raised again when it comes back.
      seen.current.delete(id);
      close(id);
      router.refresh();
    });
  };

  if (due.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] w-[min(92vw,360px)] space-y-2.5"
      role="region"
      aria-label="Due reminders"
    >
      {due.map((reminder) => (
        <div
          key={reminder.id}
          role="alert"
          className="glass-card border border-accent/30 p-4 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)] reminder-pop"
        >
          <div className="flex items-start gap-2.5">
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-accent/15 text-accent-ink shrink-0">
              <Bell className="w-3.5 h-3.5" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-snug">{reminder.title}</div>
              <div className="text-[11px] text-white/40 mt-0.5">
                {reminder.contactName ? `${reminder.contactName} · ` : ""}
                due {describeLateness(reminder.remind_at, new Date())}
              </div>
              {reminder.body && (
                <p className="text-xs text-white/60 mt-1.5 leading-relaxed">{reminder.body}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => close(reminder.id)}
              aria-label="Hide this reminder"
              title="Hide until the next poll"
              className="p-1 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3 pl-9">
            <button
              type="button"
              disabled={busy === reminder.id}
              onClick={() => clear(reminder.id)}
              className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
            >
              Done
            </button>
            <button
              type="button"
              disabled={busy === reminder.id}
              onClick={() => snooze(reminder.id, 10)}
              className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white px-2 py-1.5 rounded-lg hover:bg-white/8 transition-colors disabled:opacity-50"
            >
              <Clock className="w-3 h-3" />
              10 min
            </button>
            <button
              type="button"
              disabled={busy === reminder.id}
              onClick={() => snooze(reminder.id, 60)}
              className="text-xs text-white/50 hover:text-white px-2 py-1.5 rounded-lg hover:bg-white/8 transition-colors disabled:opacity-50"
            >
              1 hour
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A desktop notification as well, when the tab is in the background.
 *
 * Permission is never requested here. Asking on page load is how a prompt
 * gets dismissed for ever, and the popup above is the real notification —
 * this is a bonus for somebody who has already said yes elsewhere.
 */
function notify(reminders: DueCandidate[]): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;

  for (const reminder of reminders.slice(0, 3)) {
    try {
      new Notification(reminder.title, {
        body: reminder.body ?? "Reminder due now",
        tag: reminder.id,
        icon: "/logo-email.png",
      });
    } catch {
      // Some browsers refuse this outside a service worker. The popup has
      // already been shown, so there is nothing to recover.
    }
  }
}
