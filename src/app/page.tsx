import { loadPricing, loadSiteContent } from "@/lib/site-content-server";
import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import UseCases from "@/components/landing/UseCases";
import Testimonials from "@/components/landing/Testimonials";
import Integrations from "@/components/landing/Integrations";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import Footer from "@/components/landing/Footer";

// The content is read here, once, and handed down. The sections stay client
// components — they animate — but nothing below fetches for itself, so the
// page renders in one round trip and the copy can never disagree between two
// sections that asked separately.

export default async function HomePage() {
  const [content, pricing] = await Promise.all([loadSiteContent(), loadPricing()]);

  return (
    <main className="bg-[var(--app-bg)] text-white overflow-x-hidden">
      <Navbar brand={content.brand} />
      <Hero content={content.hero} />
      <Features />
      <HowItWorks />
      <UseCases />
      <Testimonials />
      <Integrations />
      <Pricing tiers={pricing.tiers} trialDays={pricing.trialDays} />
      <FAQ />
      <Footer brand={content.brand} />
    </main>
  );
}
