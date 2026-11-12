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

test('1C–1S–1NT shows the full source continuations and the bot’s Baron choices in both roles', () => {
  const expected = ['2C', '2D', '2H', '2S', '2NT', '3C', '3D', '3H', '3S', '3NT'];
  for (const role of ['asker', 'teller']) {
    const initial = createTrainingPractice({ profileId: 'club-1s-1nt-baron', role, seed: 'source-alternatives' });
    const session = role === 'asker' ? applyPracticeBid(initial, '2S') : initial;
    const saved = JSON.parse(JSON.stringify({ session, history: [initial] }));
    const before = JSON.stringify(saved);
    const hidden = { ...saved.session, playerHand: ['hidden'], partnerHand: ['hidden'] };
    const context = auctionCallDetails(hidden, [], 2);
    assert.deepEqual(context.alternatives.map(option => option.bid), expected);
    assert.deepEqual(context.auction.map(call => call.bid), ['1C', '1S', '1NT']);
    assert.equal(context.playedBid, '2S');
    assert.match(context.alternatives.find(option => option.bid === '2NT').label, /Five clubs and four diamonds/);
    assert.match(context.alternatives.find(option => option.bid === '3C').label, /Five diamonds and four clubs/);
    assert.match(context.alternatives.find(option => option.bid === '3D').label, /heart shortage/);
    assert.match(context.alternatives.find(option => option.bid === '3H').label, /spade shortage/);
    assert.match(context.alternatives.find(option => option.bid === '3S').label, /diamond shortage/);
    const baron = auctionCallDetails(hidden, [], 3);
    assert.deepEqual(baron.callAlternatives.map(option => option.bid).filter(bid => expected.includes(bid)), expected);
    assert.deepEqual(baron.alternatives.map(option => option.bid), ['2NT', '3C', '3D', '3NT']);
    assert.equal(JSON.stringify(saved), before);
    const otherAuction = { ...hidden, auction: hidden.auction.map((call, index) => index === 1 ? { ...call, bid: '1H' } : call) };
    assert.match(auctionCallDetails(otherAuction, [], 2).alternatives.find(option => option.bid === '2NT').label, /Exactly five clubs.*four spades/, 'A major transfer uses its own Dappleton table');
  }
});

test('a bot’s relay question offers its other public asking calls without consulting either hand', () => {
  const session = createTrainingPractice({ profileId: 'major-S', role: 'teller', seed: 'bot-choices' });
  const hidden = { ...session, playerHand: ['hidden'], partnerHand: ['hidden'] };
  const detail = auctionCallDetails(hidden, [], 1);
  assert.equal(detail.call.bid, '2NT');
  assert.deepEqual(detail.callAlternatives.map(option => option.bid), availableActions(hidden).map(option => option.bid));
  assert.match(detail.callAlternatives.find(option => option.bid === '2NT').label, /Four-plus spades; game-forcing/);
  assert.ok(detail.callAlternatives.some(option => option.bid === '6S'));
  assert.ok(detail.alternatives.some(option => option.bid === '3C'));
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

test('saved splinter entry popups recover the named shortage without reading cards or rewriting the auction', () => {
  for (const profile of PRACTICE_PROFILES.filter(profile => profile.id.startsWith('rebid-splinter'))) {
    const session = createTrainingPractice({ profileId: profile.id, seed: 'saved-splinter-label' });
    const legacy = JSON.parse(JSON.stringify(session));
    legacy.auction.forEach(call => { call.meaning = 'Source-defined relay entry'; });
    const before = JSON.stringify(legacy);
    const hidden = { ...legacy, playerHand: ['unknown'], partnerHand: ['unknown'] };
    const detail = auctionCallDetails(hidden, [], 2);
    assert.equal(detail.call.meaning, profile.initialAuction[2].meaning);
    assert.deepEqual(detail.alternatives, [], 'A fixed entry is not an answer to a relay question');
    assert.equal(JSON.stringify(legacy), before);
    const unrelated = { ...hidden, auction: legacy.auction.map((call, i) => i === 0 ? { ...call, bid: '1S' } : call) };
    assert.equal(auctionCallDetails(unrelated, [], 2).call.meaning, 'Source-defined relay entry', 'Do not relabel a different auction');
  }
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
