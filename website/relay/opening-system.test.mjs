import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingPractice, practiceView, applyPracticeBid, availablePracticeActions, practiceCalls } from './practice.js';
import { applyBid, handFeatures, DECK, RANKS } from './core.js';
import { advanceOpeningPartner, openingPartnerBid } from './opening-practice.js';
import { savePracticeProgress, loadPracticeProgress } from './progress.js';
import { auctionCallDetails } from './auction-study.js';
const copy = value => JSON.parse(JSON.stringify(value));
const storage = () => ({ getItem(){return this.value??null},setItem(key,value){this.value=value} });
const policy = session => session.opening
  ? openingPartnerBid({...session.opening,auction:session.auction,hand:practiceView(session).playerHand})
  : session.practiceRole==='teller' ? applyBid(session,session.pendingAsk.bid).auction[session.auction.length+1].bid
  : (availablePracticeActions(session).find(a=>a.kind==='relay')??availablePracticeActions(session).find(a=>a.kind==='signoff')).bid;

test('new opening families complete from either seat, preserving hands, progress and all earlier calls at relay handovers', () => {
  const roots=new Set(),routes=new Set();
  for(const family of ['D','H','S','NT','WNT','2C','2D','2H','2S','all']) for(const humanSeat of ['North','South']) for(let i=0;i<16;i++) {
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
    if (session.sourceAmbiguity) {
      assert.match(session.auction.map(call => call.bid).join(' '), /^1C 2C (2H|2S|3D 3H)$/);
      assert.equal(session.contract, null);
    } else assert.equal(session.coverageBoundary,undefined,`${family}/${i}: ${session.auction.map(call=>call.bid).join(' ')}`);
    roots.add(session.auction.find(call=>call.bid!=='Pass').bid);routes.add(session.familyId);
    const store=storage();savePracticeProgress({session,history,preferences:{practiceMode:'auction',openingFamily:family}},store);
    assert.equal(loadPracticeProgress(store).error,undefined,'Completed games retain the full undo history');
  }
  assert.deepEqual([...roots].sort(),['1C','1D','1H','1NT','1S','2C','2D','2H','2NT','2S']);
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
const threeHeartOpener = 'SQ S9 S5 HA H8 H6 DA D8 D7 D6 D4 D3 CQ';
const fiveHeartResponder = 'SA S8 SJ HK HQ HJ HT H9 DK D5 CA C8 C7';

test('Horton forcing new-suit jumps set trump and reach the natural game from either seat', () => {
  const cases = [
    ['2D', '3H', '3S', '4H', 'K987 4 KJ965 654', 'A65 AKQJ87 A2 K2'],
    ['2D', '4C', '4D', '5C', 'K987 654 KJ965 4', 'A65 K2 A2 AKQJ87'],
    ['2H', '4C', '4H', '5C', 'K987 KJ965 654 4', 'A65 A2 K2 AKQJ87'],
    ['2H', '4D', '4H', '5D', 'K987 KJ965 4 654', 'A65 A2 AKQJ87 K2'],
  ];
  const cards = holdings => holdings.split(' ').flatMap((holding, index) => [...holding].map(rank => 'SHDC'[index] + rank)).join(' ');
  for (const [opening, jump, cue, game, north, south] of cases) {
    const asker = advanceOpeningPartner(deal(opening, cards(north), cards(south)));
    const afterCue = applyPracticeBid(asker, jump);
    assert.equal(afterCue.auction.at(-1).bid, cue);
    assert.match(afterCue.auction.at(-1).meaning, /^Control in/);
    assert.equal(afterCue.trump, game[1]);
    const final = applyPracticeBid(afterCue, game);
    assert.equal(final.contract.bid, game);
    assert.equal(final.contract.declarer, 'South');
    assert.equal(final.undiscussedBid, undefined);

    const teller = applyPracticeBid(deal(opening, cards(north), cards(south), 'North'), opening);
    assert.equal(teller.pendingAsk.bid, jump);
    assert.deepEqual(practiceView(teller).playerHand, cards(north).split(' '));
    assert.deepEqual(applyPracticeBid(teller, cue).auction, afterCue.auction);
    const signedOff = applyPracticeBid(teller, game);
    assert.equal(signedOff.contract.bid, game);
    assert.deepEqual(signedOff.constraints, teller.constraints);
    assert.equal(signedOff.auction.at(-1).bid, 'Pass');

    if (jump === '3H') {
      assert.equal(practiceCalls(asker).find(action => action.bid === '4H').trump, 'D');
      assert.throws(() => applyPracticeBid(teller, '4C'), /cue does not match/);
      assert.equal(applyPracticeBid(teller, '4D').auction.at(-1).meaning, 'Control in diamonds');
      const continuedCue = applyPracticeBid(afterCue, '4C');
      assert.deepEqual(continuedCue.auction.slice(-2).map(call => call.meaning), ['Control in clubs','Control in diamonds']);
      assert.equal(applyPracticeBid(continuedCue, '4H').contract.bid, '4H');
      const store = storage();
      savePracticeProgress({ session: final, history: [asker, afterCue], preferences: {} }, store);
      assert.deepEqual(loadPracticeProgress(store).progress.session, copy(final));
    }
  }
});

test('diamond opener’s three-card heart support uses 2S to continue after the lower range answers', () => {
  const north = threeHeartOpener;
  const south = fiveHeartResponder;
  for (const [hand, reply] of [[north, '2H'], [north.replace('S5', 'ST').replace('D3', 'DJ'), '2D']]) {
    const opener = open(deal('D', hand, south, 'North'), '1D');
    const afterRange = applyPracticeBid(applyPracticeBid(opener, '1NT'), reply);
    assert.equal(afterRange.familyId, 'split-d-h-1nt');
    assert.deepEqual(practiceView(afterRange).auction.map(call => call.bid), ['1D','1H','1NT','2C',reply,'2S']);
    assert.deepEqual(afterRange.pendingAsk.responseLadder.map(answer => answer.bid), ['3C','3D']);
    assert.deepEqual(practiceView(afterRange).playerHand, hand.split(' '));

    const responder = applyPracticeBid(advanceOpeningPartner(deal('D', hand, south)), '1H');
    const range = applyPracticeBid(responder, '2C');
    assert.equal(practiceCalls(range).find(action => action.bid === '2S').kind, 'relay');
    assert.equal(practiceCalls(range).find(action => action.bid === '2NT').discussed, false);
    assert.equal(applyPracticeBid(range, reply === '2H' ? 'Pass' : '2H').contract.bid, '2H');
    const shape = applyPracticeBid(range, '2S');
    assert.equal(shape.auction.at(-1).bid, '3D');
    assert.deepEqual(applyPracticeBid(afterRange, '3D').auction, shape.auction);
  }

  // Older saves may have a displayed 2NT question with no reply entered.
  const opener = open(deal('D', north, south, 'North'), '1D');
  const firstAsk = applyPracticeBid(opener, '1NT');
  const pending = applyPracticeBid(firstAsk, '2H');
  const legacy = { ...pending, pendingAsk: { ...pending.pendingAsk, bid: '2NT' } };
  const store = storage();
  savePracticeProgress({ session: legacy, history: [opener, firstAsk], preferences: {} }, store);
  const saved = loadPracticeProgress(store);
  assert.equal(saved.error, undefined);
  assert.deepEqual(saved.progress.session, copy(pending));
  const answered = applyPracticeBid(pending, '3D');
  const committed = { ...answered, auction: answered.auction.map((call, index) => index === 5 ? { ...call, bid: '2NT' } : call) };
  savePracticeProgress({ session: committed, history: [legacy], preferences: {} }, store);
  const restored = loadPracticeProgress(store).progress;
  assert.deepEqual(restored.session, copy(committed));
  assert.deepEqual(restored.history, [copy(pending)]);
});

test('the heart-support auction uses diamond Kickback before shortage and the cue plus 4NT route afterward', () => {
  let session = applyPracticeBid(advanceOpeningPartner(deal('D', threeHeartOpener, fiveHeartResponder)), '1H');
  for (const bid of ['2C','2S']) session = applyPracticeBid(session,bid);
  assert.equal(session.auction.at(-1).bid, '3D');
  const direct = practiceCalls(session).find(action => action.bid === '4H');
  assert.equal(direct.askType, 'keycard');
  assert.equal(direct.trump, 'D');
  const keycards = applyPracticeBid(session, '4H');
  assert.deepEqual(keycards.auction.slice(-2).map(call => call.bid), ['4H','5C']);
  assert.equal(applyPracticeBid(keycards, '5D').contract.bid, '5D');

  const shortage = applyPracticeBid(session,'3S');
  assert.deepEqual(shortage.auction.slice(-2).map(call => call.bid), ['3S','4C']);
  assert.equal(practiceCalls(shortage).find(action => action.bid === '4H').kind, 'signoff');
  assert.equal(applyPracticeBid(shortage,'4H').contract.bid, '4H');
  const agreed = applyPracticeBid(shortage,'4D');
  assert.equal(agreed.auction.at(-1).bid, '4H');
  assert.equal(agreed.auction.at(-1).meaning, 'Control in hearts');
  const afterCue = practiceCalls(agreed).find(action => action.bid === '4NT');
  assert.equal(afterCue.askType, 'keycard');
  assert.equal(afterCue.trump, 'D');
  assert.deepEqual(applyPracticeBid(agreed, '4NT').auction.slice(-2).map(call => call.bid), ['4NT','5H']);
});

test('the reported four-spade, three-heart responder can force a rebid with 1S', () => {
  const north = 'S5 S4 HQ HJ H7 H3 H2 DK DQ D8 CA C9 C5';
  const south = 'SQ S8 S6 S3 HA H9 H5 DJ D9 D2 CK CJ C2';
  const response = advanceOpeningPartner(deal('H', north, south));
  const rebid = applyPracticeBid(response, '1S');
  assert.deepEqual(rebid.auction.map(c => c.bid), ['1H','1S','1NT']);
  assert.equal(rebid.finished, false);
  assert.match(rebid.auction[1].meaning, /forcing one round/);
  assert.deepEqual(practiceView(rebid).partnerHand, north.split(' '));
  const enquiry = applyPracticeBid(rebid, '2C');
  assert.deepEqual(enquiry.auction.map(c => c.bid), ['1H','1S','1NT','2C','2H']);
  assert.equal(applyPracticeBid(enquiry, 'Pass').contract.bid, '2H');
  const store = storage();
  savePracticeProgress({ session: enquiry, history: [response, rebid], preferences: {practiceMode:'auction'} }, store);
  assert.deepEqual(loadPracticeProgress(store).progress.session, copy(enquiry));

  const opener = open(deal('H', north, south, 'North'), '1H');
  assert.equal(opener.auction.at(-1).bid, '1S');
  assert.throws(() => applyPracticeBid(opener, 'Pass'), /1S is forcing/);
  const legacy = copy(opener);
  delete legacy.auction.at(-1).forcing;
  assert.throws(() => applyPracticeBid(legacy, 'Pass'), /1S is forcing/);
  assert.equal(applyPracticeBid(opener, '1NT').auction.at(-1).bid, '2C');
});

test('a direct 1NT response and a weak jump in spades are still passable', () => {
  const north = 'S5 S4 HQ HJ H7 H3 H2 DK DQ D8 CA C9 C5';
  const weakNoTrump = 'SQ S8 S6 HA H9 DJ D9 D2 CJ CT C7 C3 C2';
  const weakSpades = 'SQ ST S9 S8 S6 S3 H9 H5 DT D9 D2 CJ C2';
  for (const [bid, south] of [['1NT',weakNoTrump],['2S',weakSpades]]) {
    const before = advanceOpeningPartner(deal('H', north, south));
    const done = applyPracticeBid(before, bid);
    assert.deepEqual(done.auction.map(c => c.bid), ['1H',bid,'Pass']);
    assert.equal(done.contract.bid, bid);
    assert.equal(done.undiscussedBid, undefined);
    assert.equal(done.auction[1].forcing, undefined);
  }
});

test('the reported 1S–2H–2S hand can show diamonds as a forcing natural call', () => {
  const north = 'SA SJ ST S9 S7 S2 HQ H3 DA D8 CJ C8 C5';
  const south = 'SQ S6 HK HJ HT H6 H5 H4 DK DQ DJ D3 C7';
  let session = advanceOpeningPartner(deal('S', north, south));
  session = applyPracticeBid(session, '2H');
  assert.deepEqual(session.auction.map(c => c.bid), ['1S','2H','2S']);
  for (const bid of ['2NT','3C','3D','3H','3S','3NT','Pass']) {
    assert.equal(practiceCalls(session).find(row => row.bid === bid)?.discussed, true, bid);
  }
  assert.throws(() => applyPracticeBid(session, '3C'), /four-plus clubs/);
  const natural = applyPracticeBid(session, '3D');
  assert.deepEqual(natural.auction.map(c => c.bid), ['1S','2H','2S','3D','3H']);
  assert.equal(natural.finished, false);
  assert.equal(applyPracticeBid(natural, 'Pass').contract.bid, '3H');
  assert.equal(applyPracticeBid(session,'Pass').contract.bid, '2S');

  let opener = open(deal('S', north, south, 'North'), '1S');
  assert.throws(() => applyPracticeBid(opener, 'Pass'), /2H is forcing/);
  opener = applyPracticeBid(opener, '2S');
  assert.deepEqual(opener.auction.map(c => c.bid), ['1S','2H','2S','3D']);
  assert.throws(() => applyPracticeBid(opener, 'Pass'), /3D is forcing/);
});

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

test('whole-auction balanced Jacoby ranges and historical meanings start at 12–14 in both seats', () => {
  const examples = [
    [12, 'SK ST S6 S5 HA HQ HJ H4 H2 D9 D5 CQ C4', '3H', '12–14 HCP'],
    [13, 'S8 S4 S3 HA HQ H6 H5 H4 DK DT D6 CK CJ', '3H', '12–14 HCP'],
    [14, 'SK ST S6 S5 HA HQ HJ H4 H2 DK D5 CJ C4', '3H', '12–14 HCP'],
    [15, 'SK ST S6 S5 HA HQ HJ H4 H2 DK D5 CQ C4', '3S', '15–17 HCP'],
    [17, 'SK ST S6 S5 HA HQ HJ H4 H2 DK DQ CQ C4', '3S', '15–17 HCP'],
    [18, 'SK ST S6 S5 HA HQ HJ H4 H2 DA DQ CQ C4', '3NT', '18–19 HCP'],
    [19, 'SK ST S6 S5 HA HQ HJ H4 H2 DK DA CQ C4', '3NT', '18–19 HCP'],
  ];
  const expected = [{bid:'3H',label:'12–14 HCP'}, {bid:'3S',label:'15–17 HCP'}, {bid:'3NT',label:'18–19 HCP'}];
  for (const major of ['H','S']) for (const humanSeat of ['North','South']) for (const [points,holding,reply,meaning] of examples) {
    const north = holding.split(' ').map(card => major === 'H' ? card : `${card[0] === 'H' ? 'S' : card[0] === 'S' ? 'H' : card[0]}${card[1]}`);
    const remaining = DECK.filter(card => !north.includes(card));
    const support = remaining.filter(card => card[0] === major).slice(0,4);
    const sideCards = remaining.filter(card => card[0] !== major).sort((a,b) => RANKS.indexOf(a[1])-RANKS.indexOf(b[1]));
    const south = Array.from({length:sideCards.length-8},(_,offset) => [...support,...sideCards.slice(offset,offset+9)])
      .find(hand => { const points = handFeatures(hand,major).hcp; return points>=14 && points<=19; });
    assert.ok(south,'Responder stays within the whole-auction 14–19 practice subset');
    assert.equal(handFeatures(north,major).hcp, points);
    let session = deal(major,north.join(' '),south.join(' '),humanSeat);
    const history = [], original = copy(practiceView(session));
    const step = bid => {
      if (!session.opening || session.opening.seat === humanSeat) history.push(session);
      session = applyPracticeBid(session,bid);
    };
    step(`1${major}`);
    step(humanSeat === 'North' ? '3C' : '2NT');
    const ladder = humanSeat === 'North' ? session.pendingAsk.responseLadder : availablePracticeActions(session).find(row => row.bid === '3D').responseLadder;
    assert.deepEqual(ladder,expected);
    step(humanSeat === 'North' ? reply : '3D');
    assert.deepEqual(session.auction.map(call => call.bid),[`1${major}`,'2NT','3C','3D',reply]);
    assert.equal(session.auction.at(-1).meaning,meaning);
    assert.deepEqual(auctionCallDetails(session,history,3).alternatives,expected);
    assert.deepEqual(practiceView(session).playerHand,original.playerHand);
    assert.deepEqual(practiceView(session).partnerHand,original.partnerHand);
    const store = storage(); savePracticeProgress({session,history,preferences:{practiceMode:'auction',openingFamily:major}},store);
    const restored = loadPracticeProgress(store);
    assert.equal(restored.error,undefined);
    assert.deepEqual(restored.progress.session,copy(session));
  }
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

test('opening menus and public study choices do not read either hand; quantitative invitations preserve cards and add no invented facts', () => {
  for(const openingFamily of ['D','H','NT']) {
    const session=createTrainingPractice({auctionMode:true,openingFamily,humanSeat:'South',seed:'public-opening'});
    const hidden={...session,playerHand:['hidden'],partnerHand:['hidden']};
    assert.deepEqual(availablePracticeActions(hidden),availablePracticeActions(session));
    assert.deepEqual(practiceCalls(hidden),practiceCalls(session));
    if(openingFamily==='NT') {
      const before=copy(session),next=applyPracticeBid(session,'4NT');
      assert.equal(next.coverageBoundary,undefined);
      assert.ok(['4NT','6NT'].includes(next.contract.bid));
      assert.equal(next.revealed,false);
      assert.deepEqual(next.constraints,before.constraints,'A quantitative choice must not invent a precise partner range');
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
    assert.match(availablePracticeActions(session).find(action=>action.bid==='4NT').label,new RegExp(`Keycards in ${trump==='C'?'Clubs':'Diamonds'}`));
    session=applyPracticeBid(session,`5${trump}`);
    assert.equal(session.contract.bid,`5${trump}`);
    assert.equal(session.contract.declarer,'South','Artificial 4H/4S did not bid the minor');
  }
});


test('with exactly five transferred major cards, the partner offers a notrump/game choice using only its own hand', () => {
  const input={system:'2NT',node:'after-transfer',major:'H',auction:[],hand:'SJ S9 S7 HQ HJ HT H9 H8 DA D8 D6 CQ C2'.split(' ')};
  assert.equal(openingPartnerBid(input),'3NT');
  assert.equal(openingPartnerBid({...input,hand:'SJ S9 S7 HQ HJ HT H9 H8 H5 DA D8 CQ C2'.split(' ')}),'4H');
  assert.equal(openingPartnerBid({...input,partnerHand:['hidden'],targetProfile:'wrong'}),'3NT');
});

test('strong 2C uses control replies, suit transfers and the exact post-acceptance control steps', () => {
  const north = 'SA SK S2 HA HK H3 DA DK D2 CK CJ C8 C7';
  const noControl = 'SQ SJ S9 S8 HQ HT DQ D8 CQ CT C9 C6 C5';
  let session = advanceOpeningPartner(deal('2C', north, noControl));
  assert.equal(session.auction[0].bid,'2C');
  for (const [bid, suit] of [['2NT','clubs'], ['3C','diamonds'], ['3D','hearts'], ['3H','spades']]) {
    assert.match(availablePracticeActions(session).find(action => action.bid === bid).label, new RegExp(`six-plus ${suit}`));
  }
  assert.throws(() => applyPracticeBid(session,'Pass'), /2C is forcing/);
  assert.throws(() => applyPracticeBid(session,'2H'), /2 or 5 controls/);
  session = applyPracticeBid(session,'2D');
  assert.deepEqual(session.auction.map(call=>call.bid),['2C','2D','2NT']);
  assert.throws(() => applyPracticeBid(session,'Pass'), /2NT is forcing/);
  assert.equal(applyPracticeBid(session,'3NT').contract.bid,'3NT');
  const longClubs = 'S9 S8 S6 HT H9 DT D8 CA CQ CT C9 C6 C5';
  let transfer = advanceOpeningPartner(deal('2C', north, longClubs));
  transfer = applyPracticeBid(transfer,'2NT');
  assert.deepEqual(transfer.auction.map(call=>call.bid),['2C','2NT','3C']);
  assert.throws(() => applyPracticeBid(transfer,'3D'),/0 controls/);
  const answer = applyPracticeBid(transfer,'3S');
  assert.deepEqual(answer.auction.map(call=>call.bid),['2C','2NT','3C','3S','5C']);
  assert.equal(applyPracticeBid(answer,'Pass').contract.declarer,'North');
});

test('first/second-seat 2C–controls–2NT uses the direct 2NT enquiries, including from an older save', () => {
  const north = 'SA SK S2 HA HK H3 DA DK D2 CK CJ C8 C7';
  const south = 'SQ SJ S9 S8 HQ HT DQ D8 CQ CT C9 C6 C5';
  const before = advanceOpeningPartner(deal('2C', north, south));
  const rebid = applyPracticeBid(before, '2D');
  const legacy = { ...rebid, opening: { ...rebid.opening, node: 'strong-game' } };
  const store = storage();
  savePracticeProgress({ session:legacy, history:[before], preferences:{practiceMode:'auction'} }, store);
  const restored = loadPracticeProgress(store).progress.session;
  const meanings = new Map(availablePracticeActions(restored).map(row=>[row.bid,row.label]));
  assert.match(meanings.get('3C'),/Muppet Stayman/);
  assert.match(meanings.get('3D'),/hearts; transfer/);
  assert.match(meanings.get('3H'),/spades; transfer/);
  assert.match(meanings.get('3S'),/Minor-suit Stayman/);
  assert.throws(() => applyPracticeBid(restored,'Pass'),/2NT is forcing/);

  const muppet = applyPracticeBid(restored,'3C');
  assert.deepEqual(muppet.auction.map(c=>c.bid),['2C','2D','2NT','3C','3H']);
  assert.throws(() => applyPracticeBid(muppet,'Pass'),/3H is forcing/);
  const puppet = applyPracticeBid(muppet,'3S');
  assert.deepEqual(puppet.auction.map(c=>c.bid),['2C','2D','2NT','3C','3H','3S','3NT']);
  assert.equal(applyPracticeBid(puppet,'Pass').contract.bid,'3NT');
  const minor = applyPracticeBid(restored,'3S');
  assert.equal(minor.auction.at(-1).bid,'4C');
  assert.equal(availablePracticeActions(minor).some(row=>row.bid==='4D'),false,'P1309 reserves Keycard for opener');
  assert.equal(applyPracticeBid(minor,'5C').contract.bid,'5C');
  assert.equal(applyPracticeBid(restored,'4NT').auction.at(-1).bid,'6NT');
});

test('weak 1NT Stayman can invite and stop in notrump on a minimum', () => {
  const north = 'SQ S8 S6 HJ H9 H5 H2 DK D9 D3 CA C9 C5';
  const south = 'SK SJ S9 HA H8 H6 DJ D8 D2 CK C7 C6 C2';
  let session = advanceOpeningPartner(deal('WNT',north,south));
  assert.match(session.auction[0].meaning,/9–13/);
  session = applyPracticeBid(session,'2C');
  assert.deepEqual(session.auction.map(call=>call.bid),['1NT','2C','2H']);
  const done = applyPracticeBid(session,'2NT');
  assert.deepEqual(done.auction.map(call=>call.bid),['1NT','2C','2H','2NT','Pass']);
  assert.equal(done.contract.declarer,'North');
  assert.equal(done.undiscussedBid,undefined);
});

test('weak 1NT super-accepts with the reported minimum, and can clarify with 3H', () => {
  const north = 'S3 S2 HA HT H4 H3 DK DQ D7 D6 D5 CJ C9';
  const south = 'ST S6 S4 HK HQ H8 H7 H5 D3 CA CK C7 C4';
  const response = advanceOpeningPartner(deal('WNT', north, south));
  const superAccept = applyPracticeBid(response, '2D');
  assert.deepEqual(superAccept.auction.map(call => call.bid), ['1NT', '2D', '2NT']);
  const clarified = applyPracticeBid(superAccept, '3C');
  assert.equal(clarified.auction.at(-1).bid, '3H');
  assert.match(clarified.auction.at(-1).meaning, /Minimum super-accept/);
  const retransfer = applyPracticeBid(superAccept, '3D');
  assert.equal(applyPracticeBid(retransfer, 'Pass').contract.declarer, 'North');

  const ordinaryTen = north.replace('D5', 'S5');
  const ordinary = applyPracticeBid(advanceOpeningPartner(deal('WNT', ordinaryTen, south)), '2D');
  assert.equal(ordinary.auction.at(-1).bid, '2H');
});

test('after a weak notrump transfer, a new-suit jump shows shortage and the lower call is natural', () => {
  const north = 'SQ S8 S6 HJ H9 H5 H2 DK D9 D3 CA C9 C5';
  const south = 'SK HA HK HQ HT H8 H6 DJ D8 D2 CK C7 C2';
  let session = advanceOpeningPartner(deal('WNT',north,south));
  session = applyPracticeBid(session,'2D');
  assert.equal(session.auction.at(-1).bid,'2H');
  assert.match(availablePracticeActions(session).find(row=>row.bid==='2S').label,/Natural spades/);
  assert.match(availablePracticeActions(session).find(row=>row.bid==='3S').label,/spades shortage/);
  assert.throws(() => applyPracticeBid(session,'2S'), /natural spades/);
  assert.equal(applyPracticeBid(session,'3S').auction.at(-1).bid,'4H');
});

test('a natural major response of 1NT can lead to opener’s six-card rebid or be passed', () => {
  const north = 'SA S2 HK HQ H8 H7 H5 H4 DK DQ D9 D2 C8';
  const south = 'SK S8 S3 HA H2 DT D8 D5 C9 C7 C6 C5 C4';
  const response = advanceOpeningPartner(deal('H', north, south));
  const after = applyPracticeBid(response, '1NT');
  assert.deepEqual(after.auction.map(call => call.bid), ['1H','1NT','2H']);
  assert.equal(applyPracticeBid(after, 'Pass').contract.bid, '2H');
  const opener = open(deal('H', north, south, 'North'), '1H');
  assert.equal(opener.auction.at(-1).bid, '1NT');
  assert.match(practiceCalls(opener).find(row => row.bid === '2NT').source, /provisional/);
  assert.equal(applyPracticeBid(opener, 'Pass').contract.bid, '1NT');
});

test('a weak club response to 1D lets opener correct and a direct 3D can be declined', () => {
  const north = 'SQ S5 S2 HK H9 H3 DA DJ D9 D8 D6 D2 C3';
  const longClubs = 'SK S9 S3 H8 H7 H4 D7 D5 CQ C9 C7 C5 C2';
  const weakClubs = applyPracticeBid(advanceOpeningPartner(deal('D', north, longClubs)), '2C');
  assert.deepEqual(weakClubs.auction.map(call => call.bid), ['1D','2C','2D']);
  assert.equal(applyPracticeBid(weakClubs, 'Pass').contract.declarer, 'North');

  const diamondInvite = 'ST SJ S4 HQ H8 DK DQ DT D7 D5 CQ C9 C2';
  const invite = applyPracticeBid(advanceOpeningPartner(deal('D', north, diamondInvite)), '3D');
  assert.deepEqual(invite.auction.map(call => call.bid), ['1D','3D','Pass']);
  assert.equal(invite.contract.bid, '3D');
});

test('1D–2NT uses a five-card raise and the Jacoby shortage and range ladder in both seats', () => {
  const south = 'SK SJ S4 HA H8 DK DQ DT D7 D5 CQ C9 C2';
  const clubShort = 'SQ S5 S2 HK H9 H3 DA DJ D9 D8 D6 D2 C3';
  const before = advanceOpeningPartner(deal('D', clubShort, south));
  const raised = applyPracticeBid(before, '2NT');
  assert.deepEqual(raised.auction.map(call => call.bid), ['1D','2NT','3S']);
  assert.match(raised.auction[2].meaning, /Club shortage 9–11/);
  assert.equal(applyPracticeBid(raised, '3NT').contract.bid, '3NT');
  assert.match(practiceCalls(raised).find(row => row.bid === '4C').label, /Shortage Keycard in Diamonds/);
  const keycard = applyPracticeBid(raised, '4C');
  assert.equal(keycard.auction.at(-1).bid, '4S');

  const opener = open(deal('D', clubShort, south, 'North'), '1D');
  assert.equal(opener.pendingAsk.bid, '2NT');
  const answered = applyPracticeBid(opener, '3S');
  assert.deepEqual(answered.auction.slice(0, 3), raised.auction);
  assert.deepEqual(practiceView(answered).playerHand, clubShort.split(' '));
  const store = storage();
  savePracticeProgress({ session: answered, history: [opener], preferences: {practiceMode:'mixed'} }, store);
  assert.deepEqual(loadPracticeProgress(store).progress.session, copy(answered));

  const heartShort = 'SA SQ S5 S2 H3 DA DJ D9 D6 D2 CK C8 C3';
  const middling = applyPracticeBid(advanceOpeningPartner(deal('D', heartShort, south)), '2NT');
  assert.equal(middling.auction.at(-1).bid, '3D');
  assert.equal(practiceCalls(middling).find(row => row.bid === '3NT').kind, 'signoff');
  const ranged = applyPracticeBid(middling, '3H');
  assert.equal(ranged.auction.at(-1).bid, '3NT');
  assert.equal(ranged.auction.at(-1).meaning, '12–14');
  const fourDiamonds = south.replace('D5','C4');
  assert.throws(() => applyPracticeBid(advanceOpeningPartner(deal('D', heartShort, fourDiamonds)), '2NT'), /five-plus diamonds/);
});

test('the 2NT bot can show five-five majors and stops in hearts with two-two support', () => {
  const responder = 'SQ SJ S7 S5 S2 HQ HJ H9 H7 H6 D8 C9 C4'.split(' ');
  const opening = { system:'2NT', node:'respond', auction:[{bid:'2NT'}], hand:responder };
  assert.equal(openingPartnerBid(opening), '3H');
  assert.equal(openingPartnerBid({...opening,node:'after-transfer',major:'S',auction:[{bid:'2NT'},{bid:'3H'},{bid:'3S'}]}),'4H');
  assert.equal(openingPartnerBid({...opening,node:'after-transfer',major:'H',auction:[{bid:'2NT'},{bid:'3D'},{bid:'3H'}]}),'3NT');
  const opener = 'SA SK HA HK DA DK D9 D7 CQ CJ CT C8 C7'.split(' ');
  assert.equal(openingPartnerBid({...opening,node:'nt-55-game',major:'S',hand:opener,
    auction:[{bid:'2NT'},{bid:'3H'},{bid:'3S'},{bid:'4H'}]}),'Pass');
});

test('a flat invitation with a five-card major goes through weak-notrump Stayman', () => {
  const north = 'SK S8 S3 HK H8 H3 DQ D8 D3 CJ C9 C7 C3';
  const south = 'SQ S9 S5 S4 S2 HA HJ H2 DK D5 DA CT C2';
  const opener = open(deal('WNT', north, south, 'North'), '1NT');
  assert.equal(opener.auction.at(-1).bid, '2C');
  assert.equal(applyPracticeBid(opener, '2D').auction.at(-1).bid, '2NT');
  const transfer = applyPracticeBid(advanceOpeningPartner(deal('WNT', north, south)), '2H');
  assert.equal(transfer.auction.at(-1).bid, '2S');
  assert.equal(practiceCalls(transfer).find(row => row.bid === '2NT').discussed, false);
});

test('weak 1C–1NT is playable in both seats and opener can invite naturally', () => {
  const north = 'SA S8 S2 HA H8 H2 DA D9 D2 CK CQ C9 C3';
  const south = 'SK S9 S3 HK H7 H5 DJ D8 D5 CT C7 C5 C2';
  const responder = advanceOpeningPartner(deal('C', north, south));
  const invited = applyPracticeBid(responder,'1NT');
  assert.deepEqual(invited.auction.map(call=>call.bid),['1C','1NT','2NT']);
  assert.equal(applyPracticeBid(invited,'3NT').contract.declarer,'South');

  const opening = open(deal('C',north,south,'North'),'1C');
  assert.equal(opening.auction.at(-1).bid,'1NT');
  assert.equal(applyPracticeBid(opening,'Pass').contract.bid,'1NT');
});
