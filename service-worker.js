const CACHE_NAME = 'v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/video.css',
  './css/sidebar.css',
  './css/overlay.css',
  './js/app.js',
  './js/toast.js',
  './js/preferences.js',
  './js/video-source.js',
  './js/gestures.js',
  './js/ui.js',
  './logo.ico'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const request = e.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // 同源资源全部网络优先，保证更新即时生效；离线时回退缓存
  e.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(r => {
        if (r) return r;
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
