// Service worker: deixa o app abrir rápido e funcionar sem internet (as telas).
// Os dados (/api) sempre vêm do servidor; arquivos do app: rede primeiro, cópia guardada se estiver offline.
const CACHE = 'qualidade-oleo-v1';
const ARQUIVOS = ['/', '/index.html', '/app.js', '/config.js', '/style.css', '/manifest.webmanifest',
  '/icones/icone-192.png', '/icones/icone-512.png', '/icones/apple-touch-icon.png', '/icones/favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return; // dados: só rede
  // fontes do Google: usa a cópia guardada e atualiza por trás
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const rede = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || rede;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok) { const c = await caches.open(CACHE); c.put(req.mode === 'navigate' ? '/' : req, r.clone()); }
      return r;
    } catch {
      return (await caches.match(req.mode === 'navigate' ? '/' : req)) || new Response('Sem conexão', { status: 503 });
    }
  })());
});
