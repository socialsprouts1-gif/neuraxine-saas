import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TAX_CONTEXT,
  amountInWords,
  dueDate,
  formatInvoiceAmount,
  formatInvoiceNumber,
  gstinState,
  invoiceTotals,
  isInterState,
  isOverdue,
  isValidGstin,
  lineTotals,
  nextRunDate,
  type InvoiceLine,
} from "../src/lib/invoices.ts";

function line(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    description: "Consulting",
    quantity: 1,
    unitPriceCents: 100000,
    taxPercent: 18,
    ...overrides,
  };
}

describe("lineTotals", () => {
  it("multiplies quantity into the gross", () => {
    const totals = lineTotals(line({ quantity: 3, unitPriceCents: 50000 }));
    assert.equal(totals.grossCents, 150000);
  });

  it("discounts before tax, because tax is on what is actually paid", () => {
    const totals = lineTotals(
      line({ unitPriceCents: 100000, discountPercent: 10, taxPercent: 18 })
    );
    assert.equal(totals.discountCents, 10000);
    assert.equal(totals.taxableCents, 90000);
    // 18% of ₹900, not of ₹1,000.
    assert.equal(totals.taxCents, 16200);
    assert.equal(totals.totalCents, 106200);
  });

  it("charges nothing on a zero-rated line", () => {
    const totals = lineTotals(line({ taxPercent: 0 }));
    assert.equal(totals.taxCents, 0);
    assert.equal(totals.totalCents, 100000);
  });

  it("treats a negative quantity or price as zero rather than a credit", () => {
    assert.equal(lineTotals(line({ quantity: -2 })).grossCents, 0);
    assert.equal(lineTotals(line({ unitPriceCents: -100 })).grossCents, 0);
  });

  it("caps a discount at the whole line", () => {
    const totals = lineTotals(line({ discountPercent: 150 }));
    assert.equal(totals.taxableCents, 0);
    assert.equal(totals.totalCents, 0);
  });
});

describe("invoiceTotals — the GST split", () => {
  it("splits into CGST and SGST inside one state", () => {
    const totals = invoiceTotals([line({ unitPriceCents: 100000, taxPercent: 18 })], {
      interState: false,
      roundToRupee: false,
    });

    assert.equal(totals.cgstCents, 9000);
    assert.equal(totals.sgstCents, 9000);
    assert.equal(totals.igstCents, 0);
    assert.equal(totals.taxCents, 18000);
  });

  it("charges IGST across a state line, for the same total", () => {
    const inside = invoiceTotals([line()], { interState: false, roundToRupee: false });
    const across = invoiceTotals([line()], { interState: true, roundToRupee: false });

    assert.equal(across.igstCents, 18000);
    assert.equal(across.cgstCents, 0);
    assert.equal(across.sgstCents, 0);
    // Identical total either way — which is why the wrong split goes unnoticed.
    assert.equal(across.totalCents, inside.totalCents);
  });

  it("never loses a paisa splitting an odd tax amount in half", () => {
    // ₹1.05 at 5% is 5.25 paise, which rounds to 5 — an odd number.
    const totals = invoiceTotals([line({ unitPriceCents: 105, taxPercent: 5 })], {
      interState: false,
      roundToRupee: false,
    });

    assert.equal(totals.taxCents, 5);
    assert.equal(totals.cgstCents + totals.sgstCents, totals.taxCents);
    // The remainder goes to SGST rather than vanishing.
    assert.equal(totals.cgstCents, 2);
    assert.equal(totals.sgstCents, 3);
  });

  it("bands a mixed-rate invoice by rate, ascending", () => {
    const totals = invoiceTotals(
      [
        line({ unitPriceCents: 100000, taxPercent: 18 }),
        line({ unitPriceCents: 200000, taxPercent: 5 }),
        line({ unitPriceCents: 50000, taxPercent: 18 }),
      ],
      { interState: false, roundToRupee: false }
    );

    assert.deepEqual(
      totals.bands.map((band) => band.percent),
      [5, 18]
    );
    // The two 18% lines are one band.
    assert.equal(totals.bands[1].taxableCents, 150000);
    assert.equal(totals.bands[1].totalTaxCents, 27000);
    assert.equal(totals.bands[0].totalTaxCents, 10000);
  });

  it("has bands whose tax adds up to the invoice tax", () => {
    const totals = invoiceTotals([
      line({ unitPriceCents: 12345, taxPercent: 5 }),
      line({ unitPriceCents: 67891, taxPercent: 12 }),
      line({ unitPriceCents: 999, taxPercent: 28 }),
    ]);

    const banded = totals.bands.reduce((sum, band) => sum + band.totalTaxCents, 0);
    assert.equal(banded, totals.taxCents);
  });

  it("rounds the total to the nearest rupee and records the difference", () => {
    // ₹100.40 at 18% is ₹118.472 — 11847 paise before rounding.
    const totals = invoiceTotals([line({ unitPriceCents: 10040, taxPercent: 18 })], {
      interState: false,
      roundToRupee: true,
    });

    assert.equal(totals.totalCents % 100, 0);
    assert.equal(totals.taxableCents + totals.taxCents + totals.roundOffCents, totals.totalCents);
  });

  it("rounds down as readily as up", () => {
    const totals = invoiceTotals([line({ unitPriceCents: 10020, taxPercent: 18 })]);
    assert.equal(totals.roundOffCents < 0 || totals.roundOffCents === 0, true);
    assert.equal(totals.totalCents % 100, 0);
  });

  it("leaves the total alone when rounding is off", () => {
    const totals = invoiceTotals([line({ unitPriceCents: 10040, taxPercent: 18 })], {
      interState: false,
      roundToRupee: false,
    });
    assert.equal(totals.roundOffCents, 0);
    assert.equal(totals.totalCents, totals.taxableCents + totals.taxCents);
  });

  it("is all zeroes for an empty invoice", () => {
    const totals = invoiceTotals([], DEFAULT_TAX_CONTEXT);
    assert.equal(totals.totalCents, 0);
    assert.equal(totals.taxCents, 0);
    assert.deepEqual(totals.bands, []);
  });

  it("carries the discount through to the invoice total", () => {
    const totals = invoiceTotals(
      [line({ unitPriceCents: 100000, discountPercent: 25, taxPercent: 0 })],
      { interState: false, roundToRupee: false }
    );
    assert.equal(totals.subtotalCents, 100000);
    assert.equal(totals.discountCents, 25000);
    assert.equal(totals.totalCents, 75000);
  });
});

