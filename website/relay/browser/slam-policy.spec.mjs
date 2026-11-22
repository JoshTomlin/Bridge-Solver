import { test, expect } from '@playwright/test';
import { createTrainingPractice } from '../practice.js';
import { clickBid, fitsScreen } from './helpers.mjs';

const key='bridge-lab.relay-progress.v1';
const own='SA SK SJ ST S9 HA HJ H9 DJ D9 D8 C9 C8'.split(' ');
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
async function ready(page) {
  await expect(page.locator('#new-deal')).toBeEnabled();
  await expect(page.locator('#player-hand .playing-card')).toHaveCount(13);
}

for(const {name,hand,calls,target,grand} of [
  {name:'four without Q stops in game after the queen enquiry',hand:'S8 S7 S6 S5 S3 HQ H7 H4 H3 DA DK CQ CJ',calls:['4C','4H'],target:'4S',grand:0},
  {name:'four plus Q bids small slam',hand:'SQ S8 S6 S5 S2 HK HQ H6 H2 DA D2 CQ C7',calls:['4C','4S'],target:'6S',grand:0},
  {name:'five without Q bids small slam without grand enquiries',hand:'S8 S7 S6 S4 S3 HQ H7 H2 DA DK D2 CA C5',calls:['4D'],target:'6S',grand:0},
  {name:'all five plus Q and positive grand replies reach seven',hand:'SQ S7 S6 S5 S2 H6 H2 DA DQ D4 D3 CA C2',calls:['4H','5D','5NT'],target:'7S',grand:2},
  {name:'all five plus Q declines the grand after a negative reply',hand:'SQ S8 S7 S6 S5 HQ HT H5 DA D7 D5 CA C3',calls:['4H','5C'],target:'6S',grand:1},
]) test(`whole-auction bot: ${name}`,async({page})=>{
  const base=createTrainingPractice({auctionMode:true,openingFamily:'S',humanSeat:'North',seed:'slam-browser'});
  const session={...base,playerHand:hand.split(' '),partnerHand:own};
  await page.addInitScript(({key,session})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,session,history:[],preferences:{practiceMode:'auction',openingFamily:'S'}}));
  },{key,session});
  await page.goto('relay.html');await ready(page);
  const visible=await page.locator('#player-hand').innerHTML();
  for(const bid of ['1S','3C','3H',...calls]) await clickBid(page,bid);
  const planned=(await saved(page)).session;
  expect(planned.pendingAsk.bid).toBe(target);
  expect(planned.pendingAsk.kind).toBe('signoff');
  const tries=planned.auction.filter(call=>/^Grand try:/.test(call.meaning));
  expect(tries).toHaveLength(grand);
  expect(await page.locator('#player-hand').innerHTML()).toEqual(visible);
  await expect(page.locator('#player-seat')).toContainText('South');
  await page.reload();await ready(page);
  expect((await saved(page)).session).toEqual(planned);
  await clickBid(page,'Pass');
  expect((await saved(page)).session.contract.bid).toBe(target);
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
  await page.click('#undo-bid');
  expect((await saved(page)).session).toEqual(planned);
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await page.setViewportSize({width:390,height:844});await fitsScreen(page);
});
