import { test, expect } from '@playwright/test';
import { settings, selectSetting, closeSheets, newHand, clickBid, fitsScreen } from './helpers.mjs';
import { AUCTION_FAMILIES, auctionFamilyForProfile } from '../families.js';
import { applyBid, RANKS, SUITS } from '../core.js';
import { practiceView, availablePracticeActions, practiceCalls } from '../practice.js';

const key = 'bridge-lab.relay-progress.v1';
const symbol = suit => ({ S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' })[suit];
const label = bid => bid.replace(/([1-7])(NT|[SHDC])/g, (_, level, suit) => level + symbol(suit));
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);

async function ready(page, previousSeed) {
  await expect(page.locator('#auction-family option')).toHaveCount(AUCTION_FAMILIES.length);
  await expect(page.locator('#auction tr').first()).toBeVisible();
  await expect(page.locator('#player-hand .suit-holding')).toHaveCount(4);
  await expect(page.locator('#new-deal')).toBeEnabled();
  if (previousSeed) await expect.poll(async () => (await saved(page))?.session.seed).not.toBe(previousSeed);
  return saved(page);
}

async function checkVisibleDeal(page, familyId, role) {
  const progress = await ready(page);
  const { session } = progress;
  expect(auctionFamilyForProfile(session.familyId).id).toBe(familyId);
  expect(session.practiceRole).toBe(role);
  await expect(page.locator('#auction-family')).toHaveValue(familyId);
  await expect(page.locator('#practice-role')).toHaveValue(role);
  await expect(page.locator('#practice-badge')).toHaveText(label(AUCTION_FAMILIES.find(f => f.id === familyId).name));
  const view = practiceView(session);
  const bids = view.auction.filter(call => ['North', 'South'].includes(call.seat)).map(call => label(call.bid));
  expect(await page.locator('#auction-history .bid').allTextContents()).toEqual(bids);
  const visibleBids = await page.locator('#auction .bid').allTextContents();
  expect(visibleBids).toEqual(bids.slice(-visibleBids.length));
  expect(await page.locator('#player-hand .playing-card').evaluateAll(cards => cards.map(card => card.dataset.card).sort())).toEqual([...view.playerHand].sort());
  const holdings = SUITS.map(suit => symbol(suit) + (RANKS.filter(rank => view.playerHand.includes(suit + rank)).join('') || '—'));
  expect(await page.locator('#player-hand .suit-holding').allTextContents()).toEqual(holdings);
  expect(await page.locator('#relay-actions [data-bid], #signoff-actions [data-bid]').evaluateAll(nodes => nodes.map(n => n.dataset.bid).sort()))
    .toEqual(practiceCalls(session).map(action => action.bid).sort());
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);
  return progress;
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page._relayErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page._relayErrors).toEqual([]);
});

test('starts and changes family without Map.groupBy', async ({ page }) => {
  await page.addInitScript(() => { Map.groupBy = undefined; });
  await page.goto('relay.html');
  await ready(page);
  const previous = (await saved(page)).session.seed;
  await selectSetting(page, '#auction-family', 'dappleton');
  await ready(page, previous);
  await checkVisibleDeal(page, 'dappleton', 'asker');
});

test('new page bypasses cached legacy module URLs', async ({ page }) => {
  // A browser may retain any unversioned module from before the family picker.
  // Poison every old JS URL, including transitive imports and both workers.
  const stale = [];
  await page.context().route('**/*.js', route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/assets/')) return route.continue();
    stale.push(url.pathname);
    return route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("Cached pre-family application");' });
  });
  await page.goto('relay.html');
  await ready(page);
  expect(stale).toEqual([]);
  await selectSetting(page, '#auction-family', 'horton');
  await checkVisibleDeal(page, 'horton', 'asker');
  await expect(page.locator('#dds-status')).toHaveText('DDS ready');
  // The same build step versions the play lab's separate worker/engine graph.
  await page.goto('index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#engine-pill')).toHaveClass(/is-ready/);
  await expect(page.locator('#load-deal')).toBeEnabled();
  expect(stale).toEqual([]);
});

