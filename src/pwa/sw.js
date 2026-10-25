/* =====================================================================
   Service worker do Senzi OS — gerado no build pelo plugin `senzi-pwa` (vite.config.ts),
   que preenche a versão e a lista de arquivos do build. Não é importado pelo app.

   - Telas (navegação): rede primeiro; sem conexão, abre o app guardado.
   - Arquivos do build (/assets, ícones): cache primeiro — têm hash no nome, nunca mudam.
   - Fontes do Google: guardadas e revalidadas em segundo plano.
   - Dados (Supabase e qualquer outra origem): nunca passam pelo cache.
   ===================================================================== */

const VERSION = '__BUILD_ID__'
const APP_CACHE = `senzi-app-${VERSION}`
const FONT_CACHE = 'senzi-fonts'
const PRECACHE = __PRECACHE__
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', (event) => {
  // Sem skipWaiting aqui: a versão nova espera a pessoa tocar em "Atualizar" (ou fechar o app).
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('senzi-app-') && k !== APP_CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE))
    return
  }
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request))
    return
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request))
    return
  }
  if (PRECACHE.includes(url.pathname)) event.respondWith(staleWhileRevalidate(request, APP_CACHE))
})

async function networkFirstPage(request) {
  try {
    return await fetch(request)
  } catch {
    // Offline: o app é uma SPA, então a página inicial guardada serve para qualquer rota.
    return (await caches.match('/', { cacheName: APP_CACHE })) ?? Response.error()
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(APP_CACHE)
    await cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') void cache.put(request, response.clone())
      return response
    })
    .catch(() => cached ?? Response.error())
  return cached ?? network
}
