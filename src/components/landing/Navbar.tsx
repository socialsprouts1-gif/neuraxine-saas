"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import BrandWordmark from "./BrandWordmark";
import { DEFAULT_BRAND, type BrandContent } from "@/lib/site-content";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown, ArrowRight } from "lucide-react";

const navItems = [
  {
    label: "Features",
    href: "#features",
    dropdown: [
      { label: "AI Chatbot Builder", desc: "Train AI on your business data" },
      { label: "Workflow Automation", desc: "Drag-and-drop flow builder" },
      { label: "Bulk Campaigns", desc: "Broadcast to thousands instantly" },
      { label: "CRM System", desc: "Built-in lead management" },
      { label: "Analytics Dashboard", desc: "Real-time performance insights" },
    ],
  },
  { label: "Pricing", href: "/pricing" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Integrations", href: "#integrations" },
  { label: "Docs", href: "#" },
];

export default function Navbar({ brand = DEFAULT_BRAND }: { brand?: BrandContent }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[rgba(255,255,255,0.82)] backdrop-blur-xl border-b border-[rgba(23,18,38,0.07)] shadow-[0_1px_24px_rgba(23,18,38,0.06)]"
          : "bg-transparent"
      }`}
    >
      <nav className="max-w-[1400px] mx-auto px-5 sm:px-8">
        <div className="flex items-center justify-between h-[70px]">
          {/* Logo */}
          <Link href="/">
            <BrandWordmark brand={brand} size={32} />
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => item.dropdown && setActiveDropdown(item.label)}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <a
                  href={item.href}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl text-[15px] font-medium text-white/65 hover:text-white hover:bg-white/5 transition-all duration-200"
                >
                  {item.label}
                  {item.dropdown && <ChevronDown className="w-3 h-3" />}
                </a>

                {item.dropdown && (
                  <AnimatePresence>
                    {activeDropdown === item.label && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-2 w-72 glass-card p-2 shadow-[0_1px_2px_rgba(23,18,38,0.05),0_24px_60px_rgba(23,18,38,0.14)]"
                      >
                        {item.dropdown.map((sub) => (
                          <a
                            key={sub.label}
                            href="#"
                            className="block px-3 py-2.5 rounded-xl hover:bg-white/4 transition-colors group"
                          >
                            <div className="text-sm font-semibold text-white group-hover:text-accent-ink transition-colors">
                              {sub.label}
                            </div>
                            <div className="text-xs text-white/50 mt-0.5">{sub.desc}</div>
                          </a>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/auth/login"
              className="text-[15px] font-medium text-white/65 hover:text-white transition-colors px-4 py-2"
            >
              Sign In
            </Link>
            <Link href="/#pricing" className="btn-primary text-[15px] py-2.5 px-6 group">
              Choose a plan
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Mobile Toggle */}
          <button
            className="md:hidden p-2 rounded-xl hover:bg-white/5 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-[rgba(255,255,255,0.96)] backdrop-blur-xl border-b border-[rgba(23,18,38,0.08)] overflow-hidden"
          >
            <div className="px-4 py-4 space-y-1">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="block px-3 py-3 rounded-xl text-[15px] font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <div className="pt-4 flex flex-col gap-2 border-t border-[rgba(23,18,38,0.08)] mt-2">
                <Link href="/auth/login" className="btn-secondary text-sm text-center justify-center">
                  Sign In
                </Link>
                <Link href="/#pricing" className="btn-primary text-sm text-center justify-center">
                  Choose a plan
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
