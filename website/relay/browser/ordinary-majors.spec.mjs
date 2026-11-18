import {test,expect} from '@playwright/test';
import {createTrainingPractice} from '../practice.js';
import {advanceOpeningPartner} from '../opening-practice.js';
import {clickBid,closeSheets,fitsScreen} from './helpers.mjs';
const key='bridge-lab.relay-progress.v1';
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
async function ready(page){await expect(page.locator('#new-deal')).toBeEnabled();await expect(page.locator('#player-hand .playing-card')).toHaveCount(13)}
async function load(page,m,n,s,humanSeat){
  let session=createTrainingPractice({auctionMode:true,openingFamily:m,humanSeat:'North',seed:'ordinary-browser'});
  session=advanceOpeningPartner({...session,playerHand:n.split(' '),partnerHand:s.split(' '),constraints:[],openingConstraintsBySeat:{North:[],South:[]},
    wholeAuction:{...session.wholeAuction,humanSeat},practiceRole:humanSeat==='North'?'asker':'teller'});
  await page.addInitScript(({key,session,m})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,session,history:[],preferences:{practiceMode:'auction',openingFamily:m}}))},{key,session,m});
  await page.goto('relay.html');await ready(page);
}
for(const humanSeat of ['North','South'])test(`natural diamond response and enquiry as ${humanSeat}, with meanings, reload and undo`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await load(page,'H','SA S7 HK HQ HJ H9 H3 DA D8 D3 CK C8 C3','SQ SJ S9 HA DK DQ DJ DT D9 CQ CT C7 C2',humanSeat);
  const initial=(await saved(page)).session;
  if(humanSeat==='North') {
    await clickBid(page,'1H');await clickBid(page,'2NT');
    const before=await saved(page);await clickBid(page,'3NT');
    await expect(page.locator('#bid-feedback')).toContainText('This bid shows');expect(await saved(page)).toEqual(before);
    await clickBid(page,'3D');await clickBid(page,'Pass');
  }else{
    await clickBid(page,'2D');
    await page.locator('#auction [data-call-index="1"]').click();
    await expect(page.locator('#bid-alternatives')).toContainText('14+ balanced');await closeSheets(page);
    await clickBid(page,'3C');await page.reload();await ready(page);
    await clickBid(page,'5D');
  }
  const done=await saved(page);
  expect(done.session.auction.map(c=>c.bid)).toEqual(['1H','2D','2NT','3C','3D','5D','Pass']);
  expect(done.session.contract.declarer).toBe('South');await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
  await page.reload();await ready(page);expect(await saved(page)).toEqual(done);
  await page.click('#undo-bid');await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  const undone=(await saved(page)).session;expect(undone.playerHand).toEqual(initial.playerHand);expect(undone.partnerHand).toEqual(initial.partnerHand);
  await page.setViewportSize({width:320,height:568});await fitsScreen(page);
});
for(const humanSeat of ['North','South'])test(`three-way club response and declined limit raise as ${humanSeat}`,async({page})=>{
  await load(page,'H','SK HA HJ H9 H6 H2 DQ D8 D5 D2 C9 C8 C3','SA S8 S5 HK H8 H5 DJ D7 D4 CQ CJ C7 C2',humanSeat);
  for(const bid of humanSeat==='North'?['1H','2H']:['2C','Pass'])await clickBid(page,bid);
  expect((await saved(page)).session.auction.map(c=>c.bid)).toEqual(['1H','2C','2H','Pass']);
  await page.reload();await ready(page);await fitsScreen(page);
});
test('heart response to spades, shape enquiry and notrump game',async({page})=>{
  await load(page,'S','SA SK SQ S9 S3 H8 H3 DK D8 D3 CQ C8 C3','SJ S2 HA HQ HJ HT H9 DJ D7 CJ C7 C4 C2','South');
  for(const bid of ['2H','3C','Pass'])await clickBid(page,bid);
  expect((await saved(page)).session.auction.map(c=>c.bid)).toEqual(['1S','2H','2NT','3C','3NT','Pass']);
  await page.reload();await ready(page);await fitsScreen(page);
});

test('1H–1S forces a rebid on the reported hand and the range enquiry survives reopening',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await load(page,'H','S5 S4 HQ HJ H7 H3 H2 DK DQ D8 CA C9 C5','SQ S8 S6 S3 HA H9 H5 DJ D9 D2 CK CJ C2','South');
  const initial=(await saved(page)).session;
  await clickBid(page,'1S');
  expect((await saved(page)).session.auction.map(c=>c.bid)).toEqual(['1H','1S','1NT']);
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await clickBid(page,'2C');
  const progress=await saved(page);
  expect(progress.session.auction.map(c=>c.bid)).toEqual(['1H','1S','1NT','2C','2H']);
  await page.reload();await ready(page);expect(await saved(page)).toEqual(progress);
  await page.click('#undo-bid');await page.click('#undo-bid');
  expect((await saved(page)).session).toEqual(initial);
  await fitsScreen(page);
});

test('1S–2H–2S lets the reported hand show four diamonds and get a reply',async({page})=>{
  await load(page,'S','SA SJ ST S9 S7 S2 HQ H3 DA D8 CJ C8 C5','SQ S6 HK HJ HT H6 H5 H4 DK DQ DJ D3 C7','South');
  await clickBid(page,'2H');
  await expect(page.locator('[data-bid="3D"]')).toHaveAttribute('data-discussed','true');
  await clickBid(page,'3D');
  expect((await saved(page)).session.auction.map(c=>c.bid)).toEqual(['1S','2H','2S','3D','3H']);
  await expect(page.locator('#partner-cards .face-down-card')).toHaveCount(13);
  await clickBid(page,'Pass');
  expect((await saved(page)).session.contract.bid).toBe('3H');
  await expect(page.locator('#partner-cards [data-card]')).toHaveCount(13);
});
