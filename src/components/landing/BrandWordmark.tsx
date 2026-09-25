"use client";

import Image from "next/image";
import { Zap } from "lucide-react";
import { DEFAULT_BRAND, brandName, type BrandContent } from "@/lib/site-content";

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
          width={size}
          height={size}
          // Uploaded art is any shape; contain keeps a wide logo from being
          // cropped into a square.
          className="object-contain"
          style={{ width: size, height: size }}
          unoptimized
        />
      ) : (
        <span
          className="rounded-lg bg-gradient-to-br from-accent to-accent2 flex items-center justify-center shadow-[0_0_20px_rgba(0,255,135,0.5)] group-hover:shadow-[0_0_30px_rgba(0,255,135,0.7)] transition-shadow shrink-0"
          style={{ width: size, height: size }}
        >
          <Zap className="w-1/2 h-1/2 text-[#050508]" />
        </span>
      )}

      <span className="font-bold text-lg whitespace-nowrap">
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
