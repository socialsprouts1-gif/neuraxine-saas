import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Clock,
  Inbox,
  Lightbulb,
  Map,
  Rocket,
  Split,
  type LucideIcon,
} from "lucide-react";
import { HeroHeader } from "@/components/ui/primitives";
import { GUIDES, totalMinutes, type Guide } from "@/lib/guides";

// The manual, in the sidebar rather than in a support email.
//
// No auth beyond the dashboard layout and no database: these are pages
// about how the product works, they are the same for everybody, and a
// guide that will not load because a migration has not run is a guide
// nobody reads.

export const metadata = { title: "Guides" };

export const GUIDE_ICONS: Record<Guide["icon"], LucideIcon> = {
  map: Map,
  clock: Clock,
  split: Split,
  rocket: Rocket,
  lightbulb: Lightbulb,
  inbox: Inbox,
  bot: Bot,
};

export default function GuidesPage() {
  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Guides"
        subtitle="How this all works, in plain language. Start at the top if you are new — the first two explain most of what people get stuck on."
      />

      <p className="text-[13px] text-white/35 mt-6 mb-5">
        {GUIDES.length} guides · about {totalMinutes()} minutes to read all of them
      </p>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {GUIDES.map((guide, index) => {
          const Icon = GUIDE_ICONS[guide.icon];
          return (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}`}
              className="glass-card p-6 group hover:border-accent/30 transition-colors flex flex-col"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-accent/12 border border-accent/25 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-accent-ink" />
                </div>
                <span className="text-[11px] text-white/25 tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>

              <h2 className="font-semibold mb-2 group-hover:text-accent-ink transition-colors">
                {guide.title}
              </h2>
              <p className="text-[13px] leading-relaxed text-white/50 flex-1">{guide.summary}</p>

              <div className="flex items-center gap-1.5 mt-4 text-[11px] text-white/35">
                {guide.minutes} min read
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
