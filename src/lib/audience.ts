// Turning "who should get this" into a list of WhatsApp numbers. Pure, so
// the parsing can be tested — a campaign that quietly drops a third of its
// list is worse than one that refuses to start.

/**
 * WhatsApp wants digits only, country code included, no plus and no
 * separators. A number typed by a person arrives in every other shape.
 *
 * `defaultCountryCode` covers the common case of a sheet full of local
 * numbers: "9876543210" with a default of "91" becomes "919876543210". A
 * number that already carries a country code is left alone.
 */
export function normaliseWaId(raw: string, defaultCountryCode = ""): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip everything a human might type: +, spaces, dashes, brackets, dots.
  let digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;

  // 00 is the other way of writing +.
  if (digits.startsWith("00")) digits = digits.slice(2);

  const code = defaultCountryCode.replace(/[^\d]/g, "");
  if (code) {
    // A leading 0 is the domestic trunk prefix in India, the UK and most of
    // Europe, and is dropped when the country code goes on. Left in place it
    // makes a number that looks plausible and reaches nobody.
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length <= 10 && !digits.startsWith(code)) digits = code + digits;
  }

  // Shorter than 8 is not a reachable number anywhere; longer than 15 is
  // outside E.164 and will be rejected by Meta.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export interface ParsedAudience {
  waIds: string[];
  /** Lines that could not be read, with the reason, for showing back. */
  rejected: Array<{ value: string; reason: string }>;
  duplicates: number;
}

/**
 * Numbers pasted into a box or lifted from a spreadsheet column.
 *
 * Splits on newlines, commas, semicolons and tabs so a pasted column, a
 * comma-separated line and a CSV row all work without the person having to
 * think about which one they have.
 */
export function parseNumberList(input: string, defaultCountryCode = ""): ParsedAudience {
  const seen = new Set<string>();
  const waIds: string[] = [];
  const rejected: Array<{ value: string; reason: string }> = [];
  let duplicates = 0;

  for (const piece of input.split(/[\n,;\t]+/)) {
    const value = piece.trim();
    if (!value) continue;

    const waId = normaliseWaId(value, defaultCountryCode);
    if (!waId) {
      rejected.push({
        value,
        reason: /[a-zA-Z]/.test(value) ? "not a number" : "too short or too long",
      });
      continue;
    }
    if (seen.has(waId)) {
      duplicates += 1;
      continue;
    }
    seen.add(waId);
    waIds.push(waId);
  }

  return { waIds, rejected, duplicates };
}

export interface CsvColumn {
  index: number;
  header: string;
  /** A few values, so the person can recognise the column they want. */
  sample: string[];
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  columns: CsvColumn[];
  /** The column most likely to hold phone numbers, or null if unclear. */
  phoneColumn: number | null;
}

/**
 * A CSV a person exported from a spreadsheet.
 *
 * Handles quoted fields containing commas and escaped quotes, because the
 * one thing guaranteed to appear in a real export is a name like
 * "Sharma, Vivek" that a naive split would tear in half.
 */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // A trailing newline should not produce a row of one empty string.
    if (row.length > 1 || row[0].trim()) rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        // "" inside a quoted field is a literal quote.
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") endField();
    else if (char === "\n") endRow();
    else if (char !== "\r") field += char;
  }
  if (field || row.length > 0) endRow();

  if (rows.length === 0) {
    return { headers: [], rows: [], columns: [], phoneColumn: null };
  }

  const headers = rows[0].map((header) => header.trim());
  const body = rows.slice(1);

  const columns: CsvColumn[] = headers.map((header, index) => ({
    index,
    header: header || `Column ${index + 1}`,
    sample: body.slice(0, 3).map((entry) => entry[index] ?? ""),
  }));

  return { headers, rows: body, columns, phoneColumn: guessPhoneColumn(headers, body) };
}

/**
 * Which column holds the numbers.
 *
 * The header is the strong signal; where it says nothing useful, the column
 * whose values actually look like phone numbers wins. Guessing right saves
 * the most common mis-step, which is sending a campaign to a column of
 * order ids.
 */
export function guessPhoneColumn(headers: string[], rows: string[][]): number | null {
  const byName = headers.findIndex((header) =>
    /phone|mobile|whatsapp|number|contact|msisdn|wa_?id|cell/i.test(header)
  );
  if (byName !== -1) return byName;

  if (rows.length === 0) return null;

  let best: { index: number; hits: number } | null = null;
  for (let index = 0; index < headers.length; index += 1) {
    const hits = rows.filter((row) => normaliseWaId(row[index] ?? "") !== null).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { index, hits };
  }

  // Only claim a column when most of it parses; a stray numeric id would
  // otherwise be picked as a phone column with one match in a hundred.
  return best && best.hits >= rows.length * 0.6 ? best.index : null;
}

/** Pulls one column out of parsed rows and normalises it. */
export function columnToAudience(
  rows: string[][],
  columnIndex: number,
  defaultCountryCode = ""
): ParsedAudience {
  return parseNumberList(
    rows.map((row) => row[columnIndex] ?? "").join("\n"),
    defaultCountryCode
  );
}
