import type { FlowEdge, FlowGraph, FlowNode, ListSection, ReplyButton } from "@/types/flow";
import { normalise, containsKeyword } from "@/lib/reply-matcher";

// The decision half of the flow runtime: given a graph, where we are in it,
// and what the customer just said, work out which node runs next and what it
// should send. Pure — no Supabase, no fetch — so the traversal rules can be
// tested directly, the same split as reply-matcher.ts.

export type FlowVariables = Record<string, string>;

export function graphOf(flow: { nodes: unknown; edges: unknown }): FlowGraph {
  return {
    nodes: Array.isArray(flow.nodes) ? (flow.nodes as FlowNode[]) : [],
    edges: Array.isArray(flow.edges) ? (flow.edges as FlowEdge[]) : [],
  };
}

export function findNode(graph: FlowGraph, id: string | null): FlowNode | null {
  if (!id) return null;
  return graph.nodes.find((n) => n.id === id) ?? null;
}

/**
 * The node a flow starts from: the explicit entry node, else the trigger,
 * else the first node. Flows authored in the old single-node form have no
 * trigger node at all, so falling through to the first node keeps them
 * working.
 */
export function entryNode(graph: FlowGraph, entryNodeId?: string | null): FlowNode | null {
  return (
    findNode(graph, entryNodeId ?? null) ??
    graph.nodes.find((n) => n.kind === "on_message") ??
    graph.nodes[0] ??
    null
  );
}

/** Follows one outlet of a node. `handle` null means the default outlet. */
export function nextNode(
  graph: FlowGraph,
  fromId: string,
  handle?: string | null
): FlowNode | null {
  const candidates = graph.edges.filter((e) => e.source === fromId);
  const match =
    candidates.find((e) => (e.sourceHandle ?? null) === (handle ?? null)) ??
    // A node with named outlets can still have one unlabelled edge drawn
    // from its body; treat that as the fallback path rather than a dead end.
    (handle ? candidates.find((e) => !e.sourceHandle) : undefined);

  return match ? findNode(graph, match.target) : null;
}

// --- trigger matching ------------------------------------------------------

// Pure, so it lives in its own module and can be tested directly.
export { triggerListensOn } from "@/lib/trigger-scope";

export function triggerMatches(node: FlowNode, text: string): boolean {
  const keywords = asStringArray(node.data.keywords);
  // No keywords means "any inbound message", which is a deliberate choice in
  // the builder, not an unconfigured node.
  if (keywords.length === 0) return true;

  const normalised = normalise(text);
  if (!normalised) return false;

  if (keywords.some((k) => containsKeyword(normalised, k))) return true;

  if (node.data.fuzzy === true) {
    const sensitivity = clamp(Number(node.data.sensitivity ?? 80), 0, 100);
    return keywords.some((k) => fuzzyMatches(normalised, normalise(k), sensitivity));
  }

  return false;
}

/**
 * Loose matching for typos: every keyword token must appear in the message
 * within an edit distance the sensitivity allows. At 100 this is exact; at 0
 * almost anything matches, which is why the builder caps the slider's meaning
 * rather than the value.
 */
export function fuzzyMatches(text: string, keyword: string, sensitivity: number): boolean {
  if (!keyword) return false;
  const tolerance = Math.floor(((100 - sensitivity) / 100) * Math.max(keyword.length, 1) * 0.5);
  if (tolerance <= 0) return text.includes(keyword);

  return text
    .split(" ")
    .some((word) => Math.abs(word.length - keyword.length) <= tolerance && editDistance(word, keyword) <= tolerance);
}

function editDistance(a: string, b: string): number {
  // Levenshtein with a rolling row: the strings here are single words, so
  // the full matrix would be wasted allocation on every inbound message.
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

// --- variables -------------------------------------------------------------

/** Replaces {{name}} with a collected answer. Unknown names become empty. */
export function interpolate(template: string, variables: FlowVariables): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, name: string) => variables[name] ?? "");
}

