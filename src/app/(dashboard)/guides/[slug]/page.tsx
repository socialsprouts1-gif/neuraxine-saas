import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { GUIDES, guideBySlug, guideSlugs } from "@/lib/guides";
import GuideBlock from "../GuideBlocks";
import { GUIDE_ICONS } from "../page";

// Built at build time: the content is a constant, so there is nothing to
// fetch and no reason for a reader to wait for a render.
export function generateStaticParams() {
  return guideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const guide = guideBySlug((await params).slug);
  return { title: guide ? `${guide.title} · Guides` : "Guides" };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  const Icon = GUIDE_ICONS[guide.icon];

  // Where to go next. A guide that ends in nothing is a guide people read
  // one of.
  const index = GUIDES.findIndex((entry) => entry.slug === guide.slug);
  const next = GUIDES[index + 1] ?? null;

  return (
    <div className="p-6 md:p-8">
      <Link
        href="/guides"
        className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/75 transition-colors mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All guides
      </Link>

      {/* Narrow on purpose. A line of prose past about 70 characters is
          measurably harder to read, and this is the one screen in the
          product whose whole job is being read. */}
      <article className="max-w-3xl">
        <header className="mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent/12 border border-accent/25 flex items-center justify-center mb-5">
            <Icon className="w-6 h-6 text-accent-ink" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-3 leading-tight">{guide.title}</h1>
          <p className="text-[15px] text-white/55 leading-relaxed">{guide.summary}</p>
          <p className="text-[11px] text-white/30 mt-3">{guide.minutes} min read</p>
        </header>

        <div className="space-y-7">
          {guide.blocks.map((block, position) => (
            <GuideBlock key={position} block={block} />
          ))}
        </div>

        {next && (
          <Link
            href={`/guides/${next.slug}`}
            className="glass-card p-5 mt-10 flex items-center justify-between gap-4 group hover:border-accent/30 transition-colors"
          >
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-widest text-white/35 mb-1">
                Next
              </div>
              <div className="font-semibold group-hover:text-accent-ink transition-colors">
                {next.title}
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-accent-ink group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </Link>
        )}
      </article>
    </div>
  );
}
