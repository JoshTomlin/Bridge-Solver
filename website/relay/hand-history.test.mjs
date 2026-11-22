import assert from 'node:assert/strict';
import test from 'node:test';
import { PRACTICE_PROFILES, applyBid, revealPractice } from './core.js';
import { createTrainingPractice, applyPracticeBid, practiceCalls } from './practice.js';
import { tableView as practiceView } from './seat-view.js';
import { savePracticeProgress, loadPracticeProgress } from './progress.js';
import { HAND_HISTORY_KEY, HAND_HISTORY_LIMIT, createHandRecord, loadHandHistory, updateHandHistory,
  saveHandHistory, recordedCallDetails, canReviewBothHands, handRecordText } from './hand-history.js';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const record = (session, history = [], id = 'hand-1') => createHandRecord(session, history, { id });
const clone = value => JSON.parse(JSON.stringify(value));

test('history records both roles across every family and survives without live profile or node data', () => {
  const storage = memoryStorage();
  for (const profile of PRACTICE_PROFILES) for (const role of ['asker', 'teller']) {
    const session = createTrainingPractice({ profileId: profile.id, role, seed: 'archive-all' });
    const snapshot = record(session);
    assert.equal(saveHandHistory(updateHandHistory([], snapshot), storage).ok, true);
    const restored = loadHandHistory(storage);
    assert.equal(restored.error, undefined, `${profile.id}/${role}`);
    assert.deepEqual(restored.records, [snapshot]);
    assert.deepEqual(snapshot.hands[practiceView(session).playerSeat], practiceView(session).playerHand);
    assert.equal(snapshot.auction.length, practiceView(session).auction.length, 'Pending teller question is included');
    assert.equal('session' in snapshot, false);
    assert.equal('familyId' in snapshot, false, 'Historical review does not require current family definitions');
  }
});

test('bids, reveal and undo update one hand; new deals, including seed replays, remain separate', () => {
  const initial = createTrainingPractice({ seed: 'archive-lifecycle' });
  const answered = applyPracticeBid(initial, '2NT');
  const completed = revealPractice(applyPracticeBid(answered, '6S'));
  let records = updateHandHistory([], record(initial));
  records = updateHandHistory(records, record(answered, [initial]));
  records = updateHandHistory(records, record(completed, [initial, answered]));
  assert.equal(records.length, 1);
  assert.equal(records[0].contract.bid, '6S');
  records = updateHandHistory(records, record(answered, [initial]));
  assert.equal(records[0].contract, null, 'Undo replaces the completed snapshot');
  records = updateHandHistory(records, record(initial, [], 'replay'));
  assert.deepEqual(records.map(hand => hand.id), ['replay', 'hand-1']);
  const storage = memoryStorage();
  savePracticeProgress({ session: answered, history: [initial], handId: 'hand-1' }, storage);
  assert.equal(loadPracticeProgress(storage).progress.handId, 'hand-1', 'Reload preserves archive identity');
});

test('history retains the newest 100 hands and updates the current hand without duplicate entries', () => {
  const snapshot = record(createTrainingPractice({ seed: 'archive-limit' }));
  let records = [];
  for (let i = 0; i < HAND_HISTORY_LIMIT + 5; i++) records = updateHandHistory(records, { ...snapshot, id: `hand-${i}` });
  assert.equal(records.length, 100);
  assert.equal(records[0].id, 'hand-104');
  assert.equal(records.at(-1).id, 'hand-5');
  records = updateHandHistory(records, { ...records[0], seed: 'updated' });
  assert.equal(records.length, 100);
  assert.equal(records[0].seed, 'updated');
});

test('historical meanings, question suit and response ladders are frozen independently of the session', () => {
  const initial = createTrainingPractice({ seed: 'relay-1' });
  const first = applyPracticeBid(initial, '2NT');
  const session = applyPracticeBid(first, '4C');
  const snapshot = record(session, [initial, first]);
  const questionIndex = snapshot.auction.findIndex(call => call.bid === '4C');
  const detail = recordedCallDetails(snapshot, questionIndex + 1);
  assert.match(detail.question.meaning, /[Ss]pade/);
  assert.ok(detail.alternatives.length > 1);
  assert.equal(detail.auction.at(-1).bid, '4C');
  const frozen = clone(detail);
  const changedSession = clone(session);
  changedSession.auction[questionIndex].meaning = 'Changed system notes';
  changedSession.playerHand[0] = 'xx';
  assert.deepEqual(clone(recordedCallDetails(snapshot, questionIndex + 1)), frozen);
  assert.equal(recordedCallDetails(snapshot, -1), null);
});

