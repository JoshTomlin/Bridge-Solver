import {test,expect} from '@playwright/test';
import {createTrainingPractice} from '../practice.js';
import {applyNtOpeningCall} from '../nt-opening.js';
import {clickBid,closeSheets,fitsScreen} from './helpers.mjs';

const key='bridge-lab.relay-progress.v1';
const north='SA SK S2 HA H3 DK D4 D2 CK CQ CJ C8 C7'.split(' ');
const south='SQ SJ S9 S8 HQ HT DA D8 CA CT C9 C6 C5'.split(' ');
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
async function ready(page){await expect(page.locator('#new-deal')).toBeEnabled();await expect(page.locator('#player-hand .playing-card')).toHaveCount(13)}
function fixture(humanSeat) {
  const base=createTrainingPractice({auctionMode:true,openingFamily:'NT',humanSeat:'North',seed:'nt-browser-deep'});
  let session={...base,playerHand:south,partnerHand:north,wholeAuction:{...base.wholeAuction,humanSeat},practiceRole:humanSeat==='South'?'asker':'teller'};
  for(const bid of (humanSeat==='South'?['2NT']:['2NT','3S','4H','4NT']))session=applyNtOpeningCall(session,bid);
  return session;
}
async function load(page,session) {
  await page.addInitScript(({key,session})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,session,history:[],preferences:{practiceMode:'auction',openingFamily:'NT'}}))},{key,session});
  await page.goto('relay.html');await ready(page);
}

test('2NT minor Stayman reaches keycards and queen on a phone, with real alternatives, reload and undo',async({page})=>{
  await page.setViewportSize({width:390,height:844});await load(page,fixture('South'));
  const hand=await page.locator('#player-hand').innerHTML();
  await clickBid(page,'3S');const initial=await saved(page);
  await expect(page.locator('[data-bid="4NT"]')).toHaveAttribute('data-discussed','true');
  await clickBid(page,'4NT');
  expect((await saved(page)).session.auction.map(c=>c.bid)).toEqual(['2NT','3S','4H','4NT','5C']);
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await page.locator('#auction [data-call-index="3"]').click();
  expect(await page.locator('#bid-alternatives dt').allTextContents()).toEqual(['5♣','5♦','5♥','5♠']);
  await closeSheets(page);await clickBid(page,'5D');
  const progressed=await saved(page);expect(progressed.session.auction.at(-1).bid).toBe('5S');
  await page.reload();await ready(page);expect(await saved(page)).toEqual(progressed);
  expect(await page.locator('#player-hand').innerHTML()).toBe(hand);
  await page.click('#undo-bid');await page.click('#undo-bid');expect((await saved(page)).session).toEqual(initial.session);
  await page.setViewportSize({width:320,height:568});await fitsScreen(page);
  await clickBid(page,'6C');expect((await saved(page)).session.contract.bid).toBe('6C');
  expect((await saved(page)).session.undiscussedBid).toBeUndefined();
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
});

test('the 2NT opener answers the keycard question themselves and can recover from a wrong response',async({page})=>{
  await page.setViewportSize({width:390,height:844});await load(page,fixture('North'));
  const before=await saved(page),hand=await page.locator('#player-hand').innerHTML();
  await clickBid(page,'5D');await expect(page.locator('#bid-feedback')).toContainText('does not match');
  expect(await saved(page)).toEqual(before);await page.click('#dismiss-bid-feedback');
  await clickBid(page,'5C');
  expect((await saved(page)).session.auction.map(c=>c.bid)).toEqual(['2NT','3S','4H','4NT','5C','5D']);
  await clickBid(page,'5S');const after=await saved(page);
  expect(after.session.auction.at(-1).bid).toBe('6D');
  await page.reload();await ready(page);expect(await saved(page)).toEqual(after);
  expect(await page.locator('#player-hand').innerHTML()).toBe(hand);
  await page.click('#undo-bid');await page.click('#undo-bid');expect((await saved(page)).session).toEqual(before.session);
  await fitsScreen(page);
});

test('4NT following the opposite-minor cue remains diamond keycard rather than ending the auction',async({page})=>{
  const base=fixture('South');
  let session={...base,playerHand:'SQ SJ S9 S8 HQ HT DA DQ DJ DT D9 CA C6'.split(' ')};
  session=applyNtOpeningCall(session,'4C');session=applyNtOpeningCall(session,'4H');
  await load(page,session);await clickBid(page,'4NT');
  const after=await saved(page);
  expect(after.session.auction.map(c=>c.bid)).toEqual(['2NT','4C','4H','4NT','5C']);
  expect(after.session.trump).toBe('D');expect(after.session.finished).toBe(false);
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await page.reload();await ready(page);expect(await saved(page)).toEqual(after);
  await page.click('#undo-bid');expect((await saved(page)).session).toEqual(JSON.parse(JSON.stringify(session)));
});
