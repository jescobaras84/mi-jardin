/* Mi Jardín — service worker: la app abre sin internet.
   Al publicar una versión nueva, sube VERSION para que los teléfonos la descarguen. */
const VERSION = "mj-0.9.1";
const ASSETS = [
  "./", "./index.html", "./js/store.js", "./js/recetas.js", "./js/config.js", "./js/sync.js", "./js/vendor/supabase.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
  "./fonts/geist-latin-400-normal.woff2", "./fonts/geist-latin-500-normal.woff2", "./fonts/geist-latin-600-normal.woff2"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // Página: red primero (para recibir versiones nuevas), caché si no hay internet.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put("./index.html", c)); return r; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  // Archivos: caché primero.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); }
    return r;
  })));
});
