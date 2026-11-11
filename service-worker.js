const CACHE_NAME = 'wenyang-v5';
const NETWORK_TIMEOUT = 1500;
const NAVIGATION_TIMEOUT = 2500;
const APP_SHELL = [
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

// 逐个缓存：任一资源失败都不影响整体安装，避免离线能力整体失效
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response && response.ok) await cache.put(url, response);
      } catch (error) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
}

async function fetchAndCache(request, signal) {
  const response = await fetch(request, signal ? { signal } : undefined);
  putInCache(request, response);
  return response;
}

function offlineResponse(message, contentType) {
  return new Response(message || '', {
    status: 503,
    statusText: 'Offline',
    headers: contentType ? { 'Content-Type': contentType } : undefined
  });
}

// 页面导航：联网优先（保证更新即时生效），超时或离线回退到缓存的首页
async function handleNavigation(request) {
  const cached = await caches.match(request, { ignoreSearch: true })
    || await caches.match('./index.html', { ignoreSearch: true })
    || await caches.match('./', { ignoreSearch: true });

  const controller = new AbortController();
  const timer = cached ? setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT) : null;

  try {
    return await fetchAndCache(request, controller.signal);
  } catch (error) {
    if (cached) return cached;
    return offlineResponse('离线状态下无法加载页面，请联网后重试', 'text/plain; charset=utf-8');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// JS/CSS：联网优先 + 超时回退缓存，避免发版后长时间停留在旧脚本
async function networkFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  const controller = new AbortController();
  const timer = cached ? setTimeout(() => controller.abort(), NETWORK_TIMEOUT) : null;

  try {
    return await fetchAndCache(request, controller.signal);
  } catch (error) {
    if (cached) return cached;
    return offlineResponse();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 图片等静态资源：缓存优先，后台静默更新，离线可用
async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) {
    fetchAndCache(request).catch(() => {});
    return cached;
  }
  try {
    return await fetchAndCache(request);
  } catch (error) {
    return offlineResponse();
  }
}

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

  if (request.mode === 'navigate') {
    e.respondWith(handleNavigation(request));
    return;
  }

  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'worker') {
    e.respondWith(networkFirst(request));
    return;
  }

  e.respondWith(cacheFirst(request));
});
