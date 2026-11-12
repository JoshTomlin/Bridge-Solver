import { test, expect } from '@playwright/test';
import { createTrainingPractice } from '../practice.js';
import { closeSheets } from './helpers.mjs';

test('old support bids show their meaning and alternatives; opening shows meaning alone', async ({ page }) => {
  const session = JSON.parse(JSON.stringify(createTrainingPractice({ profileId: 'split-d-h-1nt', seed: 'entry-popup' })));
  session.auction.forEach(call => { call.meaning = 'Source-defined relay entry'; });
  await page.addInitScript(progress => {
    if (!localStorage.getItem('bridge-lab.relay-progress.v1')) localStorage.setItem('bridge-lab.relay-progress.v1', JSON.stringify(progress));
  }, { version: 1, session, history: [], preferences: {} });
  await page.goto('relay.html');
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  const before = await page.evaluate(() => localStorage.getItem('bridge-lab.relay-progress.v1'));
  await page.click('#auction [data-call-index="2"]');
  await expect(page.locator('#bid-meaning-text')).toHaveText('3 hearts; 11-15');
  await expect(page.locator('#call-alternatives dt.is-played')).toHaveText('1NT');
  expect(await page.locator('#call-alternatives').innerText()).not.toContain('Relay entry');
  expect(await page.locator('#bid-alternatives dt').allTextContents()).toEqual(['2♣','2♥']);
  await closeSheets(page);
  await page.click('#auction [data-call-index="1"]');
  await expect(page.locator('#bid-meaning-text')).toContainText('4+ hearts');
  await expect(page.locator('#call-alternatives dt')).toHaveCount(13);
  await closeSheets(page);
  await page.click('#auction [data-call-index="0"]');
  await expect(page.locator('#bid-meaning-text')).toContainText('Diamonds');
  await expect(page.locator('#bid-meaning-dialog .bid-alternatives')).toBeHidden();
  await closeSheets(page);
  expect(await page.evaluate(() => localStorage.getItem('bridge-lab.relay-progress.v1'))).toEqual(before);
  await page.reload();
  await expect(page.locator('#new-deal')).toBeEnabled();
  await page.click('#auction [data-call-index="2"]');
  await expect(page.locator('#bid-meaning-text')).toHaveText('3 hearts; 11-15');
});
