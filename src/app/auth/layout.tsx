import type { ReactNode } from "react";
import { loadSiteContent } from "@/lib/site-content-server";
import { AuthBrandProvider } from "@/components/AuthBrand";

// Reads the brand once for both auth pages.
//
// They are client components, so this is the only place that can look
// it up for them.

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { brand } = await loadSiteContent();

  return (
    <AuthBrandProvider
      value={{
        name: brand.name,
        nameAccent: brand.nameAccent,
        logoUrl: brand.logoUrl,
      }}
    >
      {children}
    </AuthBrandProvider>
  );
}
