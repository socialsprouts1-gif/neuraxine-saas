"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Loader2, Trash2 } from "lucide-react";
import { deleteTransaction, setTransactionStatus } from "../leads-actions";
import { Badge, statusTone } from "@/components/ui/primitives";
import { TRANSACTION_STATUSES, type TransactionStatus } from "@/types/portal";

export interface TransactionItem {
  id: string;
  amountCents: number;
  currency: string;
  direction: "in" | "out";
  status: TransactionStatus;
  method: string | null;
  reference: string | null;
  note: string | null;
  occurredAt: string;
  contactName: string | null;
}

export default function TransactionRow({ transaction }: { transaction: TransactionItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<{ ok: boolean }>) =>
    startTransition(async () => {
      await work();
      router.refresh();
    });

  const incoming = transaction.direction === "in";

  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
      <td className="px-5 py-3.5 whitespace-nowrap text-white/60 text-xs">
        {new Date(transaction.occurredAt).toLocaleDateString([], {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </td>

      <td className="px-5 py-3.5">
        <div className="truncate max-w-[12rem]">{transaction.contactName ?? "—"}</div>
        {(transaction.method || transaction.reference) && (
          <div className="text-[11px] text-white/35 truncate max-w-[12rem]">
            {[transaction.method, transaction.reference].filter(Boolean).join(" · ")}
          </div>
        )}
      </td>

      <td className="px-5 py-3.5">
        <span
          className={`inline-flex items-center gap-1.5 font-medium tabular-nums ${
            incoming ? "text-accent-ink" : "text-[#FB923C]"
          }`}
        >
          {incoming ? (
            <ArrowDownLeft className="w-3.5 h-3.5" />
          ) : (
            <ArrowUpRight className="w-3.5 h-3.5" />
          )}
          {(transaction.amountCents / 100).toLocaleString("en-IN", {
            maximumFractionDigits: 2,
          })}
        </span>
        <span className="text-[11px] text-white/30 ml-1">{transaction.currency}</span>
      </td>

      <td className="px-5 py-3.5">
        {/* The status is the thing people come here to change, so it is a
            control rather than a badge you have to open a row to edit. */}
        <select
          value={transaction.status}
          disabled={pending}
          onChange={(event) =>
            run(() =>
              setTransactionStatus(transaction.id, event.target.value as TransactionStatus)
            )
          }
          aria-label="Transaction status"
          className="bg-transparent border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-accent/40 disabled:opacity-50 capitalize"
        >
          {TRANSACTION_STATUSES.map((status) => (
            <option key={status} value={status} className="bg-[var(--surface-3)] capitalize">
              {status}
            </option>
          ))}
        </select>
      </td>

      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-1.5">
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />}
          <Badge tone={statusTone(transaction.status)}>{transaction.status}</Badge>
          <button
            type="button"
            onClick={() => {
              const data = new FormData();
              data.set("id", transaction.id);
              run(() => deleteTransaction(data));
            }}
            disabled={pending}
            aria-label="Delete transaction"
            className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
