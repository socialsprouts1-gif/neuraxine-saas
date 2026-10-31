import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/org";
import { loadSiteContent } from "@/lib/site-content-server";
import { PageHeader, Card } from "@/components/ui/primitives";
import BrandEditor from "./BrandEditor";
import HeroEditor from "./HeroEditor";

export default async function AdminLandingPage() {
  await requirePlatformAdmin();
  const content = await loadSiteContent();

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Landing page"
        subtitle="The public site's words and brand, editable without a deploy."
        action={
          <Link href="/" target="_blank" className="btn-secondary text-sm">
            View site
          </Link>
        }
      />

      <div className="space-y-6">
        <BrandEditor initial={content.brand} />
        <HeroEditor initial={content.hero} />

        <Card>
          <h2 className="font-semibold mb-1">The rest of the page</h2>
          <p className="text-sm text-white/50 leading-relaxed">
            Features, How it works, Use cases, Testimonials, Integrations, Pricing, FAQ and the
            footer are still set in code. They are next.
          </p>
        </Card>
      </div>

      <p className="text-xs text-white/35 mt-6 max-w-2xl leading-relaxed">
        Saving writes one row per section and rebuilds the public page. Anything you have not
        edited falls back to what is in the code, so an empty table renders the site exactly as
        it is now.
      </p>
    </div>
  );
}
