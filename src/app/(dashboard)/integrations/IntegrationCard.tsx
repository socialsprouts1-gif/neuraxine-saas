"use client";

import { Info, Pencil, Plug } from "lucide-react";
import BrandLogo from "@/components/ui/BrandLogo";

// A catalogue tile: logo, name, connection state, description, an optional
// caveat, and the two actions. Purely presentational — everything it can do
// happens in the panel the parent opens.

export interface CardData {
  slug: string;
  name: string;
  description: string;
  note?: string;
  brand: string;
  connected: boolean;
  /**
   * Always-on entries have nothing to connect, only settings to adjust, so
   * their primary action reads Configure. Everything else is Connect until
   * it is connected.
   */
  alwaysOn: boolean;
}

export default function IntegrationCard({
  card,
  onOpen,
}: {
  card: CardData;
  onOpen: (slug: string, view: "manage" | "connect") => void;
}) {
  const primaryLabel = card.alwaysOn || card.connected ? "Configure" : "Connect";

  return (
    <div className="glass-card p-5 flex flex-col">
      <div className="flex items-start gap-3">
        <BrandLogo slug={card.slug} brand={card.brand} />

        <h3 className="font-semibold text-base truncate flex-1 min-w-0 mt-1.5">{card.name}</h3>

        <span
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border flex-shrink-0 ${
            card.connected
              ? "bg-accent/10 text-accent-ink border-accent/20"
              : "bg-white/5 text-white/45 border-white/10"
          }`}
        >
          <Info className="w-3 h-3" />
          {card.connected ? "Connected" : "Not Connected"}
        </span>
      </div>

      <p className="text-sm text-white/55 mt-3.5 leading-relaxed">{card.description}</p>

      {card.note && (
        <p className="text-[11px] text-white/45 leading-relaxed mt-3.5 pl-3 border-l-2 border-accent/40">
          {card.note}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-5 pt-1">
        <button
          type="button"
          onClick={() => onOpen(card.slug, "manage")}
          className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium text-white/55 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Manage
        </button>
        <button
          type="button"
          onClick={() => onOpen(card.slug, "connect")}
          className="btn-primary text-sm py-2.5 px-5"
        >
          <Plug className="w-4 h-4" />
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
