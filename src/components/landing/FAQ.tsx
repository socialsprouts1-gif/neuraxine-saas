"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "How is this different from an IVR?",
    a: "An IVR plays menus ('press 1 for…'). A Neuraxine voice agent holds a real two-way conversation — it understands free speech in Hindi, English or regional languages, answers questions from your knowledge base, and takes actions like booking a slot or sending a WhatsApp link.",
  },
  {
    q: "Is outbound calling legal in India? What about DND numbers?",
    a: "Yes, for transactional and consented communication. The platform automatically scrubs TRAI NDNC (DND) registered numbers from promotional campaigns, enforces calling windows, and maintains consent logs so you stay compliant.",
  },
  {
    q: "Which languages and accents are supported?",
    a: "12 languages — Hindi, English (Indian accent), Hinglish, Tamil, Telugu, Marathi, Bengali, Kannada, Gujarati, Malayalam, Punjabi and Odia. Agents can switch languages mid-call if the customer does.",
  },
  {
    q: "How do I get a phone number?",
    a: "You can rent virtual numbers (Mumbai, Delhi, Bengaluru and 20+ cities) or a 1800 toll-free number directly from the dashboard. Numbers are provisioned via Exotel, Plivo or Tata Tele and activate within a few hours after KYC.",
  },
  {
    q: "How does billing work?",
    a: "Plans are priced monthly in ₹ with included calling minutes. Extra usage is deducted from your wallet, which you can recharge with UPI, netbanking or cards. GST invoices are generated automatically.",
  },
  {
    q: "Can it hand over to a human?",
    a: "Yes. Set escalation rules — 'if the customer is angry' or 'if they ask for a manager' — and the call transfers live to your team's number with a summary of the conversation so far.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="section-badge">FAQ</span>
          <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight">
            Questions? <span className="gradient-text">Answers.</span>
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="glass-card overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 p-5 text-left"
              >
                <span className="font-medium text-sm sm:text-base">{f.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`}
                />
              </button>
              {open === i && (
                <div className="px-5 pb-5 text-sm text-white/60 leading-relaxed">{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
