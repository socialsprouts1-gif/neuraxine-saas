import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProductSheet, readPrice } from "../src/lib/product-import.ts";

test("a Meta catalogue export is read as it comes", () => {
  const { products, rejected } = parseProductSheet(
    ["id", "title", "description", "availability", "price", "image_link"],
    [
      ["189e4bdn2o", "orange tshirt", "all sizes", "in stock", "999.00 INR", "https://x/1.jpg"],
      ["i1ow56cr4i", "printed tshirt", "", "in stock", "1299.00 INR", "https://x/2.jpg"],
    ]
  );

  assert.equal(rejected.length, 0);
  assert.deepEqual(products[0], {
    retailerId: "189e4bdn2o",
    name: "orange tshirt",
    priceCents: 99900,
    imageUrl: "https://x/1.jpg",
  });
  assert.equal(products[1].priceCents, 129900);
});

test("columns are found by name, not position", () => {
  // A business that opened the file in Excel and moved things about should
  // still be able to use it.
  const { products } = parseProductSheet(
    ["Price", "Title", "Content ID"],
    [["₹1,299.00", "kurta", "abc123"]]
  );
  assert.deepEqual(products, [
    { retailerId: "abc123", name: "kurta", priceCents: 129900, imageUrl: null },
  ]);
});

test("every spelling of the id column is accepted", () => {
  for (const header of ["id", "content_id", "Content ID", "retailer_id", "sku"]) {
    const { products } = parseProductSheet([header, "title"], [["x1", "thing"]]);
    assert.equal(products.length, 1, header);
  }
});

test("a sheet with no id column is refused, and says why", () => {
  // Importing it would produce products that look fine and can never be
  // sent, which is the failure this whole import exists to prevent.
  const { products, rejected } = parseProductSheet(["title", "price"], [["kurta", "999"]]);
  assert.equal(products.length, 0);
  assert.match(rejected[0].reason, /content ID/i);
});

test("a row with no id is skipped and counted, not imported", () => {
  const { products, rejected } = parseProductSheet(
    ["id", "title"],
    [["", "nameless"], ["ok1", "fine"]]
  );
  assert.equal(products.length, 1);
  assert.equal(rejected.length, 1);
  // Header is row 1, so the first data row is row 2.
  assert.equal(rejected[0].row, 2);
});

test("a repeated content ID keeps the first row", () => {
  const { products, duplicates } = parseProductSheet(
    ["id", "title"],
    [["a", "first"], ["a", "second"]]
  );
  assert.equal(products.length, 1);
  assert.equal(products[0].name, "first");
  assert.equal(duplicates, 1);
});

test("a product with no name falls back to its id", () => {
  // It still has to be recognisable in a list.
  const { products } = parseProductSheet(["id", "title"], [["sku99", "  "]]);
  assert.equal(products[0].name, "sku99");
});

test("prices arrive in every shape an exporter writes them", () => {
  assert.equal(readPrice("999.00 INR"), 99900);
  assert.equal(readPrice("₹1,299"), 129900);
  assert.equal(readPrice("1299"), 129900);
  assert.equal(readPrice("0"), 0);
});

test("an unreadable price is null rather than zero", () => {
  // Zero is a price. "Missing" is not, and importing it as free is how a
  // catalogue ends up selling something for nothing.
  assert.equal(readPrice("Missing"), null);
  assert.equal(readPrice(""), null);
  assert.equal(readPrice(undefined), null);
  assert.equal(readPrice("-5"), null);
});

test("a sheet with no price column imports anyway", () => {
  const { products } = parseProductSheet(["id", "title"], [["a", "thing"]]);
  assert.equal(products[0].priceCents, null);
});
