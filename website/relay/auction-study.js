import { availableActions } from './core.js';
import { practiceView } from './practice.js';

// Read the public ladder at the time of the question, rather than the current
// node (which may already be several questions further down the tree).
export function auctionCallDetails(session, history, index) {
  const auction = practiceView(session).auction;
  const call = auction[index];
  if (!call) return null;

  function questionAt(at) {
    const question = auction[at];
    if (!question || question.seat !== session.playerSeat) return null;
    let ladder = question.responseLadder;
    if (!ladder?.length) {
      // This also supports auctions saved before ladders were recorded on all
      // calls. Undo snapshots contain the original public question state.
      const before = [session, ...history].find(previous => previous.auction.length === at
        && previous.auction.every((entry, i) => entry.bid === auction[i].bid && entry.seat === auction[i].seat));
      const action = before?.pendingAsk?.bid === question.bid ? before.pendingAsk
        : before && availableActions(before).find(action => action.bid === question.bid);
      ladder = action?.responseLadder;
      if (!ladder?.length && action?.kind === 'signoff' && action.bid !== 'Pass') {
        ladder = [{ bid: 'Pass', label: 'Accept partner’s final contract' }];
      }
    }
    if (!ladder?.length) return null;
    // Only descriptions belong in the study view, never hand predicates.
    const alternatives = new Map();
    for (const answer of ladder) {
      const previous = alternatives.get(answer.bid);
      alternatives.set(answer.bid, { bid: answer.bid,
        label: previous ? `${previous.label} / ${answer.label}` : answer.label });
    }
    return { question, questionIndex: at, alternatives: [...alternatives.values()] };
  }

  const detail = call.seat === session.playerSeat ? questionAt(index) : questionAt(index - 1);
  const questionIndex = detail?.questionIndex ?? index;
  const response = detail && auction[questionIndex + 1];
  return { call, question: detail?.question ?? null,
    auction: auction.slice(0, questionIndex + 1), alternatives: detail?.alternatives ?? [],
    playedBid: response?.seat === session.partnerSeat ? response.bid : null };
}
