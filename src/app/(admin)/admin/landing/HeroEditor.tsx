"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { saveSiteSection } from "../actions";
import { Card } from "@/components/ui/primitives";
import type { HeroContent } from "@/lib/site-content";

/** Everything above the fold on the landing page. */
export default function HeroEditor({ initial }: { initial: HeroContent }) {
  const router = useRouter();
  const [hero, setHero] = useState(initial);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof HeroContent>(key: K, value: HeroContent[K]) =>
    setHero((current) => ({ ...current, [key]: value }));

  const save = () =>
    startTransition(async () => {
      const result = await saveSiteSection("hero", { ...hero });
      setNote({ ok: result.ok, text: result.message ?? result.error ?? "" });
      if (result.ok) router.refresh();
    });

  return (
    <Card>
      <h2 className="font-semibold mb-1">Hero</h2>
      <p className="text-sm text-white/50 mb-5">
        The first screen. Headline, buttons, and the numbers beneath them.
      </p>

      <div className="space-y-4">
        <Text label="Badge" value={hero.badge} onChange={(v) => set("badge", v)} />

        <div className="grid md:grid-cols-2 gap-4">
          <Text label="Headline, first line" value={hero.headline} onChange={(v) => set("headline", v)} />
          <Text
            label="Headline, second line"
            value={hero.headlineAccent}
            onChange={(v) => set("headlineAccent", v)}
            hint="Rendered in the green gradient."
          />
        </div>

        <Text label="Subheadline" value={hero.subheadline} onChange={(v) => set("subheadline", v)} multiline />

        <List
          label="Feature pills"
          items={hero.pills}
          onChange={(items) => set("pills", items)}
          placeholder="AI Chatbots"
        />

        <div className="grid md:grid-cols-2 gap-4">
          <Pair
            label="Primary button"
            value={hero.primaryCta}
            onChange={(v) => set("primaryCta", v)}
          />
          <Pair
            label="Secondary button"
            value={hero.secondaryCta}
            onChange={(v) => set("secondaryCta", v)}
          />
        </div>

        {/* Claims about scale are checkable, and a reviewer or a customer who
            checks one that isn't true has learned something worse than the
            claim was worth. Hence a switch, not just an edit box. */}
        <div className="rounded-xl border border-white/10 bg-white/4 p-4">
          <label className="flex items-center gap-2.5 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={hero.showSocialProof}
              onChange={(event) => set("showSocialProof", event.target.checked)}
              className="w-4 h-4 accent-[#00FF87]"
            />
            <span className="text-sm font-medium">Show the rating and avatars</span>
          </label>
          {hero.showSocialProof && (
            <div className="grid md:grid-cols-[8rem_1fr] gap-3">
              <Text label="Rating" value={hero.rating} onChange={(v) => set("rating", v)} />
              <Text
                label="Line beneath it"
                value={hero.socialProofText}
                onChange={(v) => set("socialProofText", v)}
                hint="Only claim what you can evidence."
              />
            </div>
          )}
        </div>

        <Rows
          label="Stat strip"
          columns={["Value", "Label"]}
          rows={hero.stats.map((s) => [s.value, s.label])}
          onChange={(rows) => set("stats", rows.map(([value, label]) => ({ value, label })))}
          blank={["", ""]}
        />

        <Rows
          label="Floating cards"
          hint="Up to four. The icons and positions are fixed by the layout."
          columns={["Title", "Subtitle", "Colour"]}
          rows={hero.floatingCards.map((c) => [c.title, c.subtitle, c.color])}
          onChange={(rows) =>
            set(
              "floatingCards",
              rows.map(([title, subtitle, color]) => ({ title, subtitle, color: color || "#00FF87" }))
            )
          }
          blank={["", "", "#00FF87"]}
          max={4}
        />
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button type="button" onClick={save} disabled={pending} className="btn-primary text-sm">
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          Save hero
        </button>
        {note && (
          <span className={`text-xs ${note.ok ? "text-accent-ink" : "text-[#F87171]"}`}>{note.text}</span>
        )}
      </div>
    </Card>
  );
}

const INPUT =
  "w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all";

function Text({
  label,
  value,
  onChange,
  hint,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT} resize-y`}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} />
      )}
      {hint && <span className="block text-[11px] text-white/35 mt-1">{hint}</span>}
    </label>
  );
}

function Pair({
  label,
  value,
  onChange,
}: {
  label: string;
  value: { label: string; href: string };
  onChange: (value: { label: string; href: string }) => void;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
          placeholder="Text"
          className={INPUT}
        />
        <input
          value={value.href}
          onChange={(e) => onChange({ ...value, href: e.target.value })}
          placeholder="/auth/register"
          className={`${INPUT} font-mono text-xs`}
        />
      </div>
    </div>
  );
}

/** A reorderable-by-editing list of plain strings. */
function List({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={item}
              placeholder={placeholder}
              onChange={(e) => onChange(items.map((v, i) => (i === index ? e.target.value : v)))}
              className={INPUT}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              aria-label={`Remove ${item || "item"}`}
              className="p-2 rounded-lg text-white/30 hover:text-[#F87171] hover:bg-white/8 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="inline-flex items-center gap-1.5 text-xs text-accent-ink mt-2 hover:underline"
      >
        <Plus className="w-3.5 h-3.5" />
        Add
      </button>
    </div>
  );
}

/** A small table of fixed-width string columns. */
function Rows({
  label,
  hint,
  columns,
  rows,
  onChange,
  blank,
  max,
}: {
  label: string;
  hint?: string;
  columns: string[];
  rows: string[][];
  onChange: (rows: string[][]) => void;
  blank: string[];
  max?: number;
}) {
  const edit = (rowIndex: number, colIndex: number, value: string) =>
    onChange(rows.map((row, i) => (i === rowIndex ? row.map((v, j) => (j === colIndex ? value : v)) : row)));

  return (
    <div>
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      {hint && <span className="block text-[11px] text-white/35 mb-2">{hint}</span>}

      <div className="space-y-2">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-2">
            <div
              className="grid gap-2 flex-1"
              style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
            >
              {row.map((cell, colIndex) => (
                <input
                  key={colIndex}
                  value={cell}
                  placeholder={columns[colIndex]}
                  onChange={(e) => edit(rowIndex, colIndex, e.target.value)}
                  className={INPUT}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, i) => i !== rowIndex))}
              aria-label="Remove row"
              className="p-2 rounded-lg text-white/30 hover:text-[#F87171] hover:bg-white/8 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {(max === undefined || rows.length < max) && (
        <button
          type="button"
          onClick={() => onChange([...rows, [...blank]])}
          className="inline-flex items-center gap-1.5 text-xs text-accent-ink mt-2 hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      )}
    </div>
  );
}
