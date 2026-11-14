"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Check, ChevronDown, Copy, Loader2, Sparkles, Wand2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { buildJourneyFromStarter, type StarterResult } from "../journey-actions";
import {
  JOURNEY_STARTERS,
  describeStarter,
  industries,
  type JourneyStarter,
} from "@/lib/journey-starters";
import { APPOINTMENT_EVENTS, describeDuration } from "@/lib/drip";
import DripBuilder, {
  type AppointmentTypeChoice,
  type DripDraft,
  type NumberChoice,
  type TemplateChoice,
} from "./DripBuilder";
import { DEFAULT_SETTINGS } from "@/lib/drip";

// Ready-made journeys, by trade.
//
// The point of this screen is that somebody can read the actual messages
// before anything is created. A "dental follow-up template" that hides its
// words behind a Use button is something nobody switches on, because the
// first thing they would have to do is check what it says to their own
// customers — so it may as well show them up front.

export default function JourneyStarters({
  numbers,
  appointmentTypes,
  templates,
}: {
  numbers: NumberChoice[];
  appointmentTypes: AppointmentTypeChoice[];
  templates: TemplateChoice[];
}) {
  const trades = useMemo(() => industries(), []);
  const [trade, setTrade] = useState<string>(trades[0] ?? "");
  const [chosen, setChosen] = useState<JourneyStarter | null>(null);

  const shown = JOURNEY_STARTERS.filter(
    (starter) => starter.industry === trade || starter.industry === "Any business"
  );

  return (
    <div className="rounded-3xl border border-white/10 bg-white/3 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-4.5 h-4.5 text-accent-ink" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">Start from a ready-made journey</h2>
          <p className="text-xs text-white/50 mt-0.5 leading-relaxed max-w-2xl">
            Pick what you do. The messages, the gaps and the WhatsApp templates are all written —
            they go to Meta for approval and the sequence waits as a draft until you switch it on.
          </p>
        </div>
      </div>

      {/* The trade picker. Chips rather than a dropdown: the list is the
          answer to "is my kind of business in here", and a closed dropdown
          does not answer it. */}
      <div className="flex flex-wrap gap-2 mb-4">
        {trades.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTrade(name)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              trade === name
                ? "border-accent/50 bg-accent/15 text-accent-ink"
                : "border-white/12 bg-white/4 text-white/60 hover:border-white/25"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((starter) => (
          <StarterCard key={starter.key} starter={starter} onUse={() => setChosen(starter)} />
        ))}
      </div>

      {chosen && (
        <UseStarter
          starter={chosen}
          numbers={numbers}
          appointmentTypes={appointmentTypes}
          templates={templates}
          onClose={() => setChosen(null)}
        />
      )}
    </div>
  );
}

function StarterCard({ starter, onUse }: { starter: JourneyStarter; onUse: () => void }) {
  const [open, setOpen] = useState(false);
  const event = APPOINTMENT_EVENTS.find((entry) => entry.key === starter.event);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 p-4 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug">{starter.name}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/8 text-white/60">
              {starter.industry}
            </span>
            <span className="text-[11px] text-white/45">{describeStarter(starter)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-white/50 mt-2.5 leading-relaxed">{starter.description}</p>

      <p className="text-[11px] text-white/40 mt-2">
        Starts: <span className="text-white/60">{event?.label.toLowerCase() ?? starter.event}</span>
      </p>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-white/55 hover:text-white/80 mt-3 transition-colors"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "Hide the messages" : "Read the messages"}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {starter.steps.map((step, index) => (
            <div key={step.slug} className="rounded-xl bg-white/5 border border-white/8 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-4 h-4 rounded-full bg-accent/15 text-accent-ink text-[10px] font-bold flex items-center justify-center">
                  {index + 1}
                </span>
                <span className="text-[11px] text-white/45">
                  {index === 0
                    ? "straight away"
                    : `after ${describeDuration(
                        starter.steps.slice(0, index).reduce((sum, s) => sum + s.waitMinutes, 0)
                      )}`}
                </span>
              </div>
              <p className="text-[12px] text-white/75 whitespace-pre-line leading-relaxed">
                {step.body}
              </p>
              {step.footer && (
                <p className="text-[11px] text-white/35 mt-1.5 italic">{step.footer}</p>
              )}
            </div>
          ))}
          <p className="text-[11px] text-white/40 leading-relaxed">
            You can change every word of this afterwards — but the words have to be approved by
            Meta, so edit before you switch it on rather than after.
          </p>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-white/8 flex justify-end">
        <button type="button" onClick={onUse} className="btn-primary text-xs">
          <Wand2 className="w-3.5 h-3.5" />
          Use this
        </button>
      </div>
    </div>
  );
}

