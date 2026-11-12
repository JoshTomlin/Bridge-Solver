import { test, expect } from '@playwright/test';
import { createTrainingPractice, applyPracticeBid } from '../practice.js';
import { closeSheets } from './helpers.mjs';

const key = 'bridge-lab.relay-progress.v1';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const sourceCalls = ['2♣', '2♦', '2♥', '2♠', '2NT', '3♣', '3♦', '3♥', '3♠', '3NT'];

for (const role of ['asker', 'teller']) {
  test(`club entry and Baron bot choices show source alternatives as ${role}`, async ({ page }) => {
    const initial = createTrainingPractice({ profileId: 'club-1s-1nt-baron', role, seed: 'bot-alternatives' });
    const session = role === 'asker' ? applyPracticeBid(initial, '2S') : initial;
    await page.addInitScript(({ key, progress }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
    }, { key, progress: { version: 1, session, history: [initial], preferences: { practiceMode: 'focused' } } });
    await page.goto('relay.html');
    await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
    const original = await saved(page);
    for (let visit = 0; visit < 2; visit++) {
      if (visit) await page.reload();
      await page.locator('#auction [data-call-index="2"]').click();
      await expect(page.locator('#alternatives-question')).toContainText('Responses to 1NT');
      expect(await page.locator('#bid-alternatives dt').allTextContents()).toEqual(sourceCalls);
      await expect(page.locator('#bid-alternatives dd').nth(6)).toHaveText('6+ clubs; heart shortage');
      await expect(page.locator('#bid-alternatives dt.is-played')).toHaveText('2♠');
      await closeSheets(page);
      await page.locator('#auction [data-call-index="3"]').click();
      await expect(page.locator('#call-alternatives-section')).toBeVisible();
      expect(await page.locator('#call-alternatives dt').allTextContents()).toEqual(expect.arrayContaining(sourceCalls));
      await expect(page.locator('#call-alternatives dt.is-played')).toHaveText('2♠');
      await expect(page.locator('#alternatives-question')).toContainText('Responses to 2♠');
      expect(await page.locator('#bid-alternatives dt').allTextContents()).toEqual(['2NT', '3♣', '3♦', '3NT']);
      await expect(page.locator('#alternatives-empty')).toBeHidden();
      expect(await saved(page)).toEqual(original);
      await closeSheets(page);
    }
  });
}
