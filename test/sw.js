/* Makes the game installable as an app, and lets it start with no signal.
   The game's own files always come fresh from the web when there is a connection, so an update reaches everyone the
   next time they open the app. The saved copy is only used when the phone is offline. The 3D library and the fonts
   never change, so their saved copies are used first. */
const CACHE = 'yhiog-15';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/sites.js', 'js/shop.js', 'js/swag.js', 'js/sim.js', 'js/audio.js', 'js/crew.js', 'js/world.js', 'js/panel.js', 'js/hud.js', 'js/inspect.js', 'js/auto.js', 'js/easy.js',
  'js/well.js', 'js/spt.js', 'js/grout.js', 'js/toss.js', 'js/nag.js', 'js/marl.js', 'js/aaron.js', 'js/greg.js', 'js/main.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.158.0/three.min.js'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => null)))));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const keep = res => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(keep).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (/cdnjs\.cloudflare\.com$|fonts\.googleapis\.com$|fonts\.gstatic\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(keep)));
  }
});