export function checkCondition(node: FlowNode, variables: FlowVariables): boolean {
  const left = variables[String(node.data.left ?? "")] ?? "";
  const right = interpolate(String(node.data.right ?? ""), variables);
  const operator = String(node.data.operator ?? "equals");

  switch (operator) {
    case "exists":
      return left.trim().length > 0;
    case "equals":
      return normalise(left) === normalise(right);
    case "not_equals":
      return normalise(left) !== normalise(right);
    case "contains":
      return normalise(left).includes(normalise(right));
    case "gt":
      return numeric(left) > numeric(right);
    case "lt":
      return numeric(left) < numeric(right);
    default:
      return false;
  }
}

/** Validates an Ask node's answer against its expected shape. */
export function answerAccepted(node: FlowNode, answer: string): boolean {
  const trimmed = answer.trim();
  if (!trimmed) return false;

  switch (String(node.data.expect ?? "any")) {
    case "number":
      return /^-?\d+(\.\d+)?$/.test(trimmed);
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
    case "phone":
      return trimmed.replace(/\D/g, "").length >= 8;
    default:
      return true;
  }
}

// --- node payloads ---------------------------------------------------------

export function buttonsOf(node: FlowNode): ReplyButton[] {
  const raw = Array.isArray(node.data.buttons) ? node.data.buttons : [];
  return raw
    .map((entry, index) => {
      const record = (entry ?? {}) as { id?: unknown; title?: unknown };
      const title = typeof record.title === "string" ? record.title.trim() : "";
      return { id: typeof record.id === "string" && record.id ? record.id : `btn_${index}`, title };
    })
    .filter((b) => b.title)
    .slice(0, 3);
}

export function sectionsOf(node: FlowNode): ListSection[] {
  const raw = Array.isArray(node.data.sections) ? node.data.sections : [];
  return raw
    .map((entry) => {
      const record = (entry ?? {}) as { title?: unknown; rows?: unknown };
      const rows = Array.isArray(record.rows) ? record.rows : [];
      return {
        title: typeof record.title === "string" ? record.title : "",
        rows: rows
          .map((row, index) => {
            const r = (row ?? {}) as { id?: unknown; title?: unknown; description?: unknown };
            return {
              id: typeof r.id === "string" && r.id ? r.id : `row_${index}`,
              title: typeof r.title === "string" ? r.title.trim() : "",
              description: typeof r.description === "string" ? r.description : undefined,
            };
          })
          .filter((r) => r.title),
      };
    })
    .filter((s) => s.rows.length > 0);
}

/**
 * Every outlet a node offers, in the order the builder draws them. The
 * builder and the engine must agree on these ids or an edge drawn from the
 * second button would deliver the first button's path.
 */
export function handleIdsOf(node: FlowNode): { id: string; label: string }[] {
  switch (node.kind) {
    case "send_buttons":
      return buttonsOf(node).map((b) => ({ id: b.id, label: b.title }));
    case "send_list":
      return sectionsOf(node).flatMap((s) => s.rows.map((r) => ({ id: r.id, label: r.title })));
    case "condition":
      return [
        { id: "true", label: "Yes" },
        { id: "false", label: "No" },
      ];
    default:
      return [];
  }
}

/** Nodes that stop the walk and wait for the customer's next message. */
export function isWaitingNode(node: FlowNode): boolean {
  return (
    node.kind === "ask_question" ||
    node.kind === "ask_location" ||
    ((node.kind === "send_buttons" || node.kind === "send_list") && handleIdsOf(node).length > 0)
  );
}

export function delayMs(node: FlowNode): number {
  const value = Math.max(0, Number(node.data.value ?? 0));
  const unit = String(node.data.unit ?? "seconds");
  const multiplier = unit === "hours" ? 3_600_000 : unit === "minutes" ? 60_000 : 1_000;
  return value * multiplier;
}

/** Longer than this and the flow parks instead of blocking the webhook. */
export const INLINE_DELAY_LIMIT_MS = 10_000;

// --- helpers ---------------------------------------------------------------

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return max;
  return Math.min(max, Math.max(min, value));
}

function numeric(value: string): number {
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}
