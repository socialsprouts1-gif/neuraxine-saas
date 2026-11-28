"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Download } from "lucide-react";

// Installing the app, on whichever device somebody is holding.
//
// Four platforms, four completely different stories, and only one of
// them can offer a button — Apple does not allow one, and desktop
// Chrome puts its own in the address bar. So the honest shape is a
// picker: guess from the browser, show that one first, and let anybody
// correct the guess in one tap.
//
// The guess is only ever a default. Every iPad since 2019 reports
// itself as a Mac, so a wrong guess is routine and has to be cheap to
// fix rather than something to be clever about.

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Device = "android" | "ios" | "windows" | "mac";

const DEVICES: { key: Device; label: string; steps: React.ReactNode[] }[] = [
  {
    key: "android",
    label: "Android",
    steps: [
      <>Open this page in <b>Chrome</b>.</>,
      <>Tap the <b>⋮</b> menu, top right.</>,
      <>Tap <b>Install app</b>, or <b>Add to Home screen</b>.</>,
      <>Tap <b>Install</b> to confirm. The icon appears on your home screen.</>,
    ],
  },
  {
    key: "ios",
    label: "iPhone & iPad",
    steps: [
      <>Open this page in <b>Safari</b>. Chrome on iPhone cannot install apps — Apple does not allow it.</>,
      <>Tap the <b>Share</b> button at the bottom of the screen (a square with an arrow out of it).</>,
      <>Scroll down the list and tap <b>Add to Home Screen</b>.</>,
      <>Tap <b>Add</b>, top right. The icon appears on your home screen.</>,
    ],
  },
  {
    key: "windows",
    label: "Windows",
    steps: [
      <>Open this page in <b>Chrome</b> or <b>Edge</b>.</>,
      <>Look at the right-hand end of the address bar for the <b>install icon</b> — a small screen with an arrow.</>,
      <>Click it, then click <b>Install</b>.</>,
      <>No icon there? Open the <b>⋮</b> menu → <b>Cast, save and share</b> → <b>Install page as app</b>.</>,
    ],
  },
  {
    key: "mac",
    label: "Mac",
    steps: [
      <>Open this page in <b>Chrome</b>, <b>Edge</b> or <b>Safari</b>.</>,
      <>In Chrome or Edge: click the <b>install icon</b> at the right of the address bar, then <b>Install</b>.</>,
      <>In Safari: <b>File</b> menu → <b>Add to Dock</b>.</>,
      <>The app opens in its own window and appears in your Applications and Dock.</>,
    ],
  },
];

const STANDALONE = "(display-mode: standalone)";

function subscribeInstalled(onChange: () => void): () => void {
  const query = window.matchMedia(STANDALONE);
  query.addEventListener("change", onChange);
  window.addEventListener("appinstalled", onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener("appinstalled", onChange);
  };
}

function readInstalled(): boolean {
  return (
    window.matchMedia(STANDALONE).matches ||
    // Safari's own, older flag. Still the only one iOS sets.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Which device this probably is.
 *
 * Cached because it cannot change without a reload, and getSnapshot is
 * called on every render.
 */
let deviceCache: Device | null = null;

function readDevice(): Device {
  if (deviceCache !== null) return deviceCache;
  const ua = window.navigator.userAgent;

  if (/Android/.test(ua)) deviceCache = "android";
  // An iPad has claimed to be a Mac since iPadOS 13, so the touch point
  // count is the only thing that separates them.
  else if (/iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1))
    deviceCache = "ios";
  else if (/Win/.test(ua)) deviceCache = "windows";
  else deviceCache = "mac";

  return deviceCache;
}

function subscribeNever(): () => void {
  return () => {};
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const register = () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      // Not fatal. The site works without it; only installing and the
      // offline page are lost.
      console.warn("Service worker did not register", error);
    });
  };

  // Waiting for `load` unconditionally is the usual version of this, and
  // it never runs: React hydrates after the page has loaded, so the
  // event being listened for has already happened. Caught by checking
  // whether a worker was actually registered rather than whether the
  // code looked right.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [picked, setPicked] = useState<Device | null>(null);

  // false and "android" on the server, where there is no browser to ask.
  const installed = useSyncExternalStore(subscribeInstalled, readInstalled, () => false);
  const detected = useSyncExternalStore(subscribeNever, readDevice, () => "android" as Device);

  // What somebody chose beats what the browser guessed, always.
  const device = picked ?? detected;
  const steps = DEVICES.find((entry) => entry.key === device)?.steps ?? [];

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Stop Chrome's own mini-banner so there is one way in, not two.
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const onInstalled = () => setPrompt(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <div className="glass-card p-6 text-center">
        <Check className="w-8 h-8 text-accent mx-auto mb-3" />
        <p className="font-semibold mb-1">You are using the app</p>
        <p className="text-sm text-white/50">It is already installed on this device.</p>
      </div>
    );
  }

  return (
    <div>
      {/* The one-tap path, when the browser offers it. */}
      {prompt && (
        <button
          type="button"
          onClick={() => {
            void prompt.prompt();
            void prompt.userChoice.finally(() => setPrompt(null));
          }}
          className="btn-primary w-full justify-center text-base py-3.5 mb-6"
        >
          <Download className="w-5 h-5" />
          Install Neura Chat
        </button>
      )}

      {/* --- pick a device ---------------------------------------------- */}
      <p className="text-sm font-semibold mb-2.5">
        {prompt ? "Installing on a different device?" : "Which device are you on?"}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {DEVICES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setPicked(entry.key)}
            aria-pressed={device === entry.key}
            className={`px-3 py-3 rounded-xl text-[13.5px] font-medium border-2 transition-colors ${
              device === entry.key
                ? "border-accent bg-accent/10 text-accent-ink"
                : "border-white/10 bg-white/4 text-white/60 hover:border-white/25 hover:text-white"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {/* --- and the steps for it ---------------------------------------- */}
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-accent/15 text-accent-ink text-[12px] font-bold grid place-items-center flex-shrink-0 mt-0.5">
              {index + 1}
            </span>
            <span className="text-[14px] text-white/70 leading-relaxed [&_b]:text-white [&_b]:font-semibold">
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
