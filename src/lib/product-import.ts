// Reading a Meta catalogue export into products.
//
// The API route to the same data — GET /{catalog-id}/products — needs
// catalog_management, and on a coexistence account Meta refuses it however
// the permissions are set. But Commerce Manager will hand the business a
// CSV of the very same catalogue, and a file nobody needs permission to
// read is a better dependency than an endpoint somebody might never be
// granted.
//
// What matters in that file is `id`: Meta's content ID, the thing a
// product message addresses an item by. A product without one can be
// priced and listed and never sent, so a row that has no id is not worth
// importing and says so rather than arriving silently broken.

export interface ImportedProduct {
  retailerId: string;
  name: string;
  /** Null when the sheet gave no readable price. */
  priceCents: number | null;
  imageUrl: string | null;
}

export interface ProductImport {
  products: ImportedProduct[];
  /** Rows that could not be used, with the reason, in sheet order. */
  rejected: Array<{ row: number; reason: string }>;
  /** Content IDs that appeared more than once; the first row won. */
  duplicates: number;
}

/**
 * Finds a column by any of the names Meta and its exporters use.
 *
 * Header matching rather than position: the export's column order is not
 * promised anywhere, and a business that has opened the file in Excel and
 * moved things about should still be able to use it.
 */
function findColumn(headers: string[], names: readonly string[]): number {
  const cleaned = headers.map((header) => header.trim().toLowerCase().replace(/[\s_-]+/g, "_"));
  for (const name of names) {
    const index = cleaned.indexOf(name);
    if (index !== -1) return index;
  }
  return -1;
}

const ID_NAMES = ["id", "content_id", "retailer_id", "sku", "item_id", "product_id"] as const;
const NAME_NAMES = ["title", "name", "product_name", "item_name"] as const;
const PRICE_NAMES = ["price", "sale_price", "amount"] as const;
const IMAGE_NAMES = ["image_link", "image_url", "image", "picture"] as const;

/**
 * Reads a price the way a catalogue export writes one.
 *
 * Meta writes "999.00 INR", exporters write "₹999", "1,299.00" or a bare
 * number, and all four mean the same thing. Rounded to paise at the end
 * because the column stores an integer and 999.005 is not a price.
 */
export function readPrice(raw: string | undefined): number | null {
  const text = (raw ?? "").trim();
  // Checked before the currency symbols are stripped, because stripping
  // turns "-5" into "5" and a negative price would import as a real one.
  if (/-\s*\d/.test(text)) return null;

  const digits = text.replace(/[^\d.,]/g, "").replace(/,/g, "");
  if (!digits) return null;

  const value = Number(digits);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function parseProductSheet(headers: string[], rows: string[][]): ProductImport {
  const idColumn = findColumn(headers, ID_NAMES);
  const nameColumn = findColumn(headers, NAME_NAMES);
  const priceColumn = findColumn(headers, PRICE_NAMES);
  const imageColumn = findColumn(headers, IMAGE_NAMES);

  if (idColumn === -1) {
    return {
      products: [],
      rejected: [
        {
          row: 0,
          reason:
            "No content ID column. Meta's export calls it “id”; without it a product cannot be sent, only listed.",
        },
      ],
      duplicates: 0,
    };
  }

  const products: ImportedProduct[] = [];
  const rejected: ProductImport["rejected"] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  rows.forEach((row, index) => {
    // +2: the header is row 1, and a person counting rows in a spreadsheet
    // counts from 1. A reason pointing at the wrong line is worse than no
    // reason at all.
    const number = index + 2;

    const retailerId = (row[idColumn] ?? "").trim();
    if (!retailerId) {
      rejected.push({ row: number, reason: "No content ID" });
      return;
    }

    if (seen.has(retailerId)) {
      duplicates += 1;
      return;
    }
    seen.add(retailerId);

    // A nameless product is still importable — the id is what sends it —
    // but it needs something to be recognised by in a product list.
    const name = (nameColumn === -1 ? "" : (row[nameColumn] ?? "")).trim() || retailerId;

    products.push({
      retailerId,
      name,
      priceCents: priceColumn === -1 ? null : readPrice(row[priceColumn]),
      imageUrl: (imageColumn === -1 ? "" : (row[imageColumn] ?? "")).trim() || null,
    });
  });

  return { products, rejected, duplicates };
}
