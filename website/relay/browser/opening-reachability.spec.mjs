import { test, expect } from '@playwright/test';
import { createTrainingPractice, practiceView } from '../practice.js';
import { clickBid, closeSheets } from './helpers.mjs';

const key = 'bridge-lab.relay-progress.v1';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)),key);
async function start(page, openingFamily, humanSeat, replay) {
  const seed = typeof replay === 'number' ? `opening-audit-${replay}` : replay;
  const session = createTrainingPractice({auctionMode:true, openingFamily, humanSeat, seed});
  await page.addInitScript(({key,progress})=>{
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, {key,progress:{version:1,session,history:[],preferences:{practiceMode:'auction',openingFamily}}});
  await page.goto('relay.html');
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
  return (await saved(page)).session;
}

for (const humanSeat of ['North','South']) test(`1C–1S through the balanced 2C rebid and 3NT request as ${humanSeat}`,async ({page})=>{
  const initial = await start(page,'C',humanSeat,0);
  for (const bid of humanSeat === 'North' ? ['1C','2C'] : ['1S','2D']) await clickBid(page,bid);
  await page.click('#auction [data-call-index="2"]');
  await expect(page.locator('#bid-alternatives')).toContainText('Baron');
  await closeSheets(page);
  const before = await saved(page);
  await page.reload();
  await expect(page.locator('#new-deal')).toBeEnabled();
  await clickBid(page,humanSeat === 'North' ? '3NT' : 'Pass');
  const done = (await saved(page)).session;
  expect(done.contract).toMatchObject({bid:'3NT',declarer:'North'});
  expect(done.auction.map(c=>c.bid)).toEqual(['1C','1S','2C','2D','3NT','Pass']);
  await page.click('#undo-bid');
  const undone = (await saved(page)).session;
  expect(undone).toEqual(before.session);
  expect(practiceView(undone).playerHand).toEqual(practiceView(initial).playerHand);
  expect(practiceView(undone).partnerHand).toEqual(practiceView(initial).partnerHand);
});

test('Horton opener can decline or accept the same club invitation after Undo',async ({page})=>{
  await start(page,'2S','North',83);
  await clickBid(page,'2S');
  await expect.poll(async()=> (await saved(page)).session.pendingAsk?.bid).toBe('4C');
  await clickBid(page,'Pass');
  expect((await saved(page)).session.contract).toMatchObject({bid:'4C',declarer:'South'});
  await page.click('#undo-bid');
  await page.reload();
  await expect(page.locator('#new-deal')).toBeEnabled();
  await clickBid(page,'5C');
  expect((await saved(page)).session.contract).toMatchObject({bid:'5C',declarer:'South'});
});

test('the Horton heart jump reaches 4H to play, then Undo returns to the cue', async ({page}) => {
  await start(page, '2D', 'South', 'horton-jump-8');
  await clickBid(page, '3H');
  const cue = (await saved(page)).session;
  expect(cue.auction.map(call => call.bid)).toEqual(['2D','3H','4D']);
  await page.click('#auction [data-call-index="2"]');
  await expect(page.locator('#bid-meaning-text')).toContainText('Control in diamonds');
  await closeSheets(page);
  await page.reload();
  await expect(page.locator('#new-deal')).toBeEnabled();
  await clickBid(page, '4H');
  expect((await saved(page)).session.contract).toMatchObject({bid:'4H',declarer:'South'});
  await page.click('#undo-bid');
  expect((await saved(page)).session).toEqual(cue);
});

test('the diamond-positive shortage ask shows the source boundary and Undo restores the five rebids', async ({page})=>{
  await start(page,'C','North',20);
  await clickBid(page,'1C');
  await clickBid(page,'2S');
  await expect(page.locator('#action-title')).toContainText('Continuation unconfirmed');
  expect((await saved(page)).session.contract).toBeNull();
  await page.click('#auction [data-call-index="1"]');
  await expect(page.locator('#bid-alternatives')).toContainText(/10[-–]12/);
  await closeSheets(page);
  await page.reload();
  await page.click('#undo-bid');
  expect((await saved(page)).session.auction.map(call=>call.bid)).toEqual(['1C','2C']);
});

test('responder can correct the weak-jump invitation or choose game after Undo', async ({page})=>{
  await start(page,'C','South',4);
  await clickBid(page,'2H');
  await clickBid(page,'3H');
  expect((await saved(page)).session.contract).toMatchObject({bid:'3H',declarer:'South'});
  await page.click('#undo-bid');
  await clickBid(page,'3NT');
  expect((await saved(page)).session.contract).toMatchObject({bid:'3NT',declarer:'North'});
});