for (const role of ['asker', 'teller']) {
  test(`all families deal, bid, undo and restore as ${role}`, async ({ page }) => {
    await page.goto('relay.html');
    await ready(page);
    if (role === 'teller') {
      const previous = (await saved(page)).session.seed;
      await selectSetting(page, '#practice-role', role);
      await ready(page, previous);
    }
    await expect(page.locator('#profile')).toBeHidden();
    await expect(page.locator('#seed')).toBeHidden();
    for (const family of AUCTION_FAMILIES) {
      const previous = (await saved(page)).session.seed;
      await selectSetting(page, '#auction-family', family.id);
      await ready(page, previous);
      const first = await checkVisibleDeal(page, family.id, role);
      expect(first.preferences.studyProfileId).toBe('');
      const before = await page.locator('#auction').innerHTML();
      const hand = await page.locator('#player-hand').innerHTML();
      const session = first.session;
      const bid = role === 'asker'
        ? availablePracticeActions(session).find(action => action.kind === 'relay')?.bid
        : applyBid(session, session.pendingAsk.bid).auction.slice(session.auction.length).find(call => call.seat === session.partnerSeat)?.bid;
      expect(bid).toBeTruthy();
      await clickBid(page, bid);
      await expect(page.locator('#bid-feedback')).toBeEmpty();
      await expect(page.locator('#auction')).not.toHaveJSProperty('innerHTML', before);
      expect(await page.locator('#player-hand').innerHTML()).toBe(hand);
      const advanced = await saved(page);
      await page.reload();
      await checkVisibleDeal(page, family.id, role);
      expect((await saved(page)).session).toEqual(advanced.session);
      await expect(page.locator('#status')).toContainText('Restored your saved bidding progress');
      await closeSheets(page);
      await page.click('#undo-bid');
      expect(await page.locator('#auction').innerHTML()).toBe(before);
      await newHand(page);
      await ready(page, first.session.seed);
      await checkVisibleDeal(page, family.id, role);
      await expect(page.locator('#seed')).toBeHidden();
    }
  });
}

test('every study branch is selectable in both roles', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('relay.html');
  await ready(page);
  await settings(page);
  await page.locator('#study-menu > summary').click();
  let count = 0;
  for (const role of ['asker', 'teller']) {
    if (role === 'teller') {
      const previous = (await saved(page)).session.seed;
      await selectSetting(page, '#practice-role', role);
      await ready(page, previous);
    }
    for (const family of AUCTION_FAMILIES) {
      let previous = (await saved(page)).session.seed;
      await selectSetting(page, '#auction-family', family.id);
      await ready(page, previous);
      expect(await page.locator('#profile option').evaluateAll(options => options.map(option => option.value).sort()))
        .toEqual(['', ...family.profileIds].sort());
      for (const profileId of family.profileIds) {
        previous = (await saved(page)).session.seed;
        await selectSetting(page, '#profile', profileId);
        await ready(page, previous);
        const progress = await checkVisibleDeal(page, family.id, role);
        expect(progress.session.familyId).toBe(profileId);
        expect(progress.preferences.studyProfileId).toBe(profileId);
        await expect(page.locator('#practice-scope')).toHaveText('Branch study');
        count++;
      }
    }
  }
  expect(count).toBe(126);
});

