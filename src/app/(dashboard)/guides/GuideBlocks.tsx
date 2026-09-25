import { AlertTriangle, ArrowRight, Check, X } from "lucide-react";
import type { Block } from "@/lib/guides";

// How a guide renders.
//
// The brief was "chart form, graphical form, more than text" — so every
// block type here is a shape you can read before you read the words.
// Flows are boxes and arrows, comparisons are two columns you can scan
// without reading, steps are numbered. Prose is the fallback, not the
// default.
//
// Deliberately no chart library: these are explanations, not data, and
// the shapes are simple enough that CSS draws them better than an SVG
// runtime would — and they stay legible when the page is printed or the
// browser text is scaled up.

const TONE: Record<string, { ring: string; text: string; dot: string }> = {
  neutral: { ring: "border-white/12 bg-white/4", text: "text-white/80", dot: "bg-white/25" },
  accent: { ring: "border-accent/30 bg-accent/8", text: "text-white", dot: "bg-accent" },
  good: { ring: "border-accent/30 bg-accent/8", text: "text-white", dot: "bg-accent" },
  bad: { ring: "border-red-400/30 bg-red-500/8", text: "text-white", dot: "bg-red-400" },
};

export default function GuideBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case "text":
      return (
        <p className="text-[15px] leading-[1.75] text-white/70 max-w-[62ch]">{block.body}</p>
      );

    case "warn":
      return (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/8 p-4 md:p-5">
          <AlertTriangle className="w-4.5 h-4.5 text-amber-300 flex-shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed text-white/75">{block.body}</p>
        </div>
      );

    case "flow":
      return (
        <figure className="m-0">
          <div className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-0">
            {block.lanes.map((lane, index) => {
              const tone = TONE[lane.tone ?? "neutral"];
              return (
                <div key={lane.label} className="flex items-stretch md:flex-1 min-w-0">
                  <div
                    className={`flex-1 min-w-0 rounded-2xl border p-4 ${tone.ring}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tone.dot}`} />
                      <span className={`text-[13px] font-semibold leading-snug ${tone.text}`}>
                        {lane.label}
                      </span>
                    </div>
                    {lane.detail && (
                      <p className="text-[12px] leading-relaxed text-white/45">{lane.detail}</p>
                    )}
                  </div>

                  {/* The arrow turns down on a phone, because a row of four
                      boxes at 360px is four boxes nobody can read. */}
                  {index < block.lanes.length - 1 && (
                    <div className="flex items-center justify-center px-1 md:px-2 flex-shrink-0">
                      <ArrowRight className="w-4 h-4 text-white/20 rotate-90 md:rotate-0" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {block.caption && (
            <figcaption className="text-[12px] text-white/40 mt-3 leading-relaxed">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case "steps":
      return (
        <div>
          {block.title && <h3 className="font-semibold mb-4">{block.title}</h3>}
          <ol className="space-y-3 list-none p-0 m-0">
            {block.steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/15 border border-accent/30 text-accent-ink text-xs font-bold flex items-center justify-center tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 pb-1">
                  <div className="font-semibold text-sm mb-1">{step.title}</div>
                  <p className="text-[13.5px] leading-relaxed text-white/55">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      );

    case "compare":
      return (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-accent/25 bg-accent/6 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Check className="w-4 h-4 text-accent-ink" />
              <h3 className="font-semibold text-sm">{block.goodTitle}</h3>
            </div>
            <ul className="space-y-2 m-0 p-0 list-none">
              {block.good.map((item) => (
                <li key={item} className="text-[13px] text-white/65 flex gap-2">
                  <span className="text-accent-ink flex-shrink-0">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-red-400/20 bg-red-500/6 p-5">
            <div className="flex items-center gap-2 mb-3">
              <X className="w-4 h-4 text-red-300" />
              <h3 className="font-semibold text-sm">{block.badTitle}</h3>
            </div>
            <ul className="space-y-2 m-0 p-0 list-none">
              {block.bad.map((item) => (
                <li key={item} className="text-[13px] text-white/65 flex gap-2">
                  <span className="text-red-300/70 flex-shrink-0">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );

    case "table":
      return (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[32rem]">
              <thead>
                <tr className="text-left bg-accent/8 border-b border-accent/15">
                  {block.head.map((cell) => (
                    <th key={cell} className="px-5 py-3.5 font-semibold text-[13px]">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row) => (
                  <tr key={row.join("|")} className="border-b border-white/5 last:border-0">
                    {row.map((cell, index) => (
                      <td
                        key={index}
                        className={`px-5 py-3.5 align-top text-[13px] leading-relaxed ${
                          index === 0 ? "text-white/85 font-medium" : "text-white/55"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case "tips":
      return (
        <div>
          {block.title && <h3 className="font-semibold mb-4">{block.title}</h3>}
          <div className="grid md:grid-cols-2 gap-3">
            {block.tips.map((tip) => (
              <div key={tip.title} className="rounded-2xl border border-white/10 bg-white/3 p-4">
                <div className="font-semibold text-[13px] mb-1.5 leading-snug">{tip.title}</div>
                <p className="text-[12.5px] leading-relaxed text-white/50">{tip.body}</p>
              </div>
            ))}
          </div>
        </div>
      );
  }
}
