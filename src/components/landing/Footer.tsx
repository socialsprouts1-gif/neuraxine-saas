import Link from "next/link";
import { AudioLines } from "lucide-react";

const cols = [
  {
    title: "Product",
    links: ["Agent builder", "Outbound campaigns", "Virtual numbers", "WhatsApp follow-ups", "Analytics"],
  },
  {
    title: "Use cases",
    links: ["Sales & lead qualification", "Customer support", "Appointment booking", "EMI reminders", "Surveys & NPS"],
  },
  {
    title: "Company",
    links: ["About", "Careers", "Blog", "Contact", "Partner program"],
  },
  {
    title: "Legal",
    links: ["Privacy policy", "Terms of service", "TRAI compliance", "Data security", "GST & invoicing"],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/8 bg-[#0B0B14]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#8B5CF6] to-[#22D3EE] flex items-center justify-center">
                <AudioLines className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold">
                Neuraxine <span className="gradient-text">Voice</span>
              </span>
            </Link>
            <p className="text-sm text-white/45 leading-relaxed max-w-xs">
              AI voice agents for Indian businesses. Made in India 🇮🇳 for Bharat&apos;s billion phone calls.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-sm font-semibold mb-3.5">{c.title}</h4>
              <ul className="space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm text-white/45 hover:text-white transition-colors">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-6 border-t border-white/8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/35">
          <span>© 2026 Neuraxine Technologies Pvt. Ltd. All rights reserved.</span>
          <span>GSTIN: 27AABCN1234F1Z5 · CIN: U72900MH2025PTC456789</span>
        </div>
      </div>
    </footer>
  );
}
