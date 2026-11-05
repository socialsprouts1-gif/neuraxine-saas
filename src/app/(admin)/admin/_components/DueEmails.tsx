"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/primitives";
import Link from "next/link";
import ActionForm from "@/components/ui/ActionForm";
import { runBillingEmailsNow, sendOneBillingEmail } from "../actions";
import type { ActionResult } from "@/app/(dashboard)/actions";

// What the schedule owes today, one row at a time.
//
// This was a read-only list with a single "run the sweep now" underneath
// it, and that is the wrong shape for what the list is actually used for.
// Ten workspaces are owed a follow-up, one of them is the customer who is
// on the phone right now, and the other nine are not supposed to hear
// from us this minute. The only way to write to that one was to write to
// all ten — so in practice the button did not get pressed at all.
//
// Each row sends itself now. The sweep stays, because sending ten when
// ten are owed is still the common case.
//
// Declared here rather than imported from billing-emails: that module is
// server-only, and what the page passes satisfies this structurally, so
// the shapes still cannot drift without a type error at the call site.
export interface DueRow {
  orgId: string;
  orgName: string;
  email: string | null;
  kind: string;
  daysLeft: number;
  alreadySent: boolean;
}

/** Why a row cannot be sent, or null when it can. */
function blocked(row: DueRow): string | null {
  if (!row.email) return "No owner address on file, so there is nobody to write to.";
  if (row.alreadySent)
    return "Already sent for this period. The guard is keyed to the workspace, the period and the day, so the schedule cannot send it twice — to write to them again, use Send an email.";
  return null;
}

function whenDue(daysLeft: number): string {
  if (daysLeft >= 0) return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  return `${-daysLeft} day${daysLeft === -1 ? "" : "s"} since it ended`;
}

export default function DueEmails({ due }: { due: DueRow[] }) {
  // One place for the outcome, shared by every button on the card.
  //
  // Each form printing its own would be the obvious thing and is wrong
  // here: a form is as wide as its widest child, so one long sentence
  // under row four stretches that row across the card and pushes the
  // rows under it out of line. This is what ActionForm's onResult is for.
  const [result, setResult] = useState<ActionResult | null>(null);
  const sendable = due.filter((row) => !blocked(row)).length;

  return (
    <>
      {due.length > 0 ? (
        <ul className="divide-y divide-white/6 mb-4 -mx-1">
          {due.map((row, index) => {
            const stop = blocked(row);
            return (
              <li
                key={`${row.orgId}-${row.kind}-${index}`}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-1 py-2.5"
              >
                <Badge tone="purple">{row.kind.replace(/_/g, " ")}</Badge>
                <span className="text-xs text-white/70">{row.orgName}</span>
                <span className="text-xs text-white/35 break-all">
                  {row.email ?? "no address on file"}
                </span>
                <span className="text-[12px] text-white/30">{whenDue(row.daysLeft)}</span>
                {row.alreadySent && <Badge tone="grey">already sent</Badge>}

                {/* Pushes the button to the right edge on a wide card and
                    simply wraps under the row on a narrow one, rather
                    than being squeezed against the address. */}
                <span className="ml-auto" />

                {stop ? (
                  // Still rendered, and still saying what it would do.
                  // A row whose button has silently vanished reads as the
                  // page having lost the feature, and then somebody goes
                  // looking for it.
                  <span
                    className="text-[12px] text-white/35 cursor-help underline decoration-dotted decoration-white/20 underline-offset-4"
                    title={stop}
                    aria-label={stop}
                  >
                    can&apos;t send
                  </span>
                ) : (
                  <ActionForm
                    action={sendOneBillingEmail}
                    submitLabel="Send this one"
                    variant="quiet"
                    compact
                    onResult={setResult}
                  >
                    <input type="hidden" name="orgId" value={row.orgId} />
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-white/40 mb-4 leading-relaxed">
          Nothing is owed today. On a fresh seven-day trial the first countdown message is due on
          the sixth day, so this staying empty for a day is the schedule working.
        </p>
      )}

      <ActionForm
        action={runBillingEmailsNow}
        submitLabel={
          sendable > 1 ? `Send all ${sendable} at once` : "Run the sweep now"
        }
        variant={due.length > 0 ? "quiet" : "primary"}
        onResult={setResult}
      >
        <span className="sr-only">Sends whatever the schedule owes today.</span>
      </ActionForm>

      {result?.error && (
        <p className="text-sm text-red-400 mt-3" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && result.message && (
        <p className="text-sm text-accent-ink mt-3" role="status">
          {result.message}
        </p>
      )}

      <p className="text-[12px] text-white/30 mt-2.5 leading-relaxed">
        Safe to press twice — every message is keyed to the workspace, the period and the day, so a
        repeat is refused rather than sent. To write something else to the same person, or to send
        the same thing again, use{" "}
        <Link href="/admin/email-send" className="text-accent-ink hover:underline">
          Send an email
        </Link>
        , which has no such guard. To stop these going out at all, untick them under{" "}
        <Link href="/admin/email-templates" className="text-accent-ink hover:underline">
          Email templates
        </Link>
        .
      </p>
    </>
  );
}
