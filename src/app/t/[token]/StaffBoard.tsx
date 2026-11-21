"use client";

import { useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { fireFromStaffLink } from "./actions";

// Built for one thumb, in a hurry, in bad light.
//
// Everything about this screen is that: the number field is the only
// thing to fill in, the buttons are the height of a thumb, and the
// confirmation is large enough to read at arm's length while carrying
// plates. There is no navigation, because there is nowhere else to go.

export default function StaffBoard({
  token,
  business,
  linkName,
  buttons,
}: {
  token: string;
  business: string;
  linkName: string;
  buttons: { event: string; name: string }[];
}) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const fire = async (event: string, label: string) => {
    setProblem(null);
    setDone(null);

    if (!phone.trim()) {
      setProblem("Put the customer's number in first.");
      return;
    }

    setBusy(event);
    const body = new FormData();
    body.set("token", token);
    body.set("event", event);
    body.set("phone", phone);
    body.set("name", name);

    const result = await fireFromStaffLink(body).catch(() => ({
      ok: false as const,
      error: "That did not go through. Check the signal and try again.",
    }));
    setBusy(null);

    if (!result.ok) {
      setProblem(result.error ?? "That did not work.");
      return;
    }

    setDone(result.message ?? `${label} — done.`);
    // Cleared so the next customer cannot be messaged by accident with
    // the last one's number still in the box.
    setPhone("");
    setName("");
  };

  return (
    <div className="min-h-dvh bg-[var(--app-bg)] px-4 py-6">
      <div className="max-w-md mx-auto">
        <header className="mb-5">
          <h1 className="text-lg font-semibold">{business}</h1>
          <p className="text-xs text-white/45 mt-0.5">{linkName}</p>
        </header>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">
              Customer&rsquo;s WhatsApp number
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="90000 00000"
              className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3.5 text-base text-white placeholder-white/25 focus:outline-none focus:border-accent/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">
              Their name (optional)
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              placeholder="Priya"
              className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>

        {done && (
          <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3.5 mb-4 flex items-start gap-2.5">
            <Check className="w-5 h-5 text-accent-ink shrink-0" />
            <p className="text-sm text-white/85 leading-snug">{done}</p>
          </div>
        )}

        {problem && (
          <div className="rounded-2xl border border-[#C47A74]/35 bg-[#C47A74]/10 px-4 py-3.5 mb-4">
            <p className="text-sm text-white/85 leading-snug">{problem}</p>
          </div>
        )}

        {buttons.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/4 p-5 text-center">
            <p className="text-sm text-white/70 leading-relaxed">
              Nothing is switched on yet.
            </p>
            <p className="text-xs text-white/40 mt-2 leading-relaxed">
              Whoever runs this needs to switch on a rule under Connections first. Then its
              button appears here.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs font-medium text-white/50 uppercase tracking-widest">
              What happened?
            </p>
            {buttons.map((button) => (
              <button
                key={button.event}
                type="button"
                disabled={busy !== null}
                onClick={() => fire(button.event, button.name)}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-white/12 bg-white/5 hover:bg-white/[0.08] active:scale-[0.99] transition-all text-left disabled:opacity-50"
              >
                {busy === button.event ? (
                  <Loader2 className="w-5 h-5 text-accent-ink animate-spin shrink-0" />
                ) : (
                  <Send className="w-5 h-5 text-accent-ink shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block text-base font-medium leading-snug">{button.name}</span>
                  <span className="block text-[11px] text-white/35 font-mono">{button.event}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <p className="text-[11px] text-white/30 mt-6 leading-relaxed text-center">
          Tapping a button sends a real WhatsApp message to that number.
        </p>
      </div>
    </div>
  );
}
