"use server";

import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { DEFAULT_SETTINGS, type DripStep } from "@/lib/drip";
import { starterFor, templateNameFor, type JourneyStarter } from "@/lib/journey-starters";
import { submitTemplate } from "./campaign-actions";
import { saveDrip } from "./drip-actions";
import type { ActionResult } from "./actions";

// Building a whole journey from one click.
//
// What makes a follow-up sequence hard to start is not the engine, it is
// the four WhatsApp templates it needs before it can send anything — each
// written, submitted, and waiting on Meta. Nobody gets through that on a
// Tuesday afternoon to find out whether follow-up works for them.
//
// So this does the whole of it: creates the templates, submits them for
// approval, and leaves a draft sequence wired to them. Nothing sends until
// somebody switches it on, which is the point — the words are ours and
// they are going out under the business's name, so they get read first.
//
// Deliberately built on submitTemplate and saveDrip rather than writing
// the rows here. Both carry rules this must not get a second, quieter
// version of: which WhatsApp account a template is created on, what Meta
// does with a media header, how a rejection is explained, and what makes
// a sequence refusable.

export interface StarterResult extends ActionResult {
  /** The sequence, once it exists, so the screen can open it. */
  id?: string;
  /** Templates that went to Meta on this run and are waiting on approval. */
  pending?: number;
  /** Templates that already existed and were reused as they are. */
  reused?: number;
  /**
   * Meta refused the account rather than the template.
   *
   * A different thing from a bad template, and it needs a different
   * answer: nothing about the words will fix it, and the way through is
   * to create them in WhatsApp Manager instead.
   */
  blockedByAccount?: boolean;
  /** Meta's trace id, which is the one value WhatsApp support can act on. */
  trace?: string;
  /**
   * Every message of the journey, ready to be created by hand.
   *
   * Returned alongside a failure rather than instead of it. When the API
   * route is shut, the words are still good and retyping them from a
   * video is not a thing anybody should have to do.
   */
  manual?: Array<{
    name: string;
    category: "UTILITY" | "MARKETING";
    body: string;
    footer: string;
    samples: string[];
  }>;
}

/** The whole journey as something somebody can paste into WhatsApp Manager. */
function manualSpec(starter: JourneyStarter): NonNullable<StarterResult["manual"]> {
  return starter.steps.map((step) => ({
    name: templateNameFor(starter, step),
    category: step.category,
    body: step.body,
    footer: step.footer ?? "",
    samples: step.samples ?? [],
  }));
}

