const CACHE = 'pomodoro-v2';
const BASE = '/tomato-todo';

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll([
        BASE + '/',
        BASE + '/index.html',
        BASE + '/style.css',
        BASE + '/app.js',
        BASE + '/manifest.json',
        BASE + '/icons/icon-192.png',
        BASE + '/icons/icon-512.png'
      ]);
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
  var url = new URL(e.request.url);
  if (url.pathname.startsWith(BASE)) {
    e.respondWith(
      caches.match(e.request).then(function(r) {
        return r || fetch(e.request).then(function(resp) {
          return caches.open(CACHE).then(function(cache) {
            cache.put(e.request, resp.clone());
            return resp;
          });
        });
      })
    );
  }
});