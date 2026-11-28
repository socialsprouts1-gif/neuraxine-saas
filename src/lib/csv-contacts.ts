// Reading a contact list out of a spreadsheet.
//
// Pure, and tested, because every interesting case here is a way of
// silently losing somebody's customer list: a number that lost its
// country code, a column order nobody checked, a name with a comma in
// it, the same person twice under two spellings.
//
// Nothing here touches the database. It turns text into rows and
// problems, and the caller decides what to do with both.

export interface ParsedContact {
  waId: string;
  name: string | null;
  tags: string[];
}

export interface RowProblem {
  /** 1-based, counting the header, so it matches what the spreadsheet shows. */
  line: number;
  value: string;
  problem: string;
}

export interface ContactImport {
  contacts: ParsedContact[];
  problems: RowProblem[];
  /** Rows dropped because the same number appeared earlier in the file. */
  duplicates: number;
  /** Which column each field was read from, so the screen can show it. */
  columns: { phone: string; name: string | null; tags: string | null };
}

/**
 * A CSV reader that understands quotes.
 *
 * Split on commas and "Sharma, Priya" becomes two columns and every
 * field after it shifts — the names end up in the tags and the numbers
 * end up nowhere. Spreadsheets quote such fields, so the quotes have to
 * be honoured rather than stripped.
 *
 * Handles doubled quotes inside a quoted field ("" is one "), and both
 * line endings, because a file saved on Windows carries \r\n and a
 * stray \r at the end of every row turns the last column into rubbish.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // A trailing newline must not produce a final empty row.
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      endField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field !== "" || row.length > 0) endRow();
  return rows;
}

// What a column holding each thing tends to be called. Matched loosely,
// because the file comes from the customer's own spreadsheet and nobody
// is going to rename their columns to suit us.
const PHONE_HEADERS = [
  "whatsapp number",
  "whatsapp",
  "phone number",
  "phone",
  "mobile number",
  "mobile",
  "number",
  "contact number",
  "contact",
  "wa_id",
  "waid",
  "msisdn",
  "cell",
  "telephone",
  "tel",
];
const NAME_HEADERS = ["name", "full name", "customer name", "contact name", "first name", "client"];
const TAG_HEADERS = ["tags", "tag", "label", "labels", "group", "segment"];

function headerIndex(header: string[], candidates: string[]): number {
  const cleaned = header.map((cell) => cell.trim().toLowerCase());
  // Exact match first: a file with both "name" and "company name" should
  // use "name", which a contains-match would get wrong depending on order.
  for (const candidate of candidates) {
    const exact = cleaned.indexOf(candidate);
    if (exact !== -1) return exact;
  }
  for (const candidate of candidates) {
    const loose = cleaned.findIndex((cell) => cell.includes(candidate));
    if (loose !== -1) return loose;
  }
  return -1;
}

/** Does this row look like column titles rather than a person? */
function looksLikeHeader(row: string[]): boolean {
  return headerIndex(row, PHONE_HEADERS) !== -1 || headerIndex(row, NAME_HEADERS) !== -1;
}

/**
 * A number in the form WhatsApp expects: digits, country code included.
 *
 * The country code is the whole problem. An Indian list exported from a
 * phone holds ten-digit numbers, and ten digits with no country code is
 * not a WhatsApp address — messages to it go nowhere, with no error
 * worth reading. So a default code can be supplied, and it is applied
 * only to numbers short enough to be missing one.
 */
