import type { ReactNode } from "react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { LEGAL } from "@/lib/legal";

// Shared shell for the legal pages. Long-form prose needs a narrower
// measure and looser leading than the marketing sections, so it gets its
// own container rather than reusing a landing-page wrapper.

export function LegalShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="bg-[var(--app-bg)] text-white min-h-screen">
      <Navbar />
      <article className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{title}</h1>
          <p className="text-white/60 leading-relaxed mb-2">{intro}</p>
          <p className="text-sm text-white/35 mb-12">Last updated: {LEGAL.lastUpdated}</p>
          <div className="space-y-10">{children}</div>
        </div>
      </article>
      <Footer />
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold mb-3 text-white">{title}</h2>
      <div className="space-y-3 text-white/60 leading-relaxed [&_a]:text-accent-ink [&_a:hover]:underline [&_strong]:text-white/85 [&_code]:text-accent2-ink [&_code]:text-sm">
        {children}
      </div>
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-5">
      {items.map((item, index) => (
        <li key={index} className="list-disc marker:text-accent-ink/50 pl-1">
          {item}
        </li>
      ))}
    </ul>
  );
}
