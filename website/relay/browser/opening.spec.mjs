import { test, expect } from '@playwright/test';
import { createTrainingPractice } from '../practice.js';
import { clickBid, closeSheets, selectSetting, settings, fitsScreen, newHand } from './helpers.mjs';

const key = 'bridge-lab.relay-progress.v1';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const ready = async page => {
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
};

function fixture(humanSeat) {
  return { ...createTrainingPractice({ auctionMode: true, seed: 'opening-browser', humanSeat }),
    playerHand: 'SK SQ S2 HK H3 DA D9 D4 CA CQ C8 C7 C3'.split(' '),
    partnerHand: 'SA S5 HA HQ HJ H2 DJ DT D8 D7 D3 CJ C6'.split(' ') };
}

for (const humanSeat of ['South', 'North']) {
  test(`${humanSeat} bids the opening choices before entering the relay and restores the same seat and hands`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const session = fixture(humanSeat);
    await page.addInitScript(({ key, session }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, session, history: [], preferences: { practiceMode: 'auction' } }));
    }, { key, session });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('relay.html');
    await ready(page);
    await expect(page.locator('#practice-badge')).toHaveText('1♣ · Whole auction');
    await expect(page.locator('#player-seat')).toContainText(humanSeat);
    await fitsScreen(page);
    if (humanSeat === 'South') {
      await expect(page.locator('#auction .bid')).toHaveCount(1);
      await page.getByRole('button', { name: 'Partner hand information', exact: true }).click();
      await expect(page.locator('#knowledge')).not.toContainText('18/19');
      await closeSheets(page);
      const before = await saved(page);
      await clickBid(page, '1H');
      await expect(page.locator('#bid-feedback')).toContainText('four spades');
      expect(await saved(page)).toEqual(before);
      await clickBid(page, '1D');
      expect((await saved(page)).session.auction.map(call => call.bid)).toEqual(['1C', '1D', '1NT']);
      await page.locator('#auction [data-call-index="0"]').click();
      await expect(page.locator('#bid-meaning-text')).toContainText('14+ balanced');
      await expect(page.locator('#bid-meaning-text')).toContainText('clubs');
      await expect(page.locator('#bid-meaning-dialog .bid-alternatives')).toBeHidden();
      await closeSheets(page);
      await clickBid(page, '3C');
      expect((await saved(page)).session.familyId).toBe('dappleton-h-d-four-major');
      await expect(page.locator('#action-title')).toHaveText('Your response to 3♦');
    } else {
      await expect(page.locator('#auction .bid')).toHaveCount(0);
      await expect(page.locator('#auction .awaiting-bid')).toHaveCount(1);
      await clickBid(page, '1C');
      expect((await saved(page)).session.auction.map(call => call.bid)).toEqual(['1C', '1D']);
      const before = await saved(page);
      await clickBid(page, '1H');
      await expect(page.locator('#bid-feedback')).toContainText('14–17');
      expect(await saved(page)).toEqual(before);
      await clickBid(page, '1NT');
      expect((await saved(page)).session.auction.map(call => call.bid)).toEqual(['1C', '1D', '1NT', '3C']);
      await clickBid(page, '3D');
      await clickBid(page, '6D');
      expect((await saved(page)).session.contract.declarer).toBe('South');
      await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
    }
    const completed = await saved(page);
    await page.reload();
    await ready(page);
    expect(await saved(page)).toEqual(completed);
    await page.click('#undo-bid');
    await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
    await expect(page.locator('#player-seat')).toContainText(humanSeat);
    await page.setViewportSize({ width: 320, height: 568 });
    await fitsScreen(page);
    expect(errors).toEqual([]);
  });
}

test('whole-auction selection, replay and new hands retain the selected mode without a branch pin', async ({ page }) => {
  await page.goto('relay.html');
  await ready(page);
  await selectSetting(page, '#practice-mode', 'auction');
  await ready(page);
  await expect(page.locator('#settings-dialog')).toBeHidden();
  const original = await saved(page);
  expect(original.preferences.practiceMode).toBe('auction');
  expect(original.preferences.studyProfileId).toBe('');
  await settings(page);
  await page.locator('#study-menu > summary').click();
  await page.locator('.replay-options > summary').click();
  await page.click('#replay-deal');
  await ready(page);
  expect((await saved(page)).session).toEqual(original.session);
  await newHand(page);
  await ready(page);
  const next = await saved(page);
  expect(next.session.seed).not.toBe(original.session.seed);
  expect(next.preferences.practiceMode).toBe('auction');
  await selectSetting(page, '#practice-mode', 'focused');
  await ready(page);
  expect((await saved(page)).preferences.practiceMode).toBe('focused');
  await expect(page.locator('#family-settings')).toBeVisible();
});

test('not-implemented continuations pause, keep partner hidden, save and undo', async ({ page }) => {
  await page.addInitScript(({ key, session }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key,
      JSON.stringify({ version: 1, session, history: [], preferences: { practiceMode: 'auction' } }));
  }, { key, session: fixture('South') });
  await page.goto('relay.html');
  await ready(page);
  const initial = await saved(page);
  await clickBid(page, '2D');
  await expect(page.locator('#action-title')).toContainText('Not implemented');
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  expect((await saved(page)).session.coverageBoundary).toBe(true);
  await page.reload();
  await ready(page);
  await page.click('#resume-bidding');
  expect((await saved(page)).session).toEqual(initial.session);
});
