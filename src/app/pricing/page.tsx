import { loadPricing, loadSiteContent } from "@/lib/site-content-server";
import Navbar from "@/components/landing/Navbar";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import Footer from "@/components/landing/Footer";

// Same content and the same prices as the section on the home page, loaded
// the same way. This page used to render Pricing with no props at all, so it
// showed whatever the component's own defaults were — a second price list
// nobody was maintaining.

export default async function PricingPage() {
  const [content, pricing] = await Promise.all([loadSiteContent(), loadPricing()]);

  return (
    <main className="bg-[var(--app-bg)] text-white">
      <Navbar brand={content.brand} />
      <div className="pt-16">
        <Pricing tiers={pricing.tiers} trialDays={pricing.trialDays} />
        <FAQ />
        <Footer brand={content.brand} />
      </div>
    </main>
  );
}
