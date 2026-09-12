import type { Metadata, Viewport } from "next";
import "./globals.css";
import { loadSiteContent } from "@/lib/site-content-server";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";

// Meta's domain verification token. Public by design — it proves control of
// the domain to Meta and nothing else. Meta fetches the home page and reads
// it out of <head>, and explicitly rejects a tag injected by JavaScript, so
// it has to be rendered server-side here rather than added on the client.
//
// Overridable so a different deployment can carry its own token without a
// code change, and so a mis-transcribed character can be corrected from
// Vercel rather than a redeploy of this file.
const FACEBOOK_DOMAIN_VERIFICATION =
  process.env.FACEBOOK_DOMAIN_VERIFICATION ?? "txlrl2b6tbksilyz5jhz1un9410ga4";

/**
 * Title, description and favicon follow the brand set in the admin panel.
 *
 * generateMetadata rather than a constant, because these now come from the
 * database. It falls back to the defaults on its own, so an unmigrated or
 * unreachable database still produces a correctly titled page.
 */
/**
 * The viewport. Without this, mobile Safari and Chrome render the page at a
 * ~980px desktop width and then shrink it to fit, which is why everything
 * looked microscopic and had to be pinched — no amount of responsive CSS
 * helps until the browser is told the real width.
 *
 * `maximumScale` is deliberately left alone: blocking zoom on a page with
 * small print is a real accessibility problem, and saves nothing.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050508",
};

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await loadSiteContent();

  return {
    ...metadata,
    title: brand.siteTitle,
    description: brand.siteDescription,
    icons: brand.faviconUrl
      ? { icon: brand.faviconUrl, shortcut: brand.faviconUrl, apple: brand.faviconUrl }
      : metadata.icons,
    openGraph: {
      ...metadata.openGraph,
      title: brand.siteTitle,
      description: brand.siteDescription,
    },
  };
}

const metadata: Metadata = {
  title: "Neura Chat — AI-Powered WhatsApp Automation Platform",
  description: "Automate customer support, lead generation, sales, follow-ups, and engagement with AI-powered WhatsApp workflows.",
  keywords: "WhatsApp automation, AI chatbot, WhatsApp marketing, CRM, lead generation",
  // src/app/icon.svg is picked up automatically; naming it here as well
  // covers the browsers that ask for a link tag rather than the convention.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  verification: {
    other: {
      "facebook-domain-verification": FACEBOOK_DOMAIN_VERIFICATION,
    },
  },
  openGraph: {
    title: "Neura Chat — AI-Powered WhatsApp Automation Platform",
    description:
      "Automate customer support, lead generation, sales, follow-ups, and engagement with AI-powered WhatsApp workflows.",
    images: ["/logo.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint. Without it the dark
            default renders and then snaps to light on hydration. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased bg-[var(--app-bg)] text-[var(--color-white)]">
        {children}
      </body>
    </html>
  );
}
