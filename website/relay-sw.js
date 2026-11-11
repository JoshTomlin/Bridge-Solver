// Build placeholders are replaced by build.js. Each cache is a complete,
// immutable release; a failed download must not replace a working release.
const VERSION = '__RELAY_VERSION__';
const FILES = __RELAY_FILES__;
const BASE = self.registration.scope;
const PREFIX = `bridge-relay:${BASE}:`;
const CACHE = PREFIX + VERSION;
const READY = new URL('__relay_offline_ready__', BASE).href;
const RELAY = new URL('relay.html', BASE);

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
  // Wait for the existing app's clients to close. Never reload an auction or
  // remove assets that an open tab or one of its workers may still need.
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(PREFIX) && key !== CACHE)
    .map(key => caches.delete(key)))));
});

async function cachedAsset(request) {
  // A waiting update has its own complete cache. An online page may already
  // use that release, while the old worker is still controlling an older tab.
  const keys = await caches.keys();
  for (const key of keys.filter(key => key.startsWith(PREFIX))) {
    const response = await (await caches.open(key)).match(request);
    if (response) return response;
  }
  return fetch(request);
}

async function navigate(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.ok) return response;
    return await offlineShell() || response;
  } catch {
    return await offlineShell() || Response.error();
  } finally {
    clearTimeout(timer);
  }
}

async function offlineShell() {
  // Prefer a fully downloaded waiting update too, even if another open tab
  // keeps the older worker alive. A partial release is never a fallback.
  let newest;
  for (const key of (await caches.keys()).filter(key => key.startsWith(PREFIX))) {
    const cache = await caches.open(key);
    const ready = await cache.match(READY);
    if (!ready) continue;
    const release = await ready.json();
    const shell = await cache.match(new URL(`assets/${release.version}/relay.html`, BASE));
    if (shell && (!newest || release.installedAt > newest.installedAt)) newest = { ...release, shell };
  }
  return newest?.shell;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== RELAY.origin) return;
  if (request.mode === 'navigate') {
    if (url.pathname === RELAY.pathname) event.respondWith(navigate(request));
    return;
  }
  const relative = url.href.startsWith(BASE) ? url.href.slice(BASE.length) : '';
  if (/^assets\/[a-f0-9]{20}\/(relay\/|engine\/)/.test(relative)
      || FILES.includes(relative)) event.respondWith(cachedAsset(request));
});
