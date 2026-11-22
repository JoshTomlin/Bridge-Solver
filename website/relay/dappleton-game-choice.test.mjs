import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingPractice, applyPracticeBid, availablePracticeActions } from './practice.js';
import { applyOpeningCall, advanceOpeningPartner, openingSeat, openingPartnerBid } from './opening-practice.js';
import { handFeatures, matchesConstraints } from './core.js';
import { entryContinuations, entryMeaning } from './bid-reference.js';
import { auctionCallDetails } from './auction-study.js';
import { savePracticeProgress, loadPracticeProgress } from './progress.js';

const snapshot = value => JSON.parse(JSON.stringify(value));
const auction = bids => bids.split(' ').map((bid,i)=>({bid,seat:i%2?'South':'North'}));
const responder = 'SQ SJ S8 S6 S5 HQ HT DA DJ D5 D3 CQ C4'.split(' ');
function fixture({major='S',points=14,fit=3,humanSeat='South'}={}) {
  const north=(fit===3?'SK S7 S2 HA H6 H5 DK D9 D4 CK CJ C9 C7':'SK S7 HA H6 H5 DK D9 D4 CK CJ C9 C7 C2').split(' ')
    .map(card=>points===18&&card==='S7'?'SA':card);
  const swap=hand=>hand.map(card=>major==='S'?card:`${card[0]==='S'?'H':card[0]==='H'?'S':card[0]}${card[1]}`);
  const base=createTrainingPractice({auctionMode:true,openingFamily:'C',humanSeat:'North',seed:'choice-source-fixture'});
  const session={...base,playerHand:swap(north),partnerHand:swap(responder),practiceRole:humanSeat==='North'?'asker':'teller',
    wholeAuction:{...base.wholeAuction,humanSeat}};
  assert.equal(handFeatures(session.playerHand,'C').hcp,points);
  assert.equal(new Set([...session.playerHand,...session.partnerHand]).size,26);
  return session;
}
function prefix(session, major, points, puppet=true) {
  for(const bid of ['1C',major==='S'?'1H':'1D',points===18?'1NT':`1${major}`,...(puppet?['2C','2D']:[])]) session=applyOpeningCall(session,bid);
  return session;
}
function restore(session,history=[]) {
  const storage={setItem(key,value){this.value=value},getItem(){return this.value}};
  savePracticeProgress({session,history,preferences:{practiceMode:'auction',openingFamily:'C'}},storage);
  const loaded=loadPracticeProgress(storage);
  assert.equal(loaded.error,undefined);
  assert.deepEqual(loaded.progress.session,snapshot(session));
}

test('both puppet game-choice routes work in both majors/ranges/seats, with the actual first bidder declaring', () => {
  for(const major of ['S','H']) for(const points of [14,18]) for(const fit of [2,3])
    for(const route of ['3NT','3S']) for(const humanSeat of ['North','South']) {
    const initial=fixture({major,points,fit,humanSeat});
    let session=prefix(initial,major,points);
    session=applyOpeningCall(session,route);
    assert.equal(session.finished,false,'The offer cannot insert a forced Pass');
    assert.equal(session.opening.node,'game-choice');
    assert.ok(session.constraints.some(c=>c.type==='length'&&c.suit===major&&c.min===5));
    assert.equal(matchesConstraints(session.partnerHand,session.constraints,session.trump),true);
    const expectedChoice=fit===3?`4${major}`:route==='3NT'?'Pass':'3NT';
    assert.equal(openingPartnerBid({...session.opening,auction:session.auction,hand:session.playerHand,partnerHand:['hidden']}),expectedChoice);
    assert.deepEqual(availablePracticeActions({...session,partnerHand:['hidden'],playerHand:['hidden']}),availablePracticeActions(session));
    const choices=route==='3NT'?['Pass',`4${major}`]:['3NT',`4${major}`];
    assert.deepEqual(availablePracticeActions(session).map(row=>row.bid),choices);
    if(humanSeat==='South') session=advanceOpeningPartner(session);
    else { restore(session);session=applyPracticeBid(session,expectedChoice); }
    if(!session.finished) {restore(session);session=applyPracticeBid(session,'Pass');}
    const target=fit===3?`4${major}`:'3NT';
    const declarer=target==='3NT' ? points===18||route==='3S'?'North':'South'
      : points===18&&major==='S'&&route==='3S'?'South':'North';
    assert.equal(session.contract.bid,target);
    assert.equal(session.contract.declarer,declarer);
    assert.deepEqual(session.playerHand,initial.playerHand);
    assert.deepEqual(session.partnerHand,initial.partnerHand);
    assert.equal(session.undiscussedBid,undefined);
    restore(session);
  }
});

