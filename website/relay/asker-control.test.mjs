import test from 'node:test';
import assert from 'node:assert/strict';
import { DECK, PRACTICE_PROFILES, createPractice, availableActions, applyBid, handFeatures, matchesConstraints } from './core.js';
import { createTrainingPractice, availablePracticeActions, practiceCalls, applyPracticeBid } from './practice.js';

test('Q1: the asker can pass an artificial 3NT keycard answer without changing its meaning or facts', () => {
  let session = createTrainingPractice({ profileId: 'minor-d-s-c', seed: 'audit-pass-5' });
  session = applyPracticeBid(applyPracticeBid(session, '2H'), '3C');
  assert.equal(session.auction.map(call => call.bid).join(' '), '1D 1S 2C 2H 2NT 3C 3NT');
  assert.match(session.auction.at(-1).meaning, /2 or 5 keycards, no trump queen/);
  assert.equal(practiceCalls(session).find(call => call.bid === 'Pass').discussed, true);
  const original = JSON.stringify(session);
  const passed = applyPracticeBid(session, 'Pass');
  assert.deepEqual(passed.contract, { bid: '3NT', level: 3, strain: 'NT', declarer: 'North' });
  assert.deepEqual(passed.constraints, session.constraints);
  assert.deepEqual(passed.auction.slice(0, -1), session.auction);
  assert.equal(passed.finished, true);
  assert.equal(passed.undiscussedBid, undefined);
  assert.equal(JSON.stringify(session), original);
});

test('a legacy artificial-3NT flag cannot block the asker or change a teller response ladder', () => {
  const initial = createTrainingPractice({ profileId: 'rebid-single-h-s', seed: 'asker-control' });
  const session = applyPracticeBid(initial, '3D');
  assert.equal(session.auction.at(-1).bid, '3NT');
  assert.match(session.auction.at(-1).meaning, /spades shortage/);
  assert.equal(session.threeNTToPlay, false);
  assert.equal(availablePracticeActions(session).find(action => action.bid === 'Pass').kind, 'signoff');
  assert.deepEqual(availableActions({ ...session, playerHand: ['hidden'], partnerHand: ['hidden'] }), availableActions(session));
  assert.deepEqual(applyPracticeBid(session, 'Pass').contract, { bid: '3NT', level: 3, strain: 'NT', declarer: 'North' });
  const teller = createTrainingPractice({ profileId: 'rebid-single-h-s', seed: 'asker-control', role: 'teller' });
  assert.equal(teller.pendingAsk.bid, '3D');
  assert.equal(availablePracticeActions(teller).some(action => action.bid === 'Pass'), false);
});

test('the responder controls the early Baron enquiry in whole-auction practice and may pass its answer', () => {
  let session = createTrainingPractice({ auctionMode: true, humanSeat: 'South', seed: 'baron-control' });
  session = { ...session,
    playerHand: 'SK SQ S2 HK H3 DA D9 D8 D4 CA CQ C8 C7'.split(' '),
    partnerHand: 'SA S5 HA HQ HJ H7 H2 DJ DT CJ C6 C5 C4'.split(' ') };
  assert.equal(new Set([...session.playerHand, ...session.partnerHand]).size, 26);
  for (const bid of ['1D', '2C', '2S']) session = applyPracticeBid(session, bid);
  assert.equal(session.opening.node, 'agree-minor');
  assert.equal(session.auction.at(-1).bid, '2NT');
  assert.equal(practiceCalls(session).find(call => call.bid === 'Pass').discussed, true);
  const passed = applyPracticeBid(session, 'Pass');
  assert.equal(passed.contract.bid, '2NT');
  assert.equal(passed.contract.declarer, 'North');
  assert.deepEqual(passed.auction.slice(0, -1), session.auction);
  assert.deepEqual(passed.constraints, session.constraints);
});

test('R0174: minimum answers 3NT; maximum carries the same keycards beyond the normal ladder at 4D', () => {
  const cards = holdings => holdings.split(' ').flatMap((holding, index) => [...holding].map(rank => 'SHDC'[index] + rank));
  for (const [holdings, points, expected] of [['A2 K2 KJ9876 QJ8', 14, '3NT'], ['AK K2 KJ9876 QJ8', 17, '4D']]) {
    const base = createPractice({ profileId: 'rebid-single-d-h', seed: 'R0174' });
    const partnerHand = cards(holdings);
    assert.equal(handFeatures(partnerHand, 'D').hcp, points);
    assert.ok(matchesConstraints(partnerHand, base.constraints, 'D'));
    const playerHand = DECK.filter(card => !partnerHand.includes(card) && '23456789T'.includes(card[1])).slice(0, 13);
    let session = applyBid({ ...base, partnerHand, playerHand }, '2NT');
    assert.equal(session.auction.at(-1).bid, '3C');
    const ladder = availableActions(session).find(action => action.bid === '3D').responseLadder;
    assert.equal(ladder.find(row => row.bid === '3NT').strength.max, 16);
    assert.equal(ladder.at(-1).bid, '4D');
    assert.equal(ladder.at(-1).strength.min, 17);
    session = applyBid(session, '3D');
    assert.equal(session.auction.at(-1).bid, expected);
    assert.match(session.auction.at(-1).meaning, /2 or 5 keycards, no trump queen/);
    assert.equal(applyBid(session, 'Pass').contract.bid, expected);
    assert.deepEqual(session.partnerHand, partnerHand);
  }
});

test('every family lets the asker stop on a relay reply, including below game, with the actual first-strain declarer', () => {
  let replies = 0, belowGame = 0;
  for (const profile of PRACTICE_PROFILES) {
    let session = createPractice({ profileId: profile.id, seed: 'asker-stops' });
    for (let turn = 0; !session.finished && turn < 18; turn++) {
      const action = availableActions(session).find(action => action.kind === 'relay' && (!action.playerConstraints
        || matchesConstraints(session.playerHand, action.playerConstraints, action.trump)));
      if (!action) break;
      session = applyBid(session, action.bid);
      if (session.finished || session.auction.at(-1).bid === 'Pass') break;
      const last = session.auction.at(-1).bid;
      const strain = last.slice(1);
      const expectedDeclarer = session.auction.find(call => call.bid !== 'Pass' && call.bid.slice(1) === strain).seat;
      const passed = applyBid(session, 'Pass');
      assert.equal(passed.contract.bid, last, profile.id);
      assert.equal(passed.contract.declarer, expectedDeclarer, profile.id);
      assert.deepEqual(passed.constraints, session.constraints);
      assert.deepEqual(passed.partnerHand, session.partnerHand);
      if (Number(last[0]) < (['C', 'D'].includes(strain) ? 5 : strain === 'NT' ? 3 : 4)) belowGame++;
      replies++;
    }
  }
  assert.ok(replies > PRACTICE_PROFILES.length);
  assert.ok(belowGame > 0);
});
