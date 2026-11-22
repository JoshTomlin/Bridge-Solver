import { test, expect } from '@playwright/test';
import { createTrainingPractice } from '../practice.js';

for (const legacy of [false, true]) {
  test(`heart splinter popup names the shortage in a ${legacy ? 'saved legacy' : 'new'} auction`, async ({ page }) => {
    const session = JSON.parse(JSON.stringify(createTrainingPractice({
      profileId: 'rebid-splinter-d-s-h', seed: 'heart-splinter-popup',
    })));
    if (legacy) session.auction.forEach(call => { call.meaning = 'Source-defined relay entry'; });
    await page.addInitScript(progress => {
      const key = 'bridge-lab.relay-progress.v1';
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
    }, { version: 1, session, history: [], preferences: {
      practiceMode: 'focused', studyProfileId: session.familyId,
    } });
    for (let visit = 0; visit < 2; visit++) {
      if (visit) await page.reload();
      else await page.goto('relay.html');
      await page.locator('#auction [data-call-index="2"]').click();
      await expect(page.locator('#bid-meaning-title')).toHaveText('3♦ · North');
      await expect(page.locator('#bid-meaning-text'))
        .toHaveText('Mini–mega splinter in hearts; 4 spades; 11-13 or 17-19');
      await expect(page.locator('#call-alternatives dt.is-played')).toHaveText('3♦');
      await expect(page.locator('#call-alternatives dd.is-played')).toContainText(/heart shortage/i);
      await expect(page.locator('#call-alternatives')).toContainText(/club shortage/i);
    }
  });
}
