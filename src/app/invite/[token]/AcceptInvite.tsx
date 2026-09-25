"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { acceptInvite } from "@/app/(dashboard)/team-actions";

export default function AcceptInvite({
  token,
  orgName,
}: {
  token: string;
  orgName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [pending, startTransition] = useTransition();

  if (joined) {
    return (
      <div className="space-y-4">
        <p className="text-accent-ink text-sm inline-flex items-center gap-2">
          <Check className="w-4 h-4" />
          You are in {orgName}.
        </p>
        <button
          type="button"
          onClick={() => router.push("/overview")}
          className="btn-primary text-sm w-full justify-center"
        >
          Open the dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await acceptInvite(token);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setJoined(true);
            // The whole shell depends on which workspace you are in.
            router.refresh();
          })
        }
        className="btn-primary text-sm w-full justify-center disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Join {orgName}
      </button>

      {error && (
        <p className="text-sm text-[#F87171] leading-relaxed" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
