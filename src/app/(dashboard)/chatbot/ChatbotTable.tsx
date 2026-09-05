"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Download,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  Workflow,
} from "lucide-react";
import { toggleChatbotFlow, deleteChatbotFlow } from "../portal-actions";
import type { FlowNode } from "@/types/flow";
import NumberPicker, { type NumberOption } from "../numbers/NumberPicker";

export interface BotRow {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: string;
  trigger_value: string | null;
  nodes: FlowNode[];
  edges: unknown[];
  version: number;
  connection_id: string | null;
}

// A table rather than cards: once there is more than a handful of bots the
// thing people do here is scan for one by name and flip it on or off, and
// cards make you hunt for the switch in a different place on every row.

export default function ChatbotTable({
  bots,
  numbers,
}: {
  bots: BotRow[];
  numbers: NumberOption[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return bots;
    return bots.filter(
      (bot) =>
        bot.name.toLowerCase().includes(term) ||
        bot.id.toLowerCase().includes(term) ||
        (bot.trigger_value ?? "").toLowerCase().includes(term) ||
        // Keywords are what people actually remember a bot by.
        bot.nodes.some((node) =>
          (Array.isArray(node.data?.keywords) ? (node.data.keywords as string[]) : []).some((k) =>
            k.toLowerCase().includes(term)
          )
        )
    );
  }, [bots, query]);

  return (
    <>
      <div className="relative mb-5">
        <Search className="w-4 h-4 text-white/35 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          className="w-full bg-white/5 border border-white/12 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-white/35 focus:outline-none focus:border-accent/50 transition-all"
          placeholder="Search chatbots..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[44rem]">
            <thead>
              <tr className="text-left text-sm font-semibold bg-accent/8 border-b border-accent/15">
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Chatbot ID</th>
                {/* Only earns a column once the workspace has a choice. */}
                {numbers.length > 1 && <th className="px-5 py-4">Number</th>}
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bot) => (
                <BotTableRow key={bot.id} bot={bot} numbers={numbers} />
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <p className="px-5 py-8 text-sm text-white/40 text-center">
            No chatbots match “{query}”.
          </p>
        )}
      </div>
    </>
  );
}

function BotTableRow({ bot, numbers }: { bot: BotRow; numbers: NumberOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () =>
    startTransition(async () => {
      setError(null);
      const data = new FormData();
      data.set("id", bot.id);
      // The action reads the *current* state and inverts it.
      data.set("is_active", String(bot.is_active));
      const result = await toggleChatbotFlow(data);
      if (!result.ok) setError(result.error ?? "Could not change the status.");
      else router.refresh();
    });

  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
      <td className="px-5 py-3.5">
        <Link
          href={`/chatbot/${bot.id}`}
          className="font-medium hover:text-accent-ink transition-colors"
          title={`${bot.nodes.length} node${bot.nodes.length === 1 ? "" : "s"}, ${bot.edges.length} connection${bot.edges.length === 1 ? "" : "s"}, v${bot.version}`}
        >
          {bot.name}
        </Link>
        {error && <div className="text-[11px] text-red-400 mt-1">{error}</div>}
      </td>

      <td className="px-5 py-3.5">
        <CopyableId id={bot.id} />
      </td>

      {numbers.length > 1 && (
        <td className="px-5 py-3.5">
          <NumberPicker
            kind="chatbot"
            id={bot.id}
            value={bot.connection_id}
            options={numbers}
            compact
          />
        </td>
      )}

      <td className="px-5 py-3.5">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          role="switch"
          aria-checked={bot.is_active}
          aria-label={bot.is_active ? "Deactivate bot" : "Activate bot"}
          title={bot.is_active ? "Active — matching inbound messages" : "Draft — not matching anything"}
          className="disabled:opacity-50"
        >
          <span
            className={`relative block w-11 h-6 rounded-full transition-colors ${
              bot.is_active ? "bg-accent" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                bot.is_active ? "left-5.5" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </td>

      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/chatbot/${bot.id}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/6 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Link>
          <RowMenu bot={bot} />
        </div>
      </td>
    </tr>
  );
}

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="group inline-flex items-center gap-1.5 font-mono text-[11px] text-white/45 hover:text-white/80 transition-colors"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access can be refused (insecure context, permissions).
          // The id is on screen and selectable, so this is not worth an alert.
        }
      }}
      title="Copy bot ID"
    >
      <span className="truncate max-w-[13rem]">{id}</span>
      {copied ? (
        <Check className="w-3 h-3 text-accent-ink flex-shrink-0" />
      ) : (
        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      )}
    </button>
  );
}

function RowMenu({ bot }: { bot: BotRow }) {
  const router = useRouter();
  const details = useRef<HTMLDetailsElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const close = () => {
    details.current?.removeAttribute("open");
    setConfirming(false);
  };

  const exportBot = () => {
    // Round-trips through importFlow, so what comes out is what goes in.
    const payload = JSON.stringify(
      { name: bot.name, nodes: bot.nodes, edges: bot.edges },
      null,
      2
    );
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${bot.name.replace(/[^\w-]+/g, "-").toLowerCase() || "bot"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    close();
  };

  const remove = () =>
    startTransition(async () => {
      const data = new FormData();
      data.set("id", bot.id);
      await deleteChatbotFlow(data);
      close();
      router.refresh();
    });

  return (
    <details ref={details} className="relative">
      <summary
        className="list-none cursor-pointer p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/6 transition-colors"
        aria-label="More actions"
      >
        <MoreVertical className="w-4 h-4" />
      </summary>

      <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-xl border border-white/12 bg-[var(--surface-1)] shadow-2xl p-1">
        <Link
          href={`/chatbot/${bot.id}`}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/6 transition-colors"
        >
          <Workflow className="w-3.5 h-3.5" />
          Open builder
        </Link>

        <button
          type="button"
          onClick={exportBot}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/6 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export as JSON
        </button>

        <div className="h-px bg-white/8 my-1" />

        {/* Deleting a bot cannot be undone, so the confirm lives here rather
            than in a window.confirm the browser may suppress. */}
        {confirming ? (
          <div className="px-2.5 py-2">
            <p className="text-[11px] text-white/50 mb-2 leading-relaxed">
              Delete “{bot.name}”? This cannot be undone.
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="flex-1 text-[11px] px-2 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 text-[11px] px-2 py-1.5 rounded-lg border border-white/12 text-white/60 hover:bg-white/6 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete bot
          </button>
        )}
      </div>
    </details>
  );
}
