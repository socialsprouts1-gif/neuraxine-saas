"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Check, Copy, KeyRound } from "lucide-react";

// What to paste into the other system.
//
// One address, one header, one example body. Written so a developer can
// read it in twenty seconds and somebody non-technical can forward it to
// theirs without having to understand it first.

export default function Hookup({ hasKey }: { hasKey: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);

  const base =
    typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";
  const endpoint = `${base}/api/v1/events`;

  const example = `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer nc_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event": "order.placed",
    "contact": { "phone": "+919000000000", "name": "Priya" },
    "data": { "order_id": "T6-1840", "total": 1840, "table": "T6" }
  }'`;

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Your browser would not let the app copy. Select the text instead.");
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/3 p-5">
      <h2 className="font-semibold mb-1">Point your system here</h2>
      <p className="text-xs text-white/50 mb-4 leading-relaxed max-w-2xl">
        Whoever built your till, booking panel or CRM needs these three things. Nothing else —
        no library to install, no account to create.
      </p>

      <div className="space-y-2.5">
        <Line
          label="Send to"
          value={endpoint}
          copied={copied === "url"}
          onCopy={() => copy("url", endpoint)}
        />
        <Line
          label="Header"
          value="Authorization: Bearer nc_live_…"
          copied={copied === "header"}
          onCopy={() => copy("header", "Authorization: Bearer ")}
          hint="Your key goes after Bearer."
        />
      </div>

      {!hasKey && (
        <div className="mt-3 rounded-xl border border-[#C0A063]/30 bg-[#C0A063]/8 p-3 flex gap-2.5">
          <KeyRound className="w-4 h-4 text-[#C0A063] shrink-0 mt-0.5" />
          <p className="text-xs text-white/70 leading-relaxed">
            You have no API key yet, so nothing can connect.{" "}
            <Link href="/api-endpoints" className="text-accent-ink hover:underline">
              Create one here
            </Link>{" "}
            — it is shown once, so copy it straight away.
          </p>
        </div>
      )}

      <details className="mt-4 group">
        <summary className="text-xs font-medium text-white/60 hover:text-white/85 cursor-pointer list-none flex items-center gap-1.5">
          <span className="group-open:rotate-90 transition-transform">›</span>
          Show a working example
        </summary>
        <div className="mt-3">
          <pre className="bg-[var(--surface-1)] border border-white/10 rounded-xl p-4 overflow-x-auto">
            <code className="text-[12px] text-white/75 whitespace-pre">{example}</code>
          </pre>
          <button
            type="button"
            onClick={() => copy("example", example)}
            className="btn-secondary text-xs py-2 px-3 mt-2.5"
          >
            {copied === "example" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            Copy the example
          </button>
          <p className="text-[11px] text-white/40 mt-3 leading-relaxed">
            The phone number can be called phone, mobile, wa_id, whatsapp or number, at the top
            level or inside contact — whichever your system already uses. Everything inside{" "}
            <code className="text-white/60">data</code> is yours to name, and any of it can be
            dropped into a message.
          </p>
        </div>
      </details>
    </div>
  );
}

function Line({
  label,
  value,
  hint,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  hint?: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] text-white/45 w-14 shrink-0">{label}</span>
        <code className="flex-1 min-w-0 text-xs text-white/85 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 break-all">
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 inline-flex items-center text-[11px] text-white/55 hover:text-white/90 border border-white/12 rounded-lg px-2 py-1.5 transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
      {hint && <p className="text-[11px] text-white/35 mt-1 ml-[4.25rem]">{hint}</p>}
    </div>
  );
}
