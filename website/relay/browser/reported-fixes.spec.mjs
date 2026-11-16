import {test,expect} from '@playwright/test';
import {createTrainingPractice,availablePracticeActions} from '../practice.js';
import {applyBid} from '../core.js';
import {clickBid,selectSetting,closeSheets,fitsScreen} from './helpers.mjs';
const key='bridge-lab.relay-progress.v1';
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
async function ready(page){await expect(page.locator('#new-deal')).toBeEnabled();await expect(page.locator('#player-hand .playing-card')).toHaveCount(13)}
async function load(page,session){await page.addInitScript(({key,session})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,session,history:[],preferences:{}}))},{key,session});await page.goto('relay.html');await ready(page)}
test('Horton 2H–2S is to play, reveals partner and can be undone after reopening',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const initial=createTrainingPractice({profileId:'horton-h',seed:'reported-horton'});await load(page,initial);
  await expect(page.locator('[data-bid="2S"]')).toHaveAttribute('data-discussed','true');
  await clickBid(page,'2S');const done=await saved(page);
  expect(done.session.contract.bid).toBe('2S');expect(done.session.undiscussedBid).toBeUndefined();
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
  await page.reload();await ready(page);expect(await saved(page)).toEqual(done);
  await page.click('#undo-bid');expect((await saved(page)).session).toEqual(JSON.parse(JSON.stringify(initial)));
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);await fitsScreen(page);
});
test('the error banner can be dismissed without changing the hand, and clears on undo and new hands',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  const initial=createTrainingPractice({profileId:'major-S',role:'teller',seed:'dismiss-banner'});await load(page,initial);
  const correct=applyBid(initial,initial.pendingAsk.bid).auction[initial.auction.length+1].bid;
  const wrong=availablePracticeActions(initial).find(a=>a.bid!==correct).bid;
  const before=await saved(page);await clickBid(page,wrong);
  await expect(page.locator('#bid-feedback-banner')).toBeVisible();await expect(page.locator('#dismiss-bid-feedback')).toBeVisible();
  const box=await page.locator('#dismiss-bid-feedback').boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
  await page.click('#dismiss-bid-feedback');await expect(page.locator('#bid-feedback-banner')).toBeHidden();expect(await saved(page)).toEqual(before);
  await clickBid(page,wrong);await clickBid(page,correct);await expect(page.locator('#bid-feedback-banner')).toBeHidden();
  await page.click('#undo-bid');expect((await saved(page)).session).toEqual(before.session);await fitsScreen(page);
  await clickBid(page,wrong);await selectSetting(page,'#practice-mode','mixed');await ready(page);await closeSheets(page);
  await expect(page.locator('#bid-feedback-banner')).toBeHidden();
});


test('an opening Pass is accepted, reveals the passed-out deal and can be undone',async({page})=>{
  const initial=createTrainingPractice({auctionMode:true,openingFamily:'C',humanSeat:'North',seed:'browser-pass-opening'});
  await load(page,initial);await clickBid(page,'Pass');
  expect((await saved(page)).session.passedOut).toBe(true);
  await expect(page.locator('#action-title')).toHaveText('Passed out');
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
  await page.reload();await ready(page);await page.click('#undo-bid');
  expect((await saved(page)).session).toEqual(JSON.parse(JSON.stringify(initial)));
});
