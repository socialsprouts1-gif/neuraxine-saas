// Meta telling us what it decided about a template.
//
// Review is asynchronous and there is no reply to the create call that
// says "approved" — the only way to learn is to ask, or to be told. Asking
// is the Sync button, which means someone has to sit there pressing it;
// being told is this, which means a campaign queued against a template in
// review starts itself the moment the decision lands.
//
// Pure so the mapping can be tested without a webhook. Meta's vocabulary
// and this app's `template_status` enum are not the same set, and getting
// a mapping wrong here either stops a healthy template sending or keeps
// sending a dead one.

import type { TemplateStatus } from "@/types/database";

/** The value Meta posts under the `message_template_status_update` field. */
export interface TemplateStatusEvent {
  event?: string;
  message_template_id?: number | string;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string;
  /** Present on DISABLED, and the only place the real explanation lives. */
  disable_info?: { disable_date?: string };
  other_info?: { title?: string; description?: string };
}

export interface TemplateDecision {
  /** Meta's id for the template, as a string. Null when it did not say. */
  templateId: string | null;
  name: string | null;
  language: string | null;
  status: TemplateStatus;
  /** Why, when Meta gave a reason worth showing. */
  reason: string | null;
}

// Meta's event names on the left, ours on the right.
//
// PENDING_DELETION and DELETED both become disabled rather than being
// ignored: a template on its way out must stop being picked for new
// campaigns, and "it vanished from Meta but this app kept offering it" is
// a failure nobody can diagnose from the app.
//
// FLAGGED is a quality warning that suspends sending, which is what paused
// means here. REINSTATED is Meta undoing one.
const EVENTS: Record<string, TemplateStatus> = {
  APPROVED: "approved",
  REJECTED: "rejected",
  PENDING: "pending",
  IN_APPEAL: "in_appeal",
  REINSTATED: "approved",
  DISABLED: "disabled",
  DELETED: "disabled",
  PENDING_DELETION: "disabled",
  FLAGGED: "paused",
  PAUSED: "paused",
};

/**
 * Reads a decision out of Meta's payload.
 *
 * Returns null for an event this app does not recognise. Guessing would be
 * worse than ignoring: an unmapped event turned into "approved" sends
 * messages Meta has not cleared, and turned into "disabled" silently stops
 * a campaign that was fine.
 */
export function readTemplateDecision(value: TemplateStatusEvent): TemplateDecision | null {
  const status = EVENTS[(value.event ?? "").trim().toUpperCase()];
  if (!status) return null;

  const templateId =
    value.message_template_id === undefined || value.message_template_id === null
      ? null
      : String(value.message_template_id);

  return {
    templateId: templateId?.trim() || null,
    name: value.message_template_name?.trim() || null,
    language: value.message_template_language?.trim() || null,
    status,
    reason: readReason(value, status),
  };
}

/**
 * The sentence to show against a refused template.
 *
 * Meta puts "NONE" in `reason` when there is nothing to say, and the real
 * explanation for a rejection often sits in other_info instead — so taking
 * `reason` at face value shows an operator the word NONE where the reason
 * should be.
 */
function readReason(value: TemplateStatusEvent, status: TemplateStatus): string | null {
  const reason = value.reason?.trim();
  const stated = reason && reason.toUpperCase() !== "NONE" ? reason : null;

  const detail = [value.other_info?.title?.trim(), value.other_info?.description?.trim()]
    .filter(Boolean)
    .join(": ");

  const both = [stated, detail || null].filter(Boolean).join(" — ");
  if (both) return both;

  // A template that stopped being sendable with no reason still needs to
  // say so, or the row reads as approved-but-idle.
  if (status === "rejected") return "Meta rejected this template but gave no reason.";
  if (status === "disabled") return "Meta disabled this template.";
  if (status === "paused") return "Meta paused this template over its quality rating.";
  return null;
}
