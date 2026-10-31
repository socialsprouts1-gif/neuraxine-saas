"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowUpDown,
  Download,
  Image as ImageIcon,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { deleteCommentRule, setCommentRuleActive } from "../instagram-actions";
import AutomationEditor, { type AutomationRow } from "./AutomationEditor";

// The automations list.
//
// Searching, sorting and filtering happen here rather than on the server
// because the whole set is already on the page — a workspace with two
// hundred automations is a workspace with a problem, and a round trip
// per keystroke to re-sort twelve rows is latency bought for nothing.

type SortKey = "recent" | "runs" | "clicks" | "name";
type Filter = "all" | "live" | "off" | "comment" | "dm";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Newest first" },
  { key: "runs", label: "Most runs" },
  { key: "clicks", label: "Most clicks" },
  { key: "name", label: "Name A–Z" },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "off", label: "Off" },
  { key: "comment", label: "On comments" },
  { key: "dm", label: "On DMs" },
];

function csvCell(value: string | number | null): string {
  const text = String(value ?? "");
  // A comma, a quote or a newline inside a field turns one row into two
  // in every spreadsheet, so each is quoted rather than hoped about.
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function Automations({
  rules,
  accountId,
  appUrl,
}: {
  rules: AutomationRow[];
  /** The connected account whose posts the picker offers. */
  accountId: string | null;
  appUrl: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [filter, setFilter] = useState<Filter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<AutomationRow | "new" | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = rules.filter((rule) => {
      if (filter === "live" && !rule.is_active) return false;
      if (filter === "off" && rule.is_active) return false;
      if (filter === "comment" && rule.trigger_type !== "comment") return false;
      if (filter === "dm" && rule.trigger_type !== "dm") return false;
      if (!needle) return true;
      // Searched across the message and the keywords as well as the
      // name, because people look for an automation by what it says far
      // more often than by what they called it.
      return [rule.name, rule.dm_message ?? "", rule.media_caption ?? "", ...rule.keywords]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return [...matches].sort((a, b) => {
      if (sort === "runs") return b.run_count - a.run_count;
      if (sort === "clicks") return b.button_click_count - a.button_click_count;
      if (sort === "name") return a.name.localeCompare(b.name);
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, [rules, query, sort, filter]);

  const toggle = async (rule: AutomationRow) => {
    setBusy(rule.id);
    const result = await setCommentRuleActive(rule.id, !rule.is_active).catch(() => ({
      ok: false as const,
      error: "That could not be changed just now.",
    }));
    setBusy(null);
    if (!result.ok) return void toast.error(result.error ?? "That could not be changed.");
    toast.success(result.message ?? "Saved.");
    router.refresh();
  };

  const remove = async (rule: AutomationRow) => {
    if (!window.confirm(`Delete "${rule.name}"?`)) return;
    setBusy(rule.id);
    const result = await deleteCommentRule(rule.id).catch(() => ({
      ok: false as const,
      error: "That could not be deleted just now.",
    }));
    setBusy(null);
    if (!result.ok) return void toast.error(result.error ?? "That could not be deleted.");
    toast.success(result.message ?? "Deleted.");
    router.refresh();
  };

  const exportCsv = () => {
    const head = ["Name", "Trigger", "Keywords", "Message", "Runs", "Sent", "Clicks", "Followers", "Emails", "Status"];
    const body = shown.map((rule) =>
      [
        rule.name,
        rule.trigger_type === "dm" ? "Direct message" : "Comment",
        rule.keywords.join(" | ") || "any",
        rule.dm_message ?? "",
        rule.run_count,
        rule.sent_count,
        rule.button_click_count,
        rule.follower_gain_count,
        rule.email_count,
        rule.is_active ? "Live" : "Off",
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
    toast.success(`${shown.length} ${shown.length === 1 ? "automation" : "automations"} exported.`);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="font-semibold">
          Automations{rules.length > 0 && <span className="text-white/35"> ({rules.length})</span>}
        </h2>
        <button type="button" onClick={() => setEditing("new")} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          Create automation
        </button>
      </div>

      {/* --- search and controls -------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, message or keyword"
            className="w-full bg-white/5 border border-white/12 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>

        <label className="relative">
          <span className="sr-only">Sort</span>
          <ArrowUpDown className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="appearance-none bg-white/5 border border-white/12 rounded-xl pl-8 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
          >
            {SORTS.map((option) => (
              <option key={option.key} value={option.key} className="bg-[#14101f]">
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setShowFilters((open) => !open)}
          className={`btn-quiet text-sm ${filter !== "all" ? "text-accent-ink" : ""}`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {filter === "all" ? "Filter" : FILTERS.find((item) => item.key === filter)?.label}
        </button>

        <button
          type="button"
          onClick={exportCsv}
          disabled={shown.length === 0}
          className="btn-quiet text-sm disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-4">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                filter === option.key
                  ? "border-accent/40 bg-accent/10 text-accent-ink"
                  : "border-white/10 bg-white/4 text-white/55 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* --- the list -------------------------------------------------- */}
      {rules.length === 0 ? (
        <EmptyState
          title="No automations yet"
          description="Write one and the next comment or message that matches gets an answer."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description="No automation matches that search and filter."
        />
      ) : (
        <div className="divide-y divide-white/6">
          {shown.map((rule) => (
            <div key={rule.id} className="flex flex-wrap items-start gap-3 py-4 first:pt-0">
              {/* The post, so an automation is recognisable by sight
                  rather than by a media id nobody can read. */}
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 border border-white/10 flex-shrink-0 flex items-center justify-center">
                {rule.media_thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={rule.media_thumbnail_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : rule.trigger_type === "dm" ? (
                  <MessageSquare className="w-4 h-4 text-white/25" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-white/25" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium truncate">{rule.name}</span>
                  <Badge tone={rule.is_active ? "green" : "grey"}>
                    {rule.is_active ? "live" : "off"}
                  </Badge>
                  <Badge tone="blue">
                    {rule.trigger_type === "dm" ? "direct message" : rule.media_id ? "one post" : "any post"}
                  </Badge>
                  {rule.follow_gate && <Badge tone="purple">asks for a follow</Badge>}
                  {rule.ask_email && <Badge tone="amber">collects email</Badge>}
                </div>

                {rule.dm_message && (
                  <p className="text-[12.5px] text-white/45 mt-1 line-clamp-2 leading-relaxed">
                    {rule.dm_message}
                  </p>
                )}

                <div className="text-[12px] text-white/35 mt-1.5">
                  {rule.keywords.length > 0 ? rule.keywords.join(", ") : "every comment"}
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[12px]">
                  <Stat label="runs" value={rule.run_count} />
                  <Stat label="sent" value={rule.sent_count} />
                  {rule.buttons.length > 0 && (
                    <Stat label="button clicks" value={rule.button_click_count} />
                  )}
                  {rule.follow_gate && (
                    <Stat label="followers gained" value={rule.follower_gain_count} />
                  )}
                  {rule.ask_email && <Stat label="emails" value={rule.email_count} />}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => void toggle(rule)}
                  disabled={busy === rule.id}
                  className="text-xs font-medium text-white/55 hover:text-white disabled:opacity-40 transition-colors"
                >
                  {rule.is_active ? "Switch off" : "Switch on"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(rule)}
                  className="btn-quiet btn-compact text-xs"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(rule)}
                  disabled={busy === rule.id}
                  className="text-white/30 hover:text-red-400 disabled:opacity-40 transition-colors"
                  aria-label={`Delete ${rule.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AutomationEditor
          rule={editing === "new" ? undefined : editing}
          accountId={accountId}
          appUrl={appUrl}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className={value > 0 ? "text-white/70" : "text-white/30"}>
      <span className="font-semibold tabular-nums">{value}</span>{" "}
      <span className="text-white/35">{label}</span>
    </span>
  );
}
