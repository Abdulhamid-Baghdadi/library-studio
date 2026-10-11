// Offline support. On install it stores every file of the app (listed in precache.json); afterwards each request
// goes to the server first and falls back to the stored copy, so the app opens without a server or a network.
// Vault folders never pass through here.
const CACHE = "library-studio";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const files = await (await fetch("precache.json", { cache: "no-store" })).json();
    await cache.addAll(["./", ...files].map(url => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;   // OpenAlex goes to the network as usual
  if (new URL(req.url).pathname.includes("/fixture/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await (req.mode === "navigate" ? fetch(req.url, { cache: "no-cache", credentials: "same-origin" }) : fetch(req, { cache: "no-cache" }));
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) ?? Response.error();
    }
  })());
});
