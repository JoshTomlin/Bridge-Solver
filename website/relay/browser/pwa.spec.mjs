import { test, expect } from '@playwright/test';
import { applyBid } from '../core.js';
import { availablePracticeActions } from '../practice.js';
import { selectSetting, closeSheets, clickBid, newHand, fitsScreen } from './helpers.mjs';

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('bridge-lab.relay-progress.v1')));
async function ready(page) {
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  await expect(page.locator('#dds-status')).toHaveText('DDS ready');
}

test('the home-screen launch resumes offline and deals new mixed hands with the real engine available', async ({ page, context, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('relay.html');
  await ready(page);
  await expect(page.locator('#offline-status')).toHaveText('Ready for offline practice.');
  const manifestUrl = await page.locator('link[rel="manifest"]').evaluate(link => link.href);
  const manifest = await (await page.request.get(manifestUrl)).json();
  expect(manifest.display).toBe('standalone');
  const start = new URL(manifest.start_url, manifestUrl).href;
  expect(start).toBe(new URL('relay.html', page.url()).href);
  for (const icon of manifest.icons) {
    const dimensions = await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, new URL(icon.src, manifestUrl).href);
    expect(dimensions).toBe(icon.sizes);
  }
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    const manifestResult = await cdp.send('Page.getAppManifest');
    expect(manifestResult.errors).toEqual([]);
    expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
    await cdp.detach();
  }
  await selectSetting(page, '#practice-mode', 'mixed');
  await ready(page);
  const { session } = await saved(page);
  const bid = session.practiceRole === 'teller'
    ? applyBid(session, session.pendingAsk.bid).auction[session.auction.length + 1].bid
    : availablePracticeActions(session).find(action => action.kind === 'relay').bid;
  await clickBid(page, bid);
  const progress = await saved(page);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  expect(await saved(page)).toEqual(progress);
  await fitsScreen(page);
  await newHand(page);
  await expect.poll(async () => (await saved(page)).session.seed).not.toBe(progress.session.seed);
  const nextProgress = await saved(page);
  expect(nextProgress.preferences.practiceMode).toBe('mixed');
  await page.close();
  const launched = await context.newPage();
  await launched.goto(start + '?from=home-screen');
  await ready(launched);
  expect(await saved(launched)).toEqual(nextProgress);
  expect(await launched.evaluate(async () => {
    try { await fetch('./not-a-relay-page'); return false; } catch { return true; }
  })).toBe(true);
});

test('install is offered only on request and never changes bidding progress', async ({ page }) => {
  await page.goto('relay.html');
  await ready(page);
  const progress = await saved(page);
  await page.evaluate(() => {
    window.installPromptCalls = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { window.installPromptCalls++; };
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    dispatchEvent(event);
  });
  expect(await page.evaluate(() => window.installPromptCalls)).toBe(0);
  await page.click('#settings-open');
  await page.locator('#install-menu > summary').click();
  await page.click('#install-app');
  expect(await page.evaluate(() => window.installPromptCalls)).toBe(1);
  await expect(page.locator('#install-app')).toBeHidden();
  expect(await saved(page)).toEqual(progress);
  await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('#install-title')).toHaveText('App and offline access');
  await closeSheets(page);
  await fitsScreen(page);
});

test('unavailable offline registration does not block ordinary bidding', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'register', { value: async () => { throw new Error('Unavailable'); } });
  });
  await page.goto('relay.html');
  await ready(page);
  await expect(page.locator('#offline-status')).toContainText('Offline download incomplete');
  const before = await saved(page);
  await clickBid(page, '2NT');
  expect((await saved(page)).session.auction.length).toBeGreaterThan(before.session.auction.length);
});
