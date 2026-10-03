import { loadPricing, loadSiteContent } from "@/lib/site-content-server";
import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import TrustStrip from "@/components/landing/TrustStrip";
import WhatsAppFloat from "@/components/landing/WhatsAppFloat";
import StatsBand from "@/components/landing/StatsBand";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import UseCases from "@/components/landing/UseCases";
import Testimonials from "@/components/landing/Testimonials";
import Integrations from "@/components/landing/Integrations";
import Pricing from "@/components/landing/Pricing";
import Comparison from "@/components/landing/Comparison";
import FAQ from "@/components/landing/FAQ";
import Footer from "@/components/landing/Footer";

// The content is read here, once, and handed down. The sections stay client
// components — they animate — but nothing below fetches for itself, so the
// page renders in one round trip and the copy can never disagree between two
// sections that asked separately.

export default async function HomePage() {
  const [content, pricing] = await Promise.all([loadSiteContent(), loadPricing()]);

  return (
    // .marketing is the light violet theme, scoped here so the product
    // behind the login stays dark. See globals.css — redefining --color-white
    // inside this element re-themes every text-white/60 under it.
    <main className="marketing marketing-canvas overflow-x-hidden">
      <Navbar brand={content.brand} />
      <Hero
        content={content.hero}
        demoUrl={content.brand.demoUrl}
        whatsappNumber={content.brand.whatsappNumber}
      />
      <TrustStrip />
      <StatsBand stats={content.hero.stats} />
      <Features />
      <HowItWorks />
      <UseCases />
      <Testimonials />
      <Integrations />
      <Pricing
        tiers={pricing.tiers}
        trialDays={pricing.trialDays}
        salesNumber={content.brand.whatsappNumber}
      />
      {/* Straight after the price, because somebody who has just read it
          is the one asking "compared to what". */}
      <Comparison tiers={pricing.tiers} trialDays={pricing.trialDays} />
      <FAQ />
      <Footer brand={content.brand} />

      {/* On a site that sells WhatsApp automation, a contact form would be
          an argument against the product. */}
      <WhatsAppFloat number={content.brand.whatsappNumber} />
    </main>
  );
}
