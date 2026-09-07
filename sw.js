// Service worker: network-first con fallback a caché.
// Elegido a propósito: si hay red, gana la red (y refresca la caché), así las
// actualizaciones se ven siempre. Sin red, sirve lo último cacheado.
// Al bumpear CACHE se borran automáticamente las versiones viejas.
const CACHE = "claudio-fcm-v9";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./assets/logo.png",
  "./assets/icon-ahorros.svg",
  "./assets/icon-movimientos.svg",
  "./assets/icon-stats.svg",
  "./assets/icon-todo.svg",
  "./assets/icon-deudas.svg"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Solo el propio origen. api.github.com nunca se cachea: los datos van siempre a la red.
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === "navigate") return caches.match("./index.html");
      throw err;
    }
  })());
});
