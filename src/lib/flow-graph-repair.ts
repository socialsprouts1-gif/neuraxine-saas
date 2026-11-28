// Turning a model's answer into a graph the canvas and the engine can both
// accept. Pure, so the repairs can be tested without a provider call — this
// is the layer that decides whether a generated flow is safe to open.

// Relative rather than the "@/" alias: the tests run under bare node with
// --experimental-strip-types, which erases type-only imports but resolves
// value imports for real, and it has no tsconfig path mapping.
import { nodeDef } from "../types/flow.ts";
import type { FlowEdge, FlowGraph, FlowNode, FlowNodeKind } from "../types/flow.ts";

/** Beyond this the model is padding, and a flow that big is easier in pieces. */
export const MAX_NODES = 30;

export type RepairResult =
  | { ok: true; name: string; graph: FlowGraph; warnings: string[] }
  | { ok: false; error: string };

/**
 * Pulls the JSON object out of a reply. Models still fence their JSON or
 * introduce it with a sentence however firmly you ask them not to, and a
 * whole generation is too expensive to throw away over a stray backtick.
 */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const candidates: string[] = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) candidates.push(fenced[1]);
  candidates.push(text);

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate.trim());
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

/**
 * Everything the model got wrong that we can fix, fixed; everything we
 * cannot, reported. The canvas must never open on a graph the engine would
 * choke on, so this is deliberately strict about ids and edges and forgiving
 * about everything else.
 */
export function validateGraph(raw: Record<string, unknown>, brief: string): RepairResult {
  const warnings: string[] = [];

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  if (rawNodes.length === 0) {
    return { ok: false, error: "The model returned a flow with no steps in it. Try again." };
  }

  const nodes: FlowNode[] = [];
  const seen = new Set<string>();

  for (const entry of rawNodes.slice(0, MAX_NODES)) {
    if (!entry || typeof entry !== "object") continue;
    const node = entry as Record<string, unknown>;

    const kind = String(node.kind ?? "") as FlowNodeKind;
    const def = nodeDef(kind);
    if (!def) {
      warnings.push(`Dropped a "${node.kind}" step — there is no such node type.`);
      continue;
    }

    const id = String(node.id ?? "").trim() || `n${nodes.length + 1}`;
    if (seen.has(id)) {
      warnings.push(`Dropped a duplicate step id "${id}".`);
      continue;
    }
    seen.add(id);

    // Defaults first, so a key the model omitted is present and valid
    // rather than undefined at runtime.
    const data =
      node.data && typeof node.data === "object" && !Array.isArray(node.data)
        ? { ...def.defaults, ...(node.data as Record<string, unknown>) }
        : { ...def.defaults };

    nodes.push({ id, kind, position: { x: 0, y: 0 }, data });
  }

  if (rawNodes.length > MAX_NODES) {
    warnings.push(`Kept the first ${MAX_NODES} steps — the rest were trimmed.`);
  }

  // A flow with no trigger never matches an inbound message, so give it one
  // rather than handing back something that cannot run.
  const triggers = nodes.filter((node) => node.kind === "on_message");
  if (triggers.length === 0) {
    nodes.unshift({
      id: "trigger",
      kind: "on_message",
      position: { x: 0, y: 0 },
      data: { ...(nodeDef("on_message")?.defaults ?? {}) },
    });
    warnings.push("Added the missing On Message trigger — set its keywords before going live.");
  } else if (triggers.length > 1) {
    for (const extra of triggers.slice(1)) {
      nodes.splice(nodes.indexOf(extra), 1);
    }
    warnings.push("Removed extra triggers — a flow starts from exactly one.");
  }

  const ids = new Set(nodes.map((node) => node.id));
  const edges: FlowEdge[] = [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];

  for (const entry of rawEdges) {
    if (!entry || typeof entry !== "object") continue;
    const edge = entry as Record<string, unknown>;
    const source = String(edge.source ?? "");
    const target = String(edge.target ?? "");
    // An edge to a step that was dropped would draw into empty canvas.
    if (!ids.has(source) || !ids.has(target) || source === target) continue;

    const handleRaw = edge.sourceHandle;
    const sourceHandle =
      handleRaw === null || handleRaw === undefined ? null : String(handleRaw) || null;

    edges.push({ id: `e${edges.length + 1}`, source, target, sourceHandle });
  }

  if (edges.length === 0 && nodes.length > 1) {
    return {
      ok: false,
      error: "The model returned steps but never connected them. Try again, or describe the conversation as a sequence.",
    };
  }

  const name = String(raw.name ?? "").trim().slice(0, 60) || fallbackName(brief);

  return { ok: true, name, graph: { nodes: layout(nodes, edges), edges }, warnings };
}

/**
 * Positions by distance from the trigger, so the flow reads left to right
 * the way it runs. Anything unreachable is parked in a row underneath rather
 * than stacked at the origin where it would be invisible.
 */
export function layout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const COLUMN = 360;
  const ROW = 200;

  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  const depth = new Map<string, number>();
  const start = nodes.find((node) => node.kind === "on_message") ?? nodes[0];
  const queue: Array<{ id: string; level: number }> = [{ id: start.id, level: 0 }];

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    // A longer path to the same node wins, so a join sits to the right of
    // every branch that feeds it instead of on top of one.
    if (depth.has(id) && depth.get(id)! >= level) continue;
    depth.set(id, level);
    for (const next of outgoing.get(id) ?? []) {
      queue.push({ id: next, level: level + 1 });
    }
  }

  const perColumn = new Map<number, number>();
  const orphanColumn = Math.max(0, ...[...depth.values()]) + 1;

  return nodes.map((node) => {
    const column = depth.get(node.id) ?? orphanColumn;
    const row = perColumn.get(column) ?? 0;
    perColumn.set(column, row + 1);
    return { ...node, position: { x: 80 + column * COLUMN, y: 80 + row * ROW } };
  });
}

function fallbackName(brief: string): string {
  const words = brief.split(/\s+/).slice(0, 5).join(" ");
  return words.length > 40 ? `${words.slice(0, 40)}…` : words || "New bot";
}
