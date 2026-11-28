"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import BrandMark from "@/components/ui/BrandMark";

// The logo and name on the sign-in and sign-up pages.
//
// Both pages are client components and the brand lives in the database,
// so they cannot look it up themselves — which is why for months they
// rendered the file shipped with the build while every other screen
// showed the uploaded logo. The two pages a new customer sees first
// were the two that ignored the branding.
//
// A server layout reads it once and puts it here.

export interface AuthBrandValue {
  name: string;
  nameAccent: string;
  logoUrl: string;
}

const FALLBACK: AuthBrandValue = { name: "Neura", nameAccent: "Chat", logoUrl: "" };

const BrandContext = createContext<AuthBrandValue>(FALLBACK);

export function AuthBrandProvider({
  value,
  children,
}: {
  value: AuthBrandValue;
  children: ReactNode;
}) {
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useAuthBrand(): AuthBrandValue {
  return useContext(BrandContext);
}

/**
 * The mark and the wordmark, linked home.
 *
 * One component for all three places they appear, so a brand that is
 * right on one of them is right on all of them.
 */
export default function AuthBrand({ size = 40 }: { size?: number }) {
  const brand = useAuthBrand();
  const name = brand.name.trim() || "Neura";
  const accent = brand.nameAccent.trim();

  return (
    <Link href="/" className="flex items-center gap-2">
      <BrandMark
        size={size}
        src={brand.logoUrl}
        alt={[name, accent].filter(Boolean).join(" ")}
      />
      <span className="font-bold text-xl">
        {name} {accent && <span className="gradient-text-green">{accent}</span>}
      </span>
    </Link>
  );
}
