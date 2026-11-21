"use client";

import { useSyncExternalStore } from "react";

// A timestamp in the reader's own clock.
//
// Every log in this app formatted dates with toLocaleString inside a
// server component. Server components run on Vercel, which is UTC — so
// "04:03 pm" meant 9:33 pm to somebody in India, and the activity log
// disagreed with the phone it was being read next to.
//
// Hardcoding Asia/Kolkata would fix it for today's customers and break
// it for the first one outside India. The browser already knows the
// answer, so it formats.
//
// useSyncExternalStore rather than a mounted flag set in an effect: the
// server snapshot renders UTC, hydration matches it exactly, and the
// first client render after that switches to local. No mismatch, and
// no setState during an effect.

function subscribeNever(): () => void {
  return () => {};
}

const DATE_TIME: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

export default function LocalTime({
  iso,
  className = "",
}: {
  iso: string | null;
  className?: string;
}) {
  // false while rendering on the server and during hydration.
  const local = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );

  if (!iso) return <span className={className}>—</span>;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <span className={className}>—</span>;

  return (
    <time dateTime={iso} className={className} title={local ? date.toLocaleString() : undefined}>
      {date.toLocaleString(local ? undefined : "en-IN", {
        ...DATE_TIME,
        // UTC until the browser takes over, so the server's output and
        // the first client render are the same string.
        ...(local ? {} : { timeZone: "UTC" }),
      })}
    </time>
  );
}
