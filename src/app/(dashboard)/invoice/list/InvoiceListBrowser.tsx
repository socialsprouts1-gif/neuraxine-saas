"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FilePlus, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { isOverdue } from "@/lib/invoices";
import InvoiceBuilder from "./InvoiceBuilder";
import InvoiceRow, { type InvoiceListRow } from "./InvoiceRow";

const FILTERS = ["All", "Outstanding", "Overdue", "Paid", "Drafts"] as const;
type Filter = (typeof FILTERS)[number];

export default function InvoiceListBrowser({
  invoices,
  migrated,
  migrationError,
  today,
  contacts,
  defaultTax,
  sellerGstin,
  roundToRupee,
  currency,
}: {
  invoices: InvoiceListRow[];
  migrated: boolean;
  migrationError: string | null;
  today: string;
  contacts: Array<{ id: string; label: string; gstin: string | null }>;
  defaultTax: number;
  sellerGstin: string | null;
  roundToRupee: boolean;
  currency: string;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const owing = invoice.totalCents - invoice.amountPaidCents;
      const live = invoice.status !== "cancelled" && invoice.status !== "draft";

      if (filter === "Outstanding" && !(live && owing > 0)) return false;
      if (filter === "Overdue" && !(live && owing > 0 && isOverdue(invoice.dueOn, today))) {
        return false;
      }
      if (filter === "Paid" && invoice.status !== "paid") return false;
      if (filter === "Drafts" && invoice.status !== "draft") return false;

      if (!needle) return true;
      return (
        (invoice.number ?? "").toLowerCase().includes(needle) ||
        (invoice.customerName ?? "").toLowerCase().includes(needle) ||
        invoice.lines.some((line) => line.description.toLowerCase().includes(needle))
      );
    });
  }, [invoices, filter, query, today]);

  if (!migrated) {
    return (
      <div className="glass-card p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#FACC15] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-white/65 leading-relaxed">
          <div className="font-semibold text-white mb-1">The invoice tables are missing</div>
          <p className="mb-2">
            Run <code className="text-accent-ink">supabase/updates/2026-09.sql</code> in the
            Supabase SQL editor, then reload. Platform staff can see exactly what is missing under
            Admin → Database.
          </p>
          {migrationError && <p className="text-xs text-white/40 break-words">{migrationError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {creating ? (
        <InvoiceBuilder
          contacts={contacts}
          defaultTax={defaultTax}
          sellerGstin={sellerGstin}
          roundToRupee={roundToRupee}
          currency={currency}
          onDone={() => setCreating(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-2"
        >
          <FilePlus className="w-4 h-4" />
          New invoice
        </button>
      )}

      {invoices.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 p-1 rounded-xl bg-white/4 border border-white/8 overflow-x-auto">
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`whitespace-nowrap py-2 px-3.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === option
                    ? "bg-accent text-[#050508]"
                    : "text-white/55 hover:text-white/85"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by number, customer or what was billed…"
              aria-label="Search invoices"
              className="w-full bg-white/5 border border-white/12 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/35 focus:outline-none focus:border-accent/50 transition-all"
            />
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={invoices.length === 0 ? "No invoices yet" : `Nothing under ${filter}`}
          description={
            invoices.length === 0
              ? "Raise one above. It saves as a draft, takes its number when you issue it, and goes out on WhatsApp with a link the customer can pay from."
              : "Try another filter, or clear the search."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {visible.map((invoice) => (
            <InvoiceRow
              key={invoice.id}
              invoice={invoice}
              today={today}
              contacts={contacts}
              defaultTax={defaultTax}
              sellerGstin={sellerGstin}
              roundToRupee={roundToRupee}
            />
          ))}
        </div>
      )}
    </div>
  );
}
