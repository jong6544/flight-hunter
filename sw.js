var CACHE_NAME = 'flight-hunter-v1';
var SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  // 가격 조회는 항상 실시간이어야 하므로 절대 캐싱하지 않음
  if (e.request.url.indexOf('/api/') !== -1) return;

  e.respondWith(
    caches.match(e.request).then(function (cached) {
      var networkFetch = fetch(e.request).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, copy); });
        }
        return resp;
      }).catch(function () { return cached; });
      return cached || networkFetch;
    })
  );
});
