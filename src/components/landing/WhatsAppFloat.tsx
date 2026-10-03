"use client";

// "Talk to us on WhatsApp", on a site that sells WhatsApp automation.
//
// The strongest demonstration this product has is being reachable the way
// it promises its customers will be reachable. A contact form on a page
// about WhatsApp automation is an argument against itself.
//
// It opens wa.me rather than embedding anything: no third-party script, no
// cookie, nothing to consent to, and it works on a phone (opens the app)
// and a laptop (opens web.whatsapp.com) without knowing which it is on.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { WhatsAppGlyph } from "./BrandGlyphs";
import { whatsappHref, displayWaNumber } from "@/lib/whatsapp-link";

const PREFILL = "Hi! I'd like to know more about NeuraChat.";

export default function WhatsAppFloat({
  number,
  name = "NeuraChat",
  blurb = "Typically replies in a few minutes",
}: {
  number: string;
  name?: string;
  blurb?: string;
}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // Held back for a moment after load. A chat bubble that appears in the
  // same frame as the page covers the headline before it has been read,
  // which is the thing everybody hates about these.
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const href = whatsappHref(number, PREFILL);
  // An unreadable number would open WhatsApp on an error, which reads as
  // the business being broken. Better to show nothing.
  if (!href) return null;

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 transition-all duration-500 ${
        ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      {open && (
        <div className="w-[292px] rounded-2xl overflow-hidden bg-[#FFFFFF] shadow-[0_2px_6px_rgba(23,18,38,0.08),0_24px_60px_rgba(23,18,38,0.22)] border border-[rgba(23,18,38,0.07)]">
          {/* WhatsApp's own header colour, because the panel is claiming to
              be WhatsApp and a violet one would not. */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-[#075E54]">
            <span className="w-9 h-9 rounded-full bg-[#FFFFFF]/15 flex items-center justify-center shrink-0">
              <WhatsAppGlyph className="w-5 h-5 text-[#FFFFFF]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-semibold text-[#FFFFFF] leading-tight">
                {name}
              </span>
              <span className="block text-[11.5px] text-[#FFFFFF]/70 leading-tight">{blurb}</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="p-1 rounded-lg text-[#FFFFFF]/70 hover:text-[#FFFFFF] hover:bg-[#FFFFFF]/12 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="wa-wallpaper px-3 py-4">
            <div className="max-w-[92%] bg-[#FFFFFF] rounded-lg rounded-tl-none px-3 py-2 shadow-[0_1px_1px_rgba(11,20,26,0.13)]">
              <p className="text-[13px] leading-snug text-[#111B21]">
                Hi there 👋
                <br />
                Ask us anything about setting WhatsApp automation up for your business.
              </p>
            </div>
          </div>

          <div className="p-3 bg-[#F6F5F3]">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-[#25D366] text-[#FFFFFF] text-sm font-semibold shadow-[0_4px_14px_rgba(37,211,102,0.35)] hover:bg-[#1FBA59] transition-colors"
            >
              <WhatsAppGlyph className="w-[18px] h-[18px]" />
              Start chat
            </a>
            <p className="text-center text-[11px] text-[#667781] mt-2">
              {displayWaNumber(number)}
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close WhatsApp chat" : "Chat with us on WhatsApp"}
        aria-expanded={open}
        className="relative w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-[0_6px_20px_rgba(37,211,102,0.45),0_2px_4px_rgba(23,18,38,0.14)] hover:scale-105 active:scale-95 transition-transform"
      >
        {/* One slow ring, not a permanent pulse: enough to be noticed once,
            not enough to sit in the corner of the eye for the whole visit. */}
        {!open && (
          <span className="absolute inset-0 rounded-full bg-[#25D366]/35 animate-ping [animation-duration:3.5s]" />
        )}
        {open ? (
          <X className="relative w-6 h-6 text-[#FFFFFF]" />
        ) : (
          <WhatsAppGlyph className="relative w-7 h-7 text-[#FFFFFF]" />
        )}
      </button>
    </div>
  );
}
