import { test, expect } from '@playwright/test';
import { createTrainingPractice, applyPracticeBid } from '../practice.js';
import { clickBid, closeSheets } from './helpers.mjs';

const key = 'bridge-lab.relay-progress.v1';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);

for (const mode of ['focused', 'auction']) for (const major of ['H', 'S']) for (const role of ['asker', 'teller']) {
  test(`balanced Jacoby 14-count uses the first range reply in ${major} as ${role} in ${mode}`, async ({ page }) => {
    const swap = hand => hand.split(' ').map(card => major === 'H' ? card
      : `${card[0] === 'S' ? 'H' : card[0] === 'H' ? 'S' : card[0]}${card[1]}`);
    const focused = {
      ...createTrainingPractice({ major, role, seed: 'screenshot-balanced-jacoby' }),
      partnerHand: swap('SK ST S6 S5 HA HQ HJ H4 H2 DK D5 CJ C4'),
      playerHand: swap('SA SQ SJ S9 HK HT H9 H8 DA DQ D8 C9 C8'),
    };
    let initial = focused;
    if (mode === 'auction') {
      const base = createTrainingPractice({ auctionMode: true, openingFamily: major, humanSeat: 'North', seed: 'screenshot-balanced-whole-auction' });
      const humanSeat = role === 'asker' ? 'South' : 'North';
      initial = applyPracticeBid({ ...base, playerHand: focused.partnerHand, partnerHand: focused.playerHand,
        wholeAuction: { ...base.wholeAuction, humanSeat }, practiceRole: humanSeat === 'North' ? 'asker' : 'teller' }, `1${major}`);
    }
    const shape = applyPracticeBid(initial, role === 'teller' ? '3C' : '2NT');
    await page.addInitScript(({ key, progress }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
    }, { key, progress: { version: 1, session: shape, history: [initial], preferences: {
      practiceMode: mode, ...(mode === 'auction' ? { openingFamily: major } : { studyProfileId: `major-${major}` }),
    } } });
    await page.goto('relay.html');
    await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
    await closeSheets(page);
    if (role === 'teller') {
      const preview = page.locator('[data-bid="3H"]');
      await preview.dispatchEvent('pointerover', { pointerType: 'mouse' });
      await expect(page.locator('#preview-meaning')).toHaveText('12-14');
    }
    await clickBid(page, role === 'teller' ? '3H' : '3D');
    await expect(page.locator('#bid-feedback')).toBeEmpty();
    const ranged = await saved(page);
    expect(ranged.session.auction.at(-1)).toMatchObject({ bid: '3H', meaning: '12–14 HCP' });
    expect(ranged.session.partnerHand).toEqual(shape.partnerHand);
    await page.locator('#auction [data-call-index="3"]').click();
    await expect(page.locator('#bid-alternatives dt')).toHaveText(['3♥', '3♠', '3NT']);
    await expect(page.locator('#bid-alternatives dd')).toHaveText(['12-14Played', '15-17', '18-19']);
    await closeSheets(page);
    if (role === 'teller') expect(ranged.session.pendingAsk.bid).toBe('3S');
    await page.reload();
    await expect(page.locator('#new-deal')).toBeEnabled();
    await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
    expect((await saved(page)).session).toEqual(ranged.session);
    await closeSheets(page);
    await page.click('#undo-bid');
    expect((await saved(page)).session).toEqual(JSON.parse(JSON.stringify(shape)));
  });
}
