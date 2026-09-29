// Service worker: deixa a agenda abrir offline.
// Ao publicar uma nova versão, aumente o número em VERSION.
const VERSION = 'agenda-v17';
const SHELL = [
  './', './index.html', './styles.css', './theme.js', './app.js', './store.js', './holidays.js', './gsync.js',
  './firebase-config.js', './manifest.webmanifest', './privacidade.html',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
// guardados já na instalação para o app abrir offline desde o primeiro uso
// (a versão do Firebase precisa ser a mesma de store.js)
const FB = 'https://www.gstatic.com/firebasejs/10.12.2';
const EXTRAS = [
  `${FB}/firebase-app.js`, `${FB}/firebase-auth.js`, `${FB}/firebase-firestore.js`,
  'https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=Inter:wght@400;500;600&display=swap',
];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  // cache: 'reload' ignora o cache HTTP do navegador (senão uma versão velha pode ser guardada)
  e.waitUntil(
    caches.open(VERSION)
      .then(async c => {
        await c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
        // extras não podem impedir a instalação se falharem
        await Promise.allSettled(EXTRAS.map(u => c.add(new Request(u, { cache: 'reload' }))));
      })
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
    // arquivos grandes/baixáveis (APK) passam direto
    if (url.pathname.includes('/download/')) return;
    e.respondWith(caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      });
      if (cached) { fresh.catch(() => {}); return cached; }
      // sem cópia guardada: rede; offline, uma navegação cai na página do app
      return fresh.catch(async () => (req.mode === 'navigate' && await cache.match('./index.html')) || Response.error());
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
