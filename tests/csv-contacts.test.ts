import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseCsv, normaliseNumber, parseContactsCsv } from "../src/lib/csv-contacts.ts";

// --- the reader -----------------------------------------------------------

test("parseCsv keeps a quoted comma inside one field", () => {
  // Split naively and "Sharma, Priya" becomes two columns, shifting every
  // field after it — names land in tags and numbers land nowhere.
  const rows = parseCsv('919876543210,"Sharma, Priya",vip\n');
  assert.deepEqual(rows, [["919876543210", "Sharma, Priya", "vip"]]);
});

test("parseCsv handles a doubled quote inside a quoted field", () => {
  const rows = parseCsv('919876543210,"The ""Big"" Shop",vip');
  assert.equal(rows[0][1], 'The "Big" Shop');
});

test("parseCsv strips Windows line endings", () => {
  // A stray \r at the end of each row turns the last column into rubbish,
  // so tags arrive as "vip\r" and never match anything.
  const rows = parseCsv("number,name,tags\r\n919876543210,Priya,vip\r\n");
  assert.equal(rows[1][2], "vip");
});

test("parseCsv ignores a trailing newline", () => {
  const rows = parseCsv("919876543210,Priya\n");
  assert.equal(rows.length, 1);
});

// --- the number -----------------------------------------------------------

test("normaliseNumber strips the punctuation people type", () => {
  const result = normaliseNumber("+91 98765-43210");
  assert.equal(result.ok && result.waId, "919876543210");
});

test("normaliseNumber turns the 00 prefix into nothing", () => {
  const result = normaliseNumber("0091 9876543210");
  assert.equal(result.ok && result.waId, "919876543210");
});

test("normaliseNumber adds the default country code to a local number", () => {
  // A list exported from an Indian phone holds ten digits, which is not a
  // WhatsApp address — messages to it go nowhere with no useful error.
  const result = normaliseNumber("9876543210", "91");
  assert.equal(result.ok && result.waId, "919876543210");
});

test("normaliseNumber leaves a number that already has a country code alone", () => {
  // Prefixing twice invents a number belonging to somebody else, and the
  // message goes to a stranger rather than failing.
  const result = normaliseNumber("919876543210", "91");
  assert.equal(result.ok && result.waId, "919876543210");
});

test("normaliseNumber rejects something too short to be a number", () => {
  const result = normaliseNumber("12345", "");
  assert.equal(result.ok, false);
});

test("normaliseNumber rejects a cell with no digits", () => {
  const result = normaliseNumber("not a number");
  assert.equal(result.ok, false);
});

// --- the whole file -------------------------------------------------------

test("parseContactsCsv reads a file with named columns in any order", () => {
  const csv = "Name,Tags,Mobile Number\nPriya,vip,919876543210\nRahul,lead,919812345678";
  const result = parseContactsCsv(csv);
  assert.equal(result.contacts.length, 2);
  assert.equal(result.contacts[0].waId, "919876543210");
  assert.equal(result.contacts[0].name, "Priya");
  assert.deepEqual(result.contacts[0].tags, ["vip"]);
});

test("parseContactsCsv assumes number, name, tags when there is no header", () => {
  const result = parseContactsCsv("919876543210,Priya,vip");
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0].name, "Priya");
});

test("parseContactsCsv prefers an exact header match over a loose one", () => {
  // "Company Name" must not win over "Name".
  const csv = "Company Name,Name,Phone\nAcme,Priya,919876543210";
  const result = parseContactsCsv(csv);
  assert.equal(result.contacts[0].name, "Priya");
});

test("parseContactsCsv reports a bad row instead of dropping it quietly", () => {
  const csv = "Phone,Name\n919876543210,Priya\nnonsense,Rahul";
  const result = parseContactsCsv(csv);
  assert.equal(result.contacts.length, 1);
  assert.equal(result.problems.length, 1);
  // The line number must match what the spreadsheet shows, header included.
  assert.equal(result.problems[0].line, 3);
});

test("parseContactsCsv drops a number repeated within the file", () => {
  const csv = "Phone,Name\n919876543210,Priya\n+91 98765 43210,Priya S";
  const result = parseContactsCsv(csv);
  assert.equal(result.contacts.length, 1);
  assert.equal(result.duplicates, 1);
});

test("parseContactsCsv skips blank rows without complaining", () => {
  const csv = "Phone,Name\n919876543210,Priya\n,\n919812345678,Rahul";
  const result = parseContactsCsv(csv);
  assert.equal(result.contacts.length, 2);
  assert.equal(result.problems.length, 0);
});

test("parseContactsCsv splits tags on semicolons too", () => {
  const result = parseContactsCsv("Phone,Name,Tags\n919876543210,Priya,vip;mumbai");
  assert.deepEqual(result.contacts[0].tags, ["vip", "mumbai"]);
});

test("parseContactsCsv adds the import tag without repeating one already there", () => {
  const result = parseContactsCsv("Phone,Name,Tags\n919876543210,Priya,vip", {
    extraTags: ["vip", "imported"],
  });
  assert.deepEqual(result.contacts[0].tags, ["vip", "imported"]);
});

test("parseContactsCsv says which columns it used", () => {
  const result = parseContactsCsv("Mobile Number,Name\n919876543210,Priya");
  assert.equal(result.columns.phone, "Mobile Number");
  assert.equal(result.columns.name, "Name");
});

test("parseContactsCsv survives an empty file", () => {
  const result = parseContactsCsv("");
  assert.equal(result.contacts.length, 0);
  assert.equal(result.problems.length, 0);
});
