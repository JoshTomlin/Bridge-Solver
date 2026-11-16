import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesInitialResponse} from './profile-utils.js';
import {PRACTICE_PROFILES,createPractice,handFeatures,matchesConstraints} from './core.js';
import {createTrainingPractice,applyPracticeBid,advanceAsker,practiceCalls} from './practice.js';
import {savePracticeProgress,loadPracticeProgress} from './progress.js';

test('the reported six-heart/four-spade hand responds 1H to 1D, never the prefilled 1S',()=>{
  const f=handFeatures('SA SK S5 S4 HA HK HJ H9 H5 H4 D9 D8 C4'.split(' '),'S');
  assert.equal(f.hcp,15);
  const prefix=bid=>[{seat:'North',bid:'1D'},{seat:'South',bid}];
  assert.equal(matchesInitialResponse(prefix('1S'),f,'South'),false);
  assert.equal(matchesInitialResponse(prefix('1H'),f,'South'),true);
});

test('all generated entry hands fit the initial response, including reversed Dappleton roles',()=>{
  for(const profile of PRACTICE_PROFILES)for(let i=0;i<12;i++) {
    const s=createPractice({profileId:profile.id,seed:`entry-priorities-${i}`});
    for(const [seat,hand] of [[s.playerSeat,s.playerHand],[s.partnerSeat,s.partnerHand]]) {
      assert.ok(matchesInitialResponse(s.auction,handFeatures(hand,s.trump),seat),profile.id);
    }
    const [open,response]=s.auction;
    if(open.bid==='1D' && ['1H','1S'].includes(response?.bid)) {
      const f=handFeatures(s.playerSeat==='South'?s.playerHand:s.partnerHand,'S');
      const major=response.bid.slice(1),other=major==='S'?'H':'S';
      assert.ok(f.lengths[major]>=f.lengths[other],profile.id);
      if(f.hcp>=14)assert.ok(f.lengths[major]>=5,profile.id);
    }
  }
});

test('Horton 2H–2S is a recognised playable contract, with fixed cards and saved undo',()=>{
  const s=createTrainingPractice({profileId:'horton-h',seed:'natural-horton'});
  assert.equal(practiceCalls(s).find(a=>a.bid==='2S').discussed,true);
  const done=applyPracticeBid(s,'2S');
  assert.deepEqual(done.auction.map(c=>c.bid),['2H','2S','Pass']);
  assert.deepEqual(done.contract,{bid:'2S',level:2,strain:'S',declarer:'South'});
  assert.equal(done.undiscussedBid,undefined);assert.deepEqual(done.playerHand,s.playerHand);assert.deepEqual(done.partnerHand,s.partnerHand);
  const storage={setItem(k,v){this.value=v},getItem(){return this.value}};
  savePracticeProgress({session:done,history:[s],preferences:{}},storage);
  assert.equal(loadPracticeProgress(storage).error,undefined);
  assert.deepEqual(loadPracticeProgress(storage).progress.history[0],JSON.parse(JSON.stringify(s)));
});

test('a 16-count Horton partner chooses a partscore using only their own hand',()=>{
  const base=createTrainingPractice({profileId:'horton-h',seed:'horton-16'});
  const playerHand='SA SK S8 S5 HA H5 DJ D3 CA C8 C7 C6 C5'.split(' ');
  const partnerHand='SJ S9 S7 S4 HJ H9 H7 H4 DQ D9 D7 D4 C2'.split(' ');
  assert.equal(handFeatures(playerHand,'S').hcp,16);assert.equal(new Set([...playerHand,...partnerHand]).size,26);
  assert.ok(matchesConstraints(partnerHand,base.constraints,'S'));
  const s={...base,playerHand,partnerHand,practiceRole:'teller'};
  const pending=advanceAsker(s);
  assert.equal(pending.pendingAsk.bid,'2S');assert.equal(pending.pendingAsk.kind,'signoff');
  assert.deepEqual(advanceAsker({...s,partnerHand:['hidden']}).pendingAsk,pending.pendingAsk);
  const done=applyPracticeBid(pending,'Pass');assert.equal(done.contract.bid,'2S');
});

test('Just bid preserves whole-auction mode on reload and has no prefilled human calls',()=>{
  const storage={setItem(k,v){this.value=v},getItem(){return this.value}};
  const seats=new Set(),openings=new Set();
  for(let i=0;i<120;i++) {
    const session=createTrainingPractice({auctionMode:true,openingFamily:'all',seed:`just-from-start-${i}`});
    assert.equal(session.auction.some(c=>c.seat===session.wholeAuction.humanSeat),false);
    assert.ok(session.auction.length<=1);assert.equal(session.pendingAsk,null);
    seats.add(session.wholeAuction.humanSeat);openings.add(session.wholeAuction.openingBid??'1C');
    savePracticeProgress({session,history:[],preferences:{practiceMode:'mixed'}},storage);
    assert.equal(loadPracticeProgress(storage).progress.preferences.practiceMode,'mixed');
  }
  assert.equal(seats.size,2);assert.equal(openings.size,5);
});


test('an unrecognised opening Pass is allowed and saved as a passed-out deal',()=>{
  const initial=createTrainingPractice({auctionMode:true,openingFamily:'C',humanSeat:'North',seed:'pass-opening'});
  const done=applyPracticeBid(initial,'Pass');
  assert.equal(done.passedOut,true);assert.equal(done.finished,true);assert.equal(done.contract,null);
  assert.deepEqual(done.auction.map(c=>c.bid),['Pass','Pass']);
  const storage={setItem(k,v){this.value=v},getItem(){return this.value}};
  savePracticeProgress({session:done,history:[initial],preferences:{practiceMode:'mixed'}},storage);
  assert.equal(loadPracticeProgress(storage).error,undefined);
});
