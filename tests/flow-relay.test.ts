import test from "node:test";
import assert from "node:assert/strict";
import { handleIdsOf, interpolate, nextNode } from "../src/lib/flow-engine.ts";
import { NODE_DEFS, nodeDef } from "../src/types/flow.ts";
import type { FlowGraph, FlowNode } from "../src/types/flow.ts";

// Relaying a message to somebody who is not in the conversation.
//
// Until these two nodes existed every send in a flow went to whoever was
// already talking to the bot, so "a teacher reports a student and the
// parent gets told" could not be expressed at all. The outlets are the
// part worth pinning down: the whole safety of the thing is that a
// failed lookup leaves by a different door from a successful one.

const node = (kind: string, data: Record<string, unknown> = {}): FlowNode =>
  ({ id: "n1", kind, position: { x: 0, y: 0 }, data }) as FlowNode;

test("both relay nodes are in the palette and ready to run", () => {
  for (const kind of ["find_contact", "notify_number"] as const) {
    const def = nodeDef(kind);
    assert.ok(def, `${kind} is missing from the palette`);
    assert.equal(def.runtime, "ready", `${kind} is not marked as working`);
    assert.ok(def.description.trim().length > 0);
    assert.ok(def.fields.length > 0, `${kind} has no fields to configure`);
  }
});

test("a lookup that fails leaves by a different door from one that works", () => {
  const outlets = handleIdsOf(node("find_contact")).map((handle) => handle.id);
  assert.deepEqual(outlets, ["found", "not_found"]);
});

test("a send that fails leaves by a different door from one that works", () => {
  const outlets = handleIdsOf(node("notify_number")).map((handle) => handle.id);
  assert.deepEqual(outlets, ["sent", "failed"]);
});

test("declared outlets are read from the definition, not listed twice", () => {
  // handleIdsOf used to return nothing for any node outside its own
  // switch, which meant a node could return a handle at runtime that the
  // builder gave you nowhere to draw an edge from — a branch that silently
  // went nowhere.
  for (const def of NODE_DEFS) {
    if (!def.handles || def.handles.length === 0) continue;
    assert.deepEqual(
      handleIdsOf(node(def.kind)).map((handle) => handle.id),
      def.handles.map((handle) => handle.id),
      `${def.kind} does not offer the outlets it declares`
    );
  }
});

test("the graph follows the outlet the node returned", () => {
  const graph: FlowGraph = {
    nodes: [
      node("find_contact"),
      { id: "ok", kind: "send_buttons", position: { x: 0, y: 0 }, data: {} },
      { id: "no", kind: "send_text", position: { x: 0, y: 0 }, data: {} },
    ] as FlowNode[],
    edges: [
      { id: "e1", source: "n1", target: "ok", sourceHandle: "found" },
      { id: "e2", source: "n1", target: "no", sourceHandle: "not_found" },
    ],
  };

  assert.equal(nextNode(graph, "n1", "found")?.id, "ok");
  assert.equal(nextNode(graph, "n1", "not_found")?.id, "no");
});

test("the message to the parent names the student and the teacher", () => {
  // The two variables the relay exists to carry across: one from the
  // contact that was looked up, one from the person who wrote in.
  const filled = interpolate("{{found.name}}, {{sender.name}}", {
    "found.name": "Rahul Sharma",
    "sender.name": "Mrs Gupta",
  });
  assert.equal(filled, "Rahul Sharma, Mrs Gupta");
});

test("a variable nobody set becomes empty rather than literal braces", () => {
  // A parent receiving "{{found.parent_wa}}" is worse than one receiving
  // a short message, and Meta rejects a template parameter that is blank
  // — so the failure shows up as a refusal, not as nonsense delivered.
  assert.equal(interpolate("{{found.parent_wa}}", {}), "");
});

test("the relay fields name the variables the flow actually sets", () => {
  const find = nodeDef("find_contact");
  const notify = nodeDef("notify_number");
  assert.ok(find && notify);

  // The default prefix and the default placeholder have to agree, or the
  // ready-made flow reads a variable nothing ever writes.
  assert.equal(find.defaults?.prefix, "found");
  assert.ok(
    String(notify.fields.find((field) => field.name === "to")?.placeholder ?? "").includes("found."),
    "the send node should suggest a variable the lookup node produces"
  );
});

test("messaging someone else is always a template, and says why", () => {
  const def = nodeDef("notify_number");
  assert.ok(def);
  assert.ok(
    def.fields.some((field) => field.name === "templateName"),
    "there is no template to send"
  );
  assert.ok(
    !def.fields.some((field) => field.name === "body"),
    "a free-text body would be refused outside the 24-hour window"
  );
  assert.match(def.runtimeNote ?? "", /24-hour/);
});
