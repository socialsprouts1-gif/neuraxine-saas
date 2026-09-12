import { test } from "node:test";
import assert from "node:assert/strict";
import {
  columnToAudience,
  guessPhoneColumn,
  normaliseWaId,
  parseCsv,
  parseNumberList,
} from "../src/lib/audience.ts";

test("normaliseWaId strips everything a person might type", () => {
  assert.equal(normaliseWaId("+91 98765 43210"), "919876543210");
  assert.equal(normaliseWaId("(91) 98765-43210"), "919876543210");
  assert.equal(normaliseWaId("0091 98765 43210"), "919876543210");
  assert.equal(normaliseWaId("91.98765.43210"), "919876543210");
});

test("a local number picks up the default country code", () => {
  assert.equal(normaliseWaId("9876543210", "91"), "919876543210");
  assert.equal(normaliseWaId("09876543210", "91"), "919876543210");
});

test("a number that already has a country code is left alone", () => {
  // Prefixing again would send to a number nobody owns.
  assert.equal(normaliseWaId("919876543210", "91"), "919876543210");
  assert.equal(normaliseWaId("+1 555 148 6335", "91"), "15551486335");
});

test("unreachable lengths are refused rather than sent", () => {
  assert.equal(normaliseWaId("12345"), null);
  assert.equal(normaliseWaId("1234567890123456789"), null);
  assert.equal(normaliseWaId("not a number"), null);
  assert.equal(normaliseWaId(""), null);
  assert.equal(normaliseWaId("   "), null);
});

test("parseNumberList splits on every separator a paste arrives with", () => {
  const result = parseNumberList("919876543210, 919999999999\n918888888888;917777777777");
  assert.deepEqual(result.waIds, [
    "919876543210",
    "919999999999",
    "918888888888",
    "917777777777",
  ]);
});

test("duplicates are counted, not sent twice", () => {
  const result = parseNumberList("919876543210\n+91 98765 43210\n919876543210");
  assert.deepEqual(result.waIds, ["919876543210"]);
  assert.equal(result.duplicates, 2);
});

test("bad rows are reported with a reason rather than dropped", () => {
  const result = parseNumberList("919876543210\nnot-a-phone\n123");
  assert.deepEqual(result.waIds, ["919876543210"]);
  assert.equal(result.rejected.length, 2);
  assert.equal(result.rejected[0].reason, "not a number");
  assert.match(result.rejected[1].reason, /short/);
});

// --- CSV ------------------------------------------------------------------

test("parseCsv reads headers and rows", () => {
  const csv = "name,phone\nVivek,919876543210\nAsha,919999999999\n";
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed.headers, ["name", "phone"]);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0], ["Vivek", "919876543210"]);
});

test("a quoted field containing a comma survives", () => {
  // The one thing guaranteed to be in a real export.
  const parsed = parseCsv('name,phone\n"Sharma, Vivek",919876543210\n');
  assert.deepEqual(parsed.rows[0], ["Sharma, Vivek", "919876543210"]);
});

test("an escaped quote inside a quoted field survives", () => {
  const parsed = parseCsv('name,phone\n"He said ""hi""",919876543210\n');
  assert.equal(parsed.rows[0][0], 'He said "hi"');
});

test("carriage returns and a trailing newline do not create junk rows", () => {
  const parsed = parseCsv("name,phone\r\nVivek,919876543210\r\n");
  assert.equal(parsed.rows.length, 1);
});

test("the phone column is found by header name", () => {
  assert.equal(guessPhoneColumn(["name", "Mobile Number", "city"], []), 1);
  assert.equal(guessPhoneColumn(["name", "whatsapp"], []), 1);
  assert.equal(guessPhoneColumn(["a", "msisdn"], []), 1);
});

test("with no useful header, the column that parses as numbers wins", () => {
  const rows = [
    ["Vivek", "919876543210"],
    ["Asha", "919999999999"],
    ["Ravi", "918888888888"],
  ];
  assert.equal(guessPhoneColumn(["col1", "col2"], rows), 1);
});

test("a column of ids is not mistaken for phone numbers", () => {
  // One stray long number in a hundred must not claim the column.
  const rows = [["1", "a"], ["2", "b"], ["3", "c"], ["919876543210", "d"]];
  assert.equal(guessPhoneColumn(["id", "label"], rows), null);
});

test("columnToAudience lifts one column and normalises it", () => {
  const parsed = parseCsv("name,phone\nVivek,9876543210\nAsha,9999999999\n");
  const audience = columnToAudience(parsed.rows, 1, "91");
  assert.deepEqual(audience.waIds, ["919876543210", "919999999999"]);
});
