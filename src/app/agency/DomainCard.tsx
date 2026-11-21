"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Check, Copy, Globe, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { claimDomain, checkDomain, releaseDomain } from "@/app/(admin)/admin/brand-actions";
import type { DomainActionResult } from "@/app/(admin)/admin/brand-actions";
import { dnsInstructionFor, wouldReplaceTheirSite, type DnsInstruction } from "@/lib/custom-domain";

// The agency setting up their own address.
//
// Written for somebody who has logged into their domain provider twice in
// their life. That rules out most of the vocabulary: no nameservers, no
// propagation, no apex. One box, one record to copy, one button that says
// whether it has worked yet.
//
// The record is shown as the two or three values their provider's form
// actually asks for, with the note that the boxes are labelled
// differently everywhere — which is the thing that actually stops people.

export default function DomainCard({
  brandId,
  domain,
  live,
  selfServe,
}: {
  brandId: string;
  domain: string | null;
  /** Whether the domain already resolves here. */
  live: boolean;
  /** False when the platform has not connected its hosting account. */
  selfServe: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"save" | "check" | "remove" | null>(null);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<DomainActionResult | null>(null);

  const instruction: DnsInstruction | null =
    result?.instruction ?? (domain ? dnsInstructionFor(domain) : null);

  const state = result?.state ?? (domain ? (live ? "live" : "pending") : "none");
  const warnsAboutSite = typed.trim().length > 0 && wouldReplaceTheirSite(typed);

  const run = async (
    which: "save" | "check" | "remove",
    action: () => Promise<DomainActionResult>
  ) => {
    setBusy(which);
    const outcome = await action().catch(() => ({
      ok: false as const,
      error: "That did not go through. Try again in a moment.",
    }));
    setBusy(null);

    if (!outcome.ok) {
      toast.error(outcome.error ?? "That did not work.");
      return;
    }
    setResult(outcome);
    toast.success(outcome.message ?? "Saved.");
    router.refresh();
  };

  const field =
    "w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all";

  return (
    <div className="rounded-3xl border border-white/10 bg-white/3 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
          <Globe className="w-4.5 h-4.5 text-accent-ink" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">Your own web address</h2>
          <p className="text-xs text-white/50 mt-0.5 leading-relaxed max-w-xl">
            Put the whole product on a domain you own. Your customers see your address, your
            name and your logo, and never ours.
          </p>
        </div>
      </div>

      {/* --- already set up ------------------------------------------- */}
      {domain ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm text-white/85 break-all">{domain}</span>
            {state === "live" ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent-ink">
                <Check className="w-3 h-3" /> live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#C0A063]/15 text-[#C0A063]">
                <Loader2 className="w-3 h-3" /> waiting for your DNS
              </span>
            )}
          </div>

          {state === "live" ? (
            <p className="text-xs text-white/55 leading-relaxed">
              Done. Send your customers to{" "}
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noreferrer"
                className="text-accent-ink hover:underline"
              >
                https://{domain}
              </a>
              .
            </p>
          ) : (
            instruction && <Instruction instruction={instruction} />
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                const body = new FormData();
                body.set("id", brandId);
                return run("check", () => checkDomain(body));
              }}
              className="btn-secondary text-xs py-2 px-3 disabled:opacity-50"
            >
              {busy === "check" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Check again
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (!confirm(`Remove ${domain}? Your customers will not be able to reach it.`)) {
                  return;
                }
                const body = new FormData();
                body.set("id", brandId);
                return run("remove", () => releaseDomain(body) as Promise<DomainActionResult>);
              }}
              className="btn-quiet text-xs py-2 px-3 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        /* --- not set up yet ------------------------------------------ */
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">
              The address you want to use
            </label>
            <input
              className={field}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="app.youragency.com"
              spellCheck={false}
              autoCapitalize="none"
            />
            <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
              Just the address — no https:// and no slashes.
            </p>
          </div>

          {warnsAboutSite && (
            <div className="rounded-xl border border-[#C0A063]/30 bg-[#C0A063]/8 p-3 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[#C0A063] shrink-0 mt-0.5" />
              <p className="text-xs text-white/70 leading-relaxed">
                That is your whole domain, so your company website would be replaced by this
                product. Most people want something in front of it, like{" "}
                <span className="font-mono text-white/85">app.{typed.trim()}</span>.
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={busy !== null || typed.trim().length === 0}
            onClick={() => {
              const body = new FormData();
              body.set("id", brandId);
              body.set("domain", typed.trim());
              return run("save", () => claimDomain(body));
            }}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            {busy === "save" ? "Setting up…" : "Use this address"}
          </button>

          {!selfServe && (
            <p className="text-[11px] text-white/45 leading-relaxed">
              We will save it, and the platform team will finish connecting it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The one record they have to add, in the shape their provider's form takes. */
function Instruction({ instruction }: { instruction: DnsInstruction }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 p-4 space-y-3">
      <p className="text-xs text-white/70 leading-relaxed">
        Sign in wherever you bought the domain — GoDaddy, Namecheap, Hostinger, Cloudflare — find
        the <span className="text-white/90">DNS</span> page, and add one record:
      </p>

      <div className="grid gap-2">
        <Row label="Type" value={instruction.type} />
        <Row label="Name" value={instruction.name} />
        <Row label="Value" value={instruction.value} />
      </div>

      <p className="text-[11px] text-white/45 leading-relaxed">{instruction.note}</p>
      <p className="text-[11px] text-white/45 leading-relaxed">
        Leave everything else alone — your email and your website keep working. Then come back and
        press Check again. It can take a few minutes, occasionally a few hours.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11px] text-white/45 w-12 shrink-0">{label}</span>
      <code className="flex-1 min-w-0 text-xs text-white/85 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 break-all">
        {value}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            toast.error("Your browser would not let the app copy. Select the text instead.");
          }
        }}
        className="shrink-0 inline-flex items-center gap-1 text-[11px] text-white/55 hover:text-white/90 border border-white/12 rounded-lg px-2 py-1.5 transition-colors"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}