describe("formatInvoiceNumber", () => {
  it("pads the sequence so numbers sort as text", () => {
    assert.equal(formatInvoiceNumber("INV", 42), "INV-0042");
    assert.equal(formatInvoiceNumber("INV", 7, 6), "INV-000007");
  });

  it("does not double the separator the prefix already ends with", () => {
    assert.equal(formatInvoiceNumber("INV-", 42), "INV-0042");
    assert.equal(formatInvoiceNumber("2026/27/", 42), "2026/27/0042");
  });

  it("strips characters that have no business in a document number", () => {
    assert.equal(formatInvoiceNumber("IN V#1", 1), "INV1-0001");
  });

  it("still produces a number with no prefix at all", () => {
    assert.equal(formatInvoiceNumber("", 5), "0005");
  });
});

describe("dueDate", () => {
  it("adds the payment term in days", () => {
    assert.equal(dueDate("2026-09-09", 30), "2026-10-09");
    assert.equal(dueDate("2026-09-09", 0), "2026-09-09");
  });

  it("crosses a month and a year end", () => {
    assert.equal(dueDate("2026-12-20", 15), "2027-01-04");
  });

  it("knows February's length", () => {
    assert.equal(dueDate("2028-02-20", 15), "2028-03-06");
  });

  it("hands back what it was given when that is not a date", () => {
    assert.equal(dueDate("soon", 30), "soon");
  });
});

describe("nextRunDate", () => {
  it("steps a week and a fortnight", () => {
    assert.equal(nextRunDate("2026-09-09", "weekly"), "2026-09-16");
    assert.equal(nextRunDate("2026-09-09", "fortnightly"), "2026-09-23");
  });

  it("steps a month, a quarter and a year", () => {
    assert.equal(nextRunDate("2026-09-09", "monthly"), "2026-10-09");
    assert.equal(nextRunDate("2026-09-09", "quarterly"), "2026-12-09");
    assert.equal(nextRunDate("2026-09-09", "yearly"), "2027-09-09");
  });

  it("clamps to the end of a short month rather than overflowing", () => {
    // The 31st plus a month is the 28th, not the 3rd of March.
    assert.equal(nextRunDate("2026-01-31", "monthly"), "2026-02-28");
    assert.equal(nextRunDate("2026-08-31", "monthly"), "2026-09-30");
  });

  it("finds the 29th in a leap year", () => {
    assert.equal(nextRunDate("2028-01-31", "monthly"), "2028-02-29");
  });

  it("rolls the year over", () => {
    assert.equal(nextRunDate("2026-12-15", "monthly"), "2027-01-15");
    assert.equal(nextRunDate("2026-11-15", "quarterly"), "2027-02-15");
  });
});

