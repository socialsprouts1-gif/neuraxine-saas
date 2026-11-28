"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Gauge, Loader2, Pause, Play, ShieldAlert } from "lucide-react";
import { pauseInstagramAutomation, saveInstagramLimits } from "../instagram-actions";

// The brake.
//
// First on the page, above everything, because the moment somebody needs
// it they need it immediately — and the alternative, which is what
// happened, is opening each automation in turn and switching it off one
// at a time while it is still sending.

export interface SendingAccount {
  id: string;
  username: string | null;
  sends_per_hour: number | null;
  sends_per_day: number | null;
  automation_paused_at: string | null;
  automation_paused_reason: string | null;
}

export default function SendingControls({
  accounts,
  sentHour,
  sentDay,
}: {
  accounts: SendingAccount[];
  /** Counted per account id, so the numbers are real rather than a guess. */
  sentHour: Record<string, number>;
  sentDay: Record<string, number>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  if (accounts.length === 0) return null;

  const run = async (id: string, action: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(id);
    const result = await action().catch(() => ({
      ok: false,
      error: "That did not go through.",
      message: undefined,
    }));
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error ?? "That did not work.");
      return;
    }
    toast.success(result.message ?? "Done.");
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 p-5 mb-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
          <Gauge className="w-4.5 h-4.5 text-accent-ink" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">Sending limits</h2>
          <p className="text-xs text-white/50 mt-0.5 leading-relaxed max-w-2xl">
            Instagram restricts accounts that send a lot of messages to people who did not write
            first. These caps stop that happening, and the switch stops everything at once.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {accounts.map((account) => {
          const paused = Boolean(account.automation_paused_at);
          const perHour = account.sends_per_hour ?? 30;
          const perDay = account.sends_per_day ?? 150;
          const hour = sentHour[account.id] ?? 0;
          const day = sentDay[account.id] ?? 0;
          const nearHour = hour >= perHour * 0.8;
          const nearDay = day >= perDay * 0.8;

          return (
            <div
              key={account.id}
              className={`rounded-xl border p-4 ${
                paused
                  ? "border-[#C0A063]/35 bg-[#C0A063]/8"
                  : "border-white/10 bg-white/4"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {account.username ? `@${account.username}` : "Instagram account"}
                  </p>
                  <p className="text-[12px] text-white/50 mt-1">
                    <span className={nearHour ? "text-[#C0A063]" : "text-white/70"}>
                      {hour} of {perHour}
                    </span>{" "}
                    this hour ·{" "}
                    <span className={nearDay ? "text-[#C0A063]" : "text-white/70"}>
                      {day} of {perDay}
                    </span>{" "}
                    today
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === account.id ? null : account.id)}
                    className="btn-secondary text-xs py-2 px-3"
                  >
                    Change limits
                  </button>
                  <button
                    type="button"
                    disabled={busy === account.id}
                    onClick={() =>
                      run(account.id, () => pauseInstagramAutomation(account.id, !paused))
                    }
                    className={`${paused ? "btn-primary" : "btn-danger"} text-xs py-2 px-3 disabled:opacity-50`}
                  >
                    {busy === account.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : paused ? (
                      <Play className="w-3.5 h-3.5" />
                    ) : (
                      <Pause className="w-3.5 h-3.5" />
                    )}
                    {paused ? "Switch back on" : "Stop everything"}
                  </button>
                </div>
              </div>

              {paused && (
                <div className="flex items-start gap-2 mt-3 pt-3 border-t border-white/10">
                  <ShieldAlert className="w-4 h-4 text-[#C0A063] shrink-0 mt-0.5" />
                  <p className="text-xs text-white/70 leading-relaxed">
                    {account.automation_paused_reason ??
                      "Paused. Nothing is being sent from this account."}
                  </p>
                </div>
              )}

              {editing === account.id && (
                <form
                  action={async (formData: FormData) => {
                    await run(account.id, () => saveInstagramLimits(formData));
                    setEditing(null);
                  }}
                  className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="id" value={account.id} />
                  <label className="block">
                    <span className="block text-[11px] text-white/55 mb-1">Per hour</span>
                    <input
                      name="sends_per_hour"
                      type="number"
                      min={1}
                      max={500}
                      defaultValue={perHour}
                      className="w-24 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-white/55 mb-1">Per day</span>
                    <input
                      name="sends_per_day"
                      type="number"
                      min={1}
                      max={5000}
                      defaultValue={perDay}
                      className="w-24 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
                    />
                  </label>
                  <button type="submit" className="btn-primary text-xs py-2 px-3">
                    Save
                  </button>
                  <p className="text-[11px] text-white/40 basis-full leading-relaxed">
                    Public replies to comments are never capped — those are not what gets an
                    account restricted. Only messages count.
                  </p>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
