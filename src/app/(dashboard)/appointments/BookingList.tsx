"use client";

import { MapPin, MessageCircle, User } from "lucide-react";
import { Badge, EmptyState, statusTone } from "@/components/ui/primitives";
import ActionForm from "@/components/ui/ActionForm";
import { durationLabel } from "@/lib/appointments";
import { setBookingStatus } from "../appointment-actions";

export interface BookingItem {
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  status: string;
  location: string | null;
  source: string;
  serviceName: string | null;
  contactName: string | null;
  contactWaId: string | null;
}

/**
 * Bookings, upcoming first.
 *
 * Times are rendered in the business's timezone rather than the browser's:
 * an owner checking tomorrow's list from an airport should see the times
 * their customers were given, not the times where they happen to be.
 */
export default function BookingList({
  bookings,
  timezone,
  emptyHint,
}: {
  bookings: BookingItem[];
  timezone: string;
  emptyHint: string;
}) {
  if (bookings.length === 0) {
    return <EmptyState title="Nothing booked yet" description={emptyHint} />;
  }

  return (
    <div className="space-y-2.5">
      {bookings.map((booking) => (
        <div
          key={booking.id}
          className="glass-card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="flex-shrink-0 w-full sm:w-40">
            <div className="text-sm font-semibold">
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: timezone,
                weekday: "short",
                day: "numeric",
                month: "short",
              }).format(new Date(booking.startsAt))}
            </div>
            <div className="text-lg font-bold text-accent-ink tabular-nums">
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: timezone,
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
                .format(new Date(booking.startsAt))
                .toLowerCase()}
            </div>
            <div className="text-[11px] text-white/40">
              {durationLabel(booking.durationMinutes)}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-medium truncate">
                {booking.serviceName ?? booking.title}
              </span>
              <Badge tone={statusTone(booking.status)}>{booking.status.replace("_", " ")}</Badge>
              {booking.source === "whatsapp" && (
                <Badge tone="green">
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" />
                    self-booked
                  </span>
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
              {booking.contactName && (
                <span className="inline-flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  {booking.contactName}
                </span>
              )}
              {booking.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {booking.location}
                </span>
              )}
            </div>
          </div>

          {booking.status === "scheduled" && (
            <div className="flex gap-2 flex-shrink-0">
              <StatusButton id={booking.id} status="completed" label="Done" />
              <StatusButton id={booking.id} status="no_show" label="No show" />
              <StatusButton id={booking.id} status="cancelled" label="Cancel" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * One outcome button.
 *
 * A form each rather than a select, because the whole point is one tap from
 * the list — an owner marking off a morning's appointments should not have
 * to open a dropdown per row.
 */
function StatusButton({
  id,
  status,
  label,
}: {
  id: string;
  status: string;
  label: string;
}) {
  return (
    <ActionForm action={setBookingStatus} submitLabel={label} compact>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
    </ActionForm>
  );
}