export async function buildJourneyFromStarter(formData: FormData): Promise<StarterResult> {
  const { orgId } = await requireFeature("drip");

  const key = String(formData.get("starter") ?? "").trim();
  const starter = starterFor(key);
  if (!starter) return { ok: false, error: "That ready-made journey no longer exists." };

  const appointmentTypeId = String(formData.get("appointment_type_id") ?? "").trim() || null;
  const connectionId = String(formData.get("connection_id") ?? "").trim() || null;

  const supabase = await createClient();

  // What this workspace already has under these names. Checked in one
  // query rather than per step: running the same starter twice must reuse
  // the approved templates, not submit a second copy of each and put the
  // operator back in the approval queue for nothing.
  const names = starter.steps.map((step) => templateNameFor(starter, step));
  const { data: existing } = await supabase
    .from("message_templates")
    .select("id, name, status")
    .eq("org_id", orgId)
    .in("name", names);

  const known = new Map((existing ?? []).map((row) => [row.name, row]));

  const steps: DripStep[] = [];
  let pending = 0;
  let reused = 0;

  for (const [index, step] of starter.steps.entries()) {
    const name = templateNameFor(starter, step);
    const already = known.get(name);

    // Only a template Meta actually holds may be reused.
    //
    // "approved" and "pending" are the two states that mean Meta has it.
    // A row left as "draft" is one that was written here and then refused
    // — submitTemplate saves the row before it calls Meta and marks it
    // draft when the call fails — and a "rejected" one Meta looked at and
    // turned down. Reusing either wires the sequence to a template that
    // does not exist at the other end: it would look finished on this
    // screen and fail for every single customer. Submit those again.
    if (already && (already.status === "approved" || already.status === "pending")) {
      steps.push(toStep(index, starter, already.id));
      reused += 1;
      continue;
    }

    const submission = new FormData();
    submission.set("name", name);
    submission.set("language", "en_US");
    submission.set("category", step.category);
    submission.set("header_format", "NONE");
    submission.set("body", step.body);
    submission.set("footer", step.footer ?? "");
    submission.set("buttons", "[]");
    submission.set("samples", (step.samples ?? []).join("\n"));
    if (connectionId) submission.set("connection_id", connectionId);

    const result = await submitTemplate(submission);

    if (!result.ok || !result.id) {
      // Stopped here rather than carried on. A sequence missing its third
      // message is a sequence that goes quiet half way through for
      // everybody in it, and that is harder to notice than a refusal.
      //
      // The words go back with the refusal. When Meta will not take them
      // through the API, they are still the journey — and the way through
      // is WhatsApp Manager, not retyping four messages from memory.
      return {
        ok: false,
        error: `Message ${index + 1} of ${starter.steps.length} could not be created. ${
          result.error ?? "Meta refused it."
        }`,
        blockedByAccount: result.blockedByAccount,
        trace: result.trace,
        manual: manualSpec(starter),
      };
    }

    steps.push(toStep(index, starter, result.id));
    pending += 1;
  }

  const saved = await saveDrip({
    name: starter.name,
    description: starter.description,
    connectionId,
    settings: {
      ...DEFAULT_SETTINGS,
      trigger: "appointment",
      triggerEvent: starter.event,
      triggerAppointmentTypeId: appointmentTypeId,
      // Deliberately NOT exit-on-reply.
      //
      // Every one of these messages asks for a reply — "tell us if it
      // still hurts", "reply BOOK". Stopping the sequence when somebody
      // answers would mean the people who engaged are exactly the ones
      // who never get the check-in, the review request or the recall six
      // months later. The gaps here are days and months apart, so a
      // scheduled message landing in a conversation is not the problem it
      // is in a sequence that sends daily.
      //
      // A way out there must still be, so: an exit keyword.
      exitOnReply: false,
      exitOnKeyword: true,
      exitKeywords: ["stop", "unsubscribe"],
    },
    steps,
    activate: false,
  });

  if (!saved.ok) {
    // The columns this trigger needs arrive with a database update, and
    // somebody who has not run it yet gets a message from Postgres about
    // a column rather than anything they can act on. Say what to do.
    const missingColumn = /column|schema cache/i.test(saved.error ?? "");
    return {
      ok: false,
      error: missingColumn
        ? `${saved.error} — this is the database update for appointment journeys. Run supabase/updates/run-me-latest.sql in the Supabase SQL editor, then try again. The ${
            pending + reused
          } WhatsApp templates are already created, so nothing is lost.`
        : saved.error,
    };
  }

  return {
    ok: true,
    id: saved.id,
    pending,
    reused,
    message: pending
      ? `Created as a draft. ${pending} message${pending === 1 ? "" : "s"} ${
          pending === 1 ? "has" : "have"
        } gone to Meta for approval — switch the sequence on once ${
          pending === 1 ? "it is" : "they are"
        } approved.`
      : "Created as a draft, using the templates you already have. Read it through and switch it on.",
  };
}

/** One starter step as a sequence step. The gap belongs to the step it follows. */
function toStep(index: number, starter: JourneyStarter, templateId: string): DripStep {
  const step = starter.steps[index];
  return {
    stepIndex: index + 1,
    templateId,
    variables: step.variables ?? [],
    waitKind: "duration",
    waitMinutes: step.waitMinutes,
    sendAtMinutes: 600,
    sendAtDays: 1,
  };
}
