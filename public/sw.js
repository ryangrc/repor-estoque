// Deliberately network-only: never cache authenticated pages, API responses or credentials.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Repor · Sem conexão</title><body><h1>Você está sem conexão</h1><p>Conecte-se à internet e atualize a página para acessar seu estoque com segurança.</p><a href="/">Tentar novamente</a></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
});
