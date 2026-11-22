const CACHE_NAME = 'chatview-shell-v2.4.2';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './assets/logo.svg', './assets/favicon.svg', './assets/chat-pattern.svg',
  './css/main.css', './css/layout.css', './css/components.css', './css/chat.css', './css/media.css', './css/animations.css', './css/themes.css', './css/responsive.css', './css/whatsapp.css', './css/whatsapp-advanced.css', './css/advanced-public.css',
  './vendor/jszip.min.js',
  './js/app.js', './js/core/state.js', './js/core/settings.js', './js/core/storage.js',
  './js/import/whatsapp-parser.js', './js/import/media-matcher.js', './js/import/zip-reader.js', './js/import/import-manager.js', './js/import/import-worker-client.js', './js/import/zip-worker.js',
  './js/features/analytics.js', './js/features/intelligence-panel.js', './js/workers/analytics-worker.js', './js/workers/search-worker.js', './js/features/bookmarks.js', './js/features/export.js',
  './js/chat/message-renderer.js', './js/chat/chat-manager.js', './js/search/search-engine.js', './js/media/media-viewer.js', './js/ui/notifications.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && request.destination !== 'document' && !request.url.includes('blob:')) {
      const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match('./index.html'))));
});




