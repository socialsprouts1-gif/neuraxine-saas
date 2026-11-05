"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { CheckCircle2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { InstagramGlyph } from "@/components/landing/BrandGlyphs";
import { disconnectInstagram } from "../instagram-actions";

// The connected accounts, and room for more.
//
// Shows every account rather than only the first, because a plan that
// allows three and a screen that shows one is a screen that makes the
// plan look broken.

export interface AccountRow {
  id: string;
  username: string | null;
  account_name: string | null;
  profile_picture_url: string | null;
  ig_user_id: string;
  status: string;
  created_at: string;
  token_expires_at: string | null;
  last_error: string | null;
}

export default function Accounts({
  accounts,
  limit,
  canConnect,
  formatted,
}: {
  accounts: AccountRow[];
  /** Null means unlimited. */
  limit: number | null;
  canConnect: boolean;
  /** Dates formatted on the server, so this stays a client component
      without pulling date code into the bundle. */
  formatted: Record<string, { connected: string; renews: string | null }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const disconnect = async (account: AccountRow) => {
    const name = account.username ? `@${account.username}` : "this account";
    if (
      !window.confirm(
        `Disconnect ${name}?\n\nIts comments and messages stop being answered. Your automations are kept, and reconnecting brings them back.`
      )
    ) {
      return;
    }

    setBusy(account.id);
    const result = await disconnectInstagram(account.id).catch(() => ({
      ok: false as const,
      error: "That could not be disconnected just now.",
    }));
    setBusy(null);

    if (!result.ok) return void toast.error(result.error ?? "That did not work.");
    toast.success(result.message ?? "Disconnected.");
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">
          {accounts.length === 1 ? "Connected account" : "Connected accounts"}
          {limit !== null && (
            <span className="text-white/30 font-normal text-[15px]">
              {" "}
              {accounts.length} of {limit}
            </span>
          )}
        </h2>

        {canConnect ? (
          <Link href="/api/instagram/connect" className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            Add account
          </Link>
        ) : (
          <Link href="/billing" className="btn-quiet text-sm">
            Upgrade for more
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex flex-wrap items-center gap-4 p-3.5 rounded-2xl border border-white/8 bg-white/4"
          >
            {account.profile_picture_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={account.profile_picture_url}
                alt={account.username ? `@${account.username}` : "Connected account"}
                className="w-14 h-14 rounded-full object-cover border-2 border-white/10 flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-white/6 grid place-items-center flex-shrink-0">
                <InstagramGlyph className="w-6 h-6 text-white/30" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-semibold">
                  {account.username ? `@${account.username}` : "Instagram account"}
                </span>
                {account.status === "active" ? (
                  <span className="inline-flex items-center gap-1 text-[12px] text-[#00C853]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    connected
                  </span>
                ) : (
                  <span className="text-[12px] text-[#F87171]">{account.status}</span>
                )}
              </div>
              {account.account_name && (
                <div className="text-[13px] text-white/60 mt-0.5">{account.account_name}</div>
              )}
              <div className="text-[12px] text-white/35 mt-1">
                Professional account {account.ig_user_id} · connected{" "}
                {formatted[account.id]?.connected}
                {formatted[account.id]?.renews
                  ? ` · access renews by ${formatted[account.id].renews}`
                  : ""}
              </div>
              {account.last_error && (
                <div className="text-[12.5px] text-[#F87171] mt-1.5 leading-relaxed">
                  {account.last_error}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/api/instagram/connect" className="btn-quiet btn-compact text-xs">
                <RefreshCw className="w-3.5 h-3.5" />
                Reconnect
              </Link>
              <button
                type="button"
                onClick={() => void disconnect(account)}
                disabled={busy === account.id}
                className="btn-quiet btn-compact text-xs text-[#F87171] disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          </div>
        ))}
      </div>

      {!canConnect && limit !== null && (
        <p className="text-[12.5px] text-white/35 mt-3 leading-relaxed">
          Your plan covers {limit} {limit === 1 ? "Instagram account" : "Instagram accounts"}.
          Upgrading adds more, and nothing you have built is affected.
        </p>
      )}
    </>
  );
}
