import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingPractice, practiceView, applyPracticeBid, availablePracticeActions, practiceCalls } from './practice.js';
import { applyBid, handFeatures } from './core.js';
import { openingPartnerBid } from './opening-practice.js';
import { savePracticeProgress, loadPracticeProgress } from './progress.js';
const copy = value => JSON.parse(JSON.stringify(value));
const storage = () => ({ getItem(){return this.value??null},setItem(key,value){this.value=value} });
const policy = session => session.opening
  ? openingPartnerBid({...session.opening,auction:session.auction,hand:practiceView(session).playerHand})
  : session.practiceRole==='teller' ? applyBid(session,session.pendingAsk.bid).auction[session.auction.length+1].bid
  : (availablePracticeActions(session).find(a=>a.kind==='relay')??availablePracticeActions(session).find(a=>a.kind==='signoff')).bid;

test('new opening families complete from either seat, preserving hands, progress and all earlier calls at relay handovers', () => {
  const roots=new Set(),routes=new Set();
  for(const family of ['D','H','S','NT','all']) for(const humanSeat of ['North','South']) for(let i=0;i<16;i++) {
    let session=createTrainingPractice({auctionMode:true,openingFamily:family,humanSeat,seed:`system-opening-${i}`});
    const initial=copy(practiceView(session)),history=[];
    for(let turn=0;!session.finished && turn<35;turn++) {
      const store=storage(); savePracticeProgress({session,history,preferences:{practiceMode:'auction',openingFamily:family}},store);
      const restored=loadPracticeProgress(store);
      assert.equal(restored.error,undefined,`${family}/${humanSeat}/${i}/${session.opening?.node}: ${restored.error}`);
      assert.deepEqual(restored.progress.session,copy(session));
      assert.equal(practiceView(session).playerSeat,humanSeat);
      assert.deepEqual(practiceView(session).playerHand,initial.playerHand);
      assert.deepEqual(practiceView(session).partnerHand,initial.partnerHand);
      const earlier=practiceView(session).auction.map(call=>[call.seat,call.bid]);
      const bid=policy(session);
      history.push(session); session=applyPracticeBid(session,bid);
      assert.deepEqual(practiceView(session).auction.slice(0,earlier.length).map(call=>[call.seat,call.bid]),earlier,'Handover preserves every actual earlier bid');
    }
    assert.equal(session.finished,true,`${family}/${i}`);
    assert.equal(session.coverageBoundary,undefined,`${family}/${i}: ${session.auction.map(call=>call.bid).join(' ')}`);
    roots.add(session.auction[0].bid);routes.add(session.familyId);
    const store=storage();savePracticeProgress({session,history,preferences:{practiceMode:'auction',openingFamily:family}},store);
    assert.equal(loadPracticeProgress(store).error,undefined,'Completed games retain the full undo history');
  }
  assert.deepEqual([...roots].sort(),['1C','1D','1H','1S','2NT']);
  assert.ok([...routes].some(route=>route.startsWith('minor-d')));
  assert.ok([...routes].some(route=>route.startsWith('rebid-')));
  assert.ok(routes.has('major-H') && routes.has('major-S'));
});

function deal(openingFamily,north,south,humanSeat='South') {
  let session=createTrainingPractice({auctionMode:true,openingFamily,humanSeat:'North',seed:'source-fixture'});
  const hands={North:north.split(' '),South:south.split(' ')};
  assert.equal(hands.North.length,13);assert.equal(hands.South.length,13);
  assert.equal(new Set([...hands.North,...hands.South]).size,26);
  session={...session,playerHand:hands[session.playerSeat],partnerHand:hands[session.partnerSeat],
    wholeAuction:{...session.wholeAuction,humanSeat},practiceRole:humanSeat===session.playerSeat?'asker':'teller'};
  return session;
}
function open(session,bid) {
  // Source fixture: apply the opening before running partner automation.
  // The normal app always starts at the chosen human's turn.
  return applyPracticeBid(session,bid);
}

const diamondNorth='SQ S2 HK H8 H4 DA DK DQ DJ D9 D6 CQ C2'; // 17, 2362
const diamondSouth='SA SK S8 HQ HJ HT H9 H7 DT D8 CA CJ C9'; // 15, 3523
const ntFourSpades='SA SK SQ S2 HA HK H3 DK D4 D2 CJ C8 C7'; // 20, 4333
const ntResponder='SJ ST S9 S8 HQ HT H9 DA D8 D6 CQ CT C2';

