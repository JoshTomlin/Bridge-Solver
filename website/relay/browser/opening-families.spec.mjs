import { test, expect } from '@playwright/test';
import { createTrainingPractice } from '../practice.js';
import { advanceOpeningPartner } from '../opening-practice.js';
import { clickBid, closeSheets, selectSetting, settings, fitsScreen, newHand } from './helpers.mjs';
const key='bridge-lab.relay-progress.v1';
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
async function ready(page) { await expect(page.locator('#new-deal')).toBeEnabled();await expect(page.locator('#player-hand .playing-card')).toHaveCount(13); }
function fixture(openingFamily,north,south,humanSeat) {
  let session=createTrainingPractice({auctionMode:true,openingFamily,humanSeat:'North',seed:'opening-source-browser'});
  const hands={North:north.split(' '),South:south.split(' ')};
  session={...session,playerHand:hands[session.playerSeat],partnerHand:hands[session.partnerSeat],
    wholeAuction:{...session.wholeAuction,humanSeat},practiceRole:humanSeat===session.playerSeat?'asker':'teller'};
  return advanceOpeningPartner(session);
}
async function load(page,session,openingFamily) {
  await page.addInitScript(({key,progress})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(progress));},
    {key,progress:{version:1,session,history:[],preferences:{practiceMode:'auction',openingFamily}}});
  await page.goto('relay.html');await ready(page);
}

for(const humanSeat of ['North','South']) test(`2NT opening, Muppet and game work as ${humanSeat}, with reload and undo`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const session=fixture('NT','SA SK SQ S2 HA HK H3 DK D4 D2 CJ C8 C7','SJ ST S9 S8 HQ HT H9 DA D8 D6 CQ CT C2',humanSeat);
  await load(page,session,'NT');
  await expect(page.locator('#practice-badge')).toHaveText('2NT · Whole auction');
  const original=(await saved(page)).session;
  if(humanSeat==='North') {
    await clickBid(page,'2NT');
    const before=await saved(page);
    await clickBid(page,'3H');
    await expect(page.locator('#bid-feedback')).toContainText('does not match');
    expect(await saved(page)).toEqual(before);
    await clickBid(page,'3D');
    await clickBid(page,'4S');
  } else {
    await clickBid(page,'3C');
    await page.locator('#auction [data-call-index="1"]').click();
    expect(await page.locator('#bid-alternatives dt').allTextContents()).toEqual(['3♦','3♥','3♠','3NT']);
    await closeSheets(page);
    await clickBid(page,'3H');
    await clickBid(page,'Pass');
  }
  const done=await saved(page);
  expect(done.session.auction.map(call=>call.bid)).toEqual(['2NT','3C','3D','3H','4S','Pass']);
  expect(done.session.contract).toEqual({bid:'4S',level:4,strain:'S',declarer:'North'});
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
  await page.reload();await ready(page);expect(await saved(page)).toEqual(done);
  await page.click('#undo-bid');
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  const restored=(await saved(page)).session;
  expect(restored.playerHand).toEqual(original.playerHand);expect(restored.partnerHand).toEqual(original.partnerHand);
  await page.setViewportSize({width:320,height:568});await fitsScreen(page);
});

test('1D opening reaches the 2NT support rebid, retaining the earlier human bids and saved hands',async({page})=>{
  const session=fixture('D','SQ S2 HK H8 H4 DA DK DQ DJ D9 D6 CQ C2','SA SK S8 HQ HJ HT H9 H7 DT D8 CA CJ C9','South');
  await load(page,session,'D');
  await expect(page.locator('#practice-badge')).toHaveText('1♦ · Whole auction');
  const original=(await saved(page)).session;
  await clickBid(page,'1H');
  expect((await saved(page)).session.auction.map(call=>call.bid)).toEqual(['1D','1H','2NT']);
  await clickBid(page,'3C');
  expect((await saved(page)).session.auction.map(call=>call.bid)).toEqual(['1D','1H','2NT','3C','3D']);
  await page.reload();await ready(page);
  await page.click('#undo-bid');await page.click('#undo-bid');
  const restored=(await saved(page)).session;
  expect(restored.playerHand).toEqual(original.playerHand);expect(restored.partnerHand).toEqual(original.partnerHand);
  expect(restored.auction.map(call=>call.bid)).toEqual(['1D']);
});

test('a human major opener answers the first Jacoby question and keeps their physical hand through the handover',async({page})=>{
  const session=fixture('H','S8 S3 S2 HA HK HJ H8 H7 H6 DQ DT D2 C9','SA SJ S9 HQ HT H9 H5 DA DK D9 CA C7 C4','North');
  await load(page,session,'H');
  const hand=await page.locator('#player-hand').innerHTML();
  await clickBid(page,'1H');
  await expect(page.locator('#action-title')).toHaveText('Your response to 2NT');
  await clickBid(page,'3S');
  const after=(await saved(page)).session;
  expect(after.auction.slice(0,3).map(call=>call.bid)).toEqual(['1H','2NT','3S']);
  expect(await page.locator('#player-hand').innerHTML()).toEqual(hand);
  await page.reload();await ready(page);
  expect(await page.locator('#player-hand').innerHTML()).toEqual(hand);
  await page.click('#undo-bid');await page.click('#undo-bid');
  expect((await saved(page)).session.auction).toEqual([]);
});

test('opening-family selection, mixed openings, seed replay and reopening retain their settings',async({page})=>{
  await page.goto('relay.html');await ready(page);
  await selectSetting(page,'#practice-mode','auction');await ready(page);
  for(const [family,allowed] of [['D',['1D']],['M',['1H','1S']],['NT',['2NT']],['all',['1C','1D','1H','1S','2NT']]]) {
    await selectSetting(page,'#opening-family',family);await ready(page);
    const first=await saved(page);
    expect(first.preferences.openingFamily).toBe(family);
    expect(allowed).toContain(first.session.wholeAuction.openingBid??'1C');
    await page.reload();await ready(page);
    await settings(page);await expect(page.locator('#opening-family')).toHaveValue(family);
    await page.locator('#study-menu > summary').click();
    await page.locator('.replay-options > summary').click();
    await page.click('#replay-deal');await ready(page);
    expect((await saved(page)).session).toEqual(first.session);
    await closeSheets(page);
    await newHand(page);await ready(page);
    expect((await saved(page)).preferences.openingFamily).toBe(family);
  }
  await fitsScreen(page);
});
