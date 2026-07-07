"use client";

import { Bell, Search } from "lucide-react";

export default function AdminHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="h-16 border-b border-white/8 bg-[#0B0B14]/70 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between px-6 gap-4">
      <div className="min-w-0">
        <h1 className="text-base font-bold truncate">{title}</h1>
        {subtitle && <p className="text-xs text-white/40 truncate">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
          <input placeholder="Search clients, tickets…" className="input-dark !pl-9 !py-2 w-56" />
        </div>
        <span className="tag-saffron hidden sm:inline-flex">Owner mode</span>
        <button className="relative p-2 rounded-xl hover:bg-white/5 transition-colors">
          <Bell className="w-4 h-4 text-white/60" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#F87171]" />
        </button>
      </div>
    </header>
  );
}
