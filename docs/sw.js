const CACHE_NAME = 'medpapers-v11'

self.addEventListener('install', e => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  // 古いキャッシュをすべて削除
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // papers.json: ネットワーク優先、オフライン時のみキャッシュ
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
  // 静的ファイル: 常にネットワーク優先（開発中）
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  )
})
