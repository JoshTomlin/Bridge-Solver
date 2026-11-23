import { applyBid, getPracticeProfile, handFeatures, matchesConstraints, bidIndex, practiceNode } from './core.js';
import { availablePracticeActions, practiceView, advanceAsker } from './practice.js';
import { validateOpeningSession, isOpeningFamily, OPENING_FAMILIES, openingFamilyFor } from './opening-practice.js';
import { AUCTION_SEATS } from './table-ui.js';
import { SYSTEM } from './system.js';
import { restorePassedFirstTurn } from './passed-hand.js';

export const PROGRESS_KEY = 'bridge-lab.relay-progress.v1';
const VERSION = 1;

function validateSession(session) {
  if (!session || typeof session !== 'object') throw new Error('Saved practice session is missing.');
  if (session.wholeAuction) validateOpeningSession(session);
  const profile = session.wholeAuction && isOpeningFamily(session)
    ? !session.wholeAuction.passedHand && ['2D','2H','2S','2NT'].includes(session.wholeAuction.openingBid) ? { playerSeat: 'South', partnerSeat: 'North' } : { playerSeat: 'North', partnerSeat: 'South' } : getPracticeProfile(session.familyId);
  const seats = session.relayRolesSwapped
    ? { playerSeat: profile.partnerSeat, partnerSeat: profile.playerSeat } : profile;
  if (session.familyId?.startsWith('major-') && session.systemId !== SYSTEM.id) {
    throw new Error('Saved Jacoby practice uses an older range table. Start a new hand to use the corrected replies.');
  }
  if (!['asker', 'teller'].includes(session.practiceRole)
      || session.playerSeat !== seats.playerSeat || session.partnerSeat !== seats.partnerSeat
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
  const openingPending = session.opening?.node === 'open' && session.wholeAuction?.humanSeat === 'North'
    || session.opening?.node === 'first-call' && session.wholeAuction?.passedHand
    || session.opening?.quiet === 'open' && session.wholeAuction?.competition;
  if (!Array.isArray(session.auction) || !session.auction.length && !openingPending) throw new Error('Saved auction is missing.');
  const competitive = Boolean(session.wholeAuction?.competition);
  const callSeats = competitive ? AUCTION_SEATS : ['North', 'South'];
  const specials = competitive ? ['Pass', 'X', 'XX'] : ['Pass'];
  for (const call of session.auction) {
    if (!call || !callSeats.includes(call.seat)) throw new Error('Saved auction seat is invalid.');
    if (!specials.includes(call.bid)) bidIndex(call.bid);
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
  } else if (session.practiceRole === 'teller' && !session.opening && !session.finished && !session.revealed) {
    throw new Error('Saved teller question is missing.');
  }
  if (session.contract) {
    bidIndex(session.contract.bid);
    if (session.contract.bid !== `${session.contract.level}${session.contract.strain}`
        || !callSeats.includes(session.contract.declarer)) throw new Error('Saved contract is invalid.');
  }
}

function preferencesFor(preferences = {}, session) {
  const practiceMode = preferences.practiceMode === 'mixed' ? 'mixed' : session.wholeAuction ? 'auction' : 'focused';
  let assessedContract = '';
  try { bidIndex(preferences.assessedContract); assessedContract = preferences.assessedContract; } catch { /* Use the default contract. */ }
  return {
    practiceMode,
    ...(practiceMode === 'auction' ? { openingFamily: OPENING_FAMILIES.includes(preferences.openingFamily) ? preferences.openingFamily
      : openingFamilyFor(session) ?? 'C' } : {}),
    showHints: preferences.showHints === true,
    sampleCount: ['100', '500', '1000'].includes(String(preferences.sampleCount)) ? String(preferences.sampleCount) : '100',
    analysisBasis: session.revealed && preferences.analysisBasis === 'revealed' ? 'revealed' : 'auction',
    assessedContract,
    bidInput: typeof preferences.bidInput === 'string' ? preferences.bidInput.slice(0, 12) : '',
    studyProfileId: practiceMode === 'focused' && preferences.studyProfileId === session.familyId ? session.familyId : '',
  };
}

function openingDealSettings(session) {
  if (!session.wholeAuction) return null;
  const { openingBid = '1C', ...settings } = session.wholeAuction;
  return JSON.stringify({ ...settings, openingBid: session.dealOpeningBid ?? openingBid });
}

/** Save committed bidding state immediately; never depend on an unload event.
 * Samples, solver results and running workers are deliberately not persisted. */
export function savePracticeProgress({ session, history, preferences, handId }, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(PROGRESS_KEY, JSON.stringify({
      version: VERSION, session, history, preferences, handId,
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
      if ((!saved.session.wholeAuction && previous.familyId !== saved.session.familyId)
          || openingDealSettings(previous) !== openingDealSettings(saved.session)
          || previous.seed !== saved.session.seed
          || practiceView(previous).playerSeat !== practiceView(saved.session).playerSeat
          || practiceView(previous).playerHand.join() !== practiceView(saved.session).playerHand.join()
          || practiceView(previous).partnerHand.join() !== practiceView(saved.session).partnerHand.join()) {
        throw new Error('Saved undo history belongs to a different deal.');
      }
    }
    // Pending coach questions are uncommitted decisions. Recompute late asks
    // under the current policy, including Undo frames, without changing cards
    // or any actual call already made in the auction.
    const refreshCoach = session => {
      if (session.practiceRole !== 'teller' || !session.pendingAsk || session.finished || session.revealed) return session;
      const oldDiamondAgreement = ['split-d-s', 'split-d-s-1nt'].includes(session.familyId)
        && session.phase === 'family' && session.nodeId === 'agree-single' && session.pendingAsk.bid === '4D';
      if (oldDiamondAgreement) return applyBid({ ...session, pendingAsk: null }, '4D');
      const oldHeartSupportAsk = session.familyId === 'split-d-h-1nt' && session.phase === 'family'
        && session.nodeId === 'further' && session.pendingAsk.bid === '2NT';
      return oldHeartSupportAsk || ['void-keycard', 'post-keycard', 'suit-ask', 'unsupported'].includes(session.phase)
        ? advanceAsker(session) : session;
    };
    const refresh = session => refreshCoach(restorePassedFirstTurn(session));
    const session = refresh(saved.session);
    return { progress: { session, history: saved.history.map(refresh),
      ...(typeof saved.handId === 'string' && saved.handId.length > 0 && saved.handId.length <= 100 ? { handId: saved.handId } : {}),
      preferences: preferencesFor(saved.preferences ?? {}, session) } };
  } catch (error) {
    return { progress: null, error: error.message || String(error) };
  }
}
