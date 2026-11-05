import type { MetadataRoute } from "next";

// What a phone needs to treat this as an app.
//
// `display: standalone` is the whole point: installed, it opens without
// a browser bar, which is the difference between "a bookmark" and "an
// app" to everybody who is not a developer.
//
// start_url is the dashboard rather than the marketing page. Somebody
// who installed this already decided; opening them on a page selling it
// to them is a small insult every single morning.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Neura Chat — WhatsApp & Instagram automation",
    short_name: "Neura Chat",
    description:
      "Answer WhatsApp and Instagram automatically. Chatbots, an AI assistant, a shared inbox and campaigns, in one place.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0A0A0F",
    theme_color: "#0A0A0F",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops this one into whatever shape the launcher uses, so
      // it carries the padding the others do not.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Inbox", url: "/inbox", description: "Your conversations" },
      { name: "Instagram", url: "/instagram", description: "Comment and DM automations" },
      { name: "Dashboard", url: "/dashboard", description: "Today at a glance" },
    ],
  };
}
