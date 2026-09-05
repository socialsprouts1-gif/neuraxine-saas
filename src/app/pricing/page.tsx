import Navbar from "@/components/landing/Navbar";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import Footer from "@/components/landing/Footer";

export default function PricingPage() {
  return (
    <main className="bg-[var(--app-bg)] text-white">
      <Navbar />
      <div className="pt-16">
        <Pricing />
        <FAQ />
        <Footer />
      </div>
    </main>
  );
}
