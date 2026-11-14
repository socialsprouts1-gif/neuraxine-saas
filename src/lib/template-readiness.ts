// Whether a template can be sent yet, and if not, whether waiting helps.
//
// Meta reviews every template, and review takes minutes to a day. For that
// window the template exists, is visible in WhatsApp Manager and in this
// app, and cannot be sent. Treating that the same as a rejection is the
// difference between a campaign that goes out by itself when approval
// lands and one whose entire audience is burned the moment it is created —
// campaign_recipients has no un-fail, so "failed" is permanent for a
// person who was never actually attempted.
//
// Pure so the distinction can be tested without a queue.

import type { TemplateStatus } from "@/types/database";

export type TemplateReadiness =
  /** Meta approved it. Send. */
  | "ready"
  /** Not yet, but this resolves on its own. Leave the recipient queued. */
  | "waiting"
  /** It will not become sendable without someone doing something. */
  | "blocked";

export function templateReadiness(status: string | null | undefined): TemplateReadiness {
  switch ((status ?? "").trim().toLowerCase()) {
    case "approved":
      return "ready";
    // draft is a template this app saved but Meta has not seen; pending and
    // in_appeal are both with Meta. All three end on their own.
    case "pending":
    case "draft":
    case "in_appeal":
      return "waiting";
    // rejected, disabled, paused — and anything Meta invents later, because
    // guessing "waiting" for an unknown status queues people behind a state
    // that may never clear.
    default:
      return "blocked";
  }
}

/** What to tell someone looking at a campaign that has not started. */
export function describeReadiness(status: TemplateStatus | string | null): string | null {
  switch (templateReadiness(status)) {
    case "ready":
      return null;
    case "waiting":
      return "Waiting for Meta to approve the template. This campaign sends itself when approval lands — nobody has to come back to it.";
    case "blocked":
      return `Meta will not send this template — it is ${
        status ?? "in an unknown state"
      }. Fix it under Templates, or point the campaign at another one.`;
  }
}
