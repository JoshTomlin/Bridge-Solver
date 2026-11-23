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
async function load(page, humanSeat, openingFamily = 'PH-C', north = 'AQ2 K32 AKQ2 J32', south = 'K43 QJ987 T9 T54') {
  const initial = createPassedPractice({ seed: 'passed-browser', openingFamily, humanSeat, openingSeatNumber: 4 });
  const session = advanceOpeningPartner({ ...initial, playerHand: cards(north), partnerHand: cards(south) });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key, progress: { version: 1, session, history: [], preferences: { practiceMode: 'auction', openingFamily } } });
  await page.goto('relay.html'); await ready(page);
}

for (const humanSeat of ['North', 'South']) test(`passed-hand club game force works in ${humanSeat} role with South display, alternatives and undo`, async ({ page }) => {
  await load(page, humanSeat);
  await expect(page.locator('#practice-badge')).toHaveText(humanSeat === 'North' ? '1♣ · Passed hand' : 'Opening decision');
  const initial = (await saved(page)).session;
  const hand = await page.locator('#player-hand').innerHTML();
  await expect(page.locator('#player-seat')).toContainText('South');
  if (humanSeat === 'North') {
    await clickBid(page, '1C'); // responder's maximum passed hand bids artificial 1D
    await clickBid(page, '1H'); // game force; responder shows five hearts with 2D
    await clickBid(page, '4H');
  } else {
    await clickBid(page, 'Pass');
    await expect(page.locator('#practice-badge')).toHaveText('1♣ · Passed hand');
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

test('the early-seat player can open 2S and undo to choose Pass on the same deal', async ({ page }) => {
  await load(page, 'South', 'PH-D', 'AKQ J98 AQ95 J98', 'J642 6 T862 KQ52');
  const first = (await saved(page)).session;
  await expect(page.locator('#practice-badge')).toHaveText('Opening decision');
  await expect(page.locator('#auction td:nth-child(2) .opponent-pass')).toHaveText('Pass');
  await expect(page.locator('#auction td:nth-child(3) .awaiting-bid')).toHaveCount(1);
  const hand = await page.locator('#player-hand').innerHTML();
  await clickBid(page, '2S');
  await expect(page.locator('#practice-badge')).toHaveText('2♠ · Whole auction');
  await expect(page.locator('#action-title')).toHaveText('Your response to 2NT');
  await page.reload(); await ready(page);
  await expect(page.locator('#action-title')).toHaveText('Your response to 2NT');
  await page.click('#undo-bid');
  expect((await saved(page)).session).toEqual(first);
  await clickBid(page, 'Pass');
  await expect(page.locator('#practice-badge')).toHaveText('1♦ · Passed hand');
  expect((await saved(page)).session.auction.map(call => call.bid)).toEqual(['Pass', '1D']);
  expect(await page.locator('#player-hand').innerHTML()).toEqual(hand);
});

test('partner opens the reported Horton 2S hand in second seat', async ({ page }) => {
  await load(page, 'North', 'PH-S', 'AJ432 9 KT8 QJ54', 'KQ865 62 5 98763');
  await expect(page.locator('#practice-badge')).toHaveText('2♠ · Whole auction');
  await expect(page.locator('#practice-scope')).toContainText('Second-seat opening');
  await expect(page.locator('#auction .opponent-pass').first()).toHaveText('Pass');
  const original = (await saved(page)).session;
  expect(original.auction.map(call => call.bid)).toEqual(['2S']);
  await clickBid(page, 'Pass');
  await expect(page.locator('#action-title')).toHaveText('2♠ · North');
  await page.reload(); await ready(page);
  await page.click('#undo-bid');
  expect((await saved(page)).session).toEqual(original);
});

test('passed opening family, position and vulnerability survive replay and reopening', async ({ page }) => {
  await page.goto('relay.html'); await ready(page);
  await selectSetting(page, '#practice-mode', 'auction'); await ready(page);
  await selectSetting(page, '#opening-family', 'PH-C'); await ready(page);
  await selectSetting(page, '#passed-seat', '4'); await ready(page);
  await selectSetting(page, '#passed-vulnerability', 'v'); await ready(page);
  const first = await saved(page);
  expect(first.session.wholeAuction).toMatchObject({ passedHand: true, openingSeatNumber: 4, vulnerable: true });
  const openingCall = first.session.auction[0];
  const position = first.session.opening?.node === 'first-call' ? 'Second-seat decision'
    : openingCall?.seat === 'South' && openingCall.bid !== 'Pass' ? 'Second-seat opening' : 'Fourth-seat opening';
  await expect(page.locator('#practice-scope')).toContainText(`${position} · Vulnerable`);
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
