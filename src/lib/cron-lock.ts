import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// One scheduled run at a time.
//
// The heartbeat fires every minute. Most runs finish in under a second,
// but a campaign queue or a slow Meta response can take longer than the
// gap, and then two runs are reading the same queue at once.
//
// That matters because the sending engines select their work, send it,
// and mark it done afterwards. Between the select and the mark there is
// a window where a second run sees the same row as unsent. The result
// is a customer receiving the same reminder twice, or a broadcast going
// to the whole list a second time.
//
// The lock is a row, not a Postgres advisory lock: those live on a
// connection, and this talks to the database through a pooled HTTP API
// where the connection is handed back the moment the call ends.

const LOCK = "jobs";

/** How long a run may hold the lock before another may take it. */
const TTL_SECONDS = 290;

/**
 * Runs `work` while holding the lock, or returns `null` if another run
 * holds it.
 *
 * The claim is a conditional update: Postgres applies the `where`
 * atomically, so of two runs arriving together exactly one changes the
 * row and the other sees nothing returned. There is no read-then-write
 * for the two of them to interleave.
 *
 * Returning null is a success, not an error. "Another run has it" is
 * the expected answer most minutes of a long job, and treating it as a
 * failure would fill the log with alarms about the lock doing its job.
 */
export async function withCronLock<T>(work: () => Promise<T>): Promise<T | null> {
  const admin = createAdminClient();
  const now = new Date();
  const until = new Date(now.getTime() + TTL_SECONDS * 1000);

  const { data: claimed, error } = await admin
    .from("cron_locks")
    .update({ locked_until: until.toISOString(), locked_at: now.toISOString() })
    .eq("name", LOCK)
    // Only if nobody holds it, or whoever did has run out of time.
    .lt("locked_until", now.toISOString())
    .select("name");

  if (error) {
    // The table is missing until the database update is run. Refusing to
    // work would stop every scheduled message on an unmigrated database;
    // running without the lock is what happened before this file existed
    // and is safe at one run a day. Said out loud so it is not a mystery.
    console.error(
      "Could not take the scheduled-run lock, so this run is unprotected. Run the latest database update.",
      error.message
    );
    return work();
  }

  if (!claimed || claimed.length === 0) return null;

  try {
    return await work();
  } finally {
    // Released rather than left to expire, so the next minute's run goes
    // straight through instead of waiting out the full five minutes.
    await admin
      .from("cron_locks")
      .update({ locked_until: new Date().toISOString(), released_at: new Date().toISOString() })
      .eq("name", LOCK);
  }
}