test('study pin, replay, clear and legacy save preserve the right scope', async ({ page }) => {
  await page.goto('relay.html');
  await ready(page);
  await settings(page);
  await page.locator('#study-menu > summary').click();
  let previous = (await saved(page)).session.seed;
  await selectSetting(page, '#profile', 'major-S');
  await ready(page, previous);
  await page.locator('.replay-options > summary').click();
  await page.fill('#seed', 'family-replay-regression');
  await page.click('#replay-deal');
  await expect.poll(async () => (await saved(page)).session.seed).toBe('family-replay-regression');
  await ready(page);
  const replay = (await saved(page)).session;
  await newHand(page);
  await ready(page, replay.seed);
  expect((await saved(page)).session.familyId).toBe('major-S');
  await settings(page);
  await page.fill('#seed', replay.seed);
  await page.click('#replay-deal');
  await expect.poll(async () => (await saved(page)).session.seed).toBe(replay.seed);
  expect((await saved(page)).session).toEqual(replay);
  await page.reload();
  await ready(page);
  await expect(page.locator('#profile')).toHaveValue('major-S');
  await expect(page.locator('#study-menu')).toHaveJSProperty('open', true);
  previous = (await saved(page)).session.seed;
  await selectSetting(page, '#profile', '');
  await ready(page, previous);
  await expect(page.locator('#practice-scope')).toHaveText('Random branch');
  const legacy = await saved(page);
  delete legacy.preferences.studyProfileId;
  await page.evaluate(({ key, legacy }) => localStorage.setItem(key, JSON.stringify(legacy)), { key, legacy });
  await page.reload();
  await ready(page);
  await expect(page.locator('#profile')).toHaveValue('');
  await expect(page.locator('#study-menu')).toHaveJSProperty('open', false);
  expect((await saved(page)).session).toEqual(legacy.session);
});

test('picker works with keyboard and fits a touch viewport', async ({ page, isMobile }) => {
  await page.goto('relay.html');
  await ready(page);
  const previous = (await saved(page)).session.seed;
  await settings(page);
  if (isMobile) {
    await page.locator('#auction-family').tap();
    // Native OS picker internals are outside the browser DOM.
    await selectSetting(page, '#auction-family', 'diamond-notrump');
  } else {
    await page.locator('#auction-family').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  }
  await ready(page, previous);
  await checkVisibleDeal(page, 'diamond-notrump', 'asker');
  await closeSheets(page);
  await fitsScreen(page);
});

for (const outcome of ['error', 'stop']) {
  test(`a deal ${outcome} restores the selected family and saved study branch`, async ({ page }) => {
    await page.addInitScript(() => {
      const NativeWorker = Worker;
      globalThis.Worker = class extends NativeWorker {
        postMessage(message, ...rest) {
          if (message.command === 'deal' && globalThis.nextDealOutcome) {
            const outcome = globalThis.nextDealOutcome;
            globalThis.nextDealOutcome = null;
            if (outcome === 'error') {
              queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
                data: { id: message.id, error: 'Injected deal failure' },
              })));
            } else {
              // Keep this request pending until Stop has actually been tapped.
              // A short timer races menu dismissal on mobile browsers.
              globalThis.releaseHeldDeal = () => super.postMessage(message, ...rest);
            }
          } else super.postMessage(message, ...rest);
        }
      };
    });
    await page.goto('relay.html');
    await ready(page);
    await settings(page);
    await page.locator('#study-menu > summary').click();
    const previous = (await saved(page)).session.seed;
    await selectSetting(page, '#profile', 'major-S');
    await ready(page, previous);
    const original = await saved(page);
    await page.evaluate(outcome => { globalThis.nextDealOutcome = outcome; }, outcome);
    await selectSetting(page, '#auction-family', 'dappleton');
    if (outcome === 'stop') {
      await expect(page.locator('#new-deal')).toBeDisabled();
      await closeSheets(page);
      await page.click('#stop-deal');
      await expect(page.locator('#status')).toContainText('Stopped');
      await page.evaluate(() => globalThis.releaseHeldDeal?.());
    } else {
      await expect(page.locator('#status')).toContainText('Injected deal failure');
    }
    await expect(page.locator('#new-deal')).toBeEnabled();
    await expect(page.locator('#auction-family')).toHaveValue('jacoby');
    await expect(page.locator('#profile')).toHaveValue('major-S');
    await expect(page.locator('#practice-scope')).toHaveText('Branch study');
    expect(await saved(page)).toEqual(original);
    await page.reload();
    await checkVisibleDeal(page, 'jacoby', 'asker');
    await expect(page.locator('#profile')).toHaveValue('major-S');
    await selectSetting(page, '#auction-family', 'dappleton');
    await ready(page, original.session.seed);
    await checkVisibleDeal(page, 'dappleton', 'asker');
  });
}
