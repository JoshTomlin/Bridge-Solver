import { test, expect } from '@playwright/test';
import { createTrainingPractice, applyPracticeBid } from '../practice.js';
import { clickBid, closeSheets } from './helpers.mjs';

test('diamond agreement asks the human’s shortage while keeping South and the same cards through reload and undo', async ({ page }) => {
  const initial = { ...createTrainingPractice({ profileId: 'club-1s-2c-baron', seed: 'baron-fixed-south' }),
    partnerHand: 'SA SQ S2 HK H3 H2 DQ DJ D8 D3 CA CK C8'.split(' '),
    playerHand: 'SK HQ H8 DA DK D9 D5 CQ CT C7 C4 C3 C2'.split(' '),
  };
  const before = applyPracticeBid(initial, '2S');
  await page.addInitScript(progress => {
    const key = 'bridge-lab.relay-progress.v1';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { version: 1, session: before, history: [initial], preferences: { practiceMode: 'focused' } });
  await page.goto('relay.html');
  await expect(page.locator('#player-seat')).toHaveText('South · You · Asker');
  const cards = await page.locator('#player-hand').innerHTML();
  await expect(page.locator('[data-bid="3D"]')).toHaveAttribute('data-discussed', 'true');
  await clickBid(page, '3D');
  await expect(page.locator('#bid-feedback')).toBeEmpty();
  await expect(page.locator('#player-seat')).toHaveText('South · You · Teller');
  await expect(page.locator('#partner-seat')).toHaveText('North · Partner');
  await expect(page.locator('#action-title')).toHaveText('Your response to 3♥');
  await expect(page.locator('#practice-role')).toHaveValue('teller');
  expect(await page.locator('#player-hand').innerHTML()).toBe(cards);
  await clickBid(page, '3S');
  await expect(page.locator('#action-title')).toHaveText('Your response to 4♣');
  await page.reload();
  await expect(page.locator('#player-seat')).toHaveText('South · You · Teller');
  expect(await page.locator('#player-hand').innerHTML()).toBe(cards);
  await page.locator('#auction [data-call-index="3"]').click();
  await expect(page.locator('#alternatives-question')).toContainText('Responses to 2♠');
  await expect(page.locator('#bid-alternatives dt.is-played')).toHaveText('3♣');
  await closeSheets(page);
  await page.click('#undo-bid');
  await expect(page.locator('#action-title')).toHaveText('Your response to 3♥');
  await page.click('#undo-bid');
  await expect(page.locator('#player-seat')).toHaveText('South · You · Asker');
  await expect(page.locator('#practice-role')).toHaveValue('asker');
  expect(await page.locator('#player-hand').innerHTML()).toBe(cards);
});
