import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_PROFILES, applyBid, revealPractice } from './core.js';
import { createTrainingPractice, applyPracticeBid, practiceView } from './practice.js';
import { auctionCallDetails } from './auction-study.js';

const publicLadder = ladder => {
  const bids = new Map();
  for (const answer of ladder) bids.set(answer.bid, {
    bid: answer.bid, label: bids.has(answer.bid) ? `${bids.get(answer.bid).label} / ${answer.label}` : answer.label,
  });
  return [...bids.values()];
};

test('every family retains the correct historical response alternatives through completion and JSON restoration', () => {
  let questions = 0;
  for (const profile of PRACTICE_PROFILES) {
    let session = createTrainingPractice({ profileId: profile.id, role: 'teller', seed: 'study-tree' });
    const history = [], expected = [];
    for (let turn = 0; !session.finished && turn < 25; turn++) {
      const question = session.pendingAsk;
      const resolved = applyBid(session, question.bid);
      const response = resolved.auction[session.auction.length + 1];
      expected.push({ index: session.auction.length, ladder: publicLadder(question.responseLadder), response: response.bid });
      history.push(session);
      session = applyPracticeBid(session, response.bid);
    }
    assert.equal(session.finished, true, profile.id);
    const restored = JSON.parse(JSON.stringify({ session: revealPractice(session), history }));
    const before = JSON.stringify(restored);
    for (const { index, ladder, response } of expected) for (const selected of [index, index + 1]) {
      const details = auctionCallDetails(restored.session, restored.history, selected);
      assert.deepEqual(details.alternatives, ladder, `${profile.id} call ${selected}`);
      assert.deepEqual(details.auction, restored.session.auction.slice(0, index + 1));
      assert.equal(details.playedBid, response);
      questions++;
    }
    assert.equal(JSON.stringify(restored), before, 'Studying never changes bidding or undo history');
  }
  assert.ok(questions > 400);
});

test('an unanswered teller question shows every public step without consulting either hand', () => {
  const session = createTrainingPractice({ role: 'teller', seed: 'study-pending' });
  const hidden = { ...session, playerHand: ['hidden'], partnerHand: ['hidden'] };
  const index = session.auction.length;
  const detail = auctionCallDetails(hidden, [], index);
  assert.deepEqual(detail.alternatives, publicLadder(session.pendingAsk.responseLadder));
  assert.equal(detail.playedBid, null);
  assert.deepEqual(detail.auction, practiceView(session).auction);
});

test('older major auctions recover ladders from their saved undo states, including both asker calls and responses', () => {
  const original = createTrainingPractice({ profileId: 'major-S', seed: 'old-study' });
  const next = applyPracticeBid(original, '2NT');
  const legacy = JSON.parse(JSON.stringify(next));
  delete legacy.auction[1].responseLadder;
  for (const selected of [1, 2]) {
    const detail = auctionCallDetails(legacy, [original], selected);
    assert.ok(detail.alternatives.length >= 4);
    assert.equal(detail.question.bid, '2NT');
    assert.deepEqual(detail.auction.map(call => call.bid), ['1S', '2NT']);
    assert.equal(detail.playedBid, next.auction[2].bid);
  }
});

test('fixed opening sequences and undiscussed questions do not invent alternatives', () => {
  const session = createTrainingPractice({ seed: 'study-boundary' });
  assert.deepEqual(auctionCallDetails(session, [], 0).alternatives, []);
  assert.equal(auctionCallDetails(session, [], 99), null);
  const unknown = applyPracticeBid(session, '3C');
  assert.deepEqual(auctionCallDetails(unknown, [session], 1).alternatives, []);
  const beforePass = { ...session, phase: 'unsupported', auction: [
    ...session.auction, { seat: 'South', bid: '2NT' }, { seat: 'North', bid: '4S' },
  ] };
  const passed = applyPracticeBid(beforePass, 'Pass');
  assert.equal(passed.finished, true);
  assert.deepEqual(auctionCallDetails(passed, [beforePass], 3).alternatives, [], 'A final Pass needs no further partner response');
});
