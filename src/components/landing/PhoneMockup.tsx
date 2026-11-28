"use client";

// The product, shown rather than described.
//
// A landing page for a WhatsApp tool has one job above the fold: show the
// thing working inside WhatsApp. Screenshots go stale the week the copy
// changes and render soft on a retina screen, so this is drawn — real
// type, real vectors, sharp at any density, and editable when the pricing
// changes.
//
// Everything in here is WhatsApp's palette, written as literals on
// purpose. #25D366 is #25D366 in both themes; it is not a theme decision
// and must not follow one.

import { WhatsAppGlyph } from "./BrandGlyphs";

const PLANS = [
  { name: "Starter", price: "$29/mo", note: "Perfect for small businesses", tint: "#25D366" },
  { name: "Growth", price: "$79/mo", note: "For growing teams", tint: "#7C3AED" },
  { name: "Pro", price: "$149/mo", note: "For advanced automation", tint: "#2563EB" },
];

/** Two ticks, blue — WhatsApp for "read", and the detail everyone knows. */
function ReadReceipt() {
  return (
    <svg viewBox="0 0 18 12" className="w-[15px] h-[11px]" fill="none" aria-label="Read">
      <path
        d="M1 6.2 3.9 9.1 9.6 2.6M7.4 6.6 9.2 8.5 15.6 1.6"
        stroke="#34B7F1"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-3 pb-1.5 text-[#111B21]">
      <span className="text-[13px] font-semibold tracking-tight tabular-nums">9:41</span>
      <div className="flex items-center gap-1.5">
        {/* Signal, as four rising bars. */}
        <svg viewBox="0 0 18 12" className="w-[17px] h-3" fill="currentColor" aria-hidden="true">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="4.7" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="9.4" y="3" width="3" height="9" rx="1" />
          <rect x="14.1" y="0.5" width="3" height="11.5" rx="1" />
        </svg>
        <svg viewBox="0 0 16 12" className="w-[15px] h-3" fill="currentColor" aria-hidden="true">
          <path d="M8 10.8 6.1 8.7a2.9 2.9 0 0 1 3.8 0zM8 6.4a4.9 4.9 0 0 0-3.6 1.5L3 6.4a6.9 6.9 0 0 1 10 0l-1.4 1.5A4.9 4.9 0 0 0 8 6.4M8 2.2a9 9 0 0 0-6.5 2.7L.1 3.5a11 11 0 0 1 15.8 0l-1.4 1.4A9 9 0 0 0 8 2.2" />
        </svg>
        <svg viewBox="0 0 26 12" className="w-[23px] h-3" fill="none" aria-hidden="true">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" opacity=".4" />
          <rect x="2" y="2" width="18" height="8" rx="1.8" fill="currentColor" />
          <path d="M23.2 4.2v3.6a2 2 0 0 0 0-3.6" fill="currentColor" opacity=".4" />
        </svg>
      </div>
    </div>
  );
}

function ChatHeader() {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[#F6F5F3] border-b border-black/5">
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#54656F] shrink-0" fill="none" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#C026D3] flex items-center justify-center text-[#FFFFFF] text-[15px] font-bold shrink-0">
        N
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[15px] font-semibold text-[#111B21] leading-tight">NeuraChat</span>
          {/* The verified tick. On a business account this is the badge a
              customer looks for, so the mock-up would be lying without it. */}
          <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
            <path
              d="M10 1.2 12 3l2.6-.3 .8 2.5 2.3 1.3-1 2.5 1 2.5-2.3 1.3-.8 2.5L12 17l-2 1.8L8 17l-2.6.3-.8-2.5L2.3 13.5l1-2.5-1-2.5 2.3-1.3.8-2.5L8 3z"
              fill="#25D366"
            />
            <path d="m6.8 10.1 2.2 2.2 4.3-4.5" stroke="#FFFFFF" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="text-[11.5px] text-[#667781] leading-tight">Online</span>
      </div>

      <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] text-[#54656F]" fill="currentColor" aria-hidden="true">
        <path d="M3.5 6.5h11a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 16V8a1.5 1.5 0 0 1 1.5-1.5M17.5 9.8l3.4-2.2c.5-.3 1.1.05 1.1.63v7.54c0 .58-.6.93-1.1.63l-3.4-2.2z" />
      </svg>
      <svg viewBox="0 0 24 24" className="w-[17px] h-[17px] text-[#54656F]" fill="currentColor" aria-hidden="true">
        <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.4 21 3 13.6 3 4.5c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.46.57 3.58.12.35.03.75-.24 1.02z" />
      </svg>
      <svg viewBox="0 0 24 24" className="w-[17px] h-[17px] text-[#54656F]" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="12" cy="19" r="1.8" />
      </svg>
    </div>
  );
}

export default function PhoneMockup() {
  return (
    <div className="relative w-[288px] shrink-0">
      {/* The handset. The bezel is a gradient rather than a flat grey so the
          edge catches light down one side, which is most of what makes a
          drawn phone read as an object instead of a rounded rectangle. */}
      <div
        className="relative rounded-[2.75rem] p-[11px]"
        style={{
          background: "linear-gradient(150deg, #4B4458 0%, #221E2C 38%, #34303F 72%, #17141E 100%)",
          boxShadow:
            "0 2px 4px rgba(23,18,38,0.2), 0 30px 60px -12px rgba(23,18,38,0.35), 0 50px 90px -30px rgba(109,40,217,0.28), inset 0 1px 1px rgba(255,255,255,0.22)",
        }}
      >
        <div className="relative rounded-[2.1rem] overflow-hidden bg-[#FFFFFF]">
          {/* Dynamic island */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[86px] h-[25px] rounded-full bg-[#0B0910] z-20 flex items-center justify-end pr-2.5">
            <span className="w-[9px] h-[9px] rounded-full bg-[#1C2A3A] ring-1 ring-[#2E4256]" />
          </div>

          <StatusBar />
          <ChatHeader />

          <div className="wa-wallpaper px-2.5 py-3 space-y-2">
            {/* Incoming */}
            <div className="max-w-[82%]">
              <div className="relative bg-[#FFFFFF] rounded-lg rounded-tl-none px-2.5 py-1.5 shadow-[0_1px_1px_rgba(11,20,26,0.13)]">
                <p className="text-[12.5px] leading-[1.35] text-[#111B21]">
                  Hi 👋 I&apos;m your AI assistant from NeuraChat. How can I help you today?
                </p>
                <span className="block text-right text-[10px] text-[#667781] mt-0.5 leading-none">
                  9:41 AM
                </span>
              </div>
            </div>

            {/* Outgoing */}
            <div className="max-w-[82%] ml-auto">
              <div className="relative bg-[#D9FDD3] rounded-lg rounded-tr-none px-2.5 py-1.5 shadow-[0_1px_1px_rgba(11,20,26,0.13)]">
                <p className="text-[12.5px] leading-[1.35] text-[#111B21]">
                  I&apos;d like to know more about your pricing plans.
                </p>
                <span className="flex items-center justify-end gap-1 text-[10px] text-[#667781] mt-0.5 leading-none">
                  9:42 AM
                  <ReadReceipt />
                </span>
              </div>
            </div>

            {/* The reply that does the selling. A list message is a real
                WhatsApp message type, not a picture of a web page — which
                is the point being made to the reader. */}
            <div className="max-w-[95%]">
              <div className="bg-[#FFFFFF] rounded-lg rounded-tl-none px-2.5 py-2 shadow-[0_1px_1px_rgba(11,20,26,0.13)]">
                <p className="text-[12.5px] leading-[1.35] text-[#111B21] mb-1.5">
                  Sure! Here are our plans:
                </p>

                <div className="space-y-1">
                  {PLANS.map((plan) => (
                    <div
                      key={plan.name}
                      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 bg-[#F7F8FA] border border-black/4"
                    >
                      <span
                        className="w-[22px] h-[22px] rounded-[7px] shrink-0 flex items-center justify-center"
                        style={{ background: `${plan.tint}1A`, border: `1px solid ${plan.tint}33` }}
                      >
                        <span className="w-[9px] h-[9px] rounded-[3px]" style={{ background: plan.tint }} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11.5px] font-semibold text-[#111B21] leading-tight">
                          {plan.name}
                        </span>
                        <span className="block text-[9px] text-[#667781] leading-tight truncate">
                          {plan.note}
                        </span>
                      </span>
                      <span className="text-[10.5px] font-bold text-[#111B21] tabular-nums shrink-0">
                        {plan.price}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-[12.5px] leading-[1.35] text-[#111B21] mt-1.5">
                  Which plan interests you?
                </p>
                <span className="block text-right text-[10px] text-[#667781] mt-0.5 leading-none">
                  9:42 AM
                </span>
              </div>
            </div>
          </div>

          {/* Composer */}
          <div className="flex items-center gap-1.5 px-2 py-2 bg-[#F6F5F3]">
            <div className="flex-1 flex items-center gap-1.5 bg-[#FFFFFF] rounded-full px-2.5 py-[7px] shadow-[0_1px_1px_rgba(11,20,26,0.08)]">
              <svg viewBox="0 0 24 24" className="w-[17px] h-[17px] text-[#8696A0] shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 1.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4M8.8 9.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4m6.4 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4M7.6 14h8.8a4.5 4.5 0 0 1-8.8 0" />
              </svg>
              <span className="flex-1 text-[12.5px] text-[#8696A0] leading-none">Type a message...</span>
              <svg viewBox="0 0 24 24" className="w-[17px] h-[17px] text-[#8696A0] shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M4 3.5h11.5L20 8v12.5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3 20.5v-15A1.5 1.5 0 0 1 4.5 3.5zm10.5 2v3.2h3.2zM8 13.5h8v1.6H8zm0 3.2h5.4v1.6H8z" />
              </svg>
            </div>
            <span className="w-[34px] h-[34px] rounded-full bg-[#25D366] flex items-center justify-center shrink-0 shadow-[0_2px_6px_rgba(37,211,102,0.4)]">
              <svg viewBox="0 0 24 24" className="w-[17px] h-[17px] text-[#FFFFFF]" fill="currentColor" aria-hidden="true">
                <path d="M12 14.5a3 3 0 0 0 3-3V5.5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3m5.5-3a.9.9 0 0 1 1.8 0 7.3 7.3 0 0 1-6.4 7.24V21a.9.9 0 0 1-1.8 0v-2.26A7.3 7.3 0 0 1 4.7 11.5a.9.9 0 0 1 1.8 0 5.5 5.5 0 0 0 11 0" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      {/* The WhatsApp tile, orbiting. It sits half off the handset so the
          two overlap — the composition falls flat when every piece has its
          own square of space. */}
      <div className="hidden sm:block absolute -top-8 -left-16 z-20 float-slow">
        <div className="relative">
          {/* The orbit. A skewed rounded rectangle read as a misdrawn box;
              an ellipse on its own axis reads as a ring around the tile. */}
          <svg
            viewBox="0 0 200 140"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[196px] h-[137px] pointer-events-none"
            fill="none"
            aria-hidden="true"
          >
            {/* The minor axis has to clear the tile. At ry=30 the ring ran
                behind a 74px tile and only its two ends showed, which read
                as a pair of stray arcs rather than an orbit. */}
            <ellipse
              cx="100"
              cy="70"
              rx="88"
              ry="52"
              stroke="#7C3AED"
              strokeOpacity="0.32"
              strokeWidth="1.7"
              transform="rotate(-22 100 70)"
            />
          </svg>
          <span
            className="relative flex items-center justify-center w-[74px] h-[74px] rounded-[1.4rem]"
            style={{
              background: "linear-gradient(145deg, #4AE07E 0%, #25D366 46%, #10A951 100%)",
              boxShadow:
                "0 10px 24px rgba(37,211,102,0.4), 0 2px 4px rgba(23,18,38,0.14), inset 0 2px 3px rgba(255,255,255,0.45)",
            }}
          >
            <WhatsAppGlyph className="w-10 h-10 text-[#FFFFFF]" />
          </span>
        </div>
      </div>
    </div>
  );
}
