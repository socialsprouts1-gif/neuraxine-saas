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

export default function HomePage() {
  return (
    <main className="bg-[var(--app-bg)] text-white overflow-x-hidden">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <UseCases />
      <Testimonials />
      <Integrations />
      <Pricing />
      <FAQ />
      <Footer />
    </main>
  );
}
