import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, deflateRawSync } from "node:zlib";
import { readXlsx, parseSheet, parseSharedStrings, columnIndex } from "../src/lib/xlsx.ts";

// A real .xlsx built here rather than committed as a binary fixture, so the
// test shows exactly which bytes the reader is being asked to understand.

interface File {
  name: string;
  content: string;
  /** Stored rather than deflated, to cover both zip methods. */
  stored?: boolean;
}

function buildXlsx(files: File[]): ArrayBuffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const raw = Buffer.from(file.content, "utf8");
    const data = file.stored ? raw : deflateRawSync(raw);
    const method = file.stored ? 0 : 8;
    const name = Buffer.from(file.name, "utf8");
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + data.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  const zip = Buffer.concat([...locals, directory, end]);
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

const SHARED = `<?xml version="1.0"?><sst count="4" uniqueCount="4">
  <si><t>Name</t></si>
  <si><t>Phone</t></si>
  <si><r><t>Sharma, </t></r><r><t>Vivek</t></r></si>
  <si><t>Priya &amp; Co</t></si>
</sst>`;

const SHEET = `<?xml version="1.0"?><worksheet><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
  <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>919876543210</v></c></row>
  <row r="3"><c r="A3" t="s"><v>3</v></c><c r="C3" t="inlineStr"><is><t>+91 98111 22333</t></is></c></row>
  <row r="4"><c r="A4"/></row>
</sheetData></worksheet>`;

test("readXlsx reads a deflated workbook", async () => {
  const rows = await readXlsx(
    buildXlsx([
      { name: "xl/sharedStrings.xml", content: SHARED },
      { name: "xl/worksheets/sheet1.xml", content: SHEET },
    ])
  );

  assert.deepEqual(rows[0], ["Name", "Phone"]);
  // A rich-text string split across runs must arrive whole.
  assert.deepEqual(rows[1], ["Sharma, Vivek", "919876543210"]);
});

test("readXlsx reads stored (uncompressed) entries", async () => {
  const rows = await readXlsx(
    buildXlsx([
      { name: "xl/sharedStrings.xml", content: SHARED, stored: true },
      { name: "xl/worksheets/sheet1.xml", content: SHEET, stored: true },
    ])
  );
  assert.equal(rows[0][0], "Name");
});

test("a skipped cell keeps its column position", async () => {
  const rows = await readXlsx(
    buildXlsx([
      { name: "xl/sharedStrings.xml", content: SHARED },
      { name: "xl/worksheets/sheet1.xml", content: SHEET },
    ])
  );

  // Row 3 has A and C but no B: the inline string belongs in column 2.
  assert.deepEqual(rows[2], ["Priya & Co", "", "+91 98111 22333"]);
});

test("a row of empty cells is dropped", async () => {
  const rows = await readXlsx(
    buildXlsx([
      { name: "xl/sharedStrings.xml", content: SHARED },
      { name: "xl/worksheets/sheet1.xml", content: SHEET },
    ])
  );
  assert.equal(rows.length, 3);
});

test("the lowest-numbered sheet wins when several are present", async () => {
  const rows = await readXlsx(
    buildXlsx([
      {
        name: "xl/worksheets/sheet10.xml",
        content: `<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>tenth</t></is></c></row></sheetData></worksheet>`,
      },
      {
        name: "xl/worksheets/sheet2.xml",
        content: `<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>second</t></is></c></row></sheetData></worksheet>`,
      },
    ])
  );
  assert.deepEqual(rows, [["second"]]);
});

test("a file that is not a zip is refused by name", async () => {
  const notAZip = new TextEncoder().encode("Name,Phone\nVivek,919876543210\n");
  await assert.rejects(
    () => readXlsx(notAZip.buffer as ArrayBuffer),
    /doesn't look like an .xlsx/
  );
});

test("a workbook with no worksheet says so", async () => {
  await assert.rejects(
    () => readXlsx(buildXlsx([{ name: "xl/sharedStrings.xml", content: SHARED }])),
    /no worksheets/
  );
});

test("entities decode without double-unescaping", () => {
  const shared = parseSharedStrings(`<sst><si><t>a &amp;lt; b</t></si><si><t>5 &lt; 6</t></si></sst>`);
  assert.deepEqual(shared, ["a &lt; b", "5 < 6"]);
});

test("numeric cells come through as their literal text", () => {
  const rows = parseSheet(
    `<sheetData><row><c r="A1"><v>0074</v></c></row></sheetData>`,
    []
  );
  assert.deepEqual(rows, [["0074"]]);
});

test("columnIndex handles two-letter references", () => {
  assert.equal(columnIndex("A"), 0);
  assert.equal(columnIndex("Z"), 25);
  assert.equal(columnIndex("AA"), 26);
  assert.equal(columnIndex("AB"), 27);
  assert.equal(columnIndex(""), -1);
});
