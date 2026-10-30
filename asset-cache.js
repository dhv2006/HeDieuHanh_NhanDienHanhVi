// Cache only public AI assets, never video sources, API traffic or credentials.
// Asset URLs pin library versions. App-only releases must keep downloaded weights.
const ASSET_CACHE = 'behaviorlens-ai-assets-v1';
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  await self.clients.claim();
})()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range') || req.headers.has('authorization')) return;
  const url = new URL(req.url);
  const root = new URL('./', self.location.href);
  const localAsset = url.origin === root.origin && (
    url.pathname.startsWith(root.pathname + 'models/') ||
    (url.pathname.startsWith(root.pathname + 'vendor/') && !url.pathname.endsWith('/manifest.json'))
  );
  const publicAsset =
    (url.hostname === 'storage.googleapis.com' && url.pathname.startsWith('/tfjs-models/')) ||
    (url.hostname === 'cdn.jsdelivr.net' && /^\/npm\/@tensorflow(?:-models)?\//.test(url.pathname)) ||
    (url.hostname === 'vladmandic.github.io' && url.pathname.startsWith('/human-models/models/')) ||
    (url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith('/vladmandic/human-models/main/models/'));
  if (!localAsset && !publicAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    for (const key of await caches.keys()) {
      if (key === ASSET_CACHE || !key.startsWith('behaviorlens-ai-assets-')) continue;
      const previous = await (await caches.open(key)).match(req);
      if (previous) { await cache.put(req, previous.clone()).catch(() => {}); return previous; }
    }
    const response = await fetch(req);
    if (response.ok && response.type !== 'opaque') {
      // Quota failures must not prevent inference.
      event.waitUntil(cache.put(req, response.clone()).catch(() => {}));
    }
    return response;
  })());
});
