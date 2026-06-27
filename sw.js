const CACHE = 'pomodoro-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(r) {
      return r || fetch(e.request).then(function(resp) {
        return caches.open(CACHE).then(function(cache) {
          if (e.request.url.startsWith(self.location.origin)) {
            cache.put(e.request, resp.clone());
          }
          return resp;
        });
      });
    })
  );
});
