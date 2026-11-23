import { test, expect } from '@playwright/test';
import { createTrainingPractice, applyPracticeBid } from '../practice.js';
import { revealPractice } from '../core.js';
import { createHandRecord } from '../hand-history.js';
import { closeSheets, clickBid, fitsScreen } from './helpers.mjs';

const progressKey = 'bridge-lab.relay-progress.v1';
const archiveKey = 'bridge-lab.relay-hand-history.v1';
const progress = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), progressKey);
const archive = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), archiveKey);
const ready = async page => {
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect.poll(async () => (await archive(page))?.records.length).toBeGreaterThan(0);
};
const openHistory = async page => {
  await closeSheets(page);
  await page.click('#settings-open');
  await page.click('#open-hand-history');
  await expect(page.locator('#hand-history-dialog')).toBeVisible();
};

test('a completed auction survives the next deal and reload; review and sharing do not change active progress', async ({ page }, info) => {
  const initial = createTrainingPractice({ seed: 'relay-1' });
  const first = applyPracticeBid(initial, '2NT');
  const asked = applyPracticeBid(first, '4C');
  const completed = revealPractice(applyPracticeBid(asked, '6S'));
  await page.addInitScript(({ progressKey, completed, history }) => {
    if (!localStorage.getItem(progressKey)) localStorage.setItem(progressKey, JSON.stringify({ version: 1,
      session: completed, history, preferences: {} }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { window.copiedHand = text; },
    } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.sharedHand = data; } });
  }, { progressKey, completed, history: [initial, first, asked] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('relay.html');
  await ready(page);
  const completedId = (await progress(page)).handId;
  await page.click('#new-deal');
  await expect.poll(async () => (await archive(page)).records.length).toBe(2);
  await page.reload();
  await ready(page);
  const current = await progress(page);
  await openHistory(page);
  await page.locator(`[data-hand-id="${completedId}"]`).click();
  await expect(page.locator('#saved-hand-meta')).toContainText('6♠ by North');
  await expect(page.locator('#saved-hand-cards .suit-holding')).toHaveCount(8);
  await expect(page.locator('#saved-hand-auction .auction-call')).toHaveCount(completed.auction.length);
  await page.locator('#saved-hand-auction [data-recorded-call]').filter({ hasText: '4♣' }).click();
  await expect(page.locator('#bid-meaning-text')).toContainText(/spade/i);
  await expect(page.locator('#bid-alternatives dd').first()).toBeVisible();
  await page.click('#bid-meaning-dialog [data-close]');
  await page.click('#copy-saved-hand');
  await expect(page.locator('#saved-hand-share-status')).toContainText('Copied');
  expect(await page.evaluate(() => window.copiedHand)).toContain('Hand seed: relay-1');
  expect(await page.evaluate(() => window.copiedHand)).toContain('6♠ by North');
  await page.click('#share-saved-hand');
  await expect(page.locator('#saved-hand-share-status')).toHaveText('Shared.');
  expect((await page.evaluate(() => window.sharedHand)).text).toBe(await page.evaluate(() => window.copiedHand));
  expect(await progress(page)).toEqual(current);
  await page.screenshot({ path: info.outputPath('saved-hand-review.png') });
  await closeSheets(page);
  await fitsScreen(page);
});

test('New hand skips completed seeds and identical deals while explicit replay still works', async ({ page }) => {
  const initial = createTrainingPractice({ seed: 'relay-used-seed', profileId: 'major-S' });
  const completed = revealPractice(applyPracticeBid(initial, '4S'));
  const sameCards = createTrainingPractice({ seed: 'relay-repeated-cards', profileId: 'major-S' });
  const previous = createHandRecord(revealPractice(applyPracticeBid(sameCards, '4S')), [sameCards], { id: 'archived-deal' });
  previous.seed = 'relay-different-seed';
  await page.addInitScript(({ progressKey, archiveKey, completed, initial, previous }) => {
    if (!localStorage.getItem(progressKey)) localStorage.setItem(progressKey, JSON.stringify({ version: 1,
      session: completed, history: [initial], handId: 'completed-deal', preferences: { studyProfileId: 'major-S' } }));
    if (!localStorage.getItem(archiveKey)) localStorage.setItem(archiveKey, JSON.stringify({ version: 1, records: [previous] }));
    const original = crypto.randomUUID.bind(crypto);
    Object.defineProperty(crypto, 'randomUUID', { value: () => window.dealSeeds?.shift() ?? original() });
  }, { progressKey, archiveKey, completed, initial, previous });
  await page.goto('relay.html');
  await ready(page);
  await expect.poll(async () => (await archive(page)).records.length).toBe(2);
  await page.reload();
  await ready(page);
  await page.evaluate(() => { window.dealSeeds = ['used-seed', 'repeated-cards', 'fresh-deal']; });
  await page.click('#new-deal');
  await expect.poll(async () => (await progress(page)).session.seed).toBe('relay-fresh-deal');
  expect((await archive(page)).records.filter(record => record.finished)).toHaveLength(2);

  await page.click('#settings-open');
  await page.locator('.replay-options > summary').click();
  await page.fill('#seed', initial.seed);
  await page.click('#replay-deal');
  await expect.poll(async () => (await progress(page)).session.seed).toBe(initial.seed);
  expect((await progress(page)).session.playerHand).toEqual(initial.playerHand);
  expect((await progress(page)).session.partnerHand).toEqual(initial.partnerHand);
});

