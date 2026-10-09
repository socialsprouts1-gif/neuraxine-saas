import { test } from "node:test";
import assert from "node:assert/strict";
import {
  layout,
  parseJsonObject,
  validateGraph,
} from "../src/lib/flow-graph-repair.ts";
import type { FlowEdge, FlowNode } from "../src/types/flow.ts";

const BRIEF = "a support bot";

function ok(result: ReturnType<typeof validateGraph>) {
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  return result as Extract<typeof result, { ok: true }>;
}

test("parseJsonObject reads a bare object", () => {
  assert.deepEqual(parseJsonObject('{"name":"Bot"}'), { name: "Bot" });
});

test("parseJsonObject digs the object out of a fence or a preamble", () => {
  // Models fence their JSON however firmly you ask them not to, and a whole
  // generation is too expensive to throw away over a stray backtick.
  assert.deepEqual(parseJsonObject('```json\n{"name":"Bot"}\n```'), { name: "Bot" });
  assert.deepEqual(parseJsonObject('Here you go:\n{"name":"Bot"}\nHope that helps!'), {
    name: "Bot",
  });
});

test("parseJsonObject refuses anything that is not an object", () => {
  assert.equal(parseJsonObject("[1, 2, 3]"), null);
  assert.equal(parseJsonObject("no json at all"), null);
});

test("a well-formed graph survives intact", () => {
  const result = ok(
    validateGraph(
      {
        name: "Support bot",
        nodes: [
          { id: "n1", kind: "on_message", data: { keywords: ["hi"] } },
          { id: "n2", kind: "send_text", data: { body: "Hello" } },
        ],
        edges: [{ source: "n1", target: "n2", sourceHandle: null }],
      },
      BRIEF
    )
  );

  assert.equal(result.name, "Support bot");
  assert.equal(result.graph.nodes.length, 2);
  assert.equal(result.graph.edges.length, 1);
  assert.deepEqual(result.warnings, []);
});

test("unknown node kinds are dropped, not passed to the canvas", () => {
  const result = ok(
    validateGraph(
      {
        nodes: [
          { id: "n1", kind: "on_message", data: {} },
          { id: "n2", kind: "send_carrier_pigeon", data: {} },
          { id: "n3", kind: "send_text", data: { body: "Hi" } },
        ],
        edges: [
          { source: "n1", target: "n2" },
          { source: "n1", target: "n3" },
        ],
      },
      BRIEF
    )
  );

  assert.deepEqual(
    result.graph.nodes.map((node) => node.id),
    ["n1", "n3"]
  );
  // The edge into the dropped node would have drawn into empty canvas.
  assert.deepEqual(
    result.graph.edges.map((edge) => edge.target),
    ["n3"]
  );
  assert.match(result.warnings[0], /send_carrier_pigeon/);
});

test("missing data keys are filled from the node's defaults", () => {
  const result = ok(
    validateGraph(
      {
        nodes: [
          { id: "n1", kind: "on_message", data: {} },
          { id: "n2", kind: "ask_question", data: { body: "Your name?" } },
        ],
        edges: [{ source: "n1", target: "n2" }],
      },
      BRIEF
    )
  );

  const ask = result.graph.nodes.find((node) => node.id === "n2")!;
  assert.equal(ask.data.body, "Your name?");
  // Not undefined at runtime just because the model left it out.
  assert.equal(ask.data.variable, "answer");
  assert.equal(ask.data.expect, "any");
});

test("a graph with no trigger gets one rather than being unrunnable", () => {
  const result = ok(
    validateGraph(
      {
        nodes: [
          { id: "n1", kind: "send_text", data: { body: "Hi" } },
          { id: "n2", kind: "stop_bot", data: {} },
        ],
        edges: [{ source: "n1", target: "n2" }],
      },
      BRIEF
    )
  );

  assert.equal(result.graph.nodes[0].kind, "on_message");
  assert.match(result.warnings.join(" "), /missing On Message/);
});

test("extra triggers are removed — a flow starts from exactly one", () => {
  const result = ok(
    validateGraph(
      {
        nodes: [
          { id: "n1", kind: "on_message", data: { keywords: ["hi"] } },
          { id: "n2", kind: "on_message", data: { keywords: ["hello"] } },
          { id: "n3", kind: "send_text", data: { body: "Hi" } },
        ],
        edges: [{ source: "n1", target: "n3" }],
      },
      BRIEF
    )
  );

  assert.equal(result.graph.nodes.filter((node) => node.kind === "on_message").length, 1);
});

test("duplicate ids are dropped so an edge can never be ambiguous", () => {
  const result = ok(
    validateGraph(
      {
        nodes: [
          { id: "n1", kind: "on_message", data: {} },
          { id: "n2", kind: "send_text", data: { body: "First" } },
          { id: "n2", kind: "send_text", data: { body: "Second" } },
        ],
        edges: [{ source: "n1", target: "n2" }],
      },
      BRIEF
    )
  );

  assert.equal(result.graph.nodes.filter((node) => node.id === "n2").length, 1);
  assert.equal(result.graph.nodes.find((node) => node.id === "n2")!.data.body, "First");
});

