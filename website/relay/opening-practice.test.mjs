import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBid, handFeatures } from './core.js';
import { createTrainingPractice, applyPracticeBid, availablePracticeActions, practiceCalls, practiceView } from './practice.js';
import { openingPartnerBid, OPENING_RULES_VERSION } from './opening-practice.js';
import { loadPracticeProgress, savePracticeProgress } from './progress.js';
import { auctionCallDetails } from './auction-study.js';

const json = value => JSON.parse(JSON.stringify(value));
function fixture(humanSeat = 'South') {
  const session = createTrainingPractice({ auctionMode: true, seed: 'source-example', humanSeat: 'North' });
  const playerHand = 'SK SQ S2 HK H3 DA D9 D4 CA CQ C8 C7 C3'.split(' ');
  const partnerHand = 'SA S5 HA HQ HJ H2 DJ DT D8 D7 D3 CJ C6'.split(' ');
  assert.equal(new Set([...playerHand, ...partnerHand]).size, 26);
  assert.equal(handFeatures(playerHand, 'C').hcp, 18);
  assert.equal(handFeatures(partnerHand, 'C').hcp, 13);
  const initial = { ...session, playerHand, partnerHand,
    wholeAuction: { ...session.wholeAuction, humanSeat }, practiceRole: humanSeat === 'North' ? 'asker' : 'teller' };
  return humanSeat === 'South'
    ? { ...applyPracticeBid(initial, '1C'), wholeAuction: { ...initial.wholeAuction, humanSeat: 'South' } }
    : initial;
}

test('source example tests 1D and 3C before joining diamond shortage and keycard practice', () => {
  // P0251, P0285, P0467, P0520: responder shows four hearts, then five
  // diamonds. No future bid or shortage is given away at either decision.
  let session = fixture();
  assert.deepEqual(session.auction.map(call => call.bid), ['1C']);
  assert.equal(session.wholeAuction.humanSeat, 'South');
  assert.deepEqual(session.constraints, []);
  assert.equal(session.openingFacts.South.length, 0);
  const original = json(session);
  assert.throws(() => applyPracticeBid(session, '1H'), /four Spades|four spades/);
  assert.deepEqual(json(session), original);
  session = applyPracticeBid(session, '1D');
  assert.deepEqual(session.auction.map(call => call.bid), ['1C', '1D', '1NT']);
  assert.equal(session.constraints.length, 1);
  assert.equal(session.constraints[0].min, 4);
  assert.throws(() => applyPracticeBid(session, '2NT'), /five Clubs/);
  const before = session;
  session = applyPracticeBid(session, '3C');
  assert.equal(session.familyId, 'dappleton-h-d-four-major');
  assert.equal(session.opening, null);
  assert.equal(session.pendingAsk.bid, '3D');
  assert.deepEqual(practiceView(session).auction.map(call => call.bid), ['1C', '1D', '1NT', '3C', '3D']);
  assert.deepEqual(session.playerHand, original.playerHand);
  assert.deepEqual(session.partnerHand, original.partnerHand);
  assert.equal(practiceView(session).playerSeat, 'South');
  assert.equal(auctionCallDetails(session, [original, before], 0).alternatives.length, 0);
  const answer = applyBid(session, session.pendingAsk.bid).auction[session.auction.length + 1].bid;
  session = applyPracticeBid(session, answer);
  assert.ok(session.constraints.length > before.constraints.length);
  assert.equal(session.wholeAuction.humanSeat, 'South');
});

test('opener makes the actual opening and rebid, with truthful partner automation and retained declarer', () => {
  let session = fixture('North');
  assert.equal(session.auction.length, 0);
  assert.equal(practiceView(session).playerSeat, 'North');
  session = applyPracticeBid(session, '1C');
  assert.deepEqual(session.auction.map(call => call.bid), ['1C', '1D']);
  const before = json(session);
  assert.throws(() => applyPracticeBid(session, '1H'), /14–17/);
  assert.deepEqual(json(session), before);
  session = applyPracticeBid(session, '1NT');
  assert.equal(session.familyId, 'dappleton-h-d-four-major');
  assert.deepEqual(session.auction.map(call => call.bid), ['1C', '1D', '1NT', '3C']);
  session = applyPracticeBid(session, '3D');
  session = applyPracticeBid(session, '6D');
  assert.equal(session.contract.declarer, 'South', 'The artificial 1D response determines declarer');
  assert.equal(session.finished, true);
});

