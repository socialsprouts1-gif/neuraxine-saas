import { test } from "node:test";
import assert from "node:assert/strict";
import { readFlowReply, formatAnswer } from "../src/lib/flow-reply.ts";

test("answers are parsed out of the nested JSON string", () => {
  const reply = readFlowReply({
    nfm_reply: {
      name: "flow",
      body: "Sent",
      response_json: JSON.stringify({
        flow_token: "tok_123",
        full_name: "Vivek",
        topics: ["a", "b"],
        agreed: true,
      }),
    },
  });

  assert.deepEqual(reply, {
    token: "tok_123",
    answers: { full_name: "Vivek", topics: ["a", "b"], agreed: true },
  });
});

test("the flow token is routing and never shows up as an answer", () => {
  const reply = readFlowReply({
    nfm_reply: { response_json: JSON.stringify({ flow_token: "t", a: "1" }) },
  });
  assert.ok(reply);
  assert.ok(!("flow_token" in reply.answers));
});

test("a submission with no token still yields its answers", () => {
  const reply = readFlowReply({ nfm_reply: { response_json: '{"a":"1"}' } });
  assert.deepEqual(reply, { token: null, answers: { a: "1" } });
});

test("anything that isn't a flow reply returns null", () => {
  assert.equal(readFlowReply(null), null);
  assert.equal(readFlowReply({ button_reply: { id: "1", title: "Yes" } }), null);
  // Already-parsed rather than a string: not the shape Meta sends.
  assert.equal(readFlowReply({ nfm_reply: { response_json: { a: 1 } } }), null);
  assert.equal(readFlowReply({ nfm_reply: { response_json: "not json" } }), null);
  assert.equal(readFlowReply({ nfm_reply: { response_json: "[1,2]" } }), null);
});

test("formatAnswer renders each answer type the way a person reads it", () => {
  assert.equal(formatAnswer(true), "Yes");
  assert.equal(formatAnswer(false), "No");
  assert.equal(formatAnswer(["a", "b"]), "a, b");
  assert.equal(formatAnswer([]), "—");
  assert.equal(formatAnswer("  Vivek "), "Vivek");
  assert.equal(formatAnswer(""), "—");
  assert.equal(formatAnswer(null), "—");
});
