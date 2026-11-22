// Each cache contains one complete release. Keep the previous release if a
// download fails or an explicit update leaves other Bridge Lab tabs open.
const VERSION = '__RELAY_VERSION__';
const FILES = __RELAY_FILES__;
const BASE = self.registration.scope;
const PREFIX = `bridge-relay:${BASE}:`;
const CACHE = PREFIX + VERSION;
const READY = new URL('__relay_offline_ready__', BASE).href;
const EXPLICIT_UPDATE = new URL('__relay_explicit_update__', BASE).href;
const { origin, pathname } = new URL(BASE);
const pages = new Map([
  [pathname, 'index.html'],
  [pathname + 'index.html', 'index.html'],
  [pathname + 'relay.html', 'relay.html'],
]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(FILES.map(file => new Request(new URL(file, BASE), { cache: 'reload' })));
      await cache.put(READY, Response.json({ version: VERSION, installedAt: Date.now() }));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'app-version') event.ports[0]?.postMessage(VERSION);
  if (event.data === 'activate-app-update') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      await cache.put(EXPLICIT_UPDATE, new Response());
      await self.skipWaiting();
    })());
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const explicit = await (await caches.open(CACHE)).match(EXPLICIT_UPDATE);
    if (!explicit) {
      // Normal activation waits for the previous release's clients to close.
      await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE)
        .map(key => caches.delete(key)));
    }
    await self.clients.claim();
  })());
});

async function cachedAsset(request) {
  const current = await (await caches.open(CACHE)).match(request);
  if (current) return current;
  const keys = await caches.keys();
  for (const key of keys.filter(key => key.startsWith(PREFIX) && key !== CACHE)) {
    const response = await (await caches.open(key)).match(request);
    if (response) return response;
  }
  return fetch(request);
}

async function navigate(request, page) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(request, { cache: 'no-cache', signal: controller.signal });
    if (response.ok) return response;
    return await offlineShell(page) || response;
  } catch {
    return await offlineShell(page) || Response.error();
  } finally {
    clearTimeout(timer);
  }
}

async function offlineShell(page) {
  let newest;
  for (const key of (await caches.keys()).filter(key => key.startsWith(PREFIX))) {
    const cache = await caches.open(key);
    const ready = await cache.match(READY);
    if (!ready) continue;
    const release = await ready.json();
    const shell = await cache.match(new URL(`assets/${release.version}/${page}`, BASE));
    if (shell && (!newest || release.installedAt > newest.installedAt)) newest = { ...release, shell };
  }
  return newest?.shell;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== origin) return;
  if (request.mode === 'navigate') {
    const page = pages.get(url.pathname);
    if (page) event.respondWith(navigate(request, page));
    return;
  }
  const relative = url.href.startsWith(BASE) ? url.href.slice(BASE.length) : '';
  if (/^assets\/[a-f0-9]{20}\//.test(relative)
      || FILES.includes(relative)) event.respondWith(cachedAsset(request));
});
