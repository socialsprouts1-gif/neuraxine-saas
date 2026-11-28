"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Play } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { sendTestEvent } from "../event-actions";

// Firing a made-up event.
//
// The one thing that turns "I think I wired it up right" into knowing.
// Before this, the only way to check a rule was to go and buy something
// in your own restaurant.

export default function TestEvent({ suggestions }: { suggestions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(suggestions[0] ?? "order.placed");
  const [phone, setPhone] = useState("");
  const [who, setWho] = useState("");
  const [data, setData] = useState('{\n  "total": 1840,\n  "table": "T6"\n}');

  const field =
    "w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all";
  const label = "block text-xs font-medium text-white/70 mb-1.5";

  const fire = async () => {
    setBusy(true);
    const body = new FormData();
    body.set("event_name", name);
    body.set("phone", phone);
    body.set("contact_name", who);
    body.set("data", data);

    const result = await sendTestEvent(body).catch(() => ({
      ok: false as const,
      error: "That did not go through.",
    }));
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error ?? "That did not work.");
      return;
    }
    toast.success(result.message ?? "Sent.");
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-xs py-2 px-3">
        <Play className="w-3.5 h-3.5" />
        Send a test event
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Send a test event"
        description="Pretends your own system sent this. It runs the rules for real, so use your own number."
        dismissable={!busy}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={fire}
              disabled={busy}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {busy ? "Sending…" : "Send it"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={label}>Which event</label>
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              list="event-names"
              spellCheck={false}
            />
            <datalist id="event-names">
              {suggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Your WhatsApp number</label>
              <input
                className={field}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 90000 00000"
              />
            </div>
            <div>
              <label className={label}>Name (optional)</label>
              <input
                className={field}
                value={who}
                onChange={(e) => setWho(e.target.value)}
                placeholder="Priya"
              />
            </div>
          </div>

          <div>
            <label className={label}>The details your system would send</label>
            <textarea
              className={`${field} font-mono text-xs min-h-[110px]`}
              value={data}
              onChange={(e) => setData(e.target.value)}
              spellCheck={false}
            />
            <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
              Anything in here can be dropped into a message as{" "}
              <code className="text-white/60">{"{{data.total}}"}</code>.
            </p>
          </div>

          <p className="text-[11px] text-white/45 leading-relaxed">
            This really sends. If a rule is listening and switched on, a WhatsApp message goes to
            the number above.
          </p>
        </div>
      </Modal>
    </>
  );
}
