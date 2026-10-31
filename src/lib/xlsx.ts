// A minimal .xlsx reader.
//
// People export contact lists from Excel and Google Sheets far more often
// than they export CSV, and telling them to "save as CSV first" is the kind
// of instruction that loses half of them. An .xlsx is a zip of XML, and
// both halves are in the platform already — DecompressionStream for the
// deflate, and enough string handling for the very small subset of
// SpreadsheetML that a flat contact sheet uses.
//
// Deliberately not a spreadsheet library: no formulas, no dates, no styles,
// no multi-sheet selection. It reads the first worksheet as text, which is
// exactly what an audience import needs.

export class XlsxError extends Error {}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/**
 * Reads the first worksheet of an .xlsx file as rows of strings.
 *
 * Blank cells are preserved as empty strings so column positions still line
 * up — a sheet where half the rows are missing a middle value must not
 * shift its phone column.
 */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const entries = readCentralDirectory(view, bytes);

  // Sheet order in the zip is not guaranteed, and the workbook's own order
  // lives in workbook.xml. The lowest-numbered sheet file is the first
  // sheet in every writer that matters, and is what a person means by
  // "the sheet" in a one-sheet export.
  const sheetEntry = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
    .sort((a, b) => sheetNumber(a.name) - sheetNumber(b.name))[0];

  if (!sheetEntry) {
    throw new XlsxError("That file has no worksheets in it.");
  }

  const sharedEntry = entries.find((entry) => entry.name === "xl/sharedStrings.xml");
  const shared = sharedEntry
    ? parseSharedStrings(await readEntry(view, bytes, sharedEntry))
    : [];

  return parseSheet(await readEntry(view, bytes, sheetEntry), shared);
}

function sheetNumber(name: string): number {
  return Number(name.match(/sheet(\d+)\.xml$/)?.[1] ?? 0);
}

// --- zip ------------------------------------------------------------------

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

function readCentralDirectory(view: DataView, bytes: Uint8Array): ZipEntry[] {
  // The end-of-central-directory record sits at the tail, after a comment
  // of up to 64KB, so it is found by scanning backwards for its signature.
  let eocd = -1;
  const earliest = Math.max(0, bytes.length - 66_000);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) {
    throw new XlsxError("That doesn't look like an .xlsx file.");
  }

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break;

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    entries.push({
      name: textOf(bytes.subarray(offset + 46, offset + 46 + nameLength)),
      method,
      compressedSize,
      localHeaderOffset,
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function readEntry(
  view: DataView,
  bytes: Uint8Array,
  entry: ZipEntry
): Promise<string> {
  // The local header repeats the name and carries its own extra field,
  // which is usually a different length from the central one — so the data
  // offset has to be computed from the local header, not the central.
  const header = entry.localHeaderOffset;
  const nameLength = view.getUint16(header + 26, true);
  const extraLength = view.getUint16(header + 28, true);
  const start = header + 30 + nameLength + extraLength;
  const data = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return textOf(data);
  if (entry.method !== 8) {
    throw new XlsxError("That .xlsx uses a compression method we can't read.");
  }

  if (typeof DecompressionStream === "undefined") {
    throw new XlsxError("This browser can't unpack .xlsx files — save the sheet as CSV instead.");
  }

  const stream = new Blob([data as BlobPart]).stream().pipeThrough(
    new DecompressionStream("deflate-raw")
  );
  return textOf(new Uint8Array(await new Response(stream).arrayBuffer()));
}

function textOf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// --- SpreadsheetML --------------------------------------------------------

/**
 * The shared string table.
 *
 * Every repeated string in a workbook is stored once here and referenced by
 * index from the cells. A rich-text string is split across several <t>
 * runs, which are joined — otherwise a name someone bolded half of arrives
 * truncated.
 */
export function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const runs = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((run) => run[1]);
    strings.push(decodeEntities(runs.join("")));
  }
  return strings;
}

/** Rows of the worksheet, with shared-string references resolved. */
export function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];

  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];

    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const column = columnIndex(attributes.match(/r="([A-Z]+)\d+"/)?.[1] ?? "");
      const type = attributes.match(/t="([^"]+)"/)?.[1];

      let value = "";
      if (type === "s") {
        const index = Number(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "-1");
        value = shared[index] ?? "";
      } else if (type === "inlineStr") {
        const runs = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((run) => run[1]);
        value = decodeEntities(runs.join(""));
      } else {
        value = decodeEntities(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      }

      // Gaps are written by omitting the cell entirely, so pad up to the
      // column the reference names rather than pushing in document order.
      if (column >= 0) {
        while (cells.length < column) cells.push("");
        cells[column] = value;
      } else {
        cells.push(value);
      }
    }

    // A row of nothing but empty cells is a formatting artefact, not data.
    if (cells.some((cell) => cell.trim())) rows.push(cells);
  }

  return rows;
}

/** "A" → 0, "B" → 1, "AA" → 26. */
export function columnIndex(reference: string): number {
  if (!reference) return -1;
  let index = 0;
  for (const character of reference) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    // Ampersand last, so "&amp;lt;" stays the literal text "&lt;".
    .replace(/&amp;/g, "&");
}
