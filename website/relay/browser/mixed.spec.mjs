import { test, expect } from '@playwright/test';
import { AUCTION_FAMILIES, auctionFamilyForProfile, selectMixedPractice } from '../families.js';
import { applyBid } from '../core.js';
import { availablePracticeActions, practiceView } from '../practice.js';
import { settings, selectSetting, closeSheets, newHand, clickBid, fitsScreen } from './helpers.mjs';

const key = 'bridge-lab.relay-progress.v1';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const label = text => text.replace(/([1-7])(NT|[SHDC])/g, (_, level, suit) => level + ({ S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' })[suit]);

function seedFor(familyId, role) {
  for (let i = 0; i < 4096; i++) {
    const uuid = `mixed-browser-${i}`;
    const selected = selectMixedPractice(`relay-${uuid}`);
    if (auctionFamilyForProfile(selected.profileId).id === familyId && selected.role === role) return uuid;
  }
  throw new Error(`No fixture seed for ${familyId}/${role}`);
}

async function ready(page, previousSeed) {
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  await expect(page.locator('#new-deal')).toBeEnabled();
  if (previousSeed) await expect.poll(async () => (await saved(page))?.session.seed).not.toBe(previousSeed);
  return saved(page);
}

async function expectMixed(page, familyId, role) {
  const progress = await ready(page);
  const session = progress.session;
  expect(progress.preferences.practiceMode).toBe('mixed');
  expect(progress.preferences.studyProfileId).toBe('');
  expect(auctionFamilyForProfile(session.familyId).id).toBe(familyId);
  expect(session.practiceRole).toBe(role);
  await expect(page.locator('#practice-mode')).toHaveValue('mixed');
  await expect(page.locator('#role-badge')).toHaveText(`${role === 'asker' ? 'Asker' : 'Teller'} · Just bid`);
  await expect(page.locator('#practice-badge')).toHaveText(label(AUCTION_FAMILIES.find(f => f.id === familyId).name));
  await expect(page.locator('#family-settings')).toBeHidden();
  await expect(page.locator('#study-branch-field')).toBeHidden();
  const view = practiceView(session);
  expect(await page.locator('#player-hand [data-card]').evaluateAll(cards => cards.map(card => card.dataset.card).sort()))
    .toEqual(view.playerHand.slice().sort());
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await expect(page.locator('#player-seat')).toContainText(view.playerSeat);
  expect(Boolean(session.pendingAsk)).toBe(role === 'teller');
  await fitsScreen(page);
  return progress;
}

test.beforeEach(async ({ page }) => {
  // Control the entropy source, not the application's selection or deal logic.
  await page.addInitScript(() => {
    const randomUUID = crypto.randomUUID.bind(crypto);
    Object.defineProperty(crypto, 'randomUUID', { value: () => window.mixedSeeds?.shift() ?? randomUUID() });
  });
});

test('Just bid draws new families and roles, bids, restores, undoes and advances from completion', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('relay.html');
  await ready(page);
  await settings(page);
  await page.locator('#study-menu > summary').click();
  await selectSetting(page, '#profile', 'major-S');
  await ready(page);
  const choices = [['jacoby', 'asker'], ['dappleton', 'teller'], ['horton', 'teller'], ['reordered-rebid', 'asker']];
  const seeds = choices.map(([family, role]) => seedFor(family, role));
  await page.evaluate(seeds => { window.mixedSeeds = seeds; }, seeds);
  await selectSetting(page, '#practice-mode', 'mixed');
  await ready(page);
  await expect(page.locator('#settings-dialog')).toBeHidden();
  let initial = await expectMixed(page, ...choices[0]);
  await page.screenshot({ path: info.outputPath('just-bid-table.png'), animations: 'disabled' });
  for (const [index, [family, role]] of choices.entries()) {
    if (index) initial = await expectMixed(page, family, role);
    const session = initial.session;
    const bid = role === 'asker' ? availablePracticeActions(session).find(action => action.kind === 'relay').bid
      : applyBid(session, session.pendingAsk.bid).auction[session.auction.length + 1].bid;
    await clickBid(page, bid);
    await expect(page.locator('#bid-feedback')).toBeEmpty();
    const advanced = await saved(page);
    expect(advanced.session.auction.length).toBeGreaterThan(session.auction.length);
    await page.reload();
    await ready(page);
    expect(await saved(page)).toEqual(advanced);
    await page.click('#undo-bid');
    expect((await saved(page)).session).toEqual(session);
    // Reload must not redraw the hand or turn mixed mode into a branch pin.
    await page.evaluate(seeds => { window.mixedSeeds = seeds; }, seeds.slice(index + 1));
    if (index === 0) {
      await clickBid(page, '6S');
      await expect(page.locator('#review-actions')).toBeVisible();
      await page.click('#review-next');
    } else if (index < choices.length - 1) await newHand(page);
    if (index < choices.length - 1) await ready(page, session.seed);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await fitsScreen(page);
  await settings(page);
  await page.screenshot({ path: info.outputPath('just-bid-settings.png'), animations: 'disabled' });
  const mixed = await saved(page);
  await selectSetting(page, '#practice-mode', 'focused');
  const focused = await ready(page, mixed.session.seed);
  expect(focused.preferences.practiceMode).toBe('focused');
  expect(auctionFamilyForProfile(focused.session.familyId).id).toBe('reordered-rebid');
  expect(focused.session.practiceRole).toBe('asker');
  await expect(page.locator('#family-settings')).toBeVisible();
  await selectSetting(page, '#practice-role', 'teller');
  await ready(page, focused.session.seed);
  expect((await saved(page)).session.practiceRole).toBe('teller');
});

test('replay retains the mixed hand and role while the next hand randomizes again', async ({ page }) => {
  await page.goto('relay.html');
  await ready(page);
  await page.evaluate(seed => { window.mixedSeeds = [seed]; }, seedFor('dappleton', 'teller'));
  await selectSetting(page, '#practice-mode', 'mixed');
  const initial = await expectMixed(page, 'dappleton', 'teller');
  await settings(page);
  await page.locator('#study-menu > summary').click();
  await page.locator('.replay-options > summary').click();
  await page.click('#replay-deal');
  await ready(page);
  expect((await saved(page)).session).toEqual(initial.session);
  // Even an entered seed that would select a different family replays this
  // branch and role; only New hand invokes the all-family draw.
  const nextSeed = seedFor('horton', 'asker');
  await page.fill('#seed', `relay-${nextSeed}`);
  await page.click('#replay-deal');
  const replayed = await ready(page, initial.session.seed);
  expect(replayed.session.familyId).toBe(initial.session.familyId);
  expect(replayed.session.practiceRole).toBe('teller');
  expect(replayed.preferences.practiceMode).toBe('mixed');
  await page.evaluate(seed => { window.mixedSeeds = [seed]; }, nextSeed);
  await newHand(page);
  await expectMixed(page, 'horton', 'asker');
});

for (const outcome of ['error', 'stop']) {
  test(`a ${outcome} during mode changes or a mixed deal preserves the previous hand and scope`, async ({ page }) => {
    await page.addInitScript(() => {
      const NativeWorker = Worker;
      window.Worker = class extends NativeWorker {
        postMessage(message, ...rest) {
          if (message.command === 'deal' && window.nextDealOutcome) {
            const outcome = window.nextDealOutcome;
            window.nextDealOutcome = null;
            if (outcome === 'error') queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
              data: { id: message.id, error: 'Injected mixed deal failure' },
            })));
            else window.releaseHeldDeal = () => super.postMessage(message, ...rest);
          } else super.postMessage(message, ...rest);
        }
      };
    });
    await page.goto('relay.html');
    await ready(page);
    await settings(page);
    await page.locator('#study-menu > summary').click();
    await selectSetting(page, '#profile', 'major-S');
    await ready(page);
    async function failDeal(mode) {
      const original = await saved(page);
      await page.evaluate(outcome => { window.nextDealOutcome = outcome; }, outcome);
      if (mode) await selectSetting(page, '#practice-mode', mode);
      else await newHand(page);
      if (outcome === 'stop') {
        await expect(page.locator('#practice-mode')).toBeDisabled();
        // A preference save while dealing must not save the uncommitted mode.
        await page.evaluate(() => document.getElementById('bid-input').dispatchEvent(new Event('input')));
        expect(await saved(page)).toEqual(original);
        await closeSheets(page);
        await page.click('#stop-deal');
        await page.evaluate(() => window.releaseHeldDeal?.());
      } else await expect(page.locator('#status')).toContainText('Injected mixed deal failure');
      await expect(page.locator('#new-deal')).toBeEnabled();
      await expect(page.locator('#practice-mode')).toHaveValue(original.preferences.practiceMode);
      expect(await saved(page)).toEqual(original);
      await page.reload();
      await ready(page);
      expect((await saved(page)).session).toEqual(original.session);
      await expect(page.locator('#practice-mode')).toHaveValue(original.preferences.practiceMode);
    }
    await failDeal('mixed');
    await expect(page.locator('#profile')).toHaveValue('major-S');
    await selectSetting(page, '#practice-mode', 'mixed');
    await ready(page);
    expect((await saved(page)).preferences.practiceMode).toBe('mixed');
    await failDeal();
    await failDeal('focused');
  });
}
