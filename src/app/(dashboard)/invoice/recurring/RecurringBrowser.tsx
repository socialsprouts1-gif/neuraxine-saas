"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Plus,
  Repeat,
  Send,
  User,
  X,
} from "lucide-react";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { Badge, EmptyState } from "@/components/ui/primitives";
import {
  RECURRENCE_INTERVALS,
  RECURRENCE_LABEL,
  formatInvoiceAmount,
  nextRunDate,
  type RecurrenceInterval,
} from "@/lib/invoices";
import {
  deleteRecurringInvoice,
  runRecurringNow,
  saveRecurringInvoice,
  toggleRecurringInvoice,
} from "../../invoice-actions";

export interface ScheduleRow {
  id: string;
  title: string;
  interval: RecurrenceInterval;
  nextRunOn: string;
  lastRunOn: string | null;
  occurrencesLimit: number | null;
  occurrencesDone: number;
  isActive: boolean;
  autoSend: boolean;
  termsDays: number;
  notes: string | null;
  contactId: string | null;
  contactName: string | null;
  estimatedTotalCents: number;
  lines: Array<{
    description: string;
    hsnCode: string;
    quantity: string;
    price: string;
    tax: string;
    discount: string;
  }>;
}

export default function RecurringBrowser({
  schedules,
  migrated,
  migrationError,
  canManage,
  today,
  contacts,
  defaultTax,
  defaultTerms,
  currency,
}: {
  schedules: ScheduleRow[];
  migrated: boolean;
  migrationError: string | null;
  canManage: boolean;
  today: string;
  contacts: Array<{ id: string; label: string; gstin: string | null }>;
  defaultTax: number;
  defaultTerms: number;
  currency: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (!migrated) {
    return (
      <div className="glass-card p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#FACC15] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-white/65 leading-relaxed">
          <div className="font-semibold text-white mb-1">The invoice tables are missing</div>
          <p className="mb-2">
            Run <code className="text-accent-ink">supabase/updates/2026-09.sql</code> in the
            Supabase SQL editor, then reload.
          </p>
          {migrationError && <p className="text-xs text-white/40 break-words">{migrationError}</p>}
        </div>
      </div>
    );
  }

  const dueNow = schedules.filter(
    (schedule) => schedule.isActive && schedule.nextRunOn <= today
  );

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
      <div className="order-2 lg:order-1 space-y-2.5">
        {schedules.length === 0 ? (
          <EmptyState
            title="No schedules yet"
            description="Set one up on the right. A schedule holds its own lines, so changing the amount changes it from then on rather than rewriting invoices you have already sent."
          />
        ) : (
          schedules.map((schedule) =>
            editing === schedule.id ? (
              <ScheduleForm
                key={schedule.id}
                schedule={schedule}
                contacts={contacts}
                defaultTax={defaultTax}
                defaultTerms={defaultTerms}
                today={today}
                onDone={() => setEditing(null)}
              />
            ) : (
              <div key={schedule.id} className="glass-card p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium truncate">{schedule.title}</span>
                      <Badge tone={schedule.isActive ? "green" : "grey"}>
                        {schedule.isActive ? RECURRENCE_LABEL[schedule.interval] : "paused"}
                      </Badge>
                      {schedule.autoSend ? (
                        <Badge tone="blue">
                          <span className="inline-flex items-center gap-1">
                            <Send className="w-3 h-3" />
                            sends itself
                          </span>
                        </Badge>
                      ) : (
                        <Badge tone="amber">raises a draft</Badge>
                      )}
                      {schedule.isActive && schedule.nextRunOn <= today && (
                        <Badge tone="red">due</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
                      {schedule.contactName && (
                        <span className="inline-flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" />
                          {schedule.contactName}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="w-3.5 h-3.5" />
                        next {schedule.nextRunOn}
                      </span>
                      {schedule.occurrencesLimit !== null && (
                        <span>
                          {schedule.occurrencesDone} of {schedule.occurrencesLimit}
                        </span>
                      )}
                      {schedule.lastRunOn && <span>last ran {schedule.lastRunOn}</span>}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-base font-bold tabular-nums">
                      {formatInvoiceAmount(schedule.estimatedTotalCents, currency)}
                    </div>
                    <div className="text-[11px] text-white/35">each time</div>
                  </div>
                </div>

                {schedule.lines.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/8 space-y-1">
                    {schedule.lines.map((line, index) => (
                      <div key={index} className="text-xs text-white/50">
                        {line.quantity} × {line.description} · ₹{line.price}
                        {Number(line.tax) > 0 && ` + ${line.tax}% GST`}
                      </div>
                    ))}
                  </div>
                )}

                {canManage && (
                  <div className="mt-3 pt-3 border-t border-white/8 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(schedule.id)}
                      className="px-3 py-2 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                    >
                      Edit
                    </button>

                    <ActionForm
                      action={toggleRecurringInvoice}
                      submitLabel={schedule.isActive ? "Pause" : "Resume"}
                      compact
                    >
                      <input type="hidden" name="id" value={schedule.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={schedule.isActive ? "false" : "true"}
                      />
                    </ActionForm>

                    <DeleteSchedule id={schedule.id} title={schedule.title} />
                  </div>
                )}
              </div>
            )
          )
        )}
      </div>

      <div className="order-1 lg:order-2 space-y-4">
        {canManage &&
          (adding ? (
            <ScheduleForm
              contacts={contacts}
              defaultTax={defaultTax}
              defaultTerms={defaultTerms}
              today={today}
              onDone={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="btn-primary w-full inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New schedule
            </button>
          ))}

        {canManage && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Repeat className="w-4 h-4 text-accent-ink" />
              <h4 className="font-semibold text-sm">Run what is due</h4>
            </div>
            <p className="text-xs text-white/45 mb-4 leading-relaxed">
              {dueNow.length === 0
                ? `Nothing is due as of ${today}. A schedule fires on its own date.`
                : `${dueNow.length} ${
                    dueNow.length === 1 ? "schedule is" : "schedules are"
                  } due. Running raises the invoices — and sends the ones set to send themselves.`}
            </p>
            <ActionForm action={runRecurringNow} submitLabel="Run now" compact>
              <p className="text-[11px] text-white/35 leading-relaxed">
                This project has no scheduler, so point one at{" "}
                <code className="text-white/55 break-all">/api/cron/recurring-invoices</code> to
                have it run on its own. Until then, this button is the only thing that fires them.
              </p>
            </ActionForm>
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleForm({
  schedule,
  contacts,
  defaultTax,
  defaultTerms,
  today,
  onDone,
}: {
  schedule?: ScheduleRow;
  contacts: Array<{ id: string; label: string; gstin: string | null }>;
  defaultTax: number;
  defaultTerms: number;
  today: string;
  onDone: () => void;
}) {
  const [lines, setLines] = useState(
    schedule?.lines.length
      ? schedule.lines
      : [{ description: "", hsnCode: "", quantity: "1", price: "", tax: String(defaultTax), discount: "0" }]
  );
  const [interval, setInterval] = useState<RecurrenceInterval>(schedule?.interval ?? "monthly");
  const [startOn, setStartOn] = useState(schedule?.nextRunOn ?? today);

  const update = (index: number, patch: Partial<(typeof lines)[number]>) =>
    setLines((current) =>
      current.map((line, at) => (at === index ? { ...line, ...patch } : line))
    );

  // The next three dates, so somebody can see that "the 31st, monthly" means
  // the 28th in February before they find out from a customer.
  const preview: string[] = [];
  let cursor = startOn;
  for (let index = 0; index < 3; index += 1) {
    preview.push(cursor);
    cursor = nextRunDate(cursor, interval);
  }

  return (
    <ActionForm
      action={saveRecurringInvoice}
      submitLabel={schedule ? "Save schedule" : "Create schedule"}
      className="glass-card p-5"
    >
      {schedule && <input type="hidden" name="id" value={schedule.id} />}

      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold">{schedule ? "Edit schedule" : "New schedule"}</h4>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-white/40 hover:text-white transition-colors"
        >
          Close
        </button>
      </div>

      <div className="space-y-4">
        <Field
          label="What is it"
          name="title"
          required
          defaultValue={schedule?.title ?? ""}
          placeholder="Monthly retainer — Acme"
        />

        <SelectField
          label="Customer"
          name="contact_id"
          defaultValue={schedule?.contactId ?? ""}
          options={[
            { value: "", label: "Not a saved contact" },
            ...contacts.map((contact) => ({ value: contact.id, label: contact.label })),
          ]}
        />

        <label className="block">
          <span className="block text-xs font-medium text-white/70 mb-1.5">How often</span>
          <select
            name="interval"
            value={interval}
            onChange={(event) => setInterval(event.target.value as RecurrenceInterval)}
            className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-all"
          >
            {RECURRENCE_INTERVALS.map((option) => (
              <option key={option} value={option} className="bg-[var(--surface-3)]">
                {RECURRENCE_LABEL[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-white/70 mb-1.5">First one on</span>
          <input
            name="next_run_on"
            type="date"
            required
            value={startOn}
            onChange={(event) => setStartOn(event.target.value)}
            className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-all"
          />
          <span className="block text-[11px] text-white/35 mt-1">
            Then {preview.slice(1).join(", ")}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Payment terms"
            name="terms_days"
            type="number"
            defaultValue={String(schedule?.termsDays ?? defaultTerms)}
            hint="Days"
          />
          <Field
            label="Stop after"
            name="occurrences_limit"
            type="number"
            defaultValue={schedule?.occurrencesLimit ? String(schedule.occurrencesLimit) : ""}
            hint="Blank for forever"
          />
        </div>

        <div>
          <span className="block text-xs font-medium text-white/70 mb-2">Lines</span>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="rounded-xl border border-white/8 bg-white/4 p-2.5 space-y-2">
                <div className="flex gap-2">
                  <input
                    name="line_description"
                    value={line.description}
                    onChange={(event) => update(index, { description: event.target.value })}
                    placeholder="What is being billed"
                    className="flex-1 bg-white/5 border border-white/12 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove this line"
                      onClick={() => setLines(lines.filter((_, at) => at !== index))}
                      className="p-1.5 rounded-lg text-white/35 hover:text-white hover:bg-white/8 transition-colors flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <MiniInput
                    label="HSN"
                    name="line_hsn"
                    value={line.hsnCode}
                    onChange={(value) => update(index, { hsnCode: value })}
                  />
                  <MiniInput
                    label="Qty"
                    name="line_quantity"
                    type="number"
                    value={line.quantity}
                    onChange={(value) => update(index, { quantity: value })}
                  />
                  <MiniInput
                    label="₹"
                    name="line_price"
                    type="number"
                    value={line.price}
                    onChange={(value) => update(index, { price: value })}
                  />
                  <MiniInput
                    label="GST%"
                    name="line_tax"
                    type="number"
                    value={line.tax}
                    onChange={(value) => update(index, { tax: value })}
                  />
                </div>
                <input type="hidden" name="line_discount" value={line.discount} />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setLines([
                ...lines,
                {
                  description: "",
                  hsnCode: "",
                  quantity: "1",
                  price: "",
                  tax: String(defaultTax),
                  discount: "0",
                },
              ])
            }
            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-white/50 hover:text-white hover:bg-white/8 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add a line
          </button>
        </div>

        <TextareaField
          label="Notes on each invoice"
          name="notes"
          rows={2}
          defaultValue={schedule?.notes ?? ""}
        />

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            name="auto_send"
            defaultChecked={schedule?.autoSend ?? false}
            className="accent-[var(--accent)] w-4 h-4 mt-0.5"
          />
          <span className="text-sm text-white/75">
            Issue and send it automatically
            <span className="block text-[11px] text-white/40">
              Off, it raises a draft for you to look at first. On, it takes its number, gets a
              payment link and goes out on WhatsApp — which needs the customer to have messaged
              you in the last 24 hours.
            </span>
          </span>
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={schedule?.isActive ?? true}
            className="accent-[var(--accent)] w-4 h-4"
          />
          <span className="text-sm text-white/75">Active</span>
        </label>
      </div>
    </ActionForm>
  );
}

function MiniInput({
  label,
  name,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-white/35 mb-0.5">
        {label}
      </span>
      <input
        name={name}
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-white/5 border border-white/12 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-accent/50"
      />
    </label>
  );
}

/** Deleting asks first: a schedule is easy to recreate but easy to mis-tap. */
function DeleteSchedule({ id, title }: { id: string; title: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="px-3 py-2 rounded-lg text-xs text-white/40 hover:text-[#F87171] hover:bg-[#F87171]/10 transition-colors"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-white/50 hidden sm:inline">Delete “{title}”?</span>
      <ActionForm action={deleteRecurringInvoice} submitLabel="Yes, delete" compact>
        <input type="hidden" name="id" value={id} />
      </ActionForm>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-white/40 hover:text-white transition-colors"
      >
        No
      </button>
    </div>
  );
}