test('1D–1H–2NT is bid from the opening before the existing diamond or heart shortage enquiries', () => {
  let session=open(deal('D',diamondNorth,diamondSouth),'1D');
  const fixed=copy(practiceView(session));
  assert.throws(()=>applyPracticeBid(session,'1S'),/four-plus Spades/);
  session=applyPracticeBid(session,'1H');
  assert.equal(session.familyId,'rebid-single-d-h-support');
  assert.deepEqual(session.auction.map(call=>call.bid),['1D','1H','2NT']);
  for(const [bid,trump,answer] of [['3C','D','3D'],['3S','H','3NT']]) {
    const next=applyPracticeBid(session,bid);
    assert.equal(next.trump,trump);assert.equal(next.auction.at(-1).bid,answer);
    assert.deepEqual(practiceView(next).playerHand,fixed.playerHand);
    assert.deepEqual(practiceView(next).partnerHand,fixed.partnerHand);
  }
});

test('a human major opener makes the opening and the first Jacoby answer without an automatic reply being inserted', () => {
  const north='S8 S3 S2 HA HK HJ H8 H7 H6 DQ DT D2 C9';
  const south='SA SJ S9 HQ HT H9 H5 DA DK D9 CA C7 C4';
  let session=open(deal('H',north,south,'North'),'1H');
  assert.deepEqual(practiceView(session).auction.map(call=>call.bid),['1H','2NT']);
  assert.equal(session.auction.length,1,'The displayed 2NT remains a pending question');
  assert.equal(session.practiceRole,'teller');
  const before=copy(session);
  assert.throws(()=>applyPracticeBid(session,'3C'),/does not match your hand/);
  assert.deepEqual(session,before);
  session=applyPracticeBid(session,'3S');
  assert.equal(session.auction[2].bid,'3S');
  assert.equal(session.auction.filter(call=>call.bid==='2NT').length,1);
  assert.equal(practiceView(session).playerSeat,'North');
});

test('2NT Muppet answers and game contracts follow the supplied source, including first-strain declarer', () => {
  for(const [north,south,calls,expected,declarer] of [
    [ntFourSpades,ntResponder,['3C','3H','Pass'],['2NT','3C','3D','3H','4S','Pass'],'North'],
    ['SA SK SQ SJ S2 HA H3 DK D4 D2 CK C8 C7','ST S9 S8 HQ HJ HT H9 DA D8 D6 CQ CT C2',['3C','4S'],['2NT','3C','3S','4S','Pass'],'North'],
    ['SA SK S2 HA HK HQ HJ H2 DQ D4 CJ C8 C7','SQ SJ ST S9 HT H9 H8 DA D8 D6 CQ CT C2',['3C','4H'],['2NT','3C','3NT','4H','Pass'],'South'],
    ['SA SK S2 HA HQ H3 DK DJ D4 D2 CK C8 C7','SJ ST S9 S8 HK HT H9 DA D8 D6 CQ CT C2',['3C','3S','Pass'],['2NT','3C','3H','3S','3NT','Pass'],'North'],
  ]) {
    let session=open(deal('NT',north,south),'2NT');
    assert.equal(handFeatures(session.partnerHand,'C').hcp,20);
    for(const bid of calls)session=applyPracticeBid(session,bid);
    assert.deepEqual(session.auction.map(call=>call.bid),expected);
    assert.equal(session.contract.declarer,declarer);
    assert.equal(session.coverageBoundary,undefined);
  }
});

test('2NT transfers and re-transfers preserve opener as declarer, and super-accept lengths are checked without grading quality', () => {
  const south='SQ SJ S9 HJ HT H9 H8 H5 DA D8 D6 CQ C2';
  const north='SA SK S2 HA HK HQ H3 DK D4 D2 CJ C8 C7';
  let session=open(deal('NT',north,south,'North'),'2NT');
  assert.equal(session.opening.node,'transfer');
  const before=copy(session);
  assert.throws(()=>applyPracticeBid(session,'3H'),/requires a super-accept/);
  assert.throws(()=>applyPracticeBid(session,'3NT'),/exactly three/);
  assert.deepEqual(session,before);
  session=applyPracticeBid(session,'3S');
  assert.deepEqual(session.auction.map(call=>call.bid),['2NT','3D','3S','4D']);
  session=applyPracticeBid(session,'4H');
  assert.deepEqual(session.auction.map(call=>call.bid),['2NT','3D','3S','4D','4H','Pass']);
  assert.equal(session.contract.declarer,'North');
});

