import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { brandsIOwn } from "@/lib/brand-access";
import SignOutButton from "@/app/(dashboard)/_components/SignOutButton";

// The agency's own panel.
//
// Its own route rather than a tab inside the dashboard, because the person
// here is not a customer of the product: they do not have an inbox, a
// WhatsApp number or contacts. They have a logo and a list of clients.
//
// Guarded by ownership rather than by role. Somebody who owns no brand has
// no reason to see this and is sent back to the product.

export const dynamic = "force-dynamic";

export default async function AgencyLayout({ children }: { children: ReactNode }) {
  const brands = await brandsIOwn();
  if (brands.length === 0) redirect("/overview");

  return (
    <div className="min-h-dvh bg-[var(--app-bg)]">
      <header className="flex items-center gap-3 h-16 px-4 md:px-8 border-b border-white/8 bg-[var(--surface-1)]/80 backdrop-blur-sm">
        <span className="text-xs font-semibold text-accent-ink uppercase tracking-widest truncate">
          Agency panel
        </span>
        <div className="ml-auto">
          <SignOutButton />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
