// The source interpreter keeps its original seats: player = asker, partner =
// teller. This controller changes the human's view without rewriting source
// definitions or letting the hidden teller hand influence the next question.
import { createPractice, availableActions, applyBid, matchesConstraints } from './core.js';

export function practiceView(session) {
  const teller = session.practiceRole === 'teller';
  return {
    role: teller ? 'teller' : 'asker',
    playerSeat: teller ? session.partnerSeat : session.playerSeat,
    partnerSeat: teller ? session.playerSeat : session.partnerSeat,
    playerHand: teller ? session.partnerHand : session.playerHand,
    partnerHand: teller ? session.playerHand : session.partnerHand,
    auction: session.pendingAsk ? [...session.auction, {
      seat: session.playerSeat, bid: session.pendingAsk.bid, meaning: session.pendingAsk.label,
    }] : session.auction,
  };
}

/** Ask through supported questions in source order, using only public facts
 * and the asker's own cards for action prerequisites. This is a recall coach,
 * not a model of optimal bidding. At the boundary take the lowest signoff. */
export function advanceAsker(session) {
  if (session.finished || session.revealed) return session;
  const actions = availableActions(session).filter(action => !action.playerConstraints
    || matchesConstraints(session.playerHand, action.playerConstraints, action.trump ?? session.trump));
  const action = actions.find(action => action.kind === 'relay')
    ?? actions.find(action => action.kind === 'signoff');
  if (!action) return Object.freeze({ ...session, pendingAsk: null, finished: true,
    unsupportedReason: session.unsupportedReason ?? 'No further supported question or final contract is available in this exercise.' });
  // Passing a teller's playable answer already completes the auction.
  if (action.bid === 'Pass') return applyBid(session, action.bid);
  const responseLadder = action.kind === 'signoff'
    ? [{ bid: 'Pass', label: 'Accept partner’s final contract' }]
    : action.responseLadder;
  if (!responseLadder?.length) throw new Error('This question has no defined response ladder.');
  return Object.freeze({ ...session, pendingAsk: Object.freeze({
    bid: action.bid, label: action.label, kind: action.kind,
    responseLadder: Object.freeze(responseLadder.map(answer => Object.freeze({ ...answer }))),
  }) });
}

export function createTrainingPractice({ role = 'asker', ...options } = {}) {
  if (!['asker', 'teller'].includes(role)) throw new Error('Choose asker or teller practice.');
  const session = Object.freeze({ ...createPractice(options), practiceRole: role, pendingAsk: null });
  return role === 'teller' ? advanceAsker(session) : session;
}

export function availablePracticeActions(session) {
  if (session.finished || session.revealed) return [];
  if (session.practiceRole !== 'teller') return availableActions(session);
  // Some source predicates share a call. Show all meanings of that call;
  // never identify the correct response by examining the human's cards.
  const calls = new Map();
  for (const answer of session.pendingAsk?.responseLadder ?? []) {
    const previous = calls.get(answer.bid);
    calls.set(answer.bid, Object.freeze({ bid: answer.bid, kind: 'response',
      label: previous ? `${previous.label} / ${answer.label}` : answer.label }));
  }
  return Object.freeze([...calls.values()]);
}

export function applyPracticeBid(session, bid) {
  if (session.practiceRole !== 'teller') return applyBid(session, bid);
  if (!availablePracticeActions(session).some(action => action.bid === bid)) {
    throw new Error(`${bid} is not an available response to partner’s question.`);
  }
  const next = applyBid({ ...session, pendingAsk: null }, session.pendingAsk.bid);
  const answer = next.auction.slice(session.auction.length).find(call => call.seat === session.partnerSeat);
  if (!answer || answer.bid !== bid) {
    throw new Error('That response does not match your hand. Try again, or turn on “Show meanings” to review the response steps.');
  }
  return advanceAsker(next);
}
