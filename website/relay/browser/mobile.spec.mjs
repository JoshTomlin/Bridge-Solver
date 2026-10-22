import { test, expect } from '@playwright/test';
import { availablePracticeActions } from '../practice.js';
import { applyBid } from '../core.js';
import { selectSetting, closeSheets, clickBid, fitsScreen } from './helpers.mjs';

const progress = page => page.evaluate(() => JSON.parse(localStorage.getItem('bridge-lab.relay-progress.v1')));
const ready = async page => {
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#auction tr').first()).toBeVisible();
};

test('the full bidding screen fits small phones, large phones and landscape', async ({ page, isMobile }, info) => {
  await page.goto('relay.html');
  await ready(page);
  for (const [width, height] of [[320, 568], [360, 640], [375, 667], [390, 844], [412, 915], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await fitsScreen(page);
    const bid = await page.locator('#bid-options .bid-button:not([hidden]):not(:disabled)').first().boundingBox();
    expect(bid.height).toBeGreaterThanOrEqual(44);
    const before = await page.locator('#player-hand').boundingBox();
    if (isMobile) await page.evaluate(() => scrollBy(0, 900));
    else await page.mouse.wheel(0, 900);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    expect((await page.locator('#player-hand').boundingBox()).y).toBe(before.y);
    if ([320, 390, 844].includes(width)) await page.screenshot({ path: info.outputPath(`phone-${width}x${height}.png`) });
  }
});

test('meanings and hand information open on demand without placing a bid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('relay.html');
  await ready(page);
  await expect(page.locator('#dds-status')).toHaveText('DDS ready');
  expect(await page.locator('dialog[open]').count()).toBe(0);
  const original = (await progress(page)).session;
  await page.locator('#auction .auction-call').first().click();
  await expect(page.locator('#bid-meaning-dialog')).toBeVisible();
  await expect(page.locator('#bid-meaning-text')).not.toBeEmpty();
  expect((await progress(page)).session).toEqual(original);
  await page.click('#bid-meaning-dialog [data-close]');
  await page.click('#meanings-open');
  await expect(page.locator('#bid-meanings dd').first()).toBeVisible();
  await page.check('#show-hints');
  await expect(page.locator('#response-steps')).toBeVisible();
  await closeSheets(page);
  await page.getByRole('button', { name: 'Your hand information', exact: true }).click();
  await expect(page.locator('#player-detail .suit-holding')).toHaveCount(4);
  await expect(page.locator('#player-facts')).toContainText('HCP');
  await closeSheets(page);
  await page.getByRole('button', { name: 'Partner hand information', exact: true }).click();
  await expect(page.locator('#partner-hand .card-backs')).toBeVisible();
  await expect(page.locator('#knowledge .constraint-list')).toBeVisible();
  expect((await progress(page)).session).toEqual(original);
  await closeSheets(page);
  await page.click('#assessment-open');
  await expect(page.locator('#contract-tools')).toBeVisible();
  expect((await progress(page)).session).toEqual(original);
  await closeSheets(page);
  await fitsScreen(page);
});

test('a long teller auction keeps bids and all cards on screen through completion and undo', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('relay.html');
  await ready(page);
  await selectSetting(page, '#auction-family', 'dappleton');
  await ready(page);
  await selectSetting(page, '#practice-role', 'teller');
  await ready(page);
  await page.locator('#study-menu > summary').click();
  await selectSetting(page, '#profile', 'dappleton-h-baron-c');
  await ready(page);
  await page.locator('.replay-options > summary').click();
  await page.fill('#seed', 'relay-1');
  await page.click('#replay-deal');
  await expect.poll(async () => (await progress(page)).session.seed).toBe('relay-1');
  await ready(page);
  await closeSheets(page);
  const originalHand = await page.locator('#player-hand').innerHTML();
  let turns = 0;
  for (; turns < 25; turns++) {
    const { session } = await progress(page);
    await fitsScreen(page);
    if (session.finished) break;
    const next = applyBid(session, session.pendingAsk.bid);
    const answer = next.auction.slice(session.auction.length).find(call => call.seat === session.partnerSeat).bid;
    if (turns === 0) {
      const wrong = availablePracticeActions(session).find(action => action.bid !== answer);
      if (wrong) {
        await clickBid(page, wrong.bid);
        await expect(page.locator('#bid-feedback')).toContainText('does not match your hand');
        expect((await progress(page)).session).toEqual(session);
      }
    }
    await clickBid(page, answer);
    expect(await page.locator('#player-hand').innerHTML()).toBe(originalHand);
  }
  expect(turns).toBeLessThan(25);
  const complete = (await progress(page)).session;
  expect(complete.finished).toBe(true);
  expect(complete.auction.length).toBeGreaterThanOrEqual(20);
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(0);
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
  await expect(page.locator('#review-actions')).toBeVisible();
  await expect(page.locator('#bidding-controls')).toBeHidden();
  await expect(page.locator('#earlier-count')).toBeVisible();
  await page.getByRole('button', { name: 'Full auction', exact: true }).click();
  await expect(page.locator('#auction-history .bid')).toHaveCount(complete.auction.length);
  await page.locator('#auction-history .auction-call').first().click();
  await expect(page.locator('#bid-meaning-text')).not.toBeEmpty();
  await closeSheets(page);
  await page.click('#undo-bid');
  await expect(page.locator('#bidding-controls')).toBeVisible();
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(0);
  await fitsScreen(page);
  const restored = (await progress(page)).session;
  await page.reload();
  await ready(page);
  expect((await progress(page)).session).toEqual(restored);
  expect(await page.locator('#player-hand').innerHTML()).toBe(originalHand);
  await fitsScreen(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('#auction tr').count()).toBeGreaterThan(6);
  await fitsScreen(page);
  await page.screenshot({ path: info.outputPath('long-auction-390x844.png') });
});
