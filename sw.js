// Kill-switch: elimina cualquier service worker viejo y borra sus cachés.
// (Se desactivó el SW porque causaba que las actualizaciones no se vieran.
//  Esta app necesita red igual, así que no perdemos nada.)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clientsList = await self.clients.matchAll();
    clientsList.forEach((c) => c.navigate(c.url));
  })());
});
