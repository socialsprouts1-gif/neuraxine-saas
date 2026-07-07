"use client";

import { Bell, Search, Wallet, Plus } from "lucide-react";
import Link from "next/link";

export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="h-16 border-b border-white/8 bg-[#0B0B14]/70 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between px-6 gap-4">
      <div className="min-w-0">
        <h1 className="text-base font-bold truncate">{title}</h1>
        {subtitle && <p className="text-xs text-white/40 truncate">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
          <input placeholder="Search agents, calls…" className="input-dark !pl-9 !py-2 w-56" />
        </div>

        <Link
          href="/dashboard/billing"
          className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-[#34D399]/10 border border-[#34D399]/25 text-[#34D399] text-xs font-semibold hover:bg-[#34D399]/15 transition-colors"
        >
          <Wallet className="w-3.5 h-3.5" /> ₹31,299
        </Link>

        <button className="relative p-2 rounded-xl hover:bg-white/5 transition-colors">
          <Bell className="w-4.5 h-4.5 text-white/60 w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF9D3C]" />
        </button>

        <Link href="/dashboard/agents?create=1" className="btn-primary !py-2 !px-3.5 text-xs">
          <Plus className="w-3.5 h-3.5" /> New Agent
        </Link>
      </div>
    </header>
  );
}
