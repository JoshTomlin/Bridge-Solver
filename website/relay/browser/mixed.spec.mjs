import { test, expect } from '@playwright/test';
import { createTrainingPractice,practiceView } from '../practice.js';
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
  expect(s.wholeAuction.humanSeat).toBe(seat);expect(s.wholeAuction.openingBid??'1C').toBe(family==='NT'?'2NT':`1${family}`);
  expect(s.auction.some(c=>c.seat===seat)).toBe(false);expect(s.auction.length).toBeLessThanOrEqual(1);expect(s.pendingAsk).toBeNull();
  await expect(page.locator('#role-badge')).toHaveText(`${seat==='North'?'Opener':'Responder'} · Just bid`);
  await expect(page.locator('#family-settings')).toBeHidden();await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await fitsScreen(page);return progress;
}
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{const original=crypto.randomUUID.bind(crypto);Object.defineProperty(crypto,'randomUUID',{value:()=>window.mixedSeeds?.shift()??original()})});
});
test('Just bid starts at the opening for both seats, saves every first call, undoes and advances',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('relay.html');await ready(page);
  const choices=[['C','North'],['D','South'],['H','North'],['NT','South']];
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
