import { getPracticeProfile, handFeatures, matchesConstraints, bidIndex, practiceNode } from './core.js';
import { availablePracticeActions } from './practice.js';

export const PROGRESS_KEY = 'bridge-lab.relay-progress.v1';
const VERSION = 1;

function validateSession(session) {
  if (!session || typeof session !== 'object') throw new Error('Saved practice session is missing.');
  const profile = getPracticeProfile(session.familyId);
  if (!['asker', 'teller'].includes(session.practiceRole)
      || session.playerSeat !== profile.playerSeat || session.partnerSeat !== profile.partnerSeat
      || typeof session.seed !== 'string' || typeof session.phase !== 'string'
      || typeof session.revealed !== 'boolean' || typeof session.finished !== 'boolean'
      || session.major !== session.trump) throw new Error('Saved practice settings are invalid.');
  handFeatures(session.playerHand, session.trump);
  handFeatures(session.partnerHand, session.trump);
  if (new Set([...session.playerHand, ...session.partnerHand]).size !== 26
      || !Array.isArray(session.constraints)
      || !matchesConstraints(session.partnerHand, session.constraints, session.trump)) {
    throw new Error('Saved hands do not match the auction constraints.');
  }
  if (!Array.isArray(session.auction) || !session.auction.length) throw new Error('Saved auction is missing.');
  for (const call of session.auction) {
    if (!call || !['North', 'South'].includes(call.seat)) throw new Error('Saved auction seat is invalid.');
    if (call.bid !== 'Pass') bidIndex(call.bid);
  }
  // Check source-node and pending-question compatibility before rendering.
  practiceNode(session);
  availablePracticeActions(session);
  if (session.pendingAsk) {
    bidIndex(session.pendingAsk.bid);
    if (!Array.isArray(session.pendingAsk.responseLadder) || !session.pendingAsk.responseLadder.length) {
      throw new Error('Saved teller response steps are invalid.');
    }
    for (const answer of session.pendingAsk.responseLadder) {
      if (answer.bid !== 'Pass') bidIndex(answer.bid);
    }
  } else if (session.practiceRole === 'teller' && !session.finished && !session.revealed) {
    throw new Error('Saved teller question is missing.');
  }
  if (session.contract) {
    bidIndex(session.contract.bid);
    if (session.contract.bid !== `${session.contract.level}${session.contract.strain}`
        || !['North', 'South'].includes(session.contract.declarer)) throw new Error('Saved contract is invalid.');
  }
}

function preferencesFor(preferences = {}, session) {
  let assessedContract = '';
  try { bidIndex(preferences.assessedContract); assessedContract = preferences.assessedContract; } catch { /* Use the default contract. */ }
  return {
    showHints: preferences.showHints === true,
    sampleCount: ['100', '500', '1000'].includes(String(preferences.sampleCount)) ? String(preferences.sampleCount) : '100',
    analysisBasis: session.revealed && preferences.analysisBasis === 'revealed' ? 'revealed' : 'auction',
    assessedContract,
    bidInput: typeof preferences.bidInput === 'string' ? preferences.bidInput.slice(0, 12) : '',
    studyProfileId: preferences.studyProfileId === session.familyId ? session.familyId : '',
  };
}

/** Save committed bidding state immediately; never depend on an unload event.
 * Samples, solver results and running workers are deliberately not persisted. */
export function savePracticeProgress({ session, history, preferences }, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(PROGRESS_KEY, JSON.stringify({
      version: VERSION, session, history, preferences,
    }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

export function loadPracticeProgress(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(PROGRESS_KEY);
    if (raw === null) return { progress: null };
    const saved = JSON.parse(raw);
    if (saved?.version !== VERSION) throw new Error('Saved practice version is unsupported.');
    validateSession(saved.session);
    if (!Array.isArray(saved.history) || saved.history.length > 100) throw new Error('Saved undo history is invalid.');
    for (const previous of saved.history) {
      validateSession(previous);
      if (previous.familyId !== saved.session.familyId || previous.seed !== saved.session.seed
          || previous.practiceRole !== saved.session.practiceRole
          || previous.playerHand.join() !== saved.session.playerHand.join()
          || previous.partnerHand.join() !== saved.session.partnerHand.join()) {
        throw new Error('Saved undo history belongs to a different deal.');
      }
    }
    return { progress: { session: saved.session, history: saved.history,
      preferences: preferencesFor(saved.preferences ?? {}, saved.session) } };
  } catch (error) {
    return { progress: null, error: error.message || String(error) };
  }
}