test('the current hand keeps one record through bid, undo and reload and does not reveal hidden cards in review or text', async ({ page }) => {
  await page.goto('relay.html');
  await ready(page);
  const initial = await progress(page);
  await clickBid(page, '2NT');
  await expect.poll(async () => (await archive(page)).records[0].auction.length).toBeGreaterThan(initial.session.auction.length);
  await page.click('#undo-bid');
  expect((await archive(page)).records).toHaveLength(1);
  expect((await archive(page)).records[0].auction).toHaveLength(initial.session.auction.length);
  await page.reload();
  await ready(page);
  expect((await progress(page)).handId).toBe(initial.handId);
  expect((await archive(page)).records).toHaveLength(1);
  await openHistory(page);
  await page.click('#open-current-hand-record');
  await expect(page.locator('#saved-hand-cards .suit-holding')).toHaveCount(4);
  await expect(page.locator('#saved-hand-cards')).toContainText('Hidden');
  await expect(page.locator('#saved-hand-text')).toHaveValue(/Hidden while this hand is in progress/);
  expect((await progress(page)).session.revealed).toBe(false);
  await closeSheets(page);
  await page.getByRole('button', { name: 'Partner hand information', exact: true }).click();
  await page.click('#reveal-hand');
  await openHistory(page);
  await page.click('#open-current-hand-record');
  await expect(page.locator('#saved-hand-cards .suit-holding')).toHaveCount(8);
  await expect(page.locator('#saved-hand-text')).not.toHaveValue(/Hidden/);
  await closeSheets(page);
  await page.click('#undo-bid');
  await openHistory(page);
  await page.click('#open-current-hand-record');
  await expect(page.locator('#saved-hand-cards .suit-holding')).toHaveCount(4);
  await expect(page.locator('#saved-hand-text')).toHaveValue(/Hidden/);
  expect((await archive(page)).records).toHaveLength(1);
});

test('copy and share fall back to selectable text when browser APIs are unavailable or denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { throw new Error('Clipboard denied'); },
    } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await page.goto('relay.html');
  await ready(page);
  await openHistory(page);
  await page.click('#open-current-hand-record');
  await page.click('#share-saved-hand');
  await expect(page.locator('#saved-hand-text')).toBeVisible();
  await expect(page.locator('#saved-hand-share-status')).toContainText('Select and copy');
  const selection = await page.locator('#saved-hand-text').evaluate(area => area.value.slice(area.selectionStart, area.selectionEnd));
  expect(selection).toContain('Bid explanations');
  await page.click('#copy-saved-hand');
  await expect(page.locator('#saved-hand-text')).toBeFocused();
});

test('history storage failures are visible and do not break bidding or overwrite a good archive', async ({ page }) => {
  await page.goto('relay.html');
  await ready(page);
  const before = await archive(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    window.originalHistorySetItem = original;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, archiveKey);
  await clickBid(page, '2NT');
  await page.click('#settings-open');
  await expect(page.locator('#hand-history-save-status')).toContainText('not being saved');
  expect(await archive(page)).toEqual(before);
  await page.click('#open-hand-history');
  await expect(page.locator('#hand-history-storage')).toContainText('could not be saved');
  await page.click('#open-current-hand-record');
  await expect(page.locator('#saved-hand-auction .auction-call')).toHaveCount((await progress(page)).session.auction.length);
  await closeSheets(page);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalHistorySetItem; });
  await page.click('#undo-bid');
  await openHistory(page);
  await expect(page.locator('#hand-history-storage')).not.toContainText('could not be saved');
  expect((await archive(page)).records).toHaveLength(1);
});

test('saving in one tab retains other hands recorded by another tab', async ({ page, context }) => {
  await page.goto('relay.html');
  await ready(page);
  const originalId = (await progress(page)).handId;
  const other = await context.newPage();
  await other.goto('relay.html');
  await ready(other);
  await other.click('#new-deal');
  await expect.poll(async () => (await archive(other)).records.length).toBe(2);
  const otherId = (await progress(other)).handId;
  await clickBid(page, '2NT');
  expect((await archive(page)).records.map(record => record.id)).toEqual([originalId, otherId]);
  await other.close();
});
