import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { buildWebsite, staticFiles } from '../../build.js';

test('offline updates are atomic, keep open auctions alive and work under the GitHub Pages subpath', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'One real service-worker lifecycle check; ordinary offline flows run in every browser.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-update-'));
  const sourceRoot = path.join(temp, 'source');
  for (const file of staticFiles) {
    fs.mkdirSync(path.dirname(path.join(sourceRoot, file)), { recursive: true });
    fs.copyFileSync(fileURLToPath(new URL('../../' + file, import.meta.url)), path.join(sourceRoot, file));
  }
  const wasmSource = fileURLToPath(new URL('../../../build-wasm/wasm', import.meta.url));
  const release = name => buildWebsite({ sourceRoot, wasmSource, destination: path.join(temp, name) });
  const first = release('first');
  fs.appendFileSync(path.join(sourceRoot, 'relay/app.js'), '\n// Next release fixture.\n');
  const second = release('second');
  let current = first, fail = false;
  const server = http.createServer((req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname.replace(/^\/Bridge-Solver\//, '');
    const isFailedAsset = fail && relative === `${second.assetPrefix}/engine/bridge_engine.wasm`;
    const filename = path.join(current.destination, relative);
    if (isFailedAsset || !fs.existsSync(filename)) { res.writeHead(404); res.end('Not found'); return; }
    const type = { '.js': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }[path.extname(filename)];
    res.writeHead(200, { 'Content-Type': type || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(filename));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext();
  try {
    const url = `http://127.0.0.1:${server.address().port}/Bridge-Solver/relay.html`;
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.locator('#offline-status')).toHaveText('Ready for offline practice.');
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.locator('[data-bid="2NT"]').click();
    const saved = await page.evaluate(() => localStorage.getItem('bridge-lab.relay-progress.v1'));
    current = second; fail = true;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      window.installFailed = new Promise(resolve => registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(); });
      }, { once: true }));
      await registration.update();
      await window.installFailed;
    });
    const cacheKeys = await page.evaluate(() => caches.keys());
    expect(cacheKeys.some(key => key.endsWith(first.version))).toBe(true);
    expect(cacheKeys.some(key => key.endsWith(second.version))).toBe(false);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#dds-status')).toHaveText('DDS ready');
    await expect(page.locator('meta[name="relay-build"]')).toHaveAttribute('content', first.version);
    expect(await page.evaluate(() => localStorage.getItem('bridge-lab.relay-progress.v1'))).toBe(saved);
    await context.setOffline(false); fail = false;
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting));
    await expect(page.locator('meta[name="relay-build"]')).toHaveAttribute('content', first.version);
    const next = await context.newPage();
    await next.goto(url);
    await expect(next.locator('#offline-status')).toHaveText('Ready for offline practice.');
    await context.setOffline(true);
    await next.reload();
    await expect(next.locator('#dds-status')).toHaveText('DDS ready');
    await expect(next.locator('meta[name="relay-build"]')).toHaveAttribute('content', second.version);
    expect(await next.evaluate(() => localStorage.getItem('bridge-lab.relay-progress.v1'))).toBe(saved);
    await page.close(); await next.close();
    const reopened = await context.newPage();
    await reopened.goto(url);
    await expect(reopened.locator('#dds-status')).toHaveText('DDS ready');
    await expect.poll(() => reopened.evaluate(() => caches.keys())).not.toContain(`bridge-relay:${new URL('./', url).href}:${first.version}`);
    expect(await reopened.evaluate(() => localStorage.getItem('bridge-lab.relay-progress.v1'))).toBe(saved);
  } finally {
    await context.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
