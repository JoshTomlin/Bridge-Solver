import { test, expect } from '@playwright/test';
import { applyBid } from '../core.js';
import { createTrainingPractice, applyPracticeBid } from '../practice.js';
import { closeSheets, fitsScreen } from './helpers.mjs';
function longProgress() {
  let session = createTrainingPractice({ profileId: 'dappleton-h-baron-c', role: 'teller', seed: 'relay-1' });
  const states = [];
  for (let turn = 0; !session.finished && turn < 25; turn++) {
    states.push(session);
    const answer = applyBid(session, session.pendingAsk.bid).auction[session.auction.length+1].bid;
    session = applyPracticeBid(session, answer);
  }
  return { version: 1, session: states.at(-1), history: states.slice(0,-1), preferences: {} };
}
test('long auctions scroll to the opening and back without moving the page or changing progress', async ({ page, context, browserName }, info) => {
  await page.setViewportSize({ width: 390, height: 667 });
  const progress = longProgress();
  await page.addInitScript(progress => {
    if (!localStorage.getItem('bridge-lab.relay-progress.v1')) localStorage.setItem('bridge-lab.relay-progress.v1', JSON.stringify(progress));
  }, progress);
  await page.goto('relay.html');
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#dds-status')).toHaveText('DDS ready');
  const area = page.locator('.auction-area');
  const metrics = () => area.evaluate(node => ({ top: node.scrollTop, max: node.scrollHeight-node.clientHeight }));
  await expect.poll(async () => (await metrics()).max).toBeGreaterThan(100);
  await expect.poll(async () => { const { top,max } = await metrics(); return Math.abs(max-top); }).toBeLessThan(3);
  await expect(page.locator('#auction .auction-call')).toHaveCount(progress.session.auction.length + (progress.session.pendingAsk ? 1 : 0));
  const box = await area.boundingBox();
  const before = await page.evaluate(() => localStorage.getItem('bridge-lab.relay-progress.v1'));
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  if (info.project.name === 'iphone') { await area.focus(); await page.keyboard.press('Home'); }
  else await page.mouse.wheel(0,-2000);
  await expect.poll(async () => (await metrics()).top).toBeLessThan(3);
  await expect(page.locator('#north-heading')).toBeInViewport();
  await expect(page.locator('#auction [data-call-index="0"]')).toBeInViewport();
  await page.click('#auction [data-call-index="0"]');
  await expect(page.locator('#bid-meaning-dialog')).toBeVisible();
  await closeSheets(page);
  expect((await metrics()).top).toBeLessThan(3);
  await page.setViewportSize({ width: 390, height: 700 });
  await expect.poll(async () => (await metrics()).top).toBeLessThan(3);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('bridge-lab.relay-progress.v1'))).toEqual(before);
  if (browserName === 'chromium' && info.project.name === 'android') {
    const client = await context.newCDPSession(page);
    const box = await area.boundingBox();
    const x = box.x+box.width*0.75, y = box.y+box.height*0.8;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x,y }] });
    for (let step = 1; step <= 8; step++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x,y:y-step*24 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await metrics()).top).toBeGreaterThan(50);
    await client.detach();
  }
  await area.hover();
  if (info.project.name === 'iphone') { await area.focus(); await page.keyboard.press('End'); }
  else await page.mouse.wheel(0,2000);
  await expect.poll(async () => { const { top,max } = await metrics(); return Math.abs(max-top); }).toBeLessThan(3);
  await fitsScreen(page);
  await page.screenshot({ path: info.outputPath('scrollable-auction.png') });
});