test("self-loops and edges to nowhere are discarded", () => {
  const result = ok(
    validateGraph(
      {
        nodes: [
          { id: "n1", kind: "on_message", data: {} },
          { id: "n2", kind: "send_text", data: { body: "Hi" } },
        ],
        edges: [
          { source: "n1", target: "n2" },
          { source: "n2", target: "n2" },
          { source: "n2", target: "ghost" },
        ],
      },
      BRIEF
    )
  );

  assert.equal(result.graph.edges.length, 1);
});

test("button outlets keep their handle, so the right branch runs", () => {
  const result = ok(
    validateGraph(
      {
        nodes: [
          { id: "n1", kind: "on_message", data: {} },
          {
            id: "n2",
            kind: "send_buttons",
            data: { body: "Pick", buttons: [{ id: "b1", title: "Track" }, { id: "b2", title: "Return" }] },
          },
          { id: "n3", kind: "send_text", data: { body: "Tracking" } },
          { id: "n4", kind: "handoff", data: { body: "One moment" } },
        ],
        edges: [
          { source: "n1", target: "n2" },
          { source: "n2", target: "n3", sourceHandle: "b1" },
          { source: "n2", target: "n4", sourceHandle: "b2" },
        ],
      },
      BRIEF
    )
  );

  const handles = result.graph.edges.map((edge) => edge.sourceHandle);
  assert.deepEqual(handles, [null, "b1", "b2"]);
});

test("steps with no connections at all are refused", () => {
  const result = validateGraph(
    {
      nodes: [
        { id: "n1", kind: "on_message", data: {} },
        { id: "n2", kind: "send_text", data: { body: "Hi" } },
      ],
      edges: [],
    },
    BRIEF
  );
  assert.equal(result.ok, false);
});

test("an empty node list is refused", () => {
  assert.equal(validateGraph({ nodes: [] }, BRIEF).ok, false);
});

test("the name falls back to the brief when the model omits one", () => {
  const result = ok(
    validateGraph(
      {
        nodes: [
          { id: "n1", kind: "on_message", data: {} },
          { id: "n2", kind: "send_text", data: { body: "Hi" } },
        ],
        edges: [{ source: "n1", target: "n2" }],
      },
      "clinic booking bot for a dental practice in Pune"
    )
  );
  assert.equal(result.name, "clinic booking bot for a");
});

// --- layout ---------------------------------------------------------------

function node(id: string, kind: string): FlowNode {
  return { id, kind: kind as FlowNode["kind"], position: { x: 0, y: 0 }, data: {} };
}
function edge(source: string, target: string): FlowEdge {
  return { id: `${source}-${target}`, source, target, sourceHandle: null };
}

test("layout reads left to right, in the order the flow runs", () => {
  const placed = layout(
    [node("n1", "on_message"), node("n2", "send_text"), node("n3", "send_text")],
    [edge("n1", "n2"), edge("n2", "n3")]
  );

  const x = Object.fromEntries(placed.map((n) => [n.id, n.position.x]));
  assert.ok(x.n1 < x.n2 && x.n2 < x.n3);
});

test("branches stack vertically instead of on top of each other", () => {
  const placed = layout(
    [node("n1", "on_message"), node("n2", "send_text"), node("n3", "send_text")],
    [edge("n1", "n2"), edge("n1", "n3")]
  );

  const two = placed.find((n) => n.id === "n2")!;
  const three = placed.find((n) => n.id === "n3")!;
  assert.equal(two.position.x, three.position.x);
  assert.notEqual(two.position.y, three.position.y);
});

test("a join sits to the right of every branch that feeds it", () => {
  // Both paths reach n4; the longer one decides where it goes, or it would
  // land on top of a node it is supposed to follow.
  const placed = layout(
    [
      node("n1", "on_message"),
      node("n2", "send_text"),
      node("n3", "send_text"),
      node("n4", "stop_bot"),
    ],
    [edge("n1", "n2"), edge("n2", "n3"), edge("n3", "n4"), edge("n1", "n4")]
  );

  const x = Object.fromEntries(placed.map((n) => [n.id, n.position.x]));
  assert.ok(x.n4 > x.n3);
});

test("unreachable nodes are parked past the end, never stacked at the origin", () => {
  const placed = layout(
    [node("n1", "on_message"), node("n2", "send_text"), node("orphan", "send_text")],
    [edge("n1", "n2")]
  );

  const orphan = placed.find((n) => n.id === "orphan")!;
  const last = placed.find((n) => n.id === "n2")!;
  assert.ok(orphan.position.x > last.position.x);
});