function UseStarter({
  starter,
  numbers,
  appointmentTypes,
  templates,
  onClose,
}: {
  starter: JourneyStarter;
  numbers: NumberChoice[];
  appointmentTypes: AppointmentTypeChoice[];
  templates: TemplateChoice[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [service, setService] = useState("");
  const [number, setNumber] = useState("");

  // Kept on screen rather than only in a toast.
  //
  // When Meta refuses, the answer is three sentences long and has a trace
  // id in it. A message that disappears on its own is no use for that —
  // and until the Toaster was mounted in the root layout, it did not even
  // appear, which is what made this button look like it did nothing.
  const [failure, setFailure] = useState<StarterResult | null>(null);
  const [byHand, setByHand] = useState(false);

  const field =
    "w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-all";
  const label = "block text-xs font-medium text-white/70 mb-1.5";

  const create = async () => {
    setBusy(true);
    setFailure(null);
    const body = new FormData();
    body.set("starter", starter.key);
    if (service) body.set("appointment_type_id", service);
    if (number) body.set("connection_id", number);

    const result: StarterResult = await buildJourneyFromStarter(body).catch((error) => ({
      ok: false as const,
      error:
        error instanceof Error
          ? `That could not be created: ${error.message}`
          : "That could not be created just now.",
    }));
    setBusy(false);

    if (!result.ok) {
      setFailure(result);
      toast.error(result.error ?? "That could not be created.");
      return;
    }
    toast.success(result.message ?? "Created as a draft.");
    onClose();
    router.refresh();
  };

  if (byHand) {
    return (
      <DripBuilder
        draft={draftFromStarter(starter, service, number)}
        templates={templates}
        numbers={numbers}
        appointmentTypes={appointmentTypes}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={starter.name}
      description="Created as a draft. Nothing is sent to anybody until you switch it on."
      dismissable={!busy}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary text-sm">
            Cancel
          </button>
          <button type="button" onClick={create} disabled={busy} className="btn-primary text-sm">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {busy ? "Creating…" : failure ? "Try again" : "Create the journey"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {failure && (
          <Failure
            result={failure}
            onBuildByHand={templates.length > 0 ? () => setByHand(true) : undefined}
          />
        )}

        <div>
          <label className={label}>Which service is it for?</label>
          <select className={field} value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">Every appointment</option>
            {appointmentTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          {appointmentTypes.length === 0 && (
            <p className="text-[11px] text-white/40 mt-1.5">
              You have no services set up yet, so this will run for every appointment.
            </p>
          )}
        </div>

        <div>
          <label className={label}>Which number sends it?</label>
          <select className={field} value={number} onChange={(e) => setNumber(e.target.value)}>
            <option value="">Default number</option>
            {numbers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        {templates.length > 0 && (
          <button
            type="button"
            onClick={() => setByHand(true)}
            className="text-xs text-white/50 hover:text-white/80 underline underline-offset-2 transition-colors"
          >
            Prefer your own approved templates? Build this journey with those instead.
          </button>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/4 p-3.5">
          <p className="text-xs text-white/60 leading-relaxed">
            What happens next:
          </p>
          <ol className="text-xs text-white/50 mt-2 space-y-1.5 leading-relaxed list-decimal pl-4">
            <li>
              {starter.steps.length} WhatsApp template
              {starter.steps.length === 1 ? "" : "s"} are created and sent to Meta for approval.
              That usually takes minutes.
            </li>
            <li>The sequence appears below as a draft, wired to them.</li>
            <li>You read it, change anything you want, and switch it on.</li>
          </ol>
        </div>
      </div>
    </Modal>
  );
}

/**
 * What went wrong, in place, with the way out.
 *
 * Shown inside the dialog and not only as a toast. Two of the three
 * failures here are long: Meta's account-level refusal is a paragraph with
 * a trace id, and a missing database update names a SQL file. Neither
 * survives a message that fades after a few seconds.
 */
function Failure({
  result,
  onBuildByHand,
}: {
  result: StarterResult;
  onBuildByHand?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#FACC15]/30 bg-[#FACC15]/8 p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#FACC15]">
            {result.blockedByAccount
              ? "This number's WhatsApp account will not let templates be created from here"
              : "That could not be created"}
          </p>
          <p className="text-xs text-white/70 mt-1.5 leading-relaxed whitespace-pre-line break-words">
            {result.error}
          </p>
          {result.trace && (
            <p className="text-[11px] text-white/40 mt-2 font-mono break-all">
              Meta trace id: {result.trace}
            </p>
          )}
        </div>
      </div>

      {onBuildByHand && (
        <div className="border-t border-white/10 pt-3">
          <p className="text-xs text-white/70 leading-relaxed">
            Or build the same journey right now with templates you already have approved. The
            trigger, the order and the gaps are set for you — you only pick the message for each
            step.
          </p>
          <button
            type="button"
            onClick={onBuildByHand}
            className="btn-secondary text-xs mt-2.5 py-2 px-3"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Build it with my own templates
          </button>
        </div>
      )}

      {result.manual && result.manual.length > 0 && (
        <ManualRoute messages={result.manual} />
      )}
    </div>
  );
}

/**
 * The journey's shape, with the words left blank.
 *
 * The trigger, the event, the order and the gaps are the half of a journey
 * that is hard to get right and easy to hand over. The templates are the
 * half that belongs to the business — and when Meta will not take ours,
 * theirs will do.
 */
function draftFromStarter(
  starter: JourneyStarter,
  service: string,
  number: string
): DripDraft {
  return {
    name: starter.name,
    description: starter.description,
    connectionId: number,
    settings: {
      ...DEFAULT_SETTINGS,
      trigger: "appointment",
      triggerEvent: starter.event,
      triggerAppointmentTypeId: service || null,
      exitOnKeyword: true,
      exitKeywords: ["stop", "unsubscribe"],
    },
    steps: starter.steps.map((step, index) => ({
      stepIndex: index + 1,
      templateId: null,
      variables: [],
      waitKind: "duration" as const,
      waitMinutes: step.waitMinutes,
      sendAtMinutes: 600,
      sendAtDays: 1,
    })),
  };
}

/**
 * The journey as something to paste into WhatsApp Manager.
 *
 * The API being shut does not make the words wrong. Creating the same
 * templates by hand takes ten minutes, and afterwards this screen finds
 * them by name and wires the sequence to them — so the work is not wasted
 * and nobody retypes four messages.
 */
function ManualRoute({
  messages,
}: {
  messages: NonNullable<StarterResult["manual"]>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-white/10 pt-3">
      <p className="text-xs text-white/70 leading-relaxed">
        The messages are still good — they just have to be created in WhatsApp Manager instead:
      </p>
      <ol className="text-xs text-white/55 mt-2 space-y-1.5 leading-relaxed list-decimal pl-4">
        <li>
          Open{" "}
          <a
            href="https://business.facebook.com/wa/manage/message-templates/"
            target="_blank"
            rel="noreferrer"
            className="text-accent-ink hover:underline"
          >
            WhatsApp Manager → Message templates
          </a>{" "}
          and create each one below, with exactly the name shown.
        </li>
        <li>Wait for Meta to approve them.</li>
        <li>
          Come back to <span className="text-white/75">Templates</span> and press{" "}
          <span className="text-white/75">Sync</span>.
        </li>
        <li>Press Use this again here — it will find them and build the sequence.</li>
      </ol>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-white/60 hover:text-white/85 mt-3 transition-colors"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "Hide the messages to create" : `Show the ${messages.length} messages to create`}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {messages.map((message) => (
            <ManualMessage key={message.name} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}

function ManualMessage({
  message,
}: {
  message: NonNullable<StarterResult["manual"]>[number];
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Your browser would not let the app copy. Select the text instead.");
    }
  };

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-mono text-white/80 break-all">{message.name}</p>
          <p className="text-[10px] text-white/40 mt-0.5">
            Category: {message.category} · Language: English (US)
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 inline-flex items-center gap-1 text-[11px] text-white/60 hover:text-white/90 border border-white/12 rounded-lg px-2 py-1 transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-[12px] text-white/70 whitespace-pre-line leading-relaxed mt-2">
        {message.body}
      </p>
      {message.footer && (
        <p className="text-[11px] text-white/40 mt-1.5 italic">Footer: {message.footer}</p>
      )}
      {message.samples.length > 0 && (
        <p className="text-[11px] text-white/40 mt-1.5 break-all">
          Example for {"{{1}}"}: {message.samples[0]}
        </p>
      )}
    </div>
  );
}
