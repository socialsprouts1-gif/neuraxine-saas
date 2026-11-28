"use client";

import Image from "next/image";
import { DEFAULT_BRAND, brandName, type BrandContent } from "@/lib/site-content";

/**
 * The generated mark: an N drawn as one stroke, with a tail lifting off
 * the last corner.
 *
 * It used to be a lightning bolt, which is the icon every tool that has
 * not decided what it is reaches for. A letter is the brand; the tail is
 * the only flourish, and it points the way the product moves.
 */
function NeuraMark({ letter }: { letter: string }) {
  if (letter !== "N") {
    return (
      <span className="text-[#FFFFFF] font-black leading-none" style={{ fontSize: "0.52em" }}>
        {letter}
      </span>
    );
  }

  return (
    <svg viewBox="0 0 32 32" className="w-[62%] h-[62%]" fill="none" aria-hidden="true">
      <path
        d="M9 24.5V9.5L23 22.5V11"
        stroke="#FFFFFF"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23 11c0-2.4 1.6-4 4-4"
        stroke="#FFFFFF"
        strokeOpacity="0.6"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The logo and name, wherever they appear.
 *
 * Two marks used to be written out by hand — one in the navbar, one in the
 * footer — so a rename or a new logo meant editing both and hoping they
 * matched. An uploaded logo replaces the generated mark entirely; without
 * one, the gradient tile and wordmark stay exactly as they were.
 */
export default function BrandWordmark({
  brand = DEFAULT_BRAND,
  size = 32,
  className = "",
}: {
  brand?: BrandContent;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-2 group ${className}`}>
      {brand.logoUrl ? (
        <Image
          src={brand.logoUrl}
          alt={brandName(brand)}
          // Sized for the widest a logo is likely to be, then constrained
          // by the style below. Next needs numbers here; what is rendered
          // is what the style says.
          width={size * 4}
          height={size}
          // Height-locked, width free. Forcing an uploaded file into a
          // square letterboxed every wide lockup — a logo with the name in
          // it came out a few pixels tall inside a box of empty space, and
          // looked nothing like the file that was uploaded.
          className="object-contain object-left"
          style={{ height: size, width: "auto", maxWidth: size * 5 }}
          unoptimized
        />
      ) : (
        <span
          className="bg-gradient-to-br from-accent to-accent2 flex items-center justify-center transition-shadow shrink-0"
          style={{
            width: size,
            height: size,
            // A superellipse corner rather than a fixed radius, so the mark
            // keeps its proportions at 28px in a navbar and 34px in a footer.
            borderRadius: size * 0.3,
            boxShadow: "var(--btn-glow)",
          }}
        >
          <NeuraMark letter={(brand.name || "N").trim().charAt(0).toUpperCase()} />
        </span>
      )}

      <span className="font-extrabold text-[1.35rem] tracking-[-0.02em] whitespace-nowrap">
        {brand.name}
        {brand.nameAccent && (
          <>
            {" "}
            <span className="gradient-text-green">{brand.nameAccent}</span>
          </>
        )}
      </span>
    </span>
  );
}
