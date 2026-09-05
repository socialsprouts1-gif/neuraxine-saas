"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  Phone,
  Search,
  Tag,
  Users,
} from "lucide-react";
import NewMessageAlert from "./NewMessageAlert";

export interface ConversationRow {
  id: string;
  contactId: string;
  name: string;
  waId: string;
  tags: string[];
  preview: string;
  lastMessageAt: string | null;
  unread: boolean;
  status: string;
  assignedTo: string | null;
  assignedName: string | null;
  score: number | null;
  stage: string;
  needsHuman: boolean;
  hasReminder: boolean;
  priority: string;
  /** Which of your numbers this thread is on. */
  connectionId: string | null;
}

export interface Teammate {
  userId: string;
  name: string;
}

type Scope = "all" | "unread" | "assigned" | "unassigned" | string;
type SortKey = "name" | "date" | "unread";

/** Hot is the analyser's own threshold for a lead worth chasing today. */
const HOT_SCORE = 70;

type View = "all" | "unread" | "mine" | "hot" | "followup" | "unassigned" | "human";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mine", label: "Mine" },
  { id: "hot", label: "Hot" },
  { id: "followup", label: "Follow-up" },
  { id: "unassigned", label: "Unassigned" },
  { id: "human", label: "Human" },
];

function inView(row: ConversationRow, view: View, me: string | null): boolean {
  switch (view) {
    case "unread":
      return row.unread;
    case "mine":
      return Boolean(me) && row.assignedTo === me;
    case "hot":
      return (row.score ?? 0) >= HOT_SCORE;
    case "followup":
      return row.hasReminder;
    case "unassigned":
      return !row.assignedTo;
    case "human":
      return row.needsHuman;
    default:
      return true;
  }
}

