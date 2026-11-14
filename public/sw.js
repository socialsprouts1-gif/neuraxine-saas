// Deliberately the dumbest service worker that still works.
//
// This is a live dashboard whose whole job is showing what happened a
// second ago. A worker that caches pages would serve yesterday's inbox
// with no way for anybody to tell — the worst bug this file could have,
// and the usual one.
//
// So: nothing is cached except one offline page. Every request goes to
// the network. The only thing this adds is an installable app and a
// readable screen when the phone has no signal.

const CACHE = "neura-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  // Take over immediately rather than waiting for every tab to close.
  // An update somebody cannot receive until they quit the app is an
  // update that does not exist.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only whole-page loads. Everything else — API calls, scripts,
  // images — goes straight to the network untouched.
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    })
  );
});
