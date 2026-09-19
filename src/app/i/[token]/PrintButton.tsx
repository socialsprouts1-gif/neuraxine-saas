"use client";

import { Printer } from "lucide-react";

/**
 * Print, or save as a PDF.
 *
 * There is no server-generated PDF, so the browser's print dialogue is the
 * PDF: every phone and desktop browser offers "Save as PDF" from it, which
 * is what a customer forwarding an invoice to their accountant needs.
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
    >
      <Printer className="w-4 h-4" />
      Print or save PDF
    </button>
  );
}
