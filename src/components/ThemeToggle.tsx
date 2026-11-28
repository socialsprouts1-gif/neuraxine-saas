"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "neura-theme";

/**
 * Runs before first paint, injected as a blocking inline script.
 *
 * Reading localStorage in an effect would mean the dark default paints first
 * and then snaps to light, which is worse than having no toggle at all.
 * Kept as a string so it can be inlined verbatim, and wrapped in try/catch
 * because storage access throws outright in some privacy modes.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(!t){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})()`;

export function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/** Current theme, kept in sync with whatever the toggle last wrote. */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readTheme());
    // The attribute is the single source of truth, so anything that changes
    // it — including another tab writing storage — is picked up here.
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export default function ThemeToggle() {
  const theme = useTheme();
  const [mounted, setMounted] = useState(false);

  // The server has no idea which theme the browser chose, so rendering the
  // real icon before hydration guarantees a mismatch. Hold the space instead.
  useEffect(() => setMounted(true), []);

  const flip = () => {
    const next: Theme = readTheme() === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode. The theme still applies for this page view.
    }
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className="w-9 h-9 rounded-xl border border-white/12 bg-white/4 hover:bg-white/8 hover:border-white/25 transition-colors flex items-center justify-center text-white/60 hover:text-white"
    >
      {mounted ? (
        theme === "light" ? (
          <Moon className="w-4 h-4" />
        ) : (
          <Sun className="w-4 h-4" />
        )
      ) : (
        <span className="w-4 h-4" />
      )}
    </button>
  );
}
