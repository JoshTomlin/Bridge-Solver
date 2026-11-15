import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingPractice,applyPracticeBid,practiceView,availablePracticeActions } from './practice.js';
import { advanceOpeningPartner, openingPartnerBid } from './opening-practice.js';
import { ordinaryMajorOptions, ordinaryMajorCheck, ordinaryMajorPartnerBid, majorResponseFacts } from './major-opening.js';
import { handFeatures,matchesConstraints,applyBid } from './core.js';
import { savePracticeProgress,loadPracticeProgress } from './progress.js';
import { auctionCallDetails } from './auction-study.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const swap=hand=>hand.replace(/[HS]/g,s=>s==='H'?'S':'H');
const north='SA S7 HK HQ HJ H9 H3 DA D8 D3 CK C8 C3';
const south='SQ SJ S9 HA DK DQ DJ DT D9 CQ CT C7 C2';
export function fixture(m,n,s,humanSeat='South') {
  const initial=createTrainingPractice({auctionMode:true,openingFamily:m,humanSeat:'North',seed:'ordinary-fixture'});
  const playerHand=n.split(' '),partnerHand=s.split(' ');
  assert.equal(new Set([...playerHand,...partnerHand]).size,26);
  assert.equal(playerHand.length,13);assert.equal(partnerHand.length,13);
  return advanceOpeningPartner({...initial,playerHand,partnerHand,constraints:[],openingConstraintsBySeat:{North:[],South:[]},
    wholeAuction:{...initial.wholeAuction,humanSeat},practiceRole:humanSeat==='North'?'asker':'teller'});
}
function restore(session,history=[]) {
  const storage={setItem(k,v){this.value=v},getItem(){return this.value}};
  savePracticeProgress({session,history,preferences:{practiceMode:'auction'}},storage);
  const result=loadPracticeProgress(storage);assert.equal(result.error,undefined);assert.deepEqual(result.progress.session,copy(session));
}
const policy=s=>s.opening?openingPartnerBid({...s.opening,auction:s.auction,hand:practiceView(s).playerHand})
  :s.practiceRole==='teller'?applyBid(s,s.pendingAsk.bid).auction[s.auction.length+1].bid
  :(availablePracticeActions(s).find(a=>a.kind==='relay')??availablePracticeActions(s).find(a=>a.kind==='signoff')).bid;

test('ordinary major generation completes both seats, saves every turn and covers all three responses',()=>{
  const responses=new Set(),nodes=new Set();
  for(const m of ['H','S'])for(const humanSeat of ['North','South'])for(let seed=0;seed<70;seed++) {
    let s=createTrainingPractice({auctionMode:true,openingFamily:m,humanSeat,seed:`ordinary-walk-${seed}`});
    const initial=copy(practiceView(s)),history=[];
    for(let turn=0;!s.finished&&turn<35;turn++) {
      restore(s,history);nodes.add(s.opening?.node);
      const before=s;history.push(s);
      try{s=applyPracticeBid(s,policy(s))}catch(e){throw new Error(`${m}/${humanSeat}/${seed}: ${before.auction.map(c=>c.bid)} (${before.opening?.node}): ${e.message}`)}
      assert.deepEqual(practiceView(s).playerHand,initial.playerHand);assert.deepEqual(practiceView(s).partnerHand,initial.partnerHand);
    }
    assert.equal(s.finished,true);assert.equal(s.coverageBoundary,undefined,s.auction.map(c=>c.bid).join(' '));restore(s,history);
    responses.add(s.auction[1].bid);
  }
  for(const response of ['2C','2D','2H','2NT'])assert.ok(responses.has(response),response);
  for(const node of ['major-club-rebid','major-diamond-rebid','major-heart-rebid','major-diamond-answer','major-heart-answer'])assert.ok(nodes.has(node),node);
});

