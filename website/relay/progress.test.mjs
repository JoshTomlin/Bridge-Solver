import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBid, revealPractice, PRACTICE_PROFILES } from './core.js';
import { createTrainingPractice, applyPracticeBid, availablePracticeActions, practiceView } from './practice.js';
import { PROGRESS_KEY, savePracticeProgress, loadPracticeProgress } from './progress.js';

function memoryStorage() {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
}

// JSON omits optional properties whose value is undefined; their bridge meaning
// is unchanged. Compare persisted data, then exercise the restored transitions.
const jsonValue = value => JSON.parse(JSON.stringify(value));

test('asker progress restores the exact auction, fixed cards, preferences and usable undo states', () => {
  const storage = memoryStorage();
  const initial = createTrainingPractice({ profileId: 'major-H', seed: 'resume-asker' });
  const first = applyPracticeBid(initial, '2NT');
  const action = availablePracticeActions(first).find(action => action.kind === 'relay');
  const session = applyPracticeBid(first, action.bid);
  const history = [initial, first];
  const preferences = { showHints: true, sampleCount: '500', analysisBasis: 'auction', assessedContract: '6H', bidInput: '5NT', studyProfileId: '' };
  assert.equal(savePracticeProgress({ session, history, preferences }, storage).ok, true);
  const restored = loadPracticeProgress(storage);
  assert.equal(restored.error, undefined);
  assert.deepEqual(restored.progress, { session, history, preferences });
  const previous = restored.progress.history.pop();
  assert.deepEqual(applyPracticeBid(previous, action.bid), session, 'Undo still permits replay with the same cards');
  assert.deepEqual(availablePracticeActions(restored.progress.session), availablePracticeActions(session));
});

test('pending teller questions survive saving, including reversed Dappleton seats and retry', () => {
  const storage = memoryStorage();
  for (const profileId of ['major-S', 'dappleton-h-d-four-major']) {
    const initial = createTrainingPractice({ profileId, seed: 'resume-teller', role: 'teller' });
    const answered = applyBid(initial, initial.pendingAsk.bid);
    const answer = answered.auction.slice(initial.auction.length).find(call => call.seat === initial.partnerSeat).bid;
    const session = applyPracticeBid(initial, answer);
    savePracticeProgress({ session, history: [initial] }, storage);
    const restored = loadPracticeProgress(storage).progress;
    assert.ok(restored, profileId);
    assert.deepEqual(practiceView(restored.session), jsonValue(practiceView(session)));
    assert.deepEqual(restored.session.pendingAsk, jsonValue(session.pendingAsk));
    assert.equal(restored.session.revealed, false);
    const next = applyBid(session, session.pendingAsk.bid);
    const correct = next.auction.slice(session.auction.length).find(call => call.seat === session.partnerSeat).bid;
    const wrong = availablePracticeActions(session).find(action => action.bid !== correct);
    if (wrong) assert.throws(() => applyPracticeBid(restored.session, wrong.bid), /does not match your hand/);
    assert.deepEqual(jsonValue(applyPracticeBid(restored.session, correct)), jsonValue(applyPracticeBid(session, correct)));
  }
});

test('revealed and completed auctions restore contracts and allow undoing the reveal', () => {
  const storage = memoryStorage();
  const initial = createTrainingPractice({ seed: 'resume-final' });
  const finished = revealPractice(applyPracticeBid(initial, '6S'));
  savePracticeProgress({ session: finished, history: [initial], preferences: {
    analysisBasis: 'revealed', assessedContract: '3NT',
  } }, storage);
  const restored = loadPracticeProgress(storage).progress;
  assert.deepEqual(restored.session.contract, finished.contract);
  assert.equal(restored.preferences.analysisBasis, 'revealed');
  assert.equal(restored.preferences.assessedContract, '3NT');
  assert.deepEqual(restored.history.pop(), initial);
  savePracticeProgress({ session: initial, history: [], preferences: { analysisBasis: 'revealed' } }, storage);
  assert.equal(loadPracticeProgress(storage).progress.preferences.analysisBasis, 'auction');
});

test('progress round-trips both roles for every registered exercise', () => {
  const storage = memoryStorage();
  for (const profile of PRACTICE_PROFILES) for (const role of ['asker', 'teller']) {
    const session = createTrainingPractice({ profileId: profile.id, role, seed: 'resume-all' });
    savePracticeProgress({ session, history: [] }, storage);
    const restored = loadPracticeProgress(storage);
    assert.equal(restored.error, undefined, `${profile.id}/${role}: ${restored.error}`);
    assert.deepEqual(restored.progress.session, jsonValue(session));
    assert.deepEqual(jsonValue(availablePracticeActions(restored.progress.session)), jsonValue(availablePracticeActions(session)));
  }
});

test('empty, corrupt, incompatible and mixed-deal saves do not crash startup', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadPracticeProgress(storage), { progress: null });
  const initial = createTrainingPractice({ seed: 'saved-valid' });
  const bad = [
    '{', 'null', JSON.stringify({ version: 99 }),
    JSON.stringify({ version: 1, session: { ...initial, playerHand: ['SA'] }, history: [] }),
    JSON.stringify({ version: 1, session: { ...initial, familyId: 'retired-profile' }, history: [] }),
    JSON.stringify({ version: 1, session: initial, history: [createTrainingPractice({ seed: 'other-deal' })] }),
    JSON.stringify({ version: 1, session: { ...initial, practiceRole: 'teller', pendingAsk: { bid: '2NT', responseLadder: 'bad' } }, history: [] }),
  ];
  for (const raw of bad) {
    storage.setItem(PROGRESS_KEY, raw);
    const restored = loadPracticeProgress(storage);
    assert.equal(restored.progress, null);
    assert.ok(restored.error);
  }
});

test('blocked storage and full quota are reported without overwriting the last good save', () => {
  const session = createTrainingPractice({ seed: 'quota' });
  const blocked = { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Quota exceeded'); } };
  assert.deepEqual(loadPracticeProgress(blocked), { progress: null, error: 'Storage blocked' });
  assert.deepEqual(savePracticeProgress({ session, history: [] }, blocked), { ok: false, error: 'Quota exceeded' });
  const storage = memoryStorage();
  savePracticeProgress({ session, history: [] }, storage);
  const full = { ...storage, setItem() { throw new Error('Quota exceeded'); } };
  assert.equal(savePracticeProgress({ session: applyPracticeBid(session, '2NT'), history: [session] }, full).ok, false);
  assert.deepEqual(loadPracticeProgress(storage).progress.session, session);
});

test('old progress resumes in family mode while an explicitly studied branch stays pinned', () => {
  const storage = memoryStorage();
  const session = applyPracticeBid(createTrainingPractice({ seed: 'family-migration' }), '2NT');
  savePracticeProgress({ session, history: [] }, storage);
  const legacy = loadPracticeProgress(storage).progress;
  assert.deepEqual(legacy.session, jsonValue(session));
  assert.equal(legacy.preferences.studyProfileId, '', 'Restoring a specific dealt branch must not pin future hands');
  savePracticeProgress({ session, history: [], preferences: { studyProfileId: session.familyId } }, storage);
  assert.equal(loadPracticeProgress(storage).progress.preferences.studyProfileId, session.familyId);
  savePracticeProgress({ session, history: [], preferences: { studyProfileId: 'horton-d' } }, storage);
  assert.equal(loadPracticeProgress(storage).progress.preferences.studyProfileId, '');
});
