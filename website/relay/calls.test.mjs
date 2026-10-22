import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingPractice, availablePracticeActions, practiceCalls, applyPracticeBid, practiceView } from './practice.js';
import { PRACTICE_PROFILES, bidIndex, applyBid } from './core.js';
import { savePracticeProgress, loadPracticeProgress } from './progress.js';

test('all legal calls are offered in every family and role with the existing public agreements marked', () => {
  for (const profile of PRACTICE_PROFILES) for (const role of ['asker', 'teller']) {
    const session = createTrainingPractice({ profileId: profile.id, role, seed: 'all-calls' });
    const last = practiceView(session).auction.findLast(call => call.bid !== 'Pass').bid;
    const calls = practiceCalls(session);
    assert.equal(calls.length, 35 - bidIndex(last));
    assert.equal(calls.at(-1).bid, 'Pass');
    assert.equal(new Set(calls.map(call => call.bid)).size, calls.length);
    assert.ok(calls.every(call => call.bid === 'Pass' || bidIndex(call.bid) > bidIndex(last)));
    assert.deepEqual(calls.filter(call => call.discussed).map(call => call.bid).sort(), availablePracticeActions(session).map(call => call.bid).sort());
    assert.deepEqual(practiceCalls({ ...session, playerHand: ['hidden'], partnerHand: ['hidden'] }), calls);
  }
});

for (const role of ['asker', 'teller']) {
  test(`an undiscussed ${role} call records the right seat and question without an invented answer or facts`, () => {
    const initial = createTrainingPractice({ profileId: 'major-S', role, seed: 'undiscussed' });
    const before = JSON.stringify(initial);
    const view = practiceView(initial);
    const call = practiceCalls(initial).find(call => !call.discussed && call.bid !== 'Pass');
    const next = applyPracticeBid(initial, call.bid);
    assert.equal(next.undiscussedBid, call.bid);
    assert.equal(next.finished, true);
    assert.equal(next.revealed, false);
    assert.equal(next.pendingAsk, null);
    assert.equal(next.contract, null);
    assert.equal(next.auction.length, view.auction.length + 1);
    assert.deepEqual(next.auction.slice(0, -1), view.auction);
    assert.equal(next.auction.at(-1).seat, view.playerSeat);
    assert.deepEqual(next.constraints, initial.constraints);
    assert.deepEqual(next.partnerHand, initial.partnerHand);
    assert.deepEqual(next.playerHand, initial.playerHand);
    assert.deepEqual(practiceCalls(next), []);
    assert.equal(JSON.stringify(initial), before);
    let raw;
    const storage = { setItem: (_key, value) => { raw = value; }, getItem: () => raw };
    assert.equal(savePracticeProgress({ session: next, history: [initial], preferences: {} }, storage).ok, true);
    const restored = loadPracticeProgress(storage);
    assert.equal(restored.error, undefined);
    assert.deepEqual(restored.progress.session, JSON.parse(JSON.stringify(next)));
    assert.deepEqual(practiceCalls(restored.progress.history[0]), practiceCalls(initial));
  });
}

test('an undiscussed Pass ends at the actual contract with its original first-strain declarer', () => {
  const initial = createTrainingPractice({ profileId: 'major-S', role: 'teller', seed: 'pass-declarer' });
  const next = applyPracticeBid(initial, 'Pass');
  assert.equal(next.undiscussedBid, 'Pass');
  assert.deepEqual(next.contract, { bid: '2NT', level: 2, strain: 'NT', declarer: initial.playerSeat });
  assert.equal(next.auction.at(-1).seat, initial.partnerSeat);
  assert.equal(next.auction.length, initial.auction.length + 2);
});

test('discussed wrong answers still allow retry and lower bids stay illegal', () => {
  const initial = createTrainingPractice({ role: 'teller', seed: 'retry-calls' });
  const answered = applyBid(initial, initial.pendingAsk.bid);
  const correct = answered.auction.slice(initial.auction.length).find(call => call.seat === initial.partnerSeat).bid;
  const wrong = availablePracticeActions(initial).find(call => call.bid !== correct);
  assert.throws(() => applyPracticeBid(initial, wrong.bid), /does not match your hand/);
  assert.throws(() => applyPracticeBid(initial, '1C'), /legal call/);
  assert.equal(initial.finished, false);
});
