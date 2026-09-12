"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setOrgSuspended } from "../../actions";

export default function SuspendControls({
  orgId,
  suspended,
  reason: initialReason,
}: {
  orgId: string;
  suspended: boolean;
  reason: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState(initialReason);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (suspend: boolean) =>
    startTransition(async () => {
      const data = new FormData();
      data.set("org_id", orgId);
      data.set("suspend", String(suspend));
      data.set("reason", reason);
      const result = await setOrgSuspended(data);
      setNote(result.ok ? (result.message ?? "Saved.") : (result.error ?? "Could not save."));
      if (result.ok) router.refresh();
    });

  return (
    <div className="space-y-3">
      {!suspended && (
        <div>
          <span className="block text-xs font-medium text-white/70 mb-1.5">
            What should they be told?
          </span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Payment for August has not come through."
            className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
          />
          <p className="text-[11px] text-white/35 mt-1.5">
            Shown to everyone in the workspace, so write it as though they are reading it — because
            they are.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        {suspended ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(false)}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Lift the suspension
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(true)}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-[#F87171]/12 text-[#F87171] border border-[#F87171]/30 hover:bg-[#F87171]/20 transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Suspend this workspace
          </button>
        )}
        {note && <span className="text-xs text-white/55">{note}</span>}
      </div>
    </div>
  );
}
