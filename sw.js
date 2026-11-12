/* Офлайн-кэш приложения. Обновление: поменять VERSION. */
const VERSION = 'kirill-fit-v1.1.0';
const FILES = ['./', 'index.html', 'style.css', 'data.js', 'poses.js', 'app.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  /* Сначала сеть (чтобы получать обновления), при отсутствии сети — кэш */
  e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