test('literal 1M–2D–2NT–3C answers preserve source shapes, facts and the final declarer',()=>{
  for(const m of ['H','S'])for(const humanSeat of ['North','South']) {
    let s=fixture(m,m==='H'?north:swap(north),m==='H'?south:swap(south),humanSeat);
    const history=[];
    for(const bid of humanSeat==='North'?[`1${m}`,'2NT','3D','Pass']:['2D','3C','5D']) {history.push(s);s=applyPracticeBid(s,bid);restore(s,history)}
    assert.deepEqual(s.auction.map(c=>c.bid),[`1${m}`,'2D','2NT','3C','3D','5D','Pass']);
    assert.equal(s.contract.declarer,'South');
    assert.match(s.auction[4].meaning,/Three diamonds/);
  }
});

test('three-way limit raise can stop at two or reach game; human acceptance is not graded by the bot cutoff',()=>{
  for(const [n,s,expected] of [
    ['SK HA HJ H9 H6 H2 DQ D8 D5 D2 C9 C8 C3','SA S8 S5 HK H8 H5 DJ D7 D4 CQ CJ C7 C2',['1H','2C','2H','Pass']],
    ['SK HA HK H9 H6 H2 DQ DJ D5 D2 CQ C8 C3','SA S8 S5 HQ H8 H5 DK D7 D4 CJ CT C7 C2',['1H','2C','2D','2H','4H','Pass']],
  ]) {
    let session=fixture('H',n,s,'North');
    while(!session.finished)session=applyPracticeBid(session,policy(session));
    assert.deepEqual(session.auction.map(c=>c.bid),expected);restore(session);
    const opening=applyPracticeBid(fixture('H',n,s,'North'),'1H');
    assert.doesNotThrow(()=>applyPracticeBid(opening,'2D'));
    assert.doesNotThrow(()=>applyPracticeBid(opening,'2H'));
  }
});

test('source 1S–2H balanced enquiry distinguishes the explicit 14–17 and 18/19 answers',()=>{
  for(const [n,answer] of [
    ['SA SK SQ S9 S3 H8 H3 DK D8 D3 CQ C8 C3','3NT'],
    ['SA SK SQ S9 S3 H8 H3 DA DQ D3 CK C8 C3','4NT'],
  ]) {
    const s='SJ S2 HA HQ HJ HT H9 DJ D7 CJ C7 C4 C2';
    let session=fixture('S',n,s,'South');
    for(const bid of ['2H','3C','Pass'])session=applyPracticeBid(session,bid);
    assert.deepEqual(session.auction.map(c=>c.bid),['1S','2H','2NT','3C',answer,'Pass']);
    assert.equal(session.contract.declarer,'North');restore(session);
  }
});

test('precise balanced and semi-balanced answer tables reject the wrong description without altering the auction',()=>{
  const cases=[
    ['H','major-diamond-answer',north,'3D','3NT'],
    ['H','major-diamond-answer','SA S7 HK HQ HJ H9 H3 DA D8 CK C8 C6 C3','3S','3D'],
    ['H','major-diamond-answer','SQ S7 HK HQ HJ H9 H3 H2 DA D8 CK C8 C3','3H','3NT'],
    ['S','major-heart-answer','SA SK SQ S9 S3 S2 H8 H3 DK D8 D3 CQ C8','3S','3NT'],
  ];
  for(const [m,node,hand,yes,no] of cases) {
    const context={system:`1${m}`,node,auction:[{bid:'3C'}]};
    assert.doesNotThrow(()=>ordinaryMajorCheck(context,yes,hand.split(' ')));
    assert.throws(()=>ordinaryMajorCheck(context,no,hand.split(' ')),/This bid shows/);
  }
});

test('a clearly solid long major uses the solid rebid, not the non-solid description',()=>{
  const context={system:'1H',node:'major-club-rebid',auction:[{bid:'1H'},{bid:'2C'}]};
  assert.equal(ordinaryMajorPartnerBid(context,'S8 S2 HA HK HQ HJ HT H9 DK D8 D3 CQ C3'.split(' ')),'3H');
});