test('review and text hide the active hidden hand in either role, but show both hands after reveal or moving on', () => {
  for (const role of ['asker', 'teller']) {
    const session = createTrainingPractice({ profileId: 'dappleton-h-d-four-major', role, seed: 'archive-secrecy' });
    const snapshot = record(session);
    assert.equal(canReviewBothHands(snapshot, 'hand-1'), false);
    assert.match(handRecordText(snapshot, 'hand-1'), /Hidden while this hand is in progress/);
    assert.equal(canReviewBothHands(snapshot, 'next-hand'), true);
    assert.doesNotMatch(handRecordText(snapshot, 'next-hand'), /Hidden/);
    assert.equal(canReviewBothHands(record(revealPractice(session)), 'hand-1'), true);
  }
});

test('text export includes both hands, full auction, bid explanations, declarer and reproducible seed', () => {
  const initial = createTrainingPractice({ seed: 'relay-1' });
  const first = applyPracticeBid(initial, '2NT');
  const completed = revealPractice(applyPracticeBid(first, '6S'));
  const exported = handRecordText(record(completed, [initial, first]), 'hand-1');
  assert.match(exported, /6♠ by North/);
  assert.match(exported, /North \(partner\): ♠/);
  assert.match(exported, /South \(you\): ♠/);
  assert.match(exported, /North\tEast\tSouth\tWest/);
  assert.match(exported, /Bid explanations/);
  assert.match(exported, /Hand seed: relay-1/);
  assert.match(exported, /Pass/);
});

test('whole auctions and undiscussed hands can be archived and shared', () => {
  for (const humanSeat of ['North', 'South']) {
    const opening = createTrainingPractice({ auctionMode: true, humanSeat, seed: 'archive-opening' });
    const snapshot = record(opening);
    assert.equal(snapshot.humanSeat, 'South');
    assert.ok(updateHandHistory([], snapshot));
    assert.match(handRecordText(snapshot, 'hand-1'), /Whole auction/);
  }
  const initial = createTrainingPractice({ seed: 'archive-undiscussed' });
  const paused = applyPracticeBid(initial, practiceCalls(initial).find(call => !call.discussed).bid);
  assert.match(handRecordText(record(paused, [initial]), 'hand-1'), /Undiscussed/);
});

test('older North-human records rotate cards, auction, question context and declarer together on load', () => {
  const session = createTrainingPractice({ role: 'teller', seed: 'old-north-record' });
  const expected = record(session);
  const swap = seat => seat === 'North' ? 'South' : seat === 'South' ? 'North' : seat;
  const old = clone(expected);
  old.humanSeat = 'North';
  [old.hands.North, old.hands.South] = [old.hands.South, old.hands.North];
  old.auction.forEach(call => { call.seat = swap(call.seat); if (call.study.question) call.study.question.seat = swap(call.study.question.seat); });
  const storage = memoryStorage();
  saveHandHistory([old], storage);
  assert.deepEqual(loadHandHistory(storage).records, [expected]);
  assert.deepEqual(old.hands.North, expected.hands.South, 'Loading does not mutate the saved input');
});

test('corrupt entries are isolated; unreadable storage and quota failures preserve the last good history', () => {
  const storage = memoryStorage();
  const snapshot = record(createTrainingPractice({ seed: 'archive-corrupt' }));
  saveHandHistory([snapshot, { id: 'broken' }], storage);
  assert.deepEqual(loadHandHistory(storage).records, [snapshot]);
  assert.ok(loadHandHistory(storage).warning);
  for (const bad of ['{', 'null', '{"version":99,"records":[]}']) {
    storage.setItem(HAND_HISTORY_KEY, bad);
    assert.ok(loadHandHistory(storage).error);
  }
  saveHandHistory([snapshot], storage);
  const quota = { ...storage, setItem() { throw new Error('Quota exceeded'); } };
  assert.equal(saveHandHistory([], quota).ok, false);
  assert.deepEqual(loadHandHistory(storage).records, [snapshot]);
  assert.match(loadHandHistory({ getItem() { throw new Error('Storage blocked'); } }).error, /Storage blocked/);
  const invalid = clone(snapshot);
  invalid.auction[0].bid = '<img src=x>';
  saveHandHistory([invalid, snapshot], storage);
  assert.deepEqual(loadHandHistory(storage).records, [snapshot]);
});
