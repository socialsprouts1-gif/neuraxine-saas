import Link from "next/link";
import { Phone, Share2, Link2, GitFork, PlaySquare, ArrowRight } from "lucide-react";

const footerLinks = {
  Product: ["Features", "Pricing", "Integrations", "Changelog", "Roadmap", "Status"],
  Solutions: ["Ecommerce", "Agencies", "Coaching", "Healthcare", "Real Estate", "Education"],
  Resources: ["Documentation", "API Reference", "Blog", "Case Studies", "Templates", "Help Center"],
  Company: ["About", "Careers", "Partners", "Press", "Contact", "Legal"],
};

export default function Footer() {
  return (
    <footer className="relative border-t border-white/8 pt-20 pb-10 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0F] to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top CTA Banner */}
        <div
          className="glass-card p-10 mb-16 text-center relative overflow-hidden"
          style={{ borderColor: "rgba(0,255,135,0.15)" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#00FF87]/5 via-transparent to-[#00D4FF]/5" />
          <div className="relative">
            <h3 className="text-3xl md:text-4xl font-bold mb-3">
              Ready to automate your{" "}
              <span className="gradient-text-green">WhatsApp growth?</span>
            </h3>
            <p className="text-white/60 mb-8 max-w-lg mx-auto">
              Join 50,000+ businesses already using Neuraxine AI to grow faster.
              Start your 14-day free trial today.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link href="/auth/register" className="btn-primary px-8 py-3.5">
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="#" className="btn-secondary px-8 py-3.5">
                Book a Demo
              </Link>
            </div>
          </div>
        </div>

        {/* Main footer grid */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00FF87] to-[#00D4FF] flex items-center justify-center shadow-[0_0_20px_rgba(0,255,135,0.4)]">
                <Phone className="w-4 h-4 text-[#050508]" />
              </div>
              <span className="font-bold text-lg">
                WhatsFlow <span className="gradient-text-green">AI</span>
              </span>
            </Link>
            <p className="text-sm text-white/50 leading-relaxed mb-6 max-w-xs">
              The most powerful AI-powered WhatsApp automation platform for modern businesses.
            </p>

            {/* Newsletter */}
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00FF87]/40"
              />
              <button className="btn-primary text-sm py-2 px-3">
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Social */}
            <div className="flex gap-3 mt-6">
              {[
                { icon: Share2, href: "#" },
                { icon: Link2, href: "#" },
                { icon: GitFork, href: "#" },
                { icon: PlaySquare, href: "#" },
              ].map(({ icon: Icon, href }) => (
                <a
                  key={href}
                  href={href}
                  className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:border-[#00FF87]/30 hover:bg-[#00FF87]/5 transition-all"
                >
                  <Icon className="w-4 h-4 text-white/60" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold mb-4 text-white">{category}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-white/50 hover:text-[#00FF87] transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/40">
            © 2024 Neuraxine AI. All rights reserved.
          </p>
          <div className="flex gap-6">
            {["Privacy Policy", "Terms of Service", "Cookie Policy", "GDPR"].map((item) => (
              <a key={item} href="#" className="text-xs text-white/40 hover:text-white/60 transition-colors">
                {item}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00FF87] animate-pulse" />
            <span className="text-xs text-white/40">All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
