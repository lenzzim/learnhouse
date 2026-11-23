/*
 * Service worker mínimo do Discipulei (item 1.8, 23/11/2026).
 *
 * Existe só para o Chrome considerar o app instalável: o pedido de instalação
 * (`beforeinstallprompt`) exige um service worker com tratador de `fetch`.
 *
 * NÃO guarda nada em cache. Notas do Caderno, a Bíblia licenciada (NVI) e
 * qualquer página da comunidade sempre vêm da rede. O único tratamento é,
 * sem conexão, responder à navegação com uma página simples de "sem
 * conexão" (texto fixo, sem conteúdo de ninguém). Ao ativar, apaga qualquer
 * cache que uma versão antiga possa ter criado.
 */
const PAGINA_OFFLINE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sem conexão · Discipulei</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#121211;color:#ecebe7;font:16px/1.5 system-ui,sans-serif;padding:24px;text-align:center}
h1{font:400 1.6rem Georgia,serif;margin:0 0 .5rem}p{color:#a3a19c;margin:0 0 1.25rem}
button{min-height:44px;padding:0 20px;border-radius:999px;border:1px solid #ecebe7;background:#ecebe7;color:#121211;font-weight:600}
</style></head><body><main><h1>Sem conexão</h1><p>Confira a internet e tente de novo.</p>
<button onclick="location.reload()">Tentar de novo</button></main></body></html>`

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const chaves = await caches.keys()
      await Promise.all(chaves.map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Só navegações (abrir uma página). Todo o resto segue direto para a rede,
  // sem passar por aqui. Nada é guardado.
  if (req.mode !== 'navigate' || req.method !== 'GET') return
  event.respondWith(
    fetch(req).catch(
      () =>
        new Response(PAGINA_OFFLINE, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        })
    )
  )
})
