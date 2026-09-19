"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, MapPin, Trash2, User } from "lucide-react";
import { deleteMeeting, setMeetingStatus } from "../leads-actions";
import { Badge, type Tone } from "@/components/ui/primitives";
import type { MeetingStatus } from "@/types/portal";

export interface MeetingItem {
  id: string;
  title: string;
  notes: string | null;
  location: string | null;
  startsAt: string;
  durationMinutes: number;
  status: MeetingStatus;
  contactName: string | null;
}

const STATUS_TONE: Record<MeetingStatus, Tone> = {
  scheduled: "blue",
  completed: "green",
  cancelled: "grey",
  no_show: "amber",
};

const STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: "scheduled",
  completed: "completed",
  cancelled: "cancelled",
  no_show: "no-show",
};

export default function MeetingRow({ meeting }: { meeting: MeetingItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<{ ok: boolean }>) =>
    startTransition(async () => {
      await work();
      router.refresh();
    });

  const starts = new Date(meeting.startsAt);
  const overdue = meeting.status === "scheduled" && hasPassed(meeting.startsAt);

  return (
    <div
      className={`glass-card p-4 flex flex-wrap items-start gap-4 ${
        meeting.status === "cancelled" ? "opacity-55" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{meeting.title}</span>
          <Badge tone={STATUS_TONE[meeting.status]}>{STATUS_LABEL[meeting.status]}</Badge>
          {overdue && <Badge tone="red">overdue</Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-white/45">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {starts.toLocaleString([], {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" · "}
            {meeting.durationMinutes} min
          </span>
          {meeting.contactName && (
            <span className="inline-flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              {meeting.contactName}
            </span>
          )}
          {meeting.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {meeting.location}
            </span>
          )}
        </div>

        {meeting.notes && (
          <p className="text-xs text-white/50 mt-2 leading-relaxed whitespace-pre-wrap">
            {meeting.notes}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />}

        {meeting.status === "scheduled" && (
          <>
            <button
              type="button"
              onClick={() => run(() => setMeetingStatus(meeting.id, "completed"))}
              disabled={pending}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-accent/30 bg-accent/10 text-accent-ink hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => run(() => setMeetingStatus(meeting.id, "no_show"))}
              disabled={pending}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-white/12 text-white/55 hover:text-white transition-colors disabled:opacity-50"
            >
              No-show
            </button>
            <button
              type="button"
              onClick={() => run(() => setMeetingStatus(meeting.id, "cancelled"))}
              disabled={pending}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-white/12 text-white/55 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => {
            const data = new FormData();
            data.set("id", meeting.id);
            run(() => deleteMeeting(data));
          }}
          disabled={pending}
          aria-label={`Delete ${meeting.title}`}
          className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Whether a scheduled meeting's time has already gone by. */
function hasPassed(iso: string): boolean {
  return Date.parse(iso) < Date.now();
}
