import { test, expect } from '@playwright/test';
import { createTrainingPractice, applyPracticeBid, advanceAsker, practiceView, practiceRoute, repeatsPracticeRoute } from '../practice.js';
import { applyBid } from '../core.js';
import { createHandRecord, HAND_HISTORY_KEY } from '../hand-history.js';
import { openingPartnerBid } from '../opening-practice.js';
import { chooseOpeningFamily } from '../opening-system.js';
import { settings,selectSetting,closeSheets,newHand,clickBid,fitsScreen } from './helpers.mjs';
const key='bridge-lab.relay-progress.v1';
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
const seeds=new Map();
function seedFor(family,seat) {
  const key=family+seat;if(seeds.has(key))return seeds.get(key);
  for(let i=0;i<4096;i++) {
    const uuid=`mixed-whole-browser-${i}`,seed=`relay-${uuid}`;
    if(chooseOpeningFamily('all',seed)!==family)continue;
    const s=createTrainingPractice({auctionMode:true,openingFamily:'all',seed});
    if (family === 'PH' && !s.opening) continue;
    if(s.wholeAuction.humanSeat===seat){seeds.set(key,uuid);return uuid;}
  }
  throw new Error('Missing opening fixture seed');
}
async function ready(page,previousSeed) {
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);await expect(page.locator('#new-deal')).toBeEnabled();
  if(previousSeed)await expect.poll(async()=>(await saved(page))?.session.seed).not.toBe(previousSeed);
  return saved(page);
}
async function expectMixed(page,family,seat) {
  const progress=await ready(page),s=progress.session;
  expect(progress.preferences.practiceMode).toBe('mixed');expect(progress.preferences.studyProfileId).toBe('');
  expect(s.wholeAuction.humanSeat).toBe(seat);
  if (family === 'PH') expect(s.wholeAuction.passedHand).toBe(true);
  else expect(s.wholeAuction.openingBid??'1C').toBe(({NT:'2NT',WNT:'1NT','2C':'2C','2D':'2D','2H':'2H','2S':'2S'})[family]??`1${family}`);
  expect(s.auction.some(c=>c.seat===seat && c.bid!=='Pass')).toBe(false);expect(s.auction.length).toBeLessThanOrEqual(family==='PH'?2:1);expect(s.pendingAsk).toBeNull();
  await expect(page.locator('#role-badge')).toHaveText(`${seat==='North' || family==='PH'?'Opener':'Responder'} · Just bid`);
  await expect(page.locator('#family-settings')).toBeHidden();await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await fitsScreen(page);return progress;
}
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{const original=crypto.randomUUID.bind(crypto);Object.defineProperty(crypto,'randomUUID',{value:()=>window.mixedSeeds?.shift()??original()})});
});

test('Just Bid prefers a new auction route even when the first random deal has different cards', async ({ page }) => {
  const draw = seed => createTrainingPractice({ auctionMode: true, openingFamily: 'all', humanSeat: 'North', seed });
  let completed = draw('relay-variation-24');
  for (let i = 0; !completed.finished && i < 20; i += 1) {
    const view = practiceView(completed);
    const bid = completed.opening ? openingPartnerBid({ ...completed.opening, auction: completed.auction, hand: view.playerHand })
      : completed.practiceRole === 'asker' ? advanceAsker(completed).pendingAsk?.bid ?? 'Pass'
        : applyBid(completed, completed.pendingAsk.bid).auction.at(-1).bid;
    completed = applyPracticeBid(completed, bid);
  }
  expect(completed.finished).toBe(true);
  const record = createHandRecord(completed, [], { id: 'recent-auction-route' });
  const routes = [practiceRoute(record.auction)];
  expect(repeatsPracticeRoute(draw('relay-variation-37'), routes)).toBe(true);
  expect(repeatsPracticeRoute(draw('relay-variation-9'), routes)).toBe(false);
  await page.addInitScript(({ key, historyKey, record, session }) => {
    if (!localStorage.getItem(historyKey)) localStorage.setItem(historyKey, JSON.stringify({ version: 1, records: [record] }));
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, session, history: [], preferences: { practiceMode: 'mixed' } }));
  }, { key, historyKey: HAND_HISTORY_KEY, record, session: draw('relay-variation-14') });
  await page.goto('relay.html');
  await ready(page);
  await page.evaluate(() => { window.mixedSeeds = ['variation-37', 'variation-9']; });
  await newHand(page);
  await expect.poll(async () => (await saved(page)).session.seed).toBe('relay-variation-9');
});
test('Just Bid accepts the reported spade opening on a deal drawn for diamonds', async ({ page }) => {
  const session = {
    ...createTrainingPractice({ auctionMode: true, openingFamily: 'D', seed: 'reported-spade-opening', humanSeat: 'North' }),
    playerHand: 'ST S6 S5 S4 S2 HQ H4 DK DQ D8 D3 D2 CA'.split(' '),
    partnerHand: 'SA S9 S7 HA HT H3 DA DJ D7 D6 D5 CK C2'.split(' '),
  };
  await page.addInitScript(({ key, session }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ version: 1, session, history: [], preferences: { practiceMode: 'mixed' } }));
    }
  }, { key, session });
  await page.goto('relay.html');
  await ready(page);
  const original = (await saved(page)).session;
  await expect(page.locator('#practice-badge')).toHaveText('Opening bid');
  await expect(page.locator('[data-bid="1S"]')).toHaveAttribute('data-discussed', 'true');
  await clickBid(page, '1S');
  await expect(page.locator('#practice-badge')).toHaveText('1♠ · Whole auction');
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  const after = (await saved(page)).session;
  expect(after.auction.map(call => call.bid)).toEqual(['1S', '2C']);
  expect(after.playerHand).toEqual(original.playerHand);
  expect(after.partnerHand).toEqual(original.partnerHand);
  await page.reload();
  await ready(page);
  expect((await saved(page)).session).toEqual(after);
  await page.click('#undo-bid');
  expect((await saved(page)).session).toEqual(original);
});