describe("isOverdue", () => {
  it("is true only once the day has passed", () => {
    assert.equal(isOverdue("2026-09-08", "2026-09-09"), true);
    assert.equal(isOverdue("2026-09-09", "2026-09-09"), false);
    assert.equal(isOverdue("2026-09-10", "2026-09-09"), false);
  });

  it("is false for an invoice with no due date", () => {
    assert.equal(isOverdue(null, "2026-09-09"), false);
  });
});

describe("amountInWords", () => {
  it("uses the Indian grouping, not the western one", () => {
    // 1,50,000 is one lakh fifty thousand.
    assert.equal(amountInWords(15_000_000), "Rupees One Lakh Fifty Thousand Only");
    assert.equal(amountInWords(1_000_000_000), "Rupees One Crore Only");
  });

  it("writes the paise out when there are any", () => {
    assert.equal(
      amountInWords(155050),
      "Rupees One Thousand Five Hundred Fifty and Fifty Paise Only"
    );
  });

  it("handles the teens and the tens", () => {
    assert.equal(amountInWords(1_700), "Rupees Seventeen Only");
    assert.equal(amountInWords(9_000), "Rupees Ninety Only");
    assert.equal(amountInWords(9_900), "Rupees Ninety Nine Only");
  });

  it("says zero rather than nothing", () => {
    assert.equal(amountInWords(0), "Rupees Zero Only");
  });

  it("marks a negative amount rather than hiding the sign", () => {
    assert.match(amountInWords(-10000), /^Minus Rupees One Hundred/);
  });

  it("scales past a crore", () => {
    assert.equal(amountInWords(123_45_67_89_000 / 1), amountInWords(123_45_67_89_000));
    assert.match(amountInWords(25_00_00_00_000), /Crore/);
  });
});

describe("formatInvoiceAmount", () => {
  it("always shows the paise, unlike the display formatter", () => {
    assert.equal(formatInvoiceAmount(129900), "₹1,299.00");
    assert.equal(formatInvoiceAmount(129950), "₹1,299.50");
  });

  it("groups the Indian way", () => {
    assert.equal(formatInvoiceAmount(15_000_000), "₹1,50,000.00");
  });
});

describe("GSTIN", () => {
  // A real-format GSTIN with a correct checksum, generated for this test.
  const valid = "27AAPFU0939F1ZV";

  it("accepts a well-formed number with the right checksum", () => {
    assert.equal(isValidGstin(valid), true);
    assert.equal(isValidGstin(valid.toLowerCase()), true);
  });

  it("rejects a wrong checksum, which is what a typo produces", () => {
    const wrong = `${valid.slice(0, 14)}A`;
    assert.equal(isValidGstin(wrong), false);
  });

  it("rejects the wrong length or shape", () => {
    assert.equal(isValidGstin("27AAPFU0939F1Z"), false);
    assert.equal(isValidGstin("ABCDEFGHIJKLMNO"), false);
    assert.equal(isValidGstin(""), false);
  });

  it("rejects a state code that does not exist", () => {
    assert.equal(isValidGstin(`99${valid.slice(2)}`), false);
  });

  it("reads the state code off the front", () => {
    assert.equal(gstinState(valid), "27");
    assert.equal(gstinState("nonsense"), null);
  });
});

describe("isInterState", () => {
  it("compares the two state codes", () => {
    assert.equal(isInterState("27AAPFU0939F1ZV", "29AAPFU0939F1ZV"), true);
    assert.equal(isInterState("27AAPFU0939F1ZV", "27BBPFU0939F1ZV"), false);
  });

  it("assumes local when the customer has no GSTIN", () => {
    // The common case. Switching every invoice to IGST because a customer
    // has no number on file would be wrong far more often than right.
    assert.equal(isInterState("27AAPFU0939F1ZV", null), false);
    assert.equal(isInterState("27AAPFU0939F1ZV", ""), false);
  });

  it("assumes local when the seller has no GSTIN either", () => {
    assert.equal(isInterState("", "29AAPFU0939F1ZV"), false);
  });
});
