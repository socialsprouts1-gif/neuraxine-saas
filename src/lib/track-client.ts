// Telling the server that something happened, from the browser.
//
// Three rules shape all of this, and the first two are the reason it is
// this short.
//
// Nothing about a person is collected. No IP (the server does not record
// the one it sees), no user-agent string, no name, no email, nothing typed
// into a field — only which page, which button, and which browser, where
// "which browser" is a random value this file generates and stores. It
// identifies nobody, and clearing site data makes a visitor new again.
//
// It must never break the page. Every entry point is wrapped: storage
// throws in a Safari private window, sendBeacon is missing in older
// browsers, the request fails behind a blocker. A failed measurement is a
// missing row, never a broken sign-up.
//
// And it must not block anything. sendBeacon hands the request to the
// browser and returns immediately, which is what makes it safe to fire
// from a click handler on a link that is about to navigate away.

const VISITOR_KEY = "nc_vid";
const SESSION_KEY = "nc_sid";
const SEEN_KEY = "nc_seen";

/** Half an hour of quiet ends a visit, which is what everybody means. */
const SESSION_GAP_MS = 30 * 60 * 1000;

function random(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** A value that survives storage being unavailable, by not needing it. */
function stored(store: Storage | null, key: string): string {
  if (!store) return random();
  try {
    const found = store.getItem(key);
    if (found) return found;
    const made = random();
    store.setItem(key, made);
    return made;
  } catch {
    return random();
  }
}

function safeStorage(which: "local" | "session"): Storage | null {
  try {
    return which === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The same browser over time, and this particular visit. */
function identity(): { visitor: string; session: string } {
  const local = safeStorage("local");
  const session = safeStorage("session");

  // A visit that has been idle for half an hour is a new visit, even in
  // the same tab — otherwise a laptop left open overnight is one session
  // lasting fourteen hours, and the session count stops meaning anything.
  try {
    const last = Number(local?.getItem(SEEN_KEY) ?? 0);
    if (last && Date.now() - last > SESSION_GAP_MS) session?.removeItem(SESSION_KEY);
    local?.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // Storage is unavailable; every event becomes its own session, which
    // over-counts rather than failing.
  }

  return { visitor: stored(local, VISITOR_KEY), session: stored(session, SESSION_KEY) };
}

/** utm_* if the link carried them, so a campaign can be told apart. */
function campaign(): { source?: string; medium?: string; campaign?: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      source: params.get("utm_source") ?? undefined,
      medium: params.get("utm_medium") ?? undefined,
      campaign: params.get("utm_campaign") ?? undefined,
    };
  } catch {
    return {};
  }
}

/** Width, not a user-agent string. Coarse on purpose. */
function device(): string {
  const width = window.innerWidth;
  if (width < 640) return "phone";
  if (width < 1024) return "tablet";
  return "desktop";
}

/** The host that sent them, never the full URL — a referrer can carry a
 *  search query or a private document's path, and neither is ours. */
function referrerHost(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    return host === window.location.hostname.replace(/^www\./, "") ? undefined : host;
  } catch {
    return undefined;
  }
}

/** Admin's own traffic is not a visitor, and would drown the numbers. */
function ignored(path: string): boolean {
  return path.startsWith("/admin") || path.startsWith("/api");
}

export function track(event: string, label?: string): void {
  if (typeof window === "undefined") return;

  try {
    const path = window.location.pathname;
    if (ignored(path)) return;

    const { visitor, session } = identity();
    const tags = campaign();

    const body = JSON.stringify({
      visitor,
      session,
      event,
      path,
      label,
      referrer: referrerHost(),
      device: device(),
      ...tags,
    });

    // Hands it to the browser and returns, so this is safe to call from a
    // click on a link that is about to navigate away — a fetch from there
    // is cancelled by the navigation about half the time.
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
      return;
    }

    void fetch("/api/track", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Measuring must never be the thing that breaks the page.
  }
}