// The list rail: filter, sort, search and pick. Everything here is local
// state over rows the server already sent — filtering a hundred threads in
// the browser beats a round trip per keystroke.
export default function ConversationList({
  rows,
  activeId,
  teammates,
  allTags,
  currentUserId,
  orgId,
  numbers,
}: {
  rows: ConversationRow[];
  activeId: string | null;
  teammates: Teammate[];
  allTags: string[];
  currentUserId: string;
  orgId: string;
  /** Every active number, so the list can be narrowed to some of them. */
  numbers: Array<{ id: string; label: string; status?: string }>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<SortKey>("date");
  const [descending, setDescending] = useState(true);
  const [tag, setTag] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [pickedNumbers, setPickedNumbers] = useState<string[]>([]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = rows.filter((row) => {
      if (!inView(row, view, currentUserId)) return false;
      // Nothing ticked means every number, so an empty list is not a
      // filter that matches nothing.
      if (pickedNumbers.length > 0 && !pickedNumbers.includes(row.connectionId ?? "")) {
        return false;
      }
      if (scope === "unread" && !row.unread) return false;
      if (scope === "assigned" && !row.assignedTo) return false;
      if (scope === "unassigned" && row.assignedTo) return false;
      // Any other scope value is a specific teammate's user id.
      if (
        scope !== "all" &&
        scope !== "unread" &&
        scope !== "assigned" &&
        scope !== "unassigned" &&
        row.assignedTo !== scope
      ) {
        return false;
      }
      if (tag && !row.tags.includes(tag)) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.waId.toLowerCase().includes(needle) ||
        row.preview.toLowerCase().includes(needle)
      );
    });

    const direction = descending ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sort === "name") return direction * -a.name.localeCompare(b.name);
      if (sort === "unread") return direction * (Number(a.unread) - Number(b.unread));
      const left = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const right = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      return direction * (left - right);
    });
  }, [rows, query, scope, sort, descending, tag, view, pickedNumbers, currentUserId]);

  const scopeLabel =
    scope === "all"
      ? null
      : scope === "unread" || scope === "assigned" || scope === "unassigned"
        ? scope
        : (teammates.find((mate) => mate.userId === scope)?.name ?? "assigned");

  return (
    <aside className="w-80 border-r border-white/8 flex flex-col flex-shrink-0 min-h-0">
      <div className="flex items-center gap-2 px-3 h-14 border-b border-white/8 flex-shrink-0">
        {/* Which numbers' conversations to show. A pill rather than an
            icon: with several numbers connected, which one you are looking
            at is the first thing you need to know. */}
        {numbers.length > 1 && (
          <NumberMenu
            numbers={numbers}
            picked={pickedNumbers}
            onToggle={(id) =>
              setPickedNumbers((current) =>
                current.includes(id)
                  ? current.filter((entry) => entry !== id)
                  : [...current, id]
              )
            }
            onClear={() => setPickedNumbers([])}
          />
        )}

        <Menu
          label="Tags"
          icon={<Tag className="w-4 h-4" />}
          active={tag !== null}
          width="w-56"
        >
          {
            <>
              <MenuHeading>Filter by tag</MenuHeading>
              <MenuItem
                checked={tag === null}
                onClick={() => {
                  setTag(null);
                }}
              >
                All conversations
              </MenuItem>
              {allTags.length === 0 ? (
                <p className="px-3 py-2 text-[11px] text-white/35 leading-relaxed">
                  No tags on any contact yet. Add them on the Contacts screen.
                </p>
              ) : (
                allTags.map((option) => (
                  <MenuItem
                    key={option}
                    checked={tag === option}
                    onClick={() => {
                      setTag(option);
                    }}
                  >
                    {option}
                  </MenuItem>
                ))
              )}
            </>
          }
        </Menu>

        <Menu
          label="Filter conversations"
          icon={<Filter className="w-4 h-4" />}
          active={scope !== "all"}
          width="w-64"
        >
          {
            <>
              <MenuHeading>Filter Conversations</MenuHeading>
              {(
                [
                  ["all", "All"],
                  ["unread", "Unread"],
                  ["assigned", "Assigned"],
                  ["unassigned", "Unassigned"],
                ] as const
              ).map(([value, label]) => (
                <MenuItem
                  key={value}
                  checked={scope === value}
                  onClick={() => {
                    setScope(value);
                  }}
                >
                  {label}
                </MenuItem>
              ))}

              <div className="px-3 pt-2 pb-1 flex items-center gap-1.5 text-[11px] text-white/40">
                Assigned To…
                <ChevronRight className="w-3 h-3" />
              </div>
              {teammates.length === 0 ? (
                <p className="px-3 pb-2 text-[11px] text-white/35">You are the only member.</p>
              ) : (
                teammates.map((mate) => (
                  <MenuItem
                    key={mate.userId}
                    checked={scope === mate.userId}
                    indent
                    onClick={() => {
                      setScope(mate.userId);
                    }}
                  >
                    {mate.name}
                  </MenuItem>
                ))
              )}

              <div className="h-px bg-white/8 my-1.5" />
              <MenuHeading>Sort By</MenuHeading>
              {(
                [
                  ["name", "Name"],
                  ["date", "Date"],
                  ["unread", "Unread Count"],
                ] as const
              ).map(([value, label]) => (
                <MenuItem
                  key={value}
                  checked={sort === value}
                  onClick={() => {
                    // Clicking the current sort flips its direction, which
                    // is what the arrow beside it means.
                    if (sort === value) setDescending((current) => !current);
                    else {
                      setSort(value);
                      setDescending(true);
                    }
                  }}
                  keepOpen
                  trailing={sort === value ? (descending ? "↓" : "↑") : undefined}
                >
                  {label}
                </MenuItem>
              ))}
            </>
          }
        </Menu>

        <Menu
          label="Assigned"
          icon={<Users className="w-4 h-4" />}
          active={false}
          width="w-56"
        >
          {
            <>
              <MenuHeading>Team</MenuHeading>
              {teammates.map((mate) => {
                const count = rows.filter((row) => row.assignedTo === mate.userId).length;
                return (
                  <MenuItem
                    key={mate.userId}
                    onClick={() => {
                      setScope(mate.userId);
                    }}
                    trailing={String(count)}
                  >
                    {mate.name}
                  </MenuItem>
                );
              })}
              <MenuItem
                onClick={() => {
                  setScope("unassigned");
                }}
                trailing={String(rows.filter((row) => !row.assignedTo).length)}
              >
                Unassigned
              </MenuItem>
            </>
          }
        </Menu>

        <div className="ml-auto flex items-center gap-1">
          <NewMessageAlert orgId={orgId} activeConversationId={activeId} />
          <span className="text-xs text-white/35 tabular-nums pr-1">{visible.length}</span>
        </div>
      </div>

      <div className="flex gap-1 px-3 pt-3 overflow-x-auto flex-shrink-0 scrollbar-none">
        {VIEWS.map((option) => {
          const count = rows.filter((row) => inView(row, option.id, currentUserId)).length;
          if (count === 0 && option.id !== "all" && view !== option.id) return null;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setView(option.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
                view === option.id
                  ? "bg-accent/12 text-accent-ink border border-accent/25"
                  : "text-white/45 hover:text-white/80 border border-transparent"
              }`}
            >
              {option.label}
              <span className="ml-1.5 tabular-nums opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="p-3 flex-shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-white/35 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search here..."
            aria-label="Search conversations"
            className="w-full bg-white/5 border border-white/12 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-white/35 focus:outline-none focus:border-accent/50 transition-all"
          />
        </div>

        {(scopeLabel || tag) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {scopeLabel && (
              <Chip onClear={() => setScope("all")}>{scopeLabel}</Chip>
            )}
            {pickedNumbers.length > 0 && (
              <Chip onClear={() => setPickedNumbers([])}>
                {pickedNumbers.length === 1
                  ? (numbers.find((n) => n.id === pickedNumbers[0])?.label ?? "Number")
                  : `${pickedNumbers.length} numbers`}
              </Chip>
            )}
            {tag && <Chip onClear={() => setTag(null)}>#{tag}</Chip>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-2xl mb-2">
              {view === "hot" ? "🔥" : view === "followup" ? "⏰" : view === "human" ? "🚨" : "💬"}
            </div>
            <p className="text-sm text-white/45 leading-relaxed">
              {view === "hot"
                ? "No hot leads right now."
                : view === "followup"
                  ? "You're all caught up."
                  : view === "human"
                    ? "Nothing needs a person right now."
                    : view === "unread"
                      ? "Nothing unread."
                      : "No conversations match this view."}
            </p>
          </div>
        ) : (
          visible.map((row) => {
            const isActive = row.id === activeId;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => router.push(`/inbox?c=${row.id}`)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-white/5 border-l-2 transition-colors ${
                  isActive
                    ? "bg-accent/8 border-l-accent"
                    : "border-l-transparent hover:bg-white/3"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent/30 to-accent2/25 flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {initials(row.name, row.waId)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm truncate ${row.unread ? "font-semibold" : "font-medium"}`}
                    >
                      {row.name}
                    </span>
                    {(row.score ?? 0) >= HOT_SCORE && (
                      <span className="text-[10px] text-[#FF6B35] flex-shrink-0" title={`Lead score ${row.score}`}>
                        🔥
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-white/35 flex-shrink-0">
                      {clockOrDay(row.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-[11px] truncate ${
                        row.unread ? "text-white/70" : "text-white/40"
                      }`}
                    >
                      {row.preview || "No messages yet"}
                    </span>
                    {row.needsHuman && (
                      <span className="ml-auto text-[10px] text-[#FB923C] flex-shrink-0">
                        human
                      </span>
                    )}
                    {row.unread && !row.needsHuman && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                    )}
                  </div>
                  {row.assignedName && (
                    <div className="text-[10px] text-accent2-ink mt-0.5 truncate">
                      {row.assignedName}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

// --- menu plumbing --------------------------------------------------------

function Menu({
  label,
  icon,
  active,
  width,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  width: string;
  children: React.ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);

  // Closing by delegation rather than by handing a closure to every item:
  // picking anything dismisses the menu, except the controls marked to stay
  // open because they are meant to be pressed more than once.
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-keep-open]")) return;
    if (target.closest("button")) details.current?.removeAttribute("open");
  };

  return (
    <details ref={details} className="relative">
      <summary
        aria-label={label}
        title={label}
        className={`list-none cursor-pointer p-2 rounded-lg transition-colors ${
          active
            ? "bg-accent text-[#050508]"
            : "text-white/50 hover:text-white hover:bg-white/8"
        }`}
      >
        {icon}
      </summary>
      <div
        onClick={onClick}
        className={`absolute left-0 top-full mt-1.5 z-30 ${width} rounded-xl border border-white/12 bg-[var(--surface-1)] shadow-2xl py-1.5`}
      >
        {children}
      </div>
    </details>
  );
}

function MenuHeading({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-1.5 text-sm font-semibold">{children}</div>;
}

function MenuItem({
  children,
  onClick,
  checked,
  indent,
  trailing,
  keepOpen,
}: {
  children: React.ReactNode;
  onClick: () => void;
  checked?: boolean;
  indent?: boolean;
  trailing?: string;
  /** Survives the click, for controls meant to be pressed repeatedly. */
  keepOpen?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-keep-open={keepOpen ? "" : undefined}
      className={`w-full flex items-center gap-2 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/6 transition-colors ${
        indent ? "pl-8 pr-3" : "px-3"
      }`}
    >
      {checked !== undefined && !indent && (
        <Check className={`w-3.5 h-3.5 flex-shrink-0 ${checked ? "text-accent-ink" : "opacity-0"}`} />
      )}
      <span className="truncate">{children}</span>
      {trailing && <span className="ml-auto text-xs text-white/35">{trailing}</span>}
    </button>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/12 border border-accent/25 text-[11px] text-accent-ink hover:bg-accent/20 transition-colors"
    >
      {children}
      <span aria-hidden>×</span>
    </button>
  );
}

// --- formatting -----------------------------------------------------------

function initials(name: string, waId: string): string {
  const trimmed = name.trim();
  if (trimmed && trimmed !== waId) {
    return trimmed
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }
  return waId.slice(-2);
}

/** Today shows a clock; anything older shows how long ago, as WhatsApp does. */
function clockOrDay(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 1) return "Yesterday";
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}


/**
 * The WhatsApp number picker.
 *
 * A labelled pill, not an icon button: once a workspace has several
 * numbers, which one you are reading is context you need before you read
 * anything, and an icon does not carry it. Ticking nothing means all.
 */
function NumberMenu({
  numbers,
  picked,
  onToggle,
  onClear,
}: {
  numbers: Array<{ id: string; label: string; status?: string }>;
  picked: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);

  const summary =
    picked.length === 0
      ? "All numbers"
      : picked.length === 1
        ? (numbers.find((number) => number.id === picked[0])?.label ?? "1 number")
        : `${picked.length} numbers`;

  return (
    <details ref={details} className="relative">
      <summary
        aria-label="Filter by WhatsApp number"
        className={`list-none cursor-pointer flex items-center gap-1.5 pl-2 pr-1.5 py-1.5 rounded-lg border text-xs transition-colors max-w-[11rem] ${
          picked.length > 0
            ? "border-accent/40 bg-accent/8 text-accent-ink"
            : "border-white/12 bg-white/4 text-white/70 hover:border-white/25"
        }`}
      >
        <Phone className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate flex-1 tabular-nums">{summary}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
      </summary>

      <div className="absolute left-0 top-full mt-1.5 w-72 rounded-xl border border-white/10 bg-[var(--surface-2)] shadow-xl z-30 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-white/8">
          <span className="text-xs font-semibold">WhatsApp numbers</span>
        </div>

        <div className="py-1 max-h-72 overflow-y-auto">
          {numbers.map((number) => {
            const checked = picked.includes(number.id);
            return (
              <label
                key={number.id}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 cursor-pointer"
              >
                <span
                  className={`grid place-items-center w-4 h-4 rounded border shrink-0 transition-colors ${
                    checked ? "bg-accent border-accent" : "border-white/25"
                  }`}
                >
                  {checked && (
                    <Check className="w-3 h-3 text-[var(--app-bg)]" strokeWidth={3} />
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(number.id)}
                  className="sr-only"
                />
                <span className="text-sm flex-1 truncate tabular-nums">{number.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/12 text-accent-ink shrink-0">
                  {number.status === "active" || !number.status ? "Active" : number.status}
                </span>
              </label>
            );
          })}
        </div>

        {picked.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onClear();
              details.current?.removeAttribute("open");
            }}
            className="w-full text-left px-3 py-2 text-[11px] text-white/45 hover:text-white hover:bg-white/5 border-t border-white/8"
          >
            Show all numbers
          </button>
        )}
      </div>
    </details>
  );
}
