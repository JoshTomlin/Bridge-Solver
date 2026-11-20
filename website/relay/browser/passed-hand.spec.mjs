import { test, expect } from '@playwright/test';
import { createPassedPractice } from '../passed-hand.js';
import { advanceOpeningPartner } from '../opening-practice.js';
import { clickBid, closeSheets, selectSetting, settings, fitsScreen } from './helpers.mjs';

const key = 'bridge-lab.relay-progress.v1';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const cards = text => text.split(' ').flatMap((holding, i) => [...holding].map(rank => 'SHDC'[i] + rank));
async function ready(page) {
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
}
async function load(page, humanSeat) {
  const initial = createPassedPractice({ seed: 'passed-browser', openingFamily: 'PH-C', humanSeat, openingSeatNumber: 4 });
  const session = advanceOpeningPartner({ ...initial,
    playerHand: cards('AQ2 K32 AKQ2 J32'), partnerHand: cards('K43 QJ987 T9 T54') });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key, progress: { version: 1, session, history: [], preferences: { practiceMode: 'auction', openingFamily: 'PH-C' } } });
  await page.goto('relay.html'); await ready(page);
}

for (const humanSeat of ['North', 'South']) test(`passed-hand club game force works in ${humanSeat} role with South display, alternatives and undo`, async ({ page }) => {
  await load(page, humanSeat);
  await expect(page.locator('#practice-badge')).toHaveText('1♣ · Passed hand');
  const initial = (await saved(page)).session;
  const hand = await page.locator('#player-hand').innerHTML();
  await expect(page.locator('#player-seat')).toContainText('South');
  if (humanSeat === 'North') {
    await clickBid(page, '1C'); // responder's maximum passed hand bids artificial 1D
    await clickBid(page, '1H'); // game force; responder shows five hearts with 2D
    await clickBid(page, '4H');
  } else {
    await page.click('#auction [data-call-index="1"]');
    const labels = await page.locator('#bid-alternatives').innerText();
    expect(labels).toContain('Maximum passed hand');
    expect(labels).not.toContain('Four-plus hearts');
    await closeSheets(page);
    await clickBid(page, '1D');
    const before = await saved(page);
    await clickBid(page, '2C');
    await expect(page.locator('#bid-feedback')).toContainText('Four spades');
    expect(await saved(page)).toEqual(before);
    await clickBid(page, '2D');
    await clickBid(page, 'Pass');
  }
  expect((await saved(page)).session.auction.map(call => call.bid)).toEqual(['Pass', '1C', '1D', '1H', '2D', '4H', 'Pass']);
  expect(await page.locator('#player-hand').innerHTML()).toEqual(hand);
  await page.reload(); await ready(page);
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
  await page.click('#undo-bid');
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  const restored = (await saved(page)).session;
  expect(restored.playerHand).toEqual(initial.playerHand);
  expect(restored.partnerHand).toEqual(initial.partnerHand);
  await page.setViewportSize({ width: 320, height: 568 }); await fitsScreen(page);
});

test('passed opening family, position and vulnerability survive replay and reopening', async ({ page }) => {
  await page.goto('relay.html'); await ready(page);
  await selectSetting(page, '#practice-mode', 'auction'); await ready(page);
  await selectSetting(page, '#opening-family', 'PH-C'); await ready(page);
  await selectSetting(page, '#passed-seat', '4'); await ready(page);
  await selectSetting(page, '#passed-vulnerability', 'v'); await ready(page);
  const first = await saved(page);
  expect(first.session.wholeAuction).toMatchObject({ passedHand: true, openingSeatNumber: 4, vulnerable: true });
  await expect(page.locator('#practice-scope')).toContainText('Fourth-seat opening · Vulnerable');
  await settings(page);
  await page.locator('#study-menu > summary').click();
  await page.locator('.replay-options > summary').click();
  await page.click('#replay-deal'); await ready(page);
  expect((await saved(page)).session).toEqual(first.session);
  await page.reload(); await ready(page);
  await settings(page);
  await expect(page.locator('#opening-family')).toHaveValue('PH-C');
  await expect(page.locator('#passed-seat')).toHaveValue('4');
  await expect(page.locator('#passed-vulnerability')).toHaveValue('v');
  await closeSheets(page);
  await page.setViewportSize({ width: 390, height: 844 }); await fitsScreen(page);
});
