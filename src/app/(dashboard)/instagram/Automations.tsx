"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  AtSign,
  Download,
  Image as ImageIcon,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { deleteCommentRule, setCommentRuleActive } from "../instagram-actions";
import AutomationEditor, { type AutomationRow } from "./AutomationEditor";
import { STARTERS, type Starter } from "@/lib/instagram-templates";

// The automations list.
//
// Rewritten to be read at a glance rather than studied. One line per
// automation, the picture of the post on the left, the one number that
// matters on the right, and everything else behind the three dots.
//
// The old version put five tallies on every row. Five numbers in a row
// is not information, it is a decision somebody has to make before they
// can read anything — so the row shows sends, and the rest live in the
// automation itself.

type Filter = "all" | "live" | "off";

const TINTS: Record<Starter["tint"], string> = {
  pink: "from-[#E4405F] to-[#C13584]",
  purple: "from-[#833AB4] to-[#5851DB]",
  amber: "from-[#FCAF45] to-[#F77737]",
  blue: "from-[#405DE6] to-[#5851DB]",
};

function csvCell(value: string | number | null): string {
  const text = String(value ?? "");
  // A comma, a quote or a newline inside a field turns one row into two
  // in every spreadsheet, so each is quoted rather than hoped about.
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function Automations({
  rules,
  accountId,
}: {
  rules: AutomationRow[];
  /** The connected account whose posts the picker offers. */
  accountId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<AutomationRow | null>(null);
  const [creating, setCreating] = useState<Starter | "blank" | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rules.filter((rule) => {
      if (filter === "live" && !rule.is_active) return false;
      if (filter === "off" && rule.is_active) return false;
      if (!needle) return true;
      // Searched across the message and keywords as well as the name,
      // because people look for an automation by what it says far more
      // often than by what they called it.
      return [rule.name, rule.dm_message ?? "", ...rule.keywords]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rules, query, filter]);

  const act = async (
    rule: AutomationRow,
    run: () => Promise<{ ok: boolean; error?: string; message?: string }>
  ) => {
    setBusy(rule.id);
    setMenu(null);
    const result = await run().catch(() => ({
      ok: false,
      error: "That did not work just now.",
      message: undefined,
    }));
    setBusy(null);
    if (!result.ok) return void toast.error(result.error ?? "That did not work.");
    toast.success(result.message ?? "Saved.");
    router.refresh();
  };

  const exportCsv = () => {
    const head = ["Name", "Starts on", "Words", "Message", "Runs", "Sent", "Clicks", "Followers", "Emails", "Status"];
    const body = shown.map((rule) =>
      [
        rule.name,
        rule.trigger_type === "dm" ? "A direct message" : "A comment",
        rule.keywords.join(" | ") || "anything",
        rule.dm_message ?? "",
        rule.run_count,
        rule.sent_count,
        rule.button_click_count,
        rule.follower_gain_count,
        rule.email_count,
        rule.is_active ? "On" : "Off",
      ]
        .map(csvCell)
        .join(",")
    );
    const blob = new Blob([[head.join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `instagram-automations-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${shown.length} exported.`);
  };

  // --- nothing yet: offer the four shapes people actually build -------
  if (rules.length === 0) {
    return (
      <>
        <h2 className="text-lg font-semibold mb-1">What should happen?</h2>
        <p className="text-sm text-white/45 mb-5 leading-relaxed">
          Pick one to start from — you can change every word of it.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          {STARTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setCreating(item)}
              className="text-left p-4 rounded-2xl border border-white/10 bg-white/4 hover:border-white/25 hover:bg-white/6 transition-all group"
            >
              <span
                className={`w-11 h-11 rounded-2xl grid place-items-center text-xl mb-3 bg-gradient-to-br ${TINTS[item.tint]} group-hover:scale-105 transition-transform`}
              >
                {item.glyph}
              </span>
              <span className="block text-[14.5px] font-semibold">{item.title}</span>
              <span className="block text-[12.5px] text-white/45 mt-1 leading-relaxed">
                {item.blurb}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setCreating("blank")}
          className="w-full mt-3 flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 border-dashed border-white/12 text-[13.5px] text-white/45 hover:border-white/25 hover:text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          Start from scratch
        </button>

        {creating && (
          <AutomationEditor
            from={creating === "blank" ? undefined : creating}
            accountId={accountId}
            onClose={() => setCreating(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-lg font-semibold">
          Automations <span className="text-white/30">{rules.length}</span>
        </h2>
        <button type="button" onClick={() => setCreating("blank")} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      {/* --- search and the two filters worth having -------------------- */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-white/25 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#E4405F]/60 transition-colors"
          />
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
          {(["all", "live", "off"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === key ? "bg-white/12 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {key === "all" ? "All" : key === "live" ? "On" : "Off"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={exportCsv}
          disabled={shown.length === 0}
          className="btn-quiet text-sm disabled:opacity-40"
          title="Download as a spreadsheet"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-white/40 py-8 text-center">Nothing matches that.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center gap-3.5 p-3 rounded-2xl border transition-colors ${
                rule.is_active
                  ? "border-white/10 bg-white/4"
                  : "border-white/6 bg-white/[0.02] opacity-60"
              }`}
            >
              {/* The post, so an automation is recognisable by sight. */}
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/6 flex-shrink-0 grid place-items-center">
                {rule.media_thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rule.media_thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : rule.trigger_type === "dm" ? (
                  <AtSign className="w-4 h-4 text-white/30" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-white/30" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-medium truncate">{rule.name}</div>
                <div className="flex items-center gap-1.5 text-[12.5px] text-white/40 mt-0.5">
                  {rule.trigger_type === "dm" ? (
                    <AtSign className="w-3 h-3 flex-shrink-0" />
                  ) : (
                    <MessageCircle className="w-3 h-3 flex-shrink-0" />
                  )}
                  <span className="truncate">
                    {rule.keywords.length > 0 ? rule.keywords.join(", ") : "anything"}
                  </span>
                </div>
              </div>

              {/* One number, not five. The rest live inside the
                  automation, where there is room to label them. */}
              <div className="text-right flex-shrink-0 hidden sm:block">
                <div className="text-[15px] font-semibold tabular-nums">{rule.sent_count}</div>
                <div className="text-[11px] text-white/35">sent</div>
              </div>

              <button
                type="button"
                onClick={() =>
                  void act(rule, () => setCommentRuleActive(rule.id, !rule.is_active))
                }
                disabled={busy === rule.id}
                className={`w-11 h-6 rounded-full flex-shrink-0 relative transition-colors disabled:opacity-40 ${
                  rule.is_active ? "bg-[#00C853]" : "bg-white/15"
                }`}
                aria-label={rule.is_active ? `Switch off ${rule.name}` : `Switch on ${rule.name}`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-[#FFFFFF] transition-all ${
                    rule.is_active ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>

              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setMenu(menu === rule.id ? null : rule.id)}
                  className="w-8 h-8 grid place-items-center rounded-lg text-white/35 hover:text-white hover:bg-white/8 transition-colors"
                  aria-label={`More for ${rule.name}`}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {menu === rule.id && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setMenu(null)}
                      aria-label="Close the menu"
                    />
                    <div className="absolute right-0 top-9 z-20 w-40 p-1 rounded-xl border border-white/12 bg-[var(--surface-3)] shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(rule);
                          setMenu(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-white/75 hover:bg-white/8 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`Delete "${rule.name}"?`)) return;
                          void act(rule, () => deleteCommentRule(rule.id));
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#F87171] hover:bg-[#F87171]/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <AutomationEditor
          rule={editing ?? undefined}
          from={creating && creating !== "blank" ? creating : undefined}
          accountId={accountId}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
        />
      )}
    </>
  );
}
