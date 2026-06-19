"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Menu, X, ChevronDown } from "lucide-react";

const navItems = [
  {
    label: "Features",
    href: "#features",
    dropdown: [
      { label: "AI Voice Agents", desc: "Build agents for inbound & outbound calls" },
      { label: "Outbound Campaigns", desc: "Automated multi-contact dialing at scale" },
      { label: "Inbound Routing", desc: "AI handles your incoming calls 24/7" },
      { label: "Post-Call AI", desc: "Gemini-powered summaries & data extraction" },
      { label: "Analytics Dashboard", desc: "Real-time call performance insights" },
    ],
  },
  { label: "Pricing", href: "/pricing" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Compliance", href: "#compliance" },
  { label: "Docs", href: "#" },
];

export default function Navbar() {
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
          ? "bg-[#050508]/90 backdrop-blur-xl border-b border-white/10"
          : "bg-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00FF87] to-[#00D4FF] flex items-center justify-center shadow-[0_0_20px_rgba(0,255,135,0.5)] group-hover:shadow-[0_0_30px_rgba(0,255,135,0.7)] transition-shadow">
              <Phone className="w-4 h-4 text-[#050508]" />
            </div>
            <span className="font-bold text-lg">
              Neuraxine <span className="gradient-text-green">AI</span>
            </span>
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
                  className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all duration-200"
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
                        className="absolute top-full left-0 mt-2 w-64 glass-card p-2 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
                      >
                        {item.dropdown.map((sub) => (
                          <a
                            key={sub.label}
                            href="#"
                            className="block px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors group"
                          >
                            <div className="text-sm font-medium text-white group-hover:text-[#00FF87] transition-colors">
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
              className="text-sm font-medium text-white/70 hover:text-white transition-colors px-4 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/auth/register"
              className="btn-primary text-sm py-2 px-5"
            >
              Start Free Trial
            </Link>
          </div>

          {/* Mobile Toggle */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
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
            className="md:hidden bg-[#050508]/95 backdrop-blur-xl border-b border-white/10"
          >
            <div className="px-4 py-4 space-y-1">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="block px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <div className="pt-4 flex flex-col gap-2 border-t border-white/10 mt-2">
                <Link href="/auth/login" className="btn-secondary text-sm text-center justify-center">
                  Sign In
                </Link>
                <Link href="/auth/register" className="btn-primary text-sm text-center justify-center">
                  Start Free Trial
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