test('three-way balanced-five-diamond continuation and 1NT club invitation have accurate public requirements',()=>{
  const dHand='SA S7 S8 HK H3 DA DK DQ D8 D3 CK C8 C3'.split(' ');
  assert.ok(matchesConstraints(dHand,majorResponseFacts('H','2C'),'H'));
  const context={system:'1H',node:'major-club-resolve',auction:[{bid:'1H'},{bid:'2C'},{bid:'2D'}]};
  assert.doesNotThrow(()=>ordinaryMajorCheck(context,'3D',dHand));
  assert.throws(()=>ordinaryMajorCheck(context,'2NT',dHand),/This bid shows/);
  const tenNoClubs='SA S7 S2 HK H3 DQ DJ D8 D3 C8 C3 C2 C4'.split(' ');
  assert.equal(handFeatures(tenNoClubs,'H').hcp,10);
  assert.ok(matchesConstraints(tenNoClubs,majorResponseFacts('H','1NT'),'H'));
  const noClubInvite='SA S7 S2 HK H3 DQ DJ D8 D3 D4 C8 C3 C2'.split(' ');
  assert.equal(matchesConstraints(noClubInvite,majorResponseFacts('H','1NT'),'H'),false);
});

test('ordinary public menus and historical alternatives survive saved progress without reading cards',()=>{
  let session=fixture('H',north,south),history=[session];
  session=applyPracticeBid(session,'2D');
  const hidden={...session,playerHand:['hidden'],partnerHand:['hidden']};
  assert.deepEqual(availablePracticeActions(hidden),availablePracticeActions(session));
  const detail=auctionCallDetails(session,history,1);
  assert.ok(detail.alternatives.some(row=>row.bid==='2NT'&&/balanced/.test(row.label)));
  const initial=fixture('H',north,south),before=copy(initial);assert.throws(()=>applyPracticeBid(initial,'2H'),/simple major raise/);assert.deepEqual(initial,before);
});

test('human alternatives never leave the automatic partner without a continuation, and menus preserve the asker’s contract choice',()=>{
  for(const m of ['H','S'])for(const humanSeat of ['North','South'])for(let seed=0;seed<24;seed++) {
    let s=createTrainingPractice({auctionMode:true,openingFamily:m,humanSeat,seed:`ordinary-alternatives-${seed}`});
    for(let turn=0;s.opening&&!s.finished&&turn<12;turn++) {
      if(s.opening.node.startsWith('major-'))for(const a of availablePracticeActions(s)) {
        try{const next=applyPracticeBid(s,a.bid);restore(next)}
        catch(e){assert.match(e.message,/^This bid shows |With 14\/15 and 6322/,`${s.auction.map(c=>c.bid)} / ${a.bid}: ${e.message}`)}
      }
      s=applyPracticeBid(s,policy(s));
    }
  }
  const opening=applyPracticeBid(fixture('H','SK HA HK H9 H6 H2 DQ DJ D5 D2 CQ C8 C3','SA S8 S5 HQ H8 H5 DK D7 D4 CJ CT C7 C2'),'2C');
  assert.equal(opening.auction.at(-1).bid,'2D');
  assert.equal(applyPracticeBid(opening,'Pass').contract.bid,'2D');
  assert.equal(applyPracticeBid(opening,'6NT').contract.bid,'6NT');
});


test('weak heart raises retain their public strength and support facts',()=>{
  const n='SK HA HJ H9 H6 H2 DQ D8 D5 D2 C9 C8 C3';
  const south='SA S8 S5 H8 H5 H4 DJ D7 D4 CJ CT C7 C2';
  let session=fixture('H',n,south);
  session=applyPracticeBid(session,'2H');
  assert.ok(session.openingConstraintsBySeat.South.some(f=>f.type==='hcp'&&f.min===5&&f.max===9));
  assert.ok(session.openingConstraintsBySeat.South.some(f=>f.type==='length'&&f.suit==='H'&&f.min===3));
});
