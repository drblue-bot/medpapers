const CACHE_NAME = 'medpapers-v4'
const STATIC_ASSETS = ['./index.html', './style.css', './app.js', './manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // papers.json はネットワーク優先、失敗時はキャッシュ
  if (e.request.url.includes('raw.githubusercontent.com')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(c => c.put('papers-data', clone))
          return res
        })
        .catch(() => caches.match('papers-data'))
    )
    return
  }
  // 静的ファイルはキャッシュ優先
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
