import { test, expect } from '@playwright/test';
import { applyBid, availableActions, matchesConstraints } from '../core.js';
import { practiceView, createTrainingPractice, applyPracticeBid } from '../practice.js';
import { shortBidDescription } from '../bid-descriptions.js';
import { clickBid, closeSheets, fitsScreen, selectSetting } from './helpers.mjs';

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('bridge-lab.relay-progress.v1')));
const label = bid => bid.replace(/([1-7])(NT|[SHDC])/g, (_, level, suit) => level + ({ S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' })[suit]);
async function ready(page) {
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#dds-status')).toHaveText('DDS ready');
}
async function turn(page, session) {
  if (session.practiceRole === 'teller') {
    const resolved = applyBid(session, session.pendingAsk.bid);
    await clickBid(page, resolved.auction[session.auction.length + 1].bid);
  } else {
    const actions = availableActions(session).filter(action => !action.playerConstraints
      || matchesConstraints(session.playerHand, action.playerConstraints, action.trump ?? session.trump));
    await clickBid(page, (actions.find(action => action.kind === 'relay') ?? actions.find(action => action.kind === 'signoff')).bid);
  }
  return (await saved(page)).session;
}

test('partner’s compact hand stays face down until completion and hides again on undo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('relay.html');
  await ready(page);
  const original = (await saved(page)).session;
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(0);
  await expect(page.locator('#partner-hcp')).toBeEmpty();
  expect((await page.locator('#player-hand').boundingBox()).height).toBeLessThanOrEqual(67);
  expect((await page.locator('#partner-cards').boundingBox()).height).toBeLessThanOrEqual(45);
  const partner = await page.locator('#partner-cards').boundingBox();
  const auction = await page.locator('.auction-area').boundingBox();
  expect(partner.y + partner.height).toBeLessThanOrEqual(auction.y);
  const final = availableActions(original).find(action => action.kind === 'signoff' && action.bid !== 'Pass');
  await clickBid(page, final.bid);
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(0);
  expect(await page.locator('#partner-cards [data-card]').evaluateAll(cards => cards.map(card => card.dataset.card).sort()))
    .toEqual(practiceView(original).partnerHand.slice().sort());
  await expect(page.locator('#partner-hcp')).toContainText('HCP');
  await fitsScreen(page);
  const complete = await saved(page);
  await page.reload();
  await ready(page);
  expect(await saved(page)).toEqual(complete);
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
  await page.click('#undo-bid');
  expect((await saved(page)).session).toEqual(original);
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(0);
  await fitsScreen(page);
  // Pass completes the actual contract even when its agreement is undiscussed.
  await clickBid(page, 'Pass');
  expect((await saved(page)).session.contract.bid).toBe(original.auction.at(-1).bid);
  expect((await saved(page)).session.revealed).toBe(true);
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
});

for (const role of ['asker', 'teller']) {
  test(`${role} can study an earlier question and response without changing progress`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('relay.html');
    await ready(page);
    if (role === 'teller') {
      await selectSetting(page, '#practice-role', role);
      await ready(page);
      await closeSheets(page);
    }
    const initial = (await saved(page)).session;
    const question = role === 'teller' ? initial.pendingAsk : availableActions(initial).find(action => action.bid === '2NT');
    let session = await turn(page, initial);
    const response = session.auction[initial.auction.length + 1];
    session = await turn(page, session);
    const current = await saved(page);
    const index = initial.auction.length;
    const expected = new Map();
    for (const answer of question.responseLadder) expected.set(answer.bid, expected.has(answer.bid) ? `${expected.get(answer.bid)} / ${answer.label}` : answer.label);
    for (const selected of [index, index + 1]) {
      await page.getByRole('button', { name: 'Full auction', exact: true }).click();
      await page.locator(`#auction-history [data-call-index="${selected}"]`).click();
      await expect(page.locator('#bid-meaning-dialog')).toBeVisible();
      await expect(page.locator('#bid-meaning-text')).toHaveText(label(shortBidDescription(session.auction[selected].meaning)));
      expect(await page.locator('#bid-alternatives dt').allTextContents()).toEqual([...expected.keys()].map(label));
      expect(await page.locator('#bid-alternatives dd').allTextContents()).toEqual([...expected].map(([bid, text]) => label(shortBidDescription(text)) + (bid === response.bid ? 'Played' : '')));
      expect(await page.locator('#alternatives-auction .bid').allTextContents()).toEqual(initial.auction.map(call => label(call.bid)).concat(label(question.bid)));
      await expect(page.locator('#alternatives-auction .awaiting-bid')).toHaveCount(1);
      await expect(page.locator('#alternatives-empty')).toBeHidden();
      if (selected === index + 1) await page.screenshot({ path: info.outputPath('response-alternatives.png') });
      expect(await saved(page)).toEqual(current);
      await closeSheets(page);
    }
    await page.reload();
    await ready(page);
    expect(await saved(page)).toEqual(current);
    await page.getByRole('button', { name: 'Full auction', exact: true }).click();
    await page.locator(`#auction-history [data-call-index="${index + 1}"]`).click();
    await expect(page.locator('#bid-alternatives dt')).toHaveCount(expected.size);
    await closeSheets(page);
    await page.click('#undo-bid');
    await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
    await fitsScreen(page);
  });
}

test('saved keycard questions name their suit, and previews distinguish club, spade and heart agreements', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const initial = createTrainingPractice({ profileId: 'minor-c-h-s', seed: 'keycard-suit-3' });
  const before = applyPracticeBid(initial, '2D');
  const session = JSON.parse(JSON.stringify(applyPracticeBid(before, '3D')));
  const index = before.auction.length;
  session.auction[index].meaning = 'Ask Shortage Keycard';
  const progress = { version: 1, session, history: [initial, before], preferences: {} };
  await page.addInitScript(progress => {
    if (!localStorage.getItem('bridge-lab.relay-progress.v1')) localStorage.setItem('bridge-lab.relay-progress.v1', JSON.stringify(progress));
  }, progress);
  await page.goto('relay.html');
  await ready(page);
  const restored = await saved(page);
  for (const selected of [index, index + 1]) {
    await page.locator(`#auction [data-call-index="${selected}"]`).click();
    await expect(page.locator('#alternatives-question')).toHaveText('Responses to 3♦ · Shortage Keycard in Clubs');
    if (selected === index) {
      await expect(page.locator('#bid-meaning-text')).toHaveText('Shortage Keycard in Clubs');
      await page.screenshot({ path: info.outputPath('keycard-suit.png') });
    }
    expect(await saved(page)).toEqual(restored);
    await closeSheets(page);
  }
  await page.reload();
  await ready(page);
  await page.click('#undo-bid');
  await page.click('#meanings-open');
  for (const suit of ['Clubs', 'Spades', 'Hearts', 'Diamonds']) {
    await expect(page.locator('#bid-meanings')).toContainText(`Shortage Keycard in ${suit}`);
  }
  await closeSheets(page);
  const unbid = await saved(page);
  for (const [bid, suit] of [['3D', 'Clubs'], ['3H', 'Spades'], ['3S', 'Hearts']]) {
    const button = page.locator(`[data-bid="${bid}"]`);
    const bounds = await button.boundingBox();
    const pointer = { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
      clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2 };
    await button.dispatchEvent('pointerdown', pointer);
    await expect(page.locator('#bid-preview')).toBeVisible();
    await expect(page.locator('#preview-meaning')).toHaveText(`Shortage Keycard in ${suit}`);
    await button.dispatchEvent('pointercancel', { ...pointer, buttons: 0 });
    expect(await saved(page)).toEqual(unbid);
  }
  await clickBid(page, '3H');
  expect((await saved(page)).session.trump).toBe('S');
  await page.locator(`#auction [data-call-index="${index}"]`).click();
  await expect(page.locator('#bid-meaning-text')).toHaveText('Shortage Keycard in Spades');
  await closeSheets(page);
  await fitsScreen(page);
});

test('an older pending teller question names the suit in both meanings and study', async ({ page }) => {
  const initial = createTrainingPractice({ profileId: 'minor-c-h-s', seed: 'keycard-suit-3', role: 'teller' });
  const session = JSON.parse(JSON.stringify(applyPracticeBid(initial, '3C')));
  expect(session.pendingAsk.bid).toBe('3D');
  session.pendingAsk.label = 'Ask Shortage Keycard';
  await page.addInitScript(progress => localStorage.setItem('bridge-lab.relay-progress.v1', JSON.stringify(progress)),
    { version: 1, session, history: [initial], preferences: {} });
  await page.goto('relay.html');
  await ready(page);
  const restored = await saved(page);
  await page.click('#meanings-open');
  await expect(page.locator('#action-help')).toHaveText('Shortage Keycard in Clubs');
  await page.check('#show-hints');
  await expect(page.locator('#response-ladders > p')).toHaveText('3♦ · Shortage Keycard in Clubs');
  await closeSheets(page);
  await page.locator(`#auction [data-call-index="${session.auction.length}"]`).click();
  await expect(page.locator('#bid-meaning-text')).toHaveText('Shortage Keycard in Clubs');
  expect((await saved(page)).session).toEqual(restored.session);
});
