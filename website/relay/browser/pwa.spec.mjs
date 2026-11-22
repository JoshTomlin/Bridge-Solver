import { test, expect } from '@playwright/test';
import { practiceView } from '../practice.js';
import { openingPartnerBid } from '../opening-practice.js';
import { selectSetting, closeSheets, clickBid, newHand, fitsScreen } from './helpers.mjs';

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('bridge-lab.relay-progress.v1')));
async function ready(page) {
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  await expect(page.locator('#dds-status')).toHaveText('DDS ready');
}

async function setNextSeed(page, uuid) {
  await page.evaluate(value => {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => value });
  }, uuid);
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
  await setNextSeed(page, 'pwa-mixed-opening-19'); // Ordinary 1C, human opener.
  await selectSetting(page, '#practice-mode', 'mixed');
  await ready(page);
  const { session } = await saved(page);
  expect(session.wholeAuction).toBeTruthy();
  expect(session.auction.some(call => call.seat === session.wholeAuction.humanSeat)).toBe(false);
  const bid = openingPartnerBid({ ...session.opening, auction: session.auction, hand: practiceView(session).playerHand });
  await clickBid(page, bid);
  const progress = await saved(page);
  expect(progress.session.auction.length).toBeGreaterThan(session.auction.length);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  expect(await saved(page)).toEqual(progress);
  await fitsScreen(page);
  await setNextSeed(page, 'pwa-mixed-opening-13'); // Fourth-seat 1D, human responder.
  await newHand(page);
  await expect.poll(async () => (await saved(page)).session.seed).not.toBe(progress.session.seed);
  const nextProgress = await saved(page);
  expect(nextProgress.preferences.practiceMode).toBe('mixed');
  expect(nextProgress.session.wholeAuction).toMatchObject({passedHand:true,openingSeatNumber:4,humanSeat:'South',openingBid:'1D'});
  expect(nextProgress.session.auction.map(({seat,bid})=>[seat,bid])).toEqual([['South','Pass'],['North','1D']]);
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
  await expect(page.locator('#install-title')).toHaveText('App and updates');
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


test('the installed app opens Bridge Lab offline and returns to the same auction', async ({ page, context }) => {
  await page.goto('relay.html');
  await ready(page);
  await expect(page.locator('#offline-status')).toHaveText('Ready for offline practice.');
  await clickBid(page,'2NT');
  const before = await saved(page);
  await context.setOffline(true);
  await page.click('#settings-open');
  await page.getByRole('link',{name:'Open Bridge Lab'}).click();
  await expect(page).toHaveURL(/index\.html$/);
  await expect(page.locator('#engine-pill')).toHaveClass(/is-ready/);
  await expect(page.locator('#table .mini-card').first()).toBeVisible();
  const manifest = new URL(await page.locator('link[rel="manifest"]').getAttribute('href'),page.url());
  expect(manifest.pathname).toMatch(/relay\.webmanifest$/);
  await page.getByRole('link',{name:'Relay practice'}).click();
  await ready(page);
  expect(await saved(page)).toEqual(before);
  await page.click('#undo-bid');
  expect((await saved(page)).session.auction).toHaveLength(before.history.at(-1).auction.length);
});
