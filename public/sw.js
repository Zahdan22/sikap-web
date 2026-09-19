const CACHE_NAME = 'sikap-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Minimal fetch handler — wajib ada biar dianggap "installable" oleh browser,
// untuk sekarang cuma pass-through ke network (belum ada offline caching canggih)
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})