test('public bid choices never identify the right opening response using hidden cards', () => {
  const session = fixture();
  const hidden = { ...session, playerHand: ['hidden'], partnerHand: ['hidden'] };
  assert.deepEqual(availablePracticeActions(hidden), availablePracticeActions(session));
  assert.deepEqual(practiceCalls(hidden), practiceCalls(session));
  const input = { node: 'rebid', major: 'H', hand: session.playerHand, auction: session.auction };
  assert.equal(openingPartnerBid(input), '1NT');
  assert.equal(openingPartnerBid({ ...input, partnerHand: ['hidden'], targetProfile: 'wrong' }), '1NT');
});

test('a legal continuation beyond coverage pauses without reveal or invented facts and remains undoable', () => {
  const initial = fixture();
  const next = applyPracticeBid(initial, '2D');
  assert.equal(next.coverageBoundary, true);
  assert.equal(next.revealed, false);
  assert.equal(next.contract, null);
  assert.deepEqual(next.constraints, initial.constraints);
  assert.deepEqual(next.partnerHand, initial.partnerHand);
  assert.match(next.unsupportedReason, /not been graded/);
  assert.deepEqual(applyPracticeBid(initial, '1D').auction.map(call => call.bid), ['1C', '1D', '1NT']);
});

test('generated opening games preserve every earlier hand and save across the transition into a relay family', () => {
  const routes = new Set(), endings = new Set();
  for (const humanSeat of ['North', 'South']) for (let i = 0; i < 16; i++) {
    let session = createTrainingPractice({ auctionMode: true, seed: `opening-walk-${i}`, humanSeat });
    const history = [], original = json(session);
    for (let turn = 0; !session.finished && turn < 30; turn++) {
      const storage = { setItem(key, value) { this.value = value; }, getItem() { return this.value; } };
      savePracticeProgress({ session, history, preferences: { practiceMode: 'auction' } }, storage);
      const restored = loadPracticeProgress(storage);
      assert.equal(restored.error, undefined);
      assert.equal(restored.progress.preferences.practiceMode, 'auction');
      assert.deepEqual(restored.progress.session, json(session));
      assert.deepEqual(restored.progress.history, json(history));
      let bid;
      if (session.opening) bid = openingPartnerBid({ ...session.opening, auction: session.auction, hand: practiceView(session).playerHand });
      else if (session.practiceRole === 'teller') bid = applyBid(session, session.pendingAsk.bid).auction[session.auction.length + 1].bid;
      else bid = (availablePracticeActions(session).find(action => action.kind === 'relay') ?? availablePracticeActions(session).find(action => action.kind === 'signoff')).bid;
      history.push(session);
      session = applyPracticeBid(session, bid);
      assert.deepEqual(session.playerHand, original.playerHand);
      assert.deepEqual(session.partnerHand, original.partnerHand);
      assert.equal(practiceView(session).playerSeat, humanSeat);
      routes.add(session.familyId);
    }
    assert.equal(session.finished, true);
    endings.add(session.contract?.bid ?? 'boundary');
    const storage = { setItem(k, v) { this.value = v; }, getItem() { return this.value; } };
    savePracticeProgress({ session, history, preferences: {} }, storage);
    assert.equal(loadPracticeProgress(storage).error, undefined);
    const wrongRevision = { ...session, wholeAuction: { ...session.wholeAuction, rulesVersion: OPENING_RULES_VERSION + 1 } };
    savePracticeProgress({ session: wrongRevision, history: [] }, storage);
    assert.match(loadPracticeProgress(storage).error, /incompatible/);
  }
  assert.ok([...routes].some(route => route.endsWith('four-major')));
  assert.ok([...routes].some(route => route.endsWith('five-major')));
  assert.ok([...routes].some(route => route.includes('baron')));
  assert.ok([...endings].some(ending => ending.startsWith('1')));
});
