// Installation is optional and never interrupts bidding or changes its save.
export function setupInstall() {
  const button = document.getElementById('install-app');
  const help = document.getElementById('install-help');
  const offline = document.getElementById('offline-status');
  const standalone = matchMedia('(display-mode: standalone)');
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  let prompt = null;
  let installed = standalone.matches || navigator.standalone === true;
  const render = () => {
    button.hidden = installed || !prompt;
    document.getElementById('install-title').textContent = installed ? 'App and offline access' : 'Install app';
    help.textContent = installed ? 'Open Relay from your home screen.'
      : prompt ? 'Add Relay to your home screen and open it like an app.'
        : isIos ? 'In Safari, open Share → Add to Home Screen, then choose Open as Web App.'
          : 'In Chrome, open ⋮ → Install and create shortcut → Install. Some versions call this Add to Home screen.';
  };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event;
    render();
  });
  window.addEventListener('appinstalled', () => { installed = true; prompt = null; render(); });
  standalone.addEventListener('change', () => { installed = standalone.matches || navigator.standalone === true; render(); });
  button.addEventListener('click', async () => {
    const pending = prompt;
    if (!pending) return;
    prompt = null;
    render();
    try { await pending.prompt(); await pending.userChoice; } catch { /* Browser instructions remain available. */ }
  });
  render();

  const version = document.querySelector('meta[name="relay-build"]')?.content;
  if (!version || !('serviceWorker' in navigator) || !('caches' in window)) {
    offline.textContent = 'Offline access is unavailable in this browser or preview.';
    return;
  }
  const base = new URL('./', location.href);
  const cacheName = `bridge-relay:${base.href}:${version}`;
  const readyUrl = new URL('__relay_offline_ready__', base).href;
  let registration;
  const checkOffline = async (failed = false) => {
    try {
      const ready = await caches.has(cacheName) && await (await caches.open(cacheName)).match(readyUrl);
      offline.textContent = ready && (await ready.json()).version === version ? 'Ready for offline practice.'
        : failed || !navigator.onLine ? 'Offline download incomplete. Reconnect and reopen Relay to finish.'
          : 'Preparing offline practice…';
    } catch { offline.textContent = 'Offline storage is unavailable. You can still practise online.'; }
  };
  const watch = worker => {
    if (!worker) return;
    worker.addEventListener('statechange', () => checkOffline(worker.state === 'redundant'));
  };
  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register(new URL('relay-sw.js', base), { scope: base.href, updateViaCache: 'none' });
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      await checkOffline();
      if (navigator.onLine) registration.update().catch(() => checkOffline(true));
    } catch { await checkOffline(true); }
  };
  window.addEventListener('online', () => { registration?.update().catch(() => checkOffline(true)); checkOffline(); });
  window.addEventListener('offline', () => checkOffline());
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
