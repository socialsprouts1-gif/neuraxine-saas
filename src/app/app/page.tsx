import Link from "next/link";
import type { Metadata } from "next";
import { Bell, Monitor, Smartphone, Wifi, Zap } from "lucide-react";
import InstallApp from "@/components/InstallApp";

// The page a "Download the app" link points at.
//
// Written for somebody who expected an APK and is about to be told
// there isn't one. So it does not explain what a PWA is — it says
// "install", shows a button, and the install happens. The word
// "progressive web app" appears nowhere, because nobody outside this
// industry has ever wanted one by name.

export const metadata: Metadata = {
  title: "Get the Neura Chat app",
  description:
    "Install Neura Chat on your phone, tablet or computer. Runs from your home screen, no app store, no download.",
};

const POINTS = [
  { icon: Smartphone, title: "On your phone", body: "An icon on your home screen. Opens full screen, no browser bar." },
  { icon: Monitor, title: "On your computer", body: "Its own window on Windows and Mac, separate from your browser tabs." },
  { icon: Zap, title: "Always current", body: "Updates arrive the moment we ship them. Nothing to download again." },
  { icon: Wifi, title: "Honest offline", body: "No signal gets a clear screen, not a broken one. Nothing is lost." },
];

export default function AppPage() {
  return (
    <main className="marketing min-h-dvh px-5 py-16 sm:py-24">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt=""
            className="w-16 h-16 rounded-2xl border border-white/10"
          />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Get the app</h1>
            <p className="text-white/50 text-sm mt-1">Phone, tablet or computer. Takes a few seconds.</p>
          </div>
        </div>

        <div className="glass-card p-6 sm:p-7 mb-10">
          <InstallApp />
        </div>

        <h2 className="text-lg font-semibold mb-4">What you get</h2>
        <ul className="space-y-3 mb-10">
          {POINTS.map((point) => (
            <li key={point.title} className="flex gap-3.5">
              <point.icon className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
              <span>
                <span className="block text-[14.5px] font-medium">{point.title}</span>
                <span className="block text-[13.5px] text-white/50 leading-relaxed mt-0.5">
                  {point.body}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {/* --- the question everybody asks -------------------------------- */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 mb-10">
          <h2 className="text-[15px] font-semibold mb-2 flex items-center gap-2">
            <Bell className="w-4 h-4 text-white/40" />
            Is there an APK?
          </h2>
          <p className="text-[13.5px] text-white/60 leading-relaxed">
            No, and you do not want one. An APK only runs on Android — never on a computer or an
            iPhone — and installing one outside the Play Store makes Android warn your customers
            that the file is unsafe. Installing from here puts the same app on every device, with
            no warning and no file to keep up to date.
          </p>
        </div>

        <p className="text-sm text-white/40">
          <Link href="/" className="text-accent-ink hover:underline">
            Back to Neura Chat
          </Link>
        </p>
      </div>
    </main>
  );
}
