import { test, expect } from '@playwright/test';
import { createTrainingPractice } from '../practice.js';
import { applyOpeningCall } from '../opening-practice.js';
import { clickBid, closeSheets, fitsScreen } from './helpers.mjs';

const key='bridge-lab.relay-progress.v1';
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
async function ready(page){await expect(page.locator('#new-deal')).toBeEnabled();await expect(page.locator('#player-hand .playing-card')).toHaveCount(13)}
function beforeOffer({major='S',points=14,fit=3,humanSeat='South',puppet=true}={}) {
  const base=createTrainingPractice({auctionMode:true,openingFamily:'C',humanSeat:'North',seed:'choice-browser'});
  const swap=hand=>hand.map(card=>major==='S'?card:`${card[0]==='S'?'H':card[0]==='H'?'S':card[0]}${card[1]}`);
  const north=(fit===3?'SK S7 S2 HA H6 H5 DK D9 D4 CK CJ C9 C7':'SK S7 HA H6 H5 DK D9 D4 CK CJ C9 C7 C2').split(' ').map(card=>points===18&&card==='S7'?'SA':card);
  let session={...base,playerHand:swap(north),partnerHand:swap('SQ SJ S8 S6 S5 HQ HT DA DJ D5 D3 CQ C4'.split(' ')),
    wholeAuction:{...base.wholeAuction,humanSeat},practiceRole:humanSeat==='North'?'asker':'teller'};
  for(const bid of ['1C',major==='S'?'1H':'1D',points===18?'1NT':`1${major}`,...(puppet?['2C','2D']:[])])session=applyOpeningCall(session,bid);
  return session;
}
async function load(page,session,history=[]) {
  await page.addInitScript(({key,session,history})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,session,history,preferences:{practiceMode:'auction',openingFamily:'C'}}))},{key,session,history});
  await page.goto('relay.html');await ready(page);
}

for(const options of [
  {major:'S',points:14,fit:3,route:'3NT',target:'4S',declarer:'North'},
  {major:'S',points:14,fit:2,route:'3S',target:'3NT',declarer:'North'},
  {major:'H',points:18,fit:3,route:'3S',target:'4H',declarer:'North'},
  {major:'S',points:18,fit:3,route:'3S',target:'4S',declarer:'South'},
])test(`puppet then ${options.route}, ${options.points}, ${options.major} ${options.fit}-card fit: opener chooses ${options.target}`,async({page})=>{
  const initial=beforeOffer(options);await load(page,initial);
  const hand=await page.locator('#player-hand').innerHTML();
  await clickBid(page,options.route);
  let state=(await saved(page)).session;
  if(!state.finished) {
    expect(state.auction.at(-1).bid).toBe(options.target);
    await page.reload();await ready(page);
    expect((await saved(page)).session).toEqual(state);
    await clickBid(page,'Pass');state=(await saved(page)).session;
  }
  expect(state.contract).toMatchObject({bid:options.target,declarer:options.declarer});
  expect(state.undiscussedBid).toBeUndefined();
  expect(await page.locator('#player-hand').innerHTML()).toEqual(hand);
  await page.locator('#auction [data-call-index="5"]').click();
  const responses=await page.locator('#bid-alternatives dt').allTextContents();
  expect(responses).toEqual(options.route==='3NT'?['Pass',`4${options.major==='S'?'♠':'♥'}`]:['3NT',`4${options.major==='S'?'♠':'♥'}`]);
  await closeSheets(page);
  await page.click('#undo-bid');
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await page.setViewportSize({width:390,height:844});await fitsScreen(page);
});

for(const route of ['3NT','3S'])test(`human opener can choose notrump over ${route} with three-card support`,async({page})=>{
  const before=beforeOffer({humanSeat:'North'}), session=applyOpeningCall(before,route);
  await load(page,session);
  const hand=await page.locator('#player-hand').innerHTML();
  await clickBid(page,route==='3NT'?'Pass':'3NT');
  const done=(await saved(page)).session;
  expect(done.contract).toMatchObject({bid:'3NT',declarer:route==='3S'?'North':'South'});
  expect(done.undiscussedBid).toBeUndefined();
  expect(await page.locator('#player-hand').innerHTML()).toEqual(hand);
  await expect(page.locator('#player-seat')).toContainText('South');
  await page.reload();await ready(page);
  await page.click('#undo-bid');expect((await saved(page)).session).toEqual(JSON.parse(JSON.stringify(session)));
});

test('the 14–17 response menu explains 3D, solid 3H and 3S, and rejects a five-card suit as six',async({page})=>{
  const initial=beforeOffer({puppet:false});await load(page,initial);
  await page.locator('#auction [data-call-index="2"]').click();
  const labels=await page.locator('#bid-alternatives dd').allTextContents();
  expect(labels.some(label=>/3-suited.*heart shortage/i.test(label))).toBe(true);
  expect(labels.some(label=>/Solid 6\+ spades/i.test(label))).toBe(true);
  expect(labels.some(label=>/Request.*3NT/.test(label))).toBe(true);
  await closeSheets(page);
  const before=await saved(page);await clickBid(page,'3H');
  await expect(page.locator('#bid-feedback')).toContainText('six-plus spades');
  expect(await saved(page)).toEqual(before);
});
