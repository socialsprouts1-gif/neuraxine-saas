// The brand as the signed-in app needs it.
//
// A narrower shape than BrandContent on purpose. The sidebar and the
// mobile drawer are client components, so whatever they receive crosses
// the server boundary on every render — sending the whole site content,
// meta description and hero copy included, to draw a 34px logo would be
// a waste repeated on every page.

import type { BrandContent } from "@/lib/site-content";

export interface AppBrand {
  name: string;
  nameAccent: string;
  logoUrl: string;
  /** The small line under the name. Blank falls back to "Business inbox". */
  tagline: string;
}

export function appBrand(brand: BrandContent): AppBrand {
  return {
    name: brand.name,
    nameAccent: brand.nameAccent,
    logoUrl: brand.logoUrl,
    tagline: "",
  };
}
