"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import IntegrationCard, { type CardData } from "./IntegrationCard";
import ConnectPanel from "./ConnectPanel";
import { INTEGRATIONS, integrationBySlug } from "@/lib/integrations";
import { HeroHeader } from "@/components/ui/primitives";

const TABS = ["All", "Featured", "Flows"] as const;
type Tab = (typeof TABS)[number];

export default function IntegrationsBrowser({
  cards,
  panels,
  canManage,
  /** Open this card on first paint — the Embedded Signup callback lands here. */
  initialOpen,
}: {
  cards: CardData[];
  /**
   * Server-rendered panels for the entries that are more than a credential
   * form: WhatsApp's connection lifecycle, the webhook manager, the API base
   * URL. Everything else falls through to ConnectPanel.
   */
  panels: Record<string, ReactNode>;
  canManage: boolean;
  initialOpen?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("All");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);

  const featured = useMemo(
    () => new Set(INTEGRATIONS.filter((def) => def.featured).map((def) => def.slug)),
    []
  );
  const flows = useMemo(
    () => new Set(INTEGRATIONS.filter((def) => def.flows).map((def) => def.slug)),
    []
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cards.filter((card) => {
      // WhatsApp is the product, so it belongs under Featured whatever the
      // catalogue says, and it is reachable from a flow's send step.
      const isFeatured = card.slug === "whatsapp" || featured.has(card.slug);
      const isFlow = card.slug === "whatsapp" || flows.has(card.slug);
      if (tab === "Featured" && !isFeatured) return false;
      if (tab === "Flows" && !isFlow) return false;
      if (!needle) return true;
      return (
        card.name.toLowerCase().includes(needle) ||
        card.description.toLowerCase().includes(needle)
      );
    });
  }, [cards, tab, query, featured, flows]);

  const openCard = open ? cards.find((card) => card.slug === open) : null;
  const openDef = open ? integrationBySlug(open) : undefined;

  return (
    <>
      <HeroHeader
        title="Integrations"
        subtitle="Connect third-party services to your workspace."
      />

      <div className="relative mb-5">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search integrations..."
          aria-label="Search integrations"
          className="w-full bg-white/5 border border-white/12 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-white/35 focus:outline-none focus:border-accent/50 transition-all"
        />
      </div>

      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/4 border border-white/8 mb-7 max-w-2xl">
        {TABS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === option ? "bg-accent text-[#050508]" : "text-white/55 hover:text-white/85"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="text-xl font-bold tracking-tight">
          {tab === "All" ? "All Integrations" : `${tab} Integrations`}
        </h2>
        <span className="text-sm text-white/45 tabular-nums">
          {visible.length} {visible.length === 1 ? "App" : "Apps"}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <h3 className="font-semibold mb-1.5">Nothing matches “{query}”</h3>
          <p className="text-sm text-white/50">
            Try a shorter search, or clear it to see all {cards.length}.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((card) => (
            <IntegrationCard key={card.slug} card={card} onOpen={(slug) => setOpen(slug)} />
          ))}
        </div>
      )}

      {openCard && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 md:p-8 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={openCard.name}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(null);
          }}
        >
          <div className="glass-card w-full max-w-2xl p-6 my-auto">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold truncate">{openCard.name}</h3>
                <p className="text-xs text-white/45 mt-1 leading-relaxed">
                  {openCard.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Close"
                className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {panels[openCard.slug] ??
              (openDef && (
                <ConnectPanel
                  def={openDef}
                  connected={openCard.connected}
                  canManage={canManage}
                />
              ))}
          </div>
        </div>
      )}
    </>
  );
}
