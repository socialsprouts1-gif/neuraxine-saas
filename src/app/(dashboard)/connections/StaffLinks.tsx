"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Check, Copy, Loader2, Plus, Smartphone, Trash2 } from "lucide-react";
import { createStaffLink, revokeStaffLink } from "../event-actions";

// The no-code way to fire an event.
//
// This is first on the page, above the API box, because it is the answer
// for almost everybody who reads it. The API is for the business that
// already has software; this is for the one that has a WhatsApp number
// and a notebook.

export interface StaffLinkRow {
  id: string;
  name: string;
  token: string;
  uses: number;
  last_used_at: string | null;
}

export default function StaffLinks({
  links,
  liveRules,
}: {
  links: StaffLinkRow[];
  /** How many rules are switched on — a link with none shows no buttons. */
  liveRules: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const base = typeof window !== "undefined" ? window.location.origin : "";

  const create = async () => {
    setBusy("new");
    const body = new FormData();
    body.set("name", name || "Staff link");
    const result = await createStaffLink(body).catch(() => ({
      ok: false as const,
      error: "That did not work.",
    }));
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error ?? "That did not work.");
      return;
    }
    toast.success(result.message ?? "Created.");
    setNaming(false);
    setName("");
    router.refresh();
  };

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Your browser would not let the app copy. Select the text instead.");
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/3 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
          <Smartphone className="w-4.5 h-4.5 text-accent-ink" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">Start here — a link for your staff</h2>
          <p className="text-xs text-white/50 mt-0.5 leading-relaxed max-w-2xl">
            No app, no login, no developer. Your waiter opens this on their phone, types the
            customer&rsquo;s number, taps what happened — and the message goes. This is how you
            use any of it today.
          </p>
        </div>
      </div>

      {liveRules === 0 && (
        <div className="rounded-xl border border-[#C0A063]/30 bg-[#C0A063]/8 p-3 mb-4">
          <p className="text-xs text-white/70 leading-relaxed">
            Switch on at least one rule below first — the buttons on the staff page are your
            switched-on rules.
          </p>
        </div>
      )}

      {links.length > 0 && (
        <div className="space-y-2 mb-3">
          {links.map((link) => {
            const url = `${base}/t/${link.token}`;
            return (
              <div
                key={link.id}
                className="flex flex-wrap items-center gap-2.5 px-3.5 py-3 rounded-xl border border-white/10 bg-white/4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{link.name}</p>
                  <code className="block text-[11px] text-white/45 font-mono break-all mt-0.5">
                    {url}
                  </code>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    {link.uses === 0 ? "Not used yet" : `Used ${link.uses} times`}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => copy(link.id, url)}
                    className="btn-secondary text-xs py-2 px-3"
                  >
                    {copied === link.id ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied === link.id ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === link.id}
                    onClick={async () => {
                      if (!confirm(`Stop “${link.name}” working? Anybody holding it loses access.`)) {
                        return;
                      }
                      setBusy(link.id);
                      const body = new FormData();
                      body.set("id", link.id);
                      const result = await revokeStaffLink(body).catch(() => ({
                        ok: false as const,
                        error: "That did not work.",
                      }));
                      setBusy(null);
                      if (!result.ok) {
                        toast.error(result.error ?? "That did not work.");
                        return;
                      }
                      toast.success(result.message ?? "Revoked.");
                      router.refresh();
                    }}
                    className="btn-quiet text-xs py-2 px-2.5 disabled:opacity-50"
                  >
                    {busy === link.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {naming ? (
        <div className="flex flex-wrap gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Front counter"
            className="flex-1 min-w-[12rem] bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
          />
          <button
            type="button"
            onClick={create}
            disabled={busy === "new"}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {busy === "new" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create it
          </button>
          <button type="button" onClick={() => setNaming(false)} className="btn-secondary text-sm">
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setNaming(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          {links.length === 0 ? "Create a staff link" : "Another link"}
        </button>
      )}

      <p className="text-[11px] text-white/40 mt-3 leading-relaxed">
        Give a different link to each phone or counter, so you can take one back without
        disturbing the rest. A link can only fire the rules you have switched on — it cannot read
        a contact, a chat, or anything else.
      </p>
    </div>
  );
}