test('opening menus and public study choices do not read either hand; unsupported routes preserve facts and remain undoable', () => {
  for(const openingFamily of ['D','H','NT']) {
    const session=createTrainingPractice({auctionMode:true,openingFamily,humanSeat:'South',seed:'public-opening'});
    const hidden={...session,playerHand:['hidden'],partnerHand:['hidden']};
    assert.deepEqual(availablePracticeActions(hidden),availablePracticeActions(session));
    assert.deepEqual(practiceCalls(hidden),practiceCalls(session));
    if(openingFamily==='NT') {
      const before=copy(session),next=applyPracticeBid(session,'4NT');
      assert.equal(next.coverageBoundary,true);
      assert.equal(next.revealed,false);
      assert.deepEqual(next.constraints,before.constraints,'A coverage boundary must not invent invitation facts');
      assert.deepEqual(next.partnerHand,before.partnerHand);
    }
  }
});

test('random opening selection and explicit-seat replay reproduce the same cards, and corrupt opening nodes are rejected', () => {
  for(const openingFamily of ['D','M','NT','all'])for(let i=0;i<8;i++) {
    const options={auctionMode:true,openingFamily,seed:`replay-opening-${i}`};
    const first=createTrainingPractice(options);
    const replay=createTrainingPractice({...options,humanSeat:first.wholeAuction.humanSeat});
    assert.deepEqual(replay,first);
    const invalid={...first,opening:{...first.opening,node:'unknown-node'}};
    const store=storage();savePracticeProgress({session:invalid,history:[],preferences:{}},store);
    assert.match(loadPracticeProgress(store).error,/node is invalid/);
  }
});

test('the 2NT asker can stop on an artificial Muppet answer or select a slam without changing its meaning or cards', () => {
  const initial=open(deal('NT',ntFourSpades,ntResponder),'2NT');
  const reply=applyPracticeBid(initial,'3C');
  assert.equal(reply.auction.at(-1).bid,'3D');
  const passed=applyPracticeBid(reply,'Pass');
  assert.equal(passed.contract.bid,'3D');
  assert.equal(passed.contract.declarer,'North');
  assert.equal(passed.auction.at(-2).meaning,'One/both four-card majors');
  assert.deepEqual(passed.constraints,reply.constraints);
  const slam=applyPracticeBid(reply,'6NT');
  assert.equal(slam.contract.bid,'6NT');
  assert.equal(slam.contract.declarer,'North');
  assert.deepEqual(slam.playerHand,initial.playerHand);
  assert.deepEqual(slam.partnerHand,initial.partnerHand);
});

test('the three-card 3NT super-accept retains the source non-4333 restriction and re-transfer', () => {
  const south='SJ S9 S7 HQ HJ HT H9 H8 DA D8 D6 CQ C2';
  const flat=open(deal('NT',ntFourSpades,south,'North'),'2NT');
  assert.equal(flat.opening.node,'transfer');
  assert.throws(()=>applyPracticeBid(flat,'3NT'),/excludes 4333/);
  const north='SA SK SQ S2 HA HK H3 DK DJ D4 D2 C8 C7';
  let session=open(deal('NT',north,south,'North'),'2NT');
  session=applyPracticeBid(session,'3NT');
  assert.deepEqual(session.auction.map(call=>call.bid),['2NT','3D','3NT','4D']);
  session=applyPracticeBid(session,'4H');
  assert.equal(session.contract.bid,'4H');
  assert.equal(session.contract.declarer,'North');
});

test('strong 2NT minor Stayman distinguishes the artificial five-club and five-diamond replies', () => {
  const south='SQ SJ S9 HQ HJ HT H9 DA D8 D6 CT C9 C2';
  for(const [north,answer,trump] of [
    ['SA SK S2 HA H3 DK D4 D2 CK CQ CJ C8 C7','4H','C'],
    ['SA SK S2 HA H3 DK DQ DJ D4 D2 CK C8 C7','4S','D'],
  ]) {
    let session=open(deal('NT',north,south),'2NT');
    session=applyPracticeBid(session,'3S');
    assert.equal(session.auction.at(-1).bid,answer);
    assert.equal(session.opening.major,trump);
    session=applyPracticeBid(session,`5${trump}`);
    assert.equal(session.contract.bid,`5${trump}`);
    assert.equal(session.contract.declarer,'South','Artificial 4H/4S did not bid the minor');
  }
});
