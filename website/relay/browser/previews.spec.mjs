import { test, expect } from '@playwright/test';
import { practiceCalls, applyPracticeBid, practiceView } from '../practice.js';
import { selectSetting, closeSheets, clickBid, fitsScreen } from './helpers.mjs';

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('bridge-lab.relay-progress.v1')));
async function ready(page) {
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#dds-status')).toHaveText('DDS ready');
}
async function initial(page, role) {
  await page.goto('relay.html');
  await ready(page);
  if (role === 'teller') {
    await selectSetting(page, '#practice-role', role);
    await ready(page);
    await closeSheets(page);
  }
  return (await saved(page)).session;
}

for (const role of ['asker', 'teller']) {
  test(`every legal ${role} call is enabled with only undiscussed calls marked`, async ({ page }) => {
    const session = await initial(page, role);
    const calls = practiceCalls(session);
    expect(await page.locator('#bid-options [data-bid]').evaluateAll(nodes => nodes.map(n => n.dataset.bid).sort()))
      .toEqual(calls.map(call => call.bid).sort());
    for (let level = 1; level <= 7; level++) {
      const tab = page.locator(`[data-level="${level}"]`);
      const levelCalls = calls.filter(call => call.bid[0] === String(level));
      if (!levelCalls.length) { await expect(tab).toBeDisabled(); continue; }
      await tab.click();
      for (const call of levelCalls) {
        const button = page.locator(`[data-bid="${call.bid}"]`);
        await expect(button).toBeVisible();
        await expect(button).toBeEnabled();
        await expect(button).toHaveAttribute('data-discussed', String(call.discussed));
        if (call.discussed) await expect(button).not.toHaveClass(/is-undiscussed/);
        else await expect(button).toHaveClass(/is-undiscussed/);
      }
    }
    await expect(page.locator('[data-bid="Pass"]')).toBeEnabled();
    expect((await saved(page)).session).toEqual(session);
    await fitsScreen(page);
  });

  test(`an undiscussed ${role} bid pauses, saves and undoes without revealing cards`, async ({ page }) => {
    const session = await initial(page, role);
    const call = practiceCalls(session).find(call => !call.discussed && call.bid !== 'Pass');
    const hand = await page.locator('#player-hand').innerHTML();
    await clickBid(page, call.bid);
    const next = (await saved(page)).session;
    expect(next.undiscussedBid).toBe(call.bid);
    expect(next.revealed).toBe(false);
    expect(next.auction.slice(0, -1)).toEqual(practiceView(session).auction);
    expect(next.auction.at(-1).seat).toBe(practiceView(session).playerSeat);
    expect(next.constraints).toEqual(session.constraints);
    await expect(page.locator('#table-state')).toHaveText('Undiscussed');
    await expect(page.locator('#review-actions')).toBeVisible();
    await expect(page.locator('#partner-hand .card-backs')).toHaveCount(1);
    expect(await page.locator('#player-hand').innerHTML()).toBe(hand);
    await page.reload();
    await ready(page);
    expect((await saved(page)).session).toEqual(next);
    await page.click('#undo-bid');
    expect((await saved(page)).session).toEqual(session);
    await expect(page.locator('#bidding-controls')).toBeVisible();
    await fitsScreen(page);
  });
}

test('hover, keyboard focus and held/cancelled touches preview without committing', async ({ page, isMobile, browserName }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  let session = await initial(page, 'asker');
  const button = page.locator('[data-bid="2NT"]');
  const tooltip = page.locator('#bid-preview');
  if (!isMobile) {
    await button.hover();
    await expect(tooltip).toBeVisible();
    await expect(page.locator('#preview-meaning')).toContainText('relay');
    expect((await saved(page)).session).toEqual(session);
    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();
    await button.focus();
    await page.keyboard.press('Tab');
    await expect(tooltip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    expect((await saved(page)).session).toEqual(session);
  }
  for (const mode of ['hold', 'drag', 'cancel']) {
    const bounds = await button.boundingBox();
    const pointer = { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
      clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2 };
    await button.dispatchEvent('pointerdown', pointer);
    if (mode === 'hold') {
      await expect(tooltip).toBeVisible();
      await expect(page.locator('#preview-bid')).toHaveText('2NT');
    } else if (mode === 'drag') {
      await button.dispatchEvent('pointermove', { ...pointer, clientX: pointer.clientX + 20 });
    }
    expect((await saved(page)).session).toEqual(session);
    await button.dispatchEvent(mode === 'cancel' ? 'pointercancel' : 'pointerup', { ...pointer, buttons: 0 });
    await button.dispatchEvent('click', { detail: 1 });
    await expect(tooltip).toBeHidden();
    expect((await saved(page)).session).toEqual(session);
  }
  // Android's real touch events also exercise the browser's synthesized click.
  if (isMobile && browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    const bounds = await button.boundingBox();
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expect(tooltip).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(tooltip).toBeHidden();
    expect((await saved(page)).session).toEqual(session);
    await cdp.detach();
  }
  if (isMobile) await button.tap();
  else await button.click();
  expect((await saved(page)).session).toEqual(JSON.parse(JSON.stringify(applyPracticeBid(session, '2NT'))));
  await fitsScreen(page);
});
