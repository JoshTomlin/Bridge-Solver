function waitForState(worker, readyStates) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('The download timed out.')), 45000);
    function finish(error) {
      clearTimeout(timer);
      worker.removeEventListener('statechange', check);
      if (error) reject(error);
      else resolve();
    }
    function check() {
      if (readyStates.includes(worker.state)) finish();
      else if (worker.state === 'redundant') finish(new Error('The download could not be completed.'));
    }
    worker.addEventListener('statechange', check);
    check();
  });
}

function versionOf(worker) {
  if (!worker) return Promise.resolve(null);
  return new Promise(resolve => {
    const { port1, port2 } = new MessageChannel();
    const timer = setTimeout(() => complete(null), 1500);
    function complete(version) {
      clearTimeout(timer);
      port1.close();
      resolve(version);
    }
    port1.onmessage = event => complete(event.data);
    try { worker.postMessage('app-version', [port2]); }
    catch { complete(null); }
  });
}

async function downloadUpdate(registration) {
  let installing = registration.installing;
  const remember = () => { installing = registration.installing ?? installing; };
  registration.addEventListener('updatefound', remember);
  try {
    await registration.update();
    remember();
    if (installing) await waitForState(installing, ['installed', 'activating', 'activated']);
  } finally {
    registration.removeEventListener('updatefound', remember);
  }
}

// Bridge Lab and Relay share one installed app. Update controls are available
// in Relay, where we can save the current auction immediately before a reload.
export function setupInstall({ beforeReload = () => true } = {}) {
  const button = document.getElementById('install-app');
  const offline = document.getElementById('offline-status');
  const update = document.getElementById('update-app');
  const updateStatus = document.getElementById('update-status');
  if (button) bindInstallPrompt(button);

  const version = document.querySelector('meta[name="relay-build"]')?.content;
  if (!version || !('serviceWorker' in navigator) || !('caches' in window)) {
    if (offline) offline.textContent = 'Offline access is unavailable in this browser or preview.';
    if (update) update.hidden = true;
    return;
  }

  const base = new URL('./', location.href);
  const cacheName = `bridge-relay:${base.href}:${version}`;
  const readyUrl = new URL('__relay_offline_ready__', base).href;
  let registration;
  let updateReady = false;
  let updating = false;

  const checkOffline = async (failed = false) => {
    if (!offline) return;
    try {
      const ready = await caches.has(cacheName) && await (await caches.open(cacheName)).match(readyUrl);
      offline.textContent = ready && (await ready.json()).version === version ? 'Ready for offline practice.'
        : failed || !navigator.onLine ? 'Offline download incomplete. Reconnect and reopen Bridge Lab to finish.'
          : 'Preparing offline practice…';
    } catch { offline.textContent = 'Offline storage is unavailable. You can still practise online.'; }
  };

  function showUpdate(ready, message) {
    if (!update) return;
    updateReady = ready;
    update.textContent = ready ? 'Restart to update' : 'Check for updates';
    updateStatus.textContent = message;
  }

  async function showWaitingUpdate() {
    if (!update || !registration.active || !registration.waiting || updating) return;
    const waiting = registration.waiting;
    const [nextVersion, activeVersion] = await Promise.all([versionOf(waiting), versionOf(registration.active)]);
    if (!updating && registration.waiting === waiting && nextVersion && nextVersion !== activeVersion) {
      showUpdate(true, 'Update downloaded.');
    }
  }

  function watch(worker) {
    if (!worker) return;
    const onStateChange = () => {
      checkOffline(worker.state === 'redundant');
      if (worker.state === 'installed') showWaitingUpdate();
    };
    worker.addEventListener('statechange', onStateChange);
  }

  update?.addEventListener('click', async () => {
    const restart = updateReady;
    updating = true;
    update.disabled = true;
    try {
      if (restart) {
        if (beforeReload() === false) {
          showUpdate(true, 'Your auction could not be saved. Keep the app open to keep bidding.');
          return;
        }
        updateStatus.textContent = 'Updating Bridge Lab…';
        const waiting = registration.waiting;
        if (waiting) {
          waiting.postMessage('activate-app-update');
          await waitForState(waiting, ['activated']);
        }
        // The auction can still change in another control while activation waits.
        if (beforeReload() === false) {
          showUpdate(true, 'Your auction could not be saved. Keep the app open to keep bidding.');
          return;
        }
        location.reload();
      } else {
        updateStatus.textContent = 'Checking for updates…';
        if (!(await versionOf(registration.waiting))) await downloadUpdate(registration);
        const [nextVersion, activeVersion] = await Promise.all([
          versionOf(registration.waiting), versionOf(registration.active),
        ]);
        if (!activeVersion || registration.waiting && !nextVersion) {
          showUpdate(false, 'Could not verify the app version. Check again in a moment.');
          return;
        }
        const ready = Boolean(nextVersion && nextVersion !== activeVersion || activeVersion !== version);
        showUpdate(ready, ready ? 'Update downloaded.' : 'You have the latest published build.');
      }
    } catch {
      showUpdate(restart, navigator.onLine ? 'Could not update. Try again in a moment.' : 'Connect to the internet to check for updates.');
    } finally {
      updating = false;
      update.disabled = false;
    }
  });

  const backgroundCheck = () => {
    if (navigator.onLine && !updating) registration?.update().catch(() => checkOffline(true));
    checkOffline();
  };
  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register(new URL('relay-sw.js', base), { scope: base.href, updateViaCache: 'none' });
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      if (update) {
        update.disabled = false;
        showWaitingUpdate();
      }
      backgroundCheck();
    } catch { await checkOffline(true); }
  };
  window.addEventListener('online', backgroundCheck);
  window.addEventListener('offline', () => checkOffline());
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

function bindInstallPrompt(button) {
  const help = document.getElementById('install-help');
  const standalone = matchMedia('(display-mode: standalone)');
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  let prompt = null;
  let installed = standalone.matches || navigator.standalone === true;
  const render = () => {
    button.hidden = installed || !prompt;
    help.hidden = installed;
    help.textContent = prompt ? 'Add Bridge Lab to your home screen.'
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
}
