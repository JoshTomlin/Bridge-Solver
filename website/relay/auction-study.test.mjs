import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_PROFILES, applyBid, revealPractice, availableActions } from './core.js';
import { createTrainingPractice, applyPracticeBid, practiceView } from './practice.js';
import { auctionCallDetails } from './auction-study.js';
import { shortBidDescription } from './bid-descriptions.js';

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

test('July heart-support continuation names the agreed suit on every keycard step', () => {
  const initial = createTrainingPractice({ profileId: 'minor-c-h-s', seed: 'keycard-suit-3' });
  const before = applyPracticeBid(initial, '2D');
  assert.equal(before.auction.at(-1).bid, '3C');
  assert.match(before.auction.at(-1).meaning, /4315/);
  // July E4/E6: opening minor, opener's second suit, responder's supported
  // hearts, then the surprise other minor; 3NT stays available to play.
  for (const [bid, trump, suit] of [['3D', 'C', 'Clubs'], ['3H', 'S', 'Spades'], ['3S', 'H', 'Hearts'], ['4C', 'D', 'Diamonds']]) {
    const action = availableActions(before).find(action => action.bid === bid);
    assert.equal(action.trump, trump);
    assert.equal(shortBidDescription(action.label), `Shortage Keycard in ${suit}`);
    const after = applyPracticeBid(before, bid);
    assert.equal(after.trump, trump);
    const questionIndex = before.auction.length;
    for (const index of [questionIndex, questionIndex + 1]) {
      const detail = auctionCallDetails(after, [initial, before], index);
      assert.equal(detail.question.meaning, `Shortage Keycard in ${suit}`);
      assert.deepEqual(detail.alternatives.map(answer => answer.bid), action.responseLadder.map(answer => answer.bid));
    }
  }
  assert.equal(availableActions(before).find(action => action.bid === '3NT').kind, 'signoff');
});

test('saved generic keycard meanings recover the historical suit without changing progress or reading hands', () => {
  const initial = createTrainingPractice({ profileId: 'minor-c-h-s', seed: 'keycard-suit-3' });
  const before = applyPracticeBid(initial, '2D');
  const legacy = JSON.parse(JSON.stringify(applyPracticeBid(before, '3D')));
  const index = before.auction.length;
  legacy.auction[index].meaning = 'Ask Shortage Keycard';
  const progress = JSON.stringify(legacy);
  // A different current trump must never relabel an earlier question.
  const hidden = { ...legacy, trump: 'S', major: 'S', playerHand: ['hidden'], partnerHand: ['hidden'] };
  const publicBefore = { ...before, playerHand: ['hidden'], partnerHand: ['hidden'] };
  for (const selected of [index, index + 1]) {
    const detail = auctionCallDetails(hidden, [publicBefore], selected);
    assert.equal(detail.question.meaning, 'Shortage Keycard in Clubs');
    if (selected === index) assert.equal(detail.call.meaning, 'Shortage Keycard in Clubs');
  }
  assert.equal(JSON.stringify(legacy), progress);
  assert.equal(auctionCallDetails(hidden, [], index).question.meaning, 'Ask Shortage Keycard', 'Do not guess a missing historical suit');
  assert.equal(shortBidDescription('Agree spades and ask shortage keycard'), 'Shortage Keycard in Spades');
  assert.equal(shortBidDescription('Agree hearts and ask shortage keycard'), 'Shortage Keycard in Hearts');
});
