import { expect } from '@playwright/test';

export async function closeSheets(page) {
  while (await page.locator('dialog[open]').count()) {
    const active = await page.evaluate(() => document.activeElement?.closest('dialog')?.id);
    if (active) await page.locator(`#${active} [data-close]`).click();
    else await page.keyboard.press('Escape');
  }
}

export async function settings(page) {
  if (!await page.locator('#settings-dialog').evaluate(dialog => dialog.open)) {
    await closeSheets(page);
    await page.click('#settings-open');
  }
}

export async function selectSetting(page, selector, value) {
  await settings(page);
  await page.selectOption(selector, value);
}

export async function newHand(page) {
  await closeSheets(page);
  await page.click('#new-deal');
}

export async function clickBid(page, bid) {
  await closeSheets(page);
  if (bid !== 'Pass') {
    const level = page.locator(`[data-level="${bid[0]}"]`);
    if (await level.getAttribute('aria-pressed') !== 'true') await level.click();
  }
  await page.locator(`[data-bid="${bid}"]`).click();
}

export async function fitsScreen(page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
    rectangles: ['.table-header', '.practice-table', '.bidding-panel', '.your-hand-block'].map(selector => {
      const { x, y, right, bottom, width, height } = document.querySelector(selector).getBoundingClientRect();
      return { selector, x, y, right, bottom, width, height };
    }),
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height + 1);
  for (const rectangle of dimensions.rectangles) {
    expect(rectangle.x, rectangle.selector).toBeGreaterThanOrEqual(0);
    expect(rectangle.y, rectangle.selector).toBeGreaterThanOrEqual(0);
    expect(rectangle.right, rectangle.selector).toBeLessThanOrEqual(dimensions.width + 1);
    expect(rectangle.bottom, rectangle.selector).toBeLessThanOrEqual(dimensions.height + 1);
    expect(rectangle.width, rectangle.selector).toBeGreaterThan(0);
    expect(rectangle.height, rectangle.selector).toBeGreaterThan(0);
  }
  const [header, tableBounds, bidding, hand] = dimensions.rectangles;
  expect(header.bottom).toBeLessThanOrEqual(tableBounds.y + 1);
  if (dimensions.width > dimensions.height && dimensions.height <= 520) {
    expect(tableBounds.right).toBeLessThanOrEqual(bidding.x + 1);
  } else {
    expect(tableBounds.bottom).toBeLessThanOrEqual(bidding.y + 1);
  }
  expect(bidding.bottom).toBeLessThanOrEqual(hand.y + 1);
  const cards = await page.locator('#player-hand .playing-card').evaluateAll(nodes => nodes.map(node => {
    const { x, y, right, bottom } = node.getBoundingClientRect();
    return { x, y, right, bottom };
  }));
  expect(cards).toHaveLength(13);
  for (const card of cards) {
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.right).toBeLessThanOrEqual(dimensions.width + 1);
    expect(card.bottom).toBeLessThanOrEqual(dimensions.height + 1);
  }
  const visibleCalls = await page.locator('#auction .bid').all();
  const table = await page.locator('.practice-table').boundingBox();
  for (const call of visibleCalls) {
    const bounds = await call.boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(table.y);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(table.y + table.height);
  }
}
