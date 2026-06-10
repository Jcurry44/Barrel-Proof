const CACHE_NAME = "barrel-proof-shell-v44";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./src/data/bottles.js",
  "./src/data/friends.js",
  "./src/data/cocktails.js",
  "./src/data/reviews.js",
  "./src/data/curated.js",
  "./src/data/bottle-images.js",
  "./src/logic/catalog.js",
  "./src/logic/families.js",
  "./src/logic/showdown.js",
  "./src/logic/recommendation.js",
  "./src/logic/palate.js",
  "./src/logic/collection.js",
  "./src/logic/prices.js",
  "./src/logic/research.js",
  "./src/logic/reviews.js",
  "./src/logic/club.js",
  "./src/logic/night.js",
  "./src/logic/barcode.js",
  "./vendor/zxing-library.min.js",
  "./src/logic/cocktails.js",
  "./src/storage/store.js",
  "./src/ui/render.js",
  "./src/main.js",
  "./src/data/imported-catalog-index.json"
];

self.addEventListener("install", (event) => {
  // Fetch with cache: "reload" so a version bump always pulls fresh assets from
  // the network, never a stale copy from the browser's HTTP cache.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(SHELL_ASSETS.map((url) =>
        fetch(new Request(url, { cache: "reload" }))
          .then((response) => (response && response.ok ? cache.put(url, response) : null))
          .catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Let the browser handle cross-origin requests (e.g. Google Fonts) directly.
  if (!sameOrigin(event.request.url)) return;

  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === "navigate";
  const isCatalogIndex = url.pathname.endsWith("imported-catalog-index.json");
  const isAppCode = url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith("index.html");

  // App shell + code: network-first. This keeps code fresh and internally
  // consistent on every online load, so editing a file no longer requires bumping
  // CACHE_NAME, and a poisoned cache can never permanently serve stale/mismatched
  // code. Falls back to cache when offline.
  if (isNavigation || (isAppCode && !isCatalogIndex)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Everything else (notably the 7 MB catalog index): stale-while-revalidate.
  // Serve the cached copy instantly for a fast launch, refresh in the background
  // so the next launch picks up updated prices without re-downloading every time.
  event.respondWith(staleWhileRevalidate(event.request));
});

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match(request).then((cached) => {
      if (cached) return cached;
      if (request.mode === "navigate") return caches.match("./index.html");
      return Response.error();
    }));
}

function staleWhileRevalidate(request) {
  return caches.match(request).then((cached) => {
    const network = fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => cached || Response.error());
    return cached || network;
  });
}

function sameOrigin(url) {
  return new URL(url).origin === self.location.origin;
}
