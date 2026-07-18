// Service worker (PWA). Estrategia "red primero" para que siempre tome la última
// versión de la app; usa la caché solo como respaldo cuando no hay conexión.
const CACHE = "claudio-fcm-v2";
const SHELL = ["./", "index.html", "style.css", "app.js", "assets/logo.png",
  "assets/icon-stats.svg", "assets/icon-movimientos.svg", "assets/icon-ahorros.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.hostname === "api.github.com") return; // datos: siempre a la red, sin SW
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
