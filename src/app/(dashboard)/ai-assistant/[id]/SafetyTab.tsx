"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { saveAssistantSafety } from "@/app/(dashboard)/portal-actions";
import { SaveForm, SectionCard, Select, TextArea, TextInput, Toggle } from "./EditorControls";
import { DAY_LABELS, TIMEZONES } from "@/lib/working-hours";
import type { AiAssistant } from "@/types/portal";

// Step four: when to stop and fetch a human.
//
// These two rules were on opposite ends of the editor — the handoff
// keywords under Basic Information, the working hours three screens later
// — and they are the same decision asked twice: at what point does an
// automated reply stop being the right answer?
//
// Both failure modes are quiet ones. An agent with no handoff keyword
// cheerfully argues with somebody threatening to sue; an agent with
// working hours and no after-hours message simply says nothing at 11pm,
// which a customer reads as the business not existing.

export default function SafetyTab({ assistant }: { assistant: AiAssistant }) {
  const [stopOnHuman, setStopOnHuman] = useState(assistant.stop_on_human);
  const [hoursOn, setHoursOn] = useState(assistant.working_hours_enabled);
  const [days, setDays] = useState<number[]>(assistant.working_days ?? []);
  const [timezone, setTimezone] = useState(assistant.working_hours_timezone);
  const [start, setStart] = useState(assistant.working_hours_start);
  const [end, setEnd] = useState(assistant.working_hours_end);

  const toggleDay = (day: number) =>
    setDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort()
    );

  const applyDefaults = () => {
    setStopOnHuman(true);
    setHoursOn(true);
    setDays([1, 2, 3, 4, 5]);
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setStart("09:00");
    setEnd("18:00");
  };

  return (
    <SaveForm action={saveAssistantSafety} label="Save safety rules">
      <input type="hidden" name="id" value={assistant.id} />
      {days.map((day) => (
        <input key={day} type="hidden" name="working_days" value={day} />
      ))}

      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={applyDefaults}
          className="inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white px-3 py-2 rounded-lg border border-white/12 hover:border-white/25 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Apply defaults
        </button>
      </div>

      <div className="space-y-5">
        <SectionCard
          title="Handing over to a person"
          description="When the agent should stand down and let your team take the conversation."
        >
          <TextInput
            label="Handoff keywords"
            name="handoff_keywords"
            defaultValue={assistant.handoff_keywords.join(", ")}
            placeholder="human, agent, complaint, refund, legal"
            hint="Comma separated. Any of these in a message stops the bot on that chat and flags it for a human."
          />
          <p className="text-[12px] text-white/35 mt-2 leading-relaxed">
            Worth including the words people use when they are already angry — complaint, refund,
            manager, legal. A complaint that cannot reach a person is the one that becomes a
            public review.
          </p>

          <div className="mt-3 border-t border-white/8 pt-1">
            <Toggle
              name="stop_on_human"
              checked={stopOnHuman}
              onChange={setStopOnHuman}
              label="Stop when a human replies"
              description="The agent stops the moment your team sends a message from the inbox, until you resume the bot on that chat."
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Working hours"
          description="When the agent is on duty, and what gets said outside those hours."
        >
          <div className="border-b border-white/8 pb-1 mb-4">
            <Toggle
              name="working_hours_enabled"
              checked={hoursOn}
              onChange={setHoursOn}
              label="Enable working hours"
              description="Off means the agent answers around the clock, which for an AI is a perfectly good answer."
            />
          </div>

          <fieldset disabled={!hoursOn} className={hoursOn ? "" : "opacity-40"}>
            <div className="grid md:grid-cols-3 gap-4">
              <Select
                label="Timezone"
                name="working_hours_timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                options={TIMEZONES.map((zone) => ({
                  value: zone,
                  label: zone.replace(/_/g, " "),
                }))}
              />
              <TextInput
                label="Start time"
                name="working_hours_start"
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
              <TextInput
                label="End time"
                name="working_hours_end"
                type="time"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                hint="An end time before the start one runs overnight."
              />
            </div>

            <div className="mt-4">
              <span className="block text-xs font-medium text-white/70 mb-2">
                Weekdays (0 = Sun … 6 = Sat)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={days.includes(day)}
                    className={`w-12 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      days.includes(day)
                        ? "border-accent/50 bg-accent/12 text-accent-ink"
                        : "border-white/10 bg-white/3 text-white/45 hover:border-white/20"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <TextArea
                label="After-hours message"
                name="off_hours_message"
                rows={3}
                defaultValue={assistant.off_hours_message}
                placeholder="Thanks for messaging. We are closed right now — leave your question here and somebody will reply in the morning."
                hint="Leave this empty and the agent simply stays quiet outside working hours, and the chat waits for a human."
              />
            </div>
          </fieldset>
        </SectionCard>
      </div>
    </SaveForm>
  );
}
