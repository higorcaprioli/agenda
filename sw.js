// Service worker: deixa a agenda abrir offline.
// Ao publicar uma nova versão, aumente o número em VERSION.
const VERSION = 'agenda-v8';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './store.js', './holidays.js', './gsync.js',
  './firebase-config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  // cache: 'reload' ignora o cache HTTP do navegador (senão uma versão velha pode ser guardada)
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // app: responde do cache e atualiza em segundo plano
  if (url.origin === location.origin) {
    e.respondWith(caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true })
        || (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
      const fresh = fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    }));
    return;
  }

  // fontes e SDK do Firebase (URLs com versão): cache primeiro
  const firebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (RUNTIME_HOSTS.includes(url.hostname) || firebaseSdk) {
    e.respondWith(caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }));
  }
});
