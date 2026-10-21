import assert from 'node:assert/strict';
import test from 'node:test';
import { createPractice, applyBid, revealPractice, PRACTICE_PROFILES } from './core.js';
import { createTrainingPractice, availablePracticeActions, applyPracticeBid, practiceView, advanceAsker } from './practice.js';

test('role changes which fixed hand is visible, including Dappleton’s reversed seats', () => {
  for (const profileId of ['major-S', 'minor-d-h-c', 'dappleton-h-d-four-major']) {
    const options = { profileId, seed: 'same-role-deal' };
    const original = createPractice(options);
    const asker = createTrainingPractice(options);
    const teller = createTrainingPractice({ ...options, role: 'teller' });
    assert.deepEqual(asker.playerHand, original.playerHand);
    assert.deepEqual(teller.playerHand, original.playerHand);
    assert.deepEqual(teller.partnerHand, original.partnerHand);
    assert.deepEqual(practiceView(teller).playerHand, original.partnerHand);
    assert.deepEqual(practiceView(teller).partnerHand, original.playerHand);
    assert.equal(practiceView(teller).playerSeat, original.partnerSeat);
    assert.equal(practiceView(teller).partnerSeat, original.playerSeat);
    assert.equal(practiceView(asker).playerSeat, original.playerSeat);
    assert.equal(teller.revealed, false);
    assert.equal(Object.isFrozen(teller), true);
  }
  assert.throws(() => createTrainingPractice({ role: 'other' }), /asker or teller/);
});

test('asker practice retains the original source interpreter and final-contract choice', () => {
  const initial = createTrainingPractice({ seed: 'asker-control' });
  const next = applyPracticeBid(initial, '2NT');
  assert.deepEqual(next, applyBid(initial, '2NT'));
  assert.equal(practiceView(next).auction.length, 3);
  const final = applyPracticeBid(next, '6S');
  assert.equal(final.contract.bid, '6S');
  assert.equal(final.contract.declarer, 'North');
  assert.equal(final.finished, true);
});

test('wrong teller responses leave the question, cards, auction and facts unchanged', () => {
  const initial = createTrainingPractice({ seed: 'wrong-answer', role: 'teller' });
  const before = JSON.stringify(initial);
  const resolved = applyBid(initial, initial.pendingAsk.bid);
  const answer = resolved.auction.at(-1).bid;
  const wrong = availablePracticeActions(initial).find(action => action.bid !== answer);
  assert.ok(wrong);
  assert.throws(() => applyPracticeBid(initial, wrong.bid), /does not match your hand/);
  assert.throws(() => applyPracticeBid(initial, '1C'), /not an available response/);
  assert.equal(JSON.stringify(initial), before);
  assert.equal(initial.auction.length, 1, 'No answer is committed before the human responds');
  assert.equal(practiceView(initial).auction.at(-1).bid, '2NT');
  const accepted = applyPracticeBid(initial, answer);
  assert.deepEqual(accepted.auction, resolved.auction);
  assert.deepEqual(accepted.constraints, resolved.constraints);
  assert.deepEqual(accepted.partnerHand, initial.partnerHand);
  assert.equal(accepted.revealed, false);
  assert.equal(initial.pendingAsk.bid, '2NT', 'The old state remains a usable undo snapshot');
});

test('questions and offered responses do not read the hidden teller hand', () => {
  for (const profileId of ['major-H', 'minor-d-h-c', 'dappleton-h-d-four-major', 'rebid-single-d-h']) {
    let session = createTrainingPractice({ profileId, role: 'teller', seed: 'public-prompts' });
    while (!session.finished) {
      const { pendingAsk, ...base } = session;
      const hidden = { ...base, partnerHand: ['hidden'] };
      const prompt = advanceAsker(hidden);
      assert.deepEqual(prompt.pendingAsk, pendingAsk, profileId);
      assert.deepEqual(availablePracticeActions(prompt), availablePracticeActions(session), profileId);
      const answered = applyBid(session, pendingAsk.bid);
      const response = answered.auction.slice(session.auction.length).find(call => call.seat === session.partnerSeat);
      session = applyPracticeBid(session, response.bid);
    }
  }
});

test('all 63 exercises support teller answers through source questions and terminal Pass', () => {
  let answers = 0;
  let finalPasses = 0;
  let sourcePasses = 0;
  for (const profile of PRACTICE_PROFILES) for (const seed of ['role-a', 'role-b']) {
    let session = createTrainingPractice({ profileId: profile.id, seed, role: 'teller' });
    const original = session;
    for (let turn = 0; !session.finished && turn < 20; turn += 1) {
      const pending = session.pendingAsk;
      assert.ok(pending, profile.id);
      const expected = applyBid(session, pending.bid);
      const answer = expected.auction.slice(session.auction.length).find(call => call.seat === session.partnerSeat);
      assert.ok(answer, profile.id);
      assert.ok(availablePracticeActions(session).some(action => action.bid === answer.bid), `${profile.id}: ${answer.bid}`);
      if (answer.bid === 'Pass') {
        if (pending.kind === 'signoff') finalPasses += 1;
        else sourcePasses += 1;
      }
      session = applyPracticeBid(session, answer.bid);
      assert.deepEqual(session.playerHand, original.playerHand);
      assert.deepEqual(session.partnerHand, original.partnerHand);
      answers += 1;
    }
    assert.equal(session.finished, true, profile.id);
    assert.ok(session.contract || session.unsupportedReason, profile.id);
    assert.deepEqual(availablePracticeActions(session), []);
    const revealed = revealPractice(session);
    assert.equal(revealed.revealed, true);
    assert.deepEqual(practiceView(revealed).partnerHand, original.playerHand);
    assert.deepEqual(availablePracticeActions(revealed), []);
  }
  assert.ok(answers > 200);
  assert.ok(finalPasses > 0);
  assert.ok(sourcePasses > 0);
});