test('Just bid starts at the opening for both seats, saves every first call, undoes and advances',async({page})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:390,height:844});await page.goto('relay.html');await ready(page);
  const choices=[['C','North'],['D','South'],['H','North'],['NT','South'],['WNT','South'],['2C','South'],['2D','North'],['PH','North'],['PH','South']];
  const queue=choices.map(([f,s])=>seedFor(f,s));await page.evaluate(seeds=>{window.mixedSeeds=seeds},queue);
  await selectSetting(page,'#practice-mode','mixed');
  for(const [i,[family,seat]] of choices.entries()) {
    const initial=await expectMixed(page,family,seat),s=initial.session;
    const bid=openingPartnerBid({...s.opening,auction:s.auction,hand:practiceView(s).playerHand});
    await clickBid(page,bid);await expect(page.locator('#bid-feedback')).toBeEmpty();
    const advanced=await saved(page);expect(advanced.session.auction.length).toBeGreaterThan(s.auction.length);
    await page.reload();await ready(page);expect(await saved(page)).toEqual(advanced);
    await page.click('#undo-bid');expect((await saved(page)).session).toEqual(s);
    await page.evaluate(seeds=>{window.mixedSeeds=seeds},queue.slice(i+1));
    if(i<choices.length-1){await newHand(page);await ready(page,s.seed)}
  }
  await page.setViewportSize({width:320,height:568});await fitsScreen(page);
  await selectSetting(page,'#practice-mode','focused');await ready(page);
  await expect(page.locator('#family-settings')).toBeVisible();
});
test('Just bid replay retains the opening and seat, while New hand draws again',async({page})=>{
  await page.goto('relay.html');await ready(page);
  await page.evaluate(seed=>{window.mixedSeeds=[seed]},seedFor('C','South'));
  await selectSetting(page,'#practice-mode','mixed');const initial=await expectMixed(page,'C','South');
  await settings(page);await page.locator('#study-menu > summary').click();await page.locator('.replay-options > summary').click();
  await page.click('#replay-deal');await ready(page);expect((await saved(page)).session).toEqual(initial.session);
  const nextSeed=seedFor('NT','North');await page.fill('#seed',`relay-${nextSeed}`);await page.click('#replay-deal');await ready(page,initial.session.seed);
  await expectMixed(page,'C','South');await closeSheets(page);
  await page.evaluate(seed=>{window.mixedSeeds=[seed]},nextSeed);await newHand(page);await expectMixed(page,'NT','North');
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

for (const [seat, number, firstBid] of [['North',12,'1D'], ['South',97,'2NT']]) {
  test(`Just bid reaches the Jacoby-style diamond raise from the opening as ${seat}`, async ({page}) => {
    await page.goto('relay.html');
    await ready(page);
    await page.evaluate(seed => { window.mixedSeeds = [seed]; }, `just-bid-diamonds-${number}`);
    await selectSetting(page,'#practice-mode','mixed');
    const initial = await expectMixed(page,'D',seat);
    await clickBid(page,firstBid);
    const relay = (await saved(page)).session;
    expect(relay.familyId).toBe('diamond-2nt-raise');
    expect(practiceView(relay).auction.slice(0,2).map(call=>call.bid)).toEqual(['1D','2NT']);
    expect(practiceView(relay).playerHand).toEqual(practiceView(initial.session).playerHand);
    await page.reload();
    await ready(page);
    expect((await saved(page)).session).toEqual(relay);
    if (seat === 'North') {
      const response = applyBid(relay,'2NT').auction.at(2).bid;
      await clickBid(page,response);
      expect((await saved(page)).session.auction[2].bid).toBe(response);
    } else {
      await clickBid(page,'3NT');
      expect((await saved(page)).session.contract.bid).toBe('3NT');
    }
    await page.click('#undo-bid');
    expect((await saved(page)).session).toEqual(relay);
  });
}
