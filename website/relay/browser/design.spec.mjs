import { test, expect } from '@playwright/test';
import { applyBid } from '../core.js';
import { createTrainingPractice, applyPracticeBid } from '../practice.js';
import { auctionCallDetails } from '../auction-study.js';
import { closeSheets, clickBid, fitsScreen } from './helpers.mjs';

const key = 'bridge-lab.relay-progress.v1';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function ready(page) {
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#dds-status')).toHaveText('DDS ready');
}
function longAuction() {
  let session = createTrainingPractice({ profileId: 'dappleton-h-baron-c', role: 'teller', seed: 'relay-1' });
  const states = [];
  for (let turn = 0; !session.finished && turn < 25; turn++) {
    states.push(session);
    const answer = applyBid(session, session.pendingAsk.bid).auction[session.auction.length + 1].bid;
    session = applyPracticeBid(session, answer);
  }
  return { version: 1, session: states.at(-1), history: states.slice(0, -1), preferences: {} };
}

test('a long study auction shows alternatives immediately and expands its full context without changing progress', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const progress = longAuction();
  await page.addInitScript(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key, progress });
  await page.goto('relay.html');
  await ready(page);
  const before = await saved(page);
  // A final-contract question can still be overbid; show those legal levels,
  // rather than a misleading row of illegal one-level calls.
  await expect(page.locator('[data-level="7"]')).toHaveAttribute('aria-pressed', 'true');
  await fitsScreen(page);
  const index = progress.session.auction.length - 1;
  const context = auctionCallDetails(progress.session, progress.history, index);
  await page.locator(`#auction [data-call-index="${index}"]`).click();
  const first = page.locator('#bid-alternatives dt').first();
  await expect(first).toBeVisible();
  const body = await page.locator('#bid-meaning-dialog .sheet-body').boundingBox();
  const bounds = await first.boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(body.y + body.height);
  await expect(page.locator('#alternatives-auction tr')).toHaveCount(2);
  await page.click('#study-context-toggle');
  await expect(page.locator('#study-context-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#alternatives-auction .bid')).toHaveCount(context.auction.length);
  expect(await saved(page)).toEqual(before);
  await page.click('#study-context-toggle');
  await expect(page.locator('#alternatives-auction tr')).toHaveCount(2);
  await closeSheets(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('#auction tr').count()).toBeGreaterThan(6);
  const space = await page.locator('.auction-area').evaluate(area => ({
    height: area.clientHeight, content: area.scrollHeight, bottom: area.scrollHeight - area.scrollTop - area.clientHeight,
  }));
  expect(space.content).toBeGreaterThanOrEqual(space.height);
  expect(space.bottom).toBeLessThanOrEqual(2);
  await fitsScreen(page);
});

test('a storage failure stays visible while bidding and clears after saving recovers', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    let fail = true;
    window.setPracticeStorageFailure = value => { fail = value; };
    Storage.prototype.setItem = function (...args) {
      if (fail) throw new DOMException('Storage blocked', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.goto('relay.html');
  await ready(page);
  await expect(page.locator('#role-badge')).toHaveText('Asker · Not saved');
  await expect(page.locator('#role-badge')).toBeVisible();
  await page.click('#settings-open');
  await expect(page.locator('#save-status')).toContainText('Keep this tab open');
  await closeSheets(page);
  await clickBid(page, '2NT');
  await expect(page.locator('#auction .bid')).toHaveCount(3);
  await expect(page.locator('#role-badge')).toContainText('Not saved');
  await fitsScreen(page);
  await page.evaluate(() => window.setPracticeStorageFailure(false));
  await page.click('#undo-bid');
  await expect(page.locator('#role-badge')).toHaveText('Asker');
  expect((await saved(page)).session.auction).toHaveLength(1);
  await page.reload();
  await ready(page);
  await expect(page.locator('#auction .bid')).toHaveCount(1);
});

test('typed entry stays in the menu and an undiscussed bid has a direct way back to bidding', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('relay.html');
  await ready(page);
  const original = (await saved(page)).session;
  await expect(page.locator('.table-tools .tool-button:visible')).toHaveCount(3);
  await expect(page.locator('#type-bid-open')).toBeHidden();
  if (isMobile) await expect(page.locator('#preview-tip')).toBeVisible();
  else await expect(page.locator('#preview-tip')).toBeHidden();
  await page.click('#settings-open');
  await page.click('#type-bid-open');
  await expect(page.locator('#settings-dialog')).toBeHidden();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.fill('#bid-input', '3C');
  await page.click('#submit-bid');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('#resume-bidding')).toBeVisible();
  await expect(page.locator('#review-hand')).toBeHidden();
  await expect(page.locator('#review-assess')).toBeHidden();
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await fitsScreen(page);
  await page.click('#resume-bidding');
  expect((await saved(page)).session).toEqual(original);
  await expect(page.locator('#bidding-controls')).toBeVisible();
  await fitsScreen(page);
});
