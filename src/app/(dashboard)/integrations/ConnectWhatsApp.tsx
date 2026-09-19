"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { startEmbeddedSignup } from "../actions";

// Two buttons instead of four fields. Meta runs the dialog, the operator
// picks their number there, and the callback provisions everything —
// including subscribed_apps, which has no UI in Meta's own dashboard and
// is the reason a correct callback URL can still receive nothing.
//
// Two rather than one because almost every business already has WhatsApp
// on the number they want to use. Offering only the "new number" flow
// means Meta refuses them — "already registered to a WhatsApp account" —
// and the only way through is to delete their WhatsApp and lose years of
// chat history. Coexistence keeps the app and adds the API beside it.

export default function ConnectWhatsApp({ label = "Connect WhatsApp" }: { label?: string }) {
  const [pending, setPending] = useState<"new" | "coexistence" | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = (mode: "new" | "coexistence") =>
    startTransition(async () => {
      setError(null);
      setPending(mode);

      const data = new FormData();
      data.set("mode", mode);
      const result = await startEmbeddedSignup(data);

      if (result.ok && result.url) {
        // A full navigation, not a popup: popups are blocked often enough
        // that the flow would look broken at random.
        window.location.href = result.url;
        return;
      }

      setPending(null);
      setError(result.error ?? "Could not start the connection.");
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        disabled={pending !== null}
        className="btn-primary text-sm disabled:opacity-50"
        onClick={() => start("coexistence")}
      >
        {pending === "coexistence" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.82 11.82 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413Z" />
          </svg>
        )}
        {pending === "coexistence" ? "Opening Meta…" : label}
        {pending !== "coexistence" && <ArrowRight className="w-3.5 h-3.5" />}
      </button>

      <button
        type="button"
        disabled={pending !== null}
        onClick={() => start("new")}
        className="btn-secondary text-sm disabled:opacity-50"
      >
        {pending === "new" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Use a brand new number
      </button>
      </div>

      <p className="text-[11px] text-white/40 leading-relaxed max-w-lg">
        The first keeps your number on the WhatsApp Business app — your chats and history stay
        exactly where they are, and the API runs alongside. Use the second only for a number that
        has never had WhatsApp on it; Meta will refuse anything else.
      </p>

      {error && <p className="text-xs text-red-400 max-w-lg leading-relaxed">{error}</p>}
    </div>
  );
}
