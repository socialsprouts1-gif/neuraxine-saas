"use client";

import Link from "next/link";
import { AudioLines, Menu, X } from "lucide-react";
import { useState } from "react";

const links = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Languages", href: "#languages" },
  { label: "Use cases", href: "#use-cases" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-[#06060B]/80 border-b border-white/8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#8B5CF6] to-[#22D3EE] flex items-center justify-center shadow-[0_0_16px_rgba(139,92,246,0.5)]">
            <AudioLines className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-base">
            Neuraxine <span className="gradient-text">Voice</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-white/60 hover:text-white transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/auth/login" className="text-sm font-medium text-white/70 hover:text-white transition-colors px-3 py-2">
            Sign in
          </Link>
          <Link href="/auth/register" className="btn-primary !py-2 !px-4 text-sm">
            Start free trial
          </Link>
        </div>

        <button className="md:hidden p-2" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/8 bg-[#0B0B14] px-4 py-4 space-y-2">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2 text-sm text-white/70">
              {l.label}
            </a>
          ))}
          <div className="pt-3 flex gap-3">
            <Link href="/auth/login" className="btn-secondary flex-1 !py-2 text-sm">Sign in</Link>
            <Link href="/auth/register" className="btn-primary flex-1 !py-2 text-sm">Start free</Link>
          </div>
        </div>
      )}
    </header>
  );
}
