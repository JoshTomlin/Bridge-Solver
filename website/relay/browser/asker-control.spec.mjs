import { test, expect } from '@playwright/test';
import { createTrainingPractice, applyPracticeBid } from '../practice.js';
import { closeSheets, clickBid, fitsScreen } from './helpers.mjs';

test('engine readiness keeps the bidding controls connected while a level tap is in progress', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message, ...rest) {
        if (message.type === 'probe') window.releaseDdsProbe = () => super.postMessage(message, ...rest);
        else super.postMessage(message, ...rest);
      }
    };
  });
  await page.goto('relay.html');
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  const level = await page.locator('[data-level="2"]').elementHandle();
  await level.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', button: 0 });
  await page.evaluate(() => window.releaseDdsProbe());
  await expect(page.locator('#dds-status')).toHaveText('DDS ready');
  expect(await level.evaluate(node => node.isConnected)).toBe(true);
  await level.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', button: 0 });
  await level.click();
  await page.locator('[data-bid="2NT"]').click();
  await expect(page.locator('#auction .bid')).toHaveCount(3);
});

test('an asker may pass a saved artificial 3NT reply as an agreed signoff, reveal partner and undo', async ({ page }) => {
  const initial = createTrainingPractice({ profileId: 'rebid-single-h-s', seed: 'asker-control' });
  const session = applyPracticeBid(initial, '3D');
  expect(session.auction.at(-1).bid).toBe('3NT');
  expect(session.threeNTToPlay).toBe(false);
  const progress = { version: 1, session, history: [initial], preferences: {} };
  const key = 'bridge-lab.relay-progress.v1';
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key, progress });
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  const ready = async () => {
    await expect(page.locator('#new-deal')).toBeEnabled();
    await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('relay.html');
  await ready();
  await expect(page.locator('[data-bid="Pass"]')).toHaveAttribute('data-discussed', 'true');
  await page.locator('#auction [data-call-index="4"]').click();
  await expect(page.locator('#bid-meaning-text')).toContainText('Spade shortage');
  await closeSheets(page);
  await clickBid(page, 'Pass');
  const completed = await saved();
  expect(completed.session.contract).toEqual({ bid: '3NT', level: 3, strain: 'NT', declarer: 'North' });
  expect(completed.session.undiscussedBid).toBeUndefined();
  expect(completed.session.constraints).toEqual(JSON.parse(JSON.stringify(session.constraints)));
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
  await expect(page.locator('#resume-bidding')).toBeHidden();
  await page.reload();
  await ready();
  expect(await saved()).toEqual(completed);
  await page.click('#undo-bid');
  expect((await saved()).session).toEqual(JSON.parse(JSON.stringify(session)));
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await fitsScreen(page);
});

test('the whole-auction responder may pass an early Baron answer and restore that choice', async ({ page }) => {
  let session = createTrainingPractice({ auctionMode: true, humanSeat: 'South', seed: 'baron-control' });
  session = { ...session,
    playerHand: 'SK SQ S2 HK H3 DA D9 D8 D4 CA CQ C8 C7'.split(' '),
    partnerHand: 'SA S5 HA HQ HJ H7 H2 DJ DT CJ C6 C5 C4'.split(' ') };
  const history = [];
  for (const bid of ['1D', '2C', '2S']) { history.push(session); session = applyPracticeBid(session, bid); }
  await page.addInitScript(progress => {
    if (!localStorage.getItem('bridge-lab.relay-progress.v1')) localStorage.setItem('bridge-lab.relay-progress.v1', JSON.stringify(progress));
  }, { version: 1, session, history, preferences: { practiceMode: 'auction' } });
  await page.goto('relay.html');
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('[data-bid="Pass"]')).toHaveAttribute('data-discussed', 'true');
  await clickBid(page, 'Pass');
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('bridge-lab.relay-progress.v1')));
  expect(result.session.contract.bid).toBe('2NT');
  expect(result.session.undiscussedBid).toBeUndefined();
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
  await page.reload();
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#action-title')).toHaveText('2NT · North');
  await page.click('#undo-bid');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bridge-lab.relay-progress.v1')).session)).toEqual(JSON.parse(JSON.stringify(session)));
});