export function normaliseNumber(
  raw: string,
  defaultCountryCode?: string
): { ok: true; waId: string } | { ok: false; problem: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, problem: "No number in this row" };

  // 00 is the old international prefix; + is the modern one. Both mean
  // "a country code follows", so both are simply removed.
  let digits = trimmed.replace(/^\+/, "").replace(/^00/, "").replace(/[^\d]/g, "");

  if (!digits) return { ok: false, problem: `"${trimmed}" has no digits in it` };

  const code = (defaultCountryCode ?? "").replace(/[^\d]/g, "");
  // Ten digits or fewer is a local number. Longer than that and a
  // country code is already there — prefixing again would invent a
  // number belonging to somebody else entirely.
  if (code && digits.length <= 10) digits = code + digits;

  if (digits.length < 8) {
    return {
      ok: false,
      problem: `"${trimmed}" is too short to be a WhatsApp number${code ? "" : " — it may be missing its country code"}`,
    };
  }
  if (digits.length > 15) {
    return { ok: false, problem: `"${trimmed}" is too long to be a phone number` };
  }

  return { ok: true, waId: digits };
}

/**
 * Turns a pasted or uploaded spreadsheet into contacts and complaints.
 *
 * Never throws and never silently drops a row: anything not imported
 * comes back in `problems` with its line number, so the business can see
 * what did not make it rather than counting the difference afterwards.
 */
export function parseContactsCsv(
  text: string,
  options: { defaultCountryCode?: string; extraTags?: string[] } = {}
): ContactImport {
  const rows = parseCsv(text);
  const problems: RowProblem[] = [];
  const contacts: ParsedContact[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  if (rows.length === 0) {
    return {
      contacts,
      problems,
      duplicates,
      columns: { phone: "none", name: null, tags: null },
    };
  }

  const first = rows[0];
  const hasHeader = looksLikeHeader(first);

  // Without a header, the order is assumed — number, name, tags — which
  // is the order the sample file uses and the order this screen asks
  // for. Said on screen rather than left as a surprise.
  let phoneAt = hasHeader ? headerIndex(first, PHONE_HEADERS) : 0;
  const nameAt = hasHeader ? headerIndex(first, NAME_HEADERS) : 1;
  const tagsAt = hasHeader ? headerIndex(first, TAG_HEADERS) : 2;

  // A header that names no phone column at all: fall back to the first
  // column rather than refusing the file, because "Mobile No." and
  // friends are endless and a wrong guess shows up immediately in the
  // preview.
  if (phoneAt === -1) phoneAt = 0;

  const columns = {
    phone: hasHeader ? (first[phoneAt]?.trim() || "column 1") : "column 1",
    name: hasHeader && nameAt !== -1 ? (first[nameAt]?.trim() ?? null) : hasHeader ? null : "column 2",
    tags: hasHeader && tagsAt !== -1 ? (first[tagsAt]?.trim() ?? null) : hasHeader ? null : "column 3",
  };

  const extra = (options.extraTags ?? []).map((tag) => tag.trim()).filter(Boolean);

  for (let index = hasHeader ? 1 : 0; index < rows.length; index += 1) {
    const row = rows[index];
    const line = index + 1;
    const rawNumber = row[phoneAt] ?? "";

    // A wholly empty row in the middle of a file is a spreadsheet
    // artefact, not a mistake worth reporting.
    if (row.every((cell) => cell.trim() === "")) continue;

    const number = normaliseNumber(rawNumber, options.defaultCountryCode);
    if (!number.ok) {
      problems.push({ line, value: rawNumber.trim(), problem: number.problem });
      continue;
    }

    if (seen.has(number.waId)) {
      duplicates += 1;
      continue;
    }
    seen.add(number.waId);

    const name = nameAt !== -1 ? (row[nameAt] ?? "").trim() : "";
    const tagCell = tagsAt !== -1 ? (row[tagsAt] ?? "").trim() : "";
    const tags = [
      ...tagCell
        // Semicolons too: a spreadsheet column of tags separated by
        // commas has to be quoted, so people reach for a semicolon.
        .split(/[,;|]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      ...extra,
    ];

    contacts.push({
      waId: number.waId,
      name: name || null,
      // Deduplicated, so adding an import tag that a row already carries
      // does not store it twice.
      tags: [...new Set(tags)],
    });
  }

  return { contacts, problems, duplicates, columns };
}