test('the screenshot hand offers a real 3NT/4S choice and North selects the K72 fit', () => {
  const before=prefix(fixture(),'S',14),session=applyPracticeBid(before,'3NT');
  assert.deepEqual(session.auction.map(c=>c.bid),['1C','1H','1S','2C','2D','3NT','4S']);
  assert.equal(session.finished,false);
  const detail=auctionCallDetails(session,[before],5);
  assert.deepEqual(detail.alternatives.map(row=>row.bid),['Pass','4S']);
  assert.match(detail.call.meaning,/choice of/);
  const done=applyPracticeBid(session,'Pass');
  assert.equal(done.contract.declarer,'North');
  restore(session,[before]);
});

test('only the puppet route promises five; direct 3NT remains to play, and direct 3S puts opener in 3NT', () => {
  for(const route of ['3NT','3S']) {
    const initial=fixture();
    const four={...initial,partnerHand:initial.partnerHand.map(card=>card==='S5'?'C5':card)};
    const before=prefix(four,'S',14),saved=snapshot(before);
    assert.throws(()=>applyOpeningCall(before,route),/five-plus spades/);
    assert.deepEqual(before,saved);
    let direct=prefix(four,'S',14,false);
    direct=applyPracticeBid(direct,route);
    if(!direct.finished) direct=applyPracticeBid(direct,'Pass');
    assert.equal(direct.contract.bid,'3NT');
    assert.equal(direct.contract.declarer,route==='3S'?'North':'South');
    assert.equal(direct.constraints.some(c=>c.type==='length'&&c.min===5),false);
  }
});

test('14–17 and 18/19 references retain 3D/3H/3S meanings and distinguish the puppet prefix', () => {
  for(const major of ['S','H']) for(const rebid of [`1${major}`,'1NT']) {
    const root=`1C ${major==='S'?'1H':'1D'} ${rebid}`;
    for(const puppet of [false,true]) {
      const bids=root+(puppet?' 2C 2D':'');
      assert.match(entryMeaning(auction(`${bids} 3D`)),/Three-suited;.*shortage/);
      assert.match(entryMeaning(auction(`${bids} 3H`)),puppet?/Non-solid six-plus/:/Solid six-plus/);
      assert.match(entryMeaning(auction(`${bids} 3S`)),puppet?/choice of 3NT/:/Request 3NT/);
      assert.match(entryMeaning(auction(`${bids} 3NT`)),puppet?/choice of 3NT/:/To play/);
      assert.ok(entryContinuations(auction(bids)).some(row=>row.bid==='3D'));
    }
  }
});

test('3D publishes the named three-suiter and 3H publishes six cards, leaving quality as judgement', () => {
  let before=prefix(fixture(),'S',14,false);
  before={...before,partnerHand:'SQ SJ S8 S6 HQ DA DJ D5 D3 CQ CT C5 C4'.split(' ')};
  const shown=applyOpeningCall(before,'3D');
  assert.equal(shown.opening.node,'described-game');
  assert.equal(matchesConstraints(shown.partnerHand,shown.constraints,'C'),true);
  assert.ok(shown.constraints.some(c=>c.type==='shapes'&&c.values.includes('4144')));
  for(const puppet of [false,true]) {
    const north='S9 S7 S2 HA HK H6 DK D9 D4 CK CJ C9 C7'.split(' ');
    const south=(puppet?'SA SQ SJ ST S8 S6 HQ H2 DA DJ D5 CQ C4':'SA SK SQ SJ ST S8 HQ H2 DA DJ D5 CQ C4').split(' ');
    before=prefix({...fixture(),playerHand:north,partnerHand:south},'S',14,puppet);
    const described=applyOpeningCall(before,'3H');
    assert.match(described.auction.at(-1).meaning,puppet?/Non-solid/:/Solid/);
    assert.equal(matchesConstraints(south,described.constraints,'C'),true);
  }
});
