"use client";

import { useEffect } from "react";

// The page has to be readable even when the JavaScript does not run.
//
// Every section of the marketing site animates itself in, which means
// Framer Motion renders its *starting* state into the HTML the server
// sends: `style="opacity:0;transform:translateY(20px)"`. That is correct
// while the animation is about to play and catastrophic when it never
// does — one script error anywhere in the bundle and the visitor gets a
// white page with a logo on it. Which is exactly what an iPhone was
// showing while the same URL was fine in Chrome.
//
// Rather than guess at which browser quirk broke the bundle, this removes
// the single point of failure. A blocking script in <head> starts a
// timer; if React has not mounted by the time it fires, it clears the
// starting styles itself.
//
// It clears them directly rather than leaving it to a stylesheet rule,
// because in this Next version the CSS ships from the same
// /_next/static/chunks/ path as the JavaScript — so whatever stopped the
// bundle arriving may well have stopped the stylesheet too, and a
// fallback that needs the other asset to have loaded is no fallback at
// all. The matching rule in globals.css stays as a second line for
// anything rendered after the sweep.
//
// parseFloat on the inline value is what keeps it honest: a substring
// match on "opacity:0" also catches opacity:0.5, and forcing every
// deliberately faded element to full strength is its own kind of broken.
//
// The guard is deliberately not reversed once it fires. By then the page
// has already been judged broken and shown in full, and un-hiding content
// only to hide it again a second later is worse than losing the
// animations for that visit.

/** How long to wait before deciding the bundle is not coming. */
const PATIENCE_MS = 4000;

/**
 * Injected verbatim into <head>, before anything else can fail.
 *
 * Kept as a string, like the theme script, so it runs during the first
 * parse rather than after a module graph it might never finish loading.
 */
export const MOTION_FALLBACK_SCRIPT = `(function(){try{var d=document.documentElement;setTimeout(function(){if(d.hasAttribute("data-hydrated"))return;d.setAttribute("data-motion-stalled","");try{var n=d.querySelectorAll('[style*="opacity:0"],[style*="opacity: 0"]');for(var i=0;i<n.length;i++){var s=n[i].style;if(parseFloat(s.opacity)===0){s.opacity="1";s.transform="none";}}}catch(e){}},${PATIENCE_MS});}catch(e){}})()`;

/**
 * Renders nothing. Its only job is to prove React got this far.
 *
 * Mounted at the root, so the attribute it sets means "the client bundle
 * loaded, executed and rendered" — the one fact the inline script above
 * cannot work out for itself.
 */
export default function MotionFallback() {
  useEffect(() => {
    document.documentElement.setAttribute("data-hydrated", "");
  }, []);

  return null;
}
