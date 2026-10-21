"use client";

// The logo strip under the fold.
//
// The reference this was built from reads "Trusted by 10,000+ businesses
// worldwide". That is a number a buyer can check, and the star rating and
// customer count elsewhere on this page are switched off for exactly that
// reason — so this says the true version instead. The platforms below are
// ones the product genuinely talks to, which is a stronger claim anyway:
// it answers "will this work with what I already have".

import { motion } from "framer-motion";
import {
  ShopifyGlyph,
  WordPressGlyph,
  MetaGlyph,
  GoogleGlyph,
  StripeGlyph,
  RazorpayGlyph,
} from "./BrandGlyphs";

const PLATFORMS = [
  { name: "Shopify", Glyph: ShopifyGlyph },
  { name: "WordPress", Glyph: WordPressGlyph },
  { name: "Meta", Glyph: MetaGlyph },
  { name: "Google", Glyph: GoogleGlyph },
  { name: "Stripe", Glyph: StripeGlyph },
  { name: "Razorpay", Glyph: RazorpayGlyph },
];

export default function TrustStrip() {
  return (
    <section className="relative border-t border-[rgba(23,18,38,0.07)] bg-[rgba(255,255,255,0.5)] backdrop-blur-sm">
      <div className="max-w-[1400px] mx-auto px-5 sm:px-8 py-7">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10"
        >
          <p className="text-sm font-semibold text-white/60 shrink-0 text-center lg:text-left">
            Works with the tools you already sell with
          </p>

          <span className="hidden lg:block w-px h-9 bg-[rgba(23,18,38,0.10)] shrink-0" />

          {/* Ink at 40%, not brand colour. Six logos in six palettes turn a
              quiet reassurance into the loudest band on the page. */}
          <div className="flex-1 flex flex-wrap items-center justify-center lg:justify-between gap-x-9 gap-y-5">
            {PLATFORMS.map(({ name, Glyph }) => (
              <span
                key={name}
                className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors duration-200"
              >
                <Glyph className="w-[26px] h-[26px]" />
                <span className="text-[17px] font-semibold tracking-tight">{name}</span>
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
