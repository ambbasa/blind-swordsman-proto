/* v2/sw.js — 심안: 묵검 v0.86 모바일 3D GLB & 에셋 오프라인 캐시 서비스 워커 */
const CACHE_NAME = 'siman-v131';

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k.startsWith('siman-') && k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHeavyAsset = /\.(glb|webp|png|jpg|jpeg|svg|woff2?)(\?.*)?$/i.test(url.pathname + url.search)
    || url.pathname.indexOf('/vendor/') !== -1;

  if (isHeavyAsset) {
    /* 3D GLB·텍스처·벤더 모듈: Cache-First (재방문 시 0.2초 내 즉시 로드) */
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
  } else {
    /* HTML·JS·CSS: Network-First (최신 패치 즉시 반영, 오프라인 시 캐시 폴백) */
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req);
      })
    );
  }
});
