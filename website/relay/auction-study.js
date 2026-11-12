import { availableActions, getPracticeProfile, bidIndex } from './core.js';
import { practiceView } from './practice.js';
import { shortBidDescription } from './bid-descriptions.js';
import { entryContinuations, describeEntryAuction } from './bid-reference.js';
import { openingActions } from './opening-practice.js';

// Read the public ladder at the time of the question, rather than the current
// node (which may already be several questions further down the tree).
export function auctionCallDetails(session, history, index) {
  const auction = practiceView(session).auction;
  let call = describeEntryAuction(auction)[index];
  if (!call) return null;
  if (index === 0) return { call, isOpening: true, question: null, auction: [call], alternatives: [], callAlternatives: [], playedBid: null };
  const beforeCall = [session, ...history].find(previous => previous.auction.length === index
    && previous.auction.every((entry, at) => entry.bid === auction[at].bid && entry.seat === auction[at].seat));
  let choices = call.callAlternatives;
  if (!choices?.length && beforeCall?.opening) choices = openingActions(beforeCall);
  if (!choices?.length && beforeCall && call.seat === beforeCall.playerSeat) choices = availableActions(beforeCall);
  // Source choices include routes outside the generated subset. Retain other
  // public playable calls offered by the interpreter at this historical turn.
  const options = new Map((choices ?? []).map(({ bid, label }) => [bid, { bid, label }]));
  for (const { bid, label } of entryContinuations(auction.slice(0, index)) ?? []) options.set(bid, { bid, label });
  const order = bid => bid === 'Pass' ? 99 : bidIndex(bid);
  const callAlternatives = [...options.values()].sort((a, b) => order(a.bid) - order(b.bid));
  if (auction[index].meaning === 'Source-defined relay entry' && session.familyId?.startsWith('rebid-splinter-')) {
    // Recover the corrected public entry description for existing saved hands.
    // Match the entire prefix; never infer a splinter from the bid alone.
    const prefix = getPracticeProfile(session.familyId).initialAuction;
    if (prefix[index] && prefix.every((entry, at) => entry.bid === auction[at]?.bid && entry.seat === auction[at]?.seat)) {
      call = { ...call, meaning: prefix[index].meaning };
    }
  }

  function questionAt(at) {
    let question = auction[at];
    if (!question) return null;
    const before = [session, ...history].find(previous => previous.auction.length === at
      && previous.auction.every((entry, i) => entry.bid === auction[i].bid && entry.seat === auction[i].seat));
    const askingSeat = before?.playerSeat ?? (question.responseLadder?.length ? question.seat : session.playerSeat);
    if (question.seat !== askingSeat) return null;
    if (before?.opening) return null; // Opening choices have no relay-answer ladder.
    if (before && /^Ask (Shortage Keycard|keycards)$/i.test(question.meaning ?? '')) {
      // Use the original question's suit, never the current or bid strain.
      question = { ...question, meaning: shortBidDescription(question.meaning, before.trump ?? before.major) };
    }
    let ladder = question.responseLadder;
    if (!ladder?.length) {
      // This also supports auctions saved before ladders were recorded on all
      // calls. Undo snapshots contain the original public question state.
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

  const detail = questionAt(index) ?? questionAt(index - 1);
  const entryReplies = !detail && entryContinuations(auction.slice(0, index + 1));
  if (entryReplies) return { call, question: call,
    auction: auction.slice(0, index + 1), alternatives: entryReplies.map(({ bid, label }) => ({ bid, label })),
    playedBid: auction[index + 1]?.bid ?? null, callAlternatives,
  };
  const questionIndex = detail?.questionIndex ?? index;
  const response = detail && auction[questionIndex + 1];
  return { call: detail && index === questionIndex ? detail.question : call, question: detail?.question ?? null,
    auction: auction.slice(0, questionIndex + 1), alternatives: detail?.alternatives ?? [],
    playedBid: response && response.seat !== detail.question.seat ? response.bid : null, callAlternatives };
}
