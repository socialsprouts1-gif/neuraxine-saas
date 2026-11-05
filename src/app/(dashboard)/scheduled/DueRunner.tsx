"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";

/**
 * "Don't wait for the next beat, go now."
 *
 * The automatic runs happen in ScheduleTicker, mounted in the dashboard
 * layout, so the queue moves wherever you are in the app. This button is
 * for the moment somebody is watching a row sit at its time and wants to
 * see it go — and, unlike the silent ticker, it says what happened.
 */
export default function DueRunner({ dueNow }: { dueNow: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setNote(null);
    try {
      const response = await fetch("/api/scheduled/run", { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { sent?: number; failed?: number; stale?: number }
        | null;

      if (!response.ok) {
        setNote("The server refused that. Reload the page and try again.");
      } else if (body && (body.sent || body.failed || body.stale)) {
        const parts: string[] = [];
        if (body.sent) parts.push(`Sent ${body.sent}.`);
        if (body.failed) parts.push(`${body.failed} failed — the reason is on the row.`);
        if (body.stale) parts.push(`${body.stale} were too old to send.`);
        setNote(parts.join(" "));
        router.refresh();
      } else {
        setNote("Nothing is due yet.");
      }
    } catch {
      setNote("Could not reach the server. Try again in a moment.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        className="btn-secondary text-xs disabled:opacity-50"
      >
        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        {dueNow > 0 ? `Send ${dueNow} due now` : "Send anything due now"}
      </button>
      {note && <span className="text-xs text-white/55">{note}</span>}
    </div>
  );
}
