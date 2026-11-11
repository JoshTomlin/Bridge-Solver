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
