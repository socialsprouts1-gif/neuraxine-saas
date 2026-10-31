import { loadPricing, loadSiteContent } from "@/lib/site-content-server";
import Navbar from "@/components/landing/Navbar";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import Footer from "@/components/landing/Footer";
import WhatsAppFloat from "@/components/landing/WhatsAppFloat";

// Same content and the same prices as the section on the home page, loaded
// the same way. This page used to render Pricing with no props at all, so it
// showed whatever the component's own defaults were — a second price list
// nobody was maintaining.

export default async function PricingPage() {
  const [content, pricing] = await Promise.all([loadSiteContent(), loadPricing()]);

  return (
    // The same light scope as the home page. Without it these components
    // render their light-tuned colours against the product's black.
    <main className="marketing marketing-canvas">
      <Navbar brand={content.brand} />
      <div className="pt-[70px]">
        <Pricing
          tiers={pricing.tiers}
          trialDays={pricing.trialDays}
          salesNumber={content.brand.whatsappNumber}
        />
        <FAQ />
        <Footer brand={content.brand} />
      </div>
      <WhatsAppFloat number={content.brand.whatsappNumber} />
    </main>
  );
}
