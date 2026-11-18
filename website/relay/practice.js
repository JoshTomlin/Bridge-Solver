// The source interpreter keeps its original seats: player = asker, partner =
// teller. This controller changes the human's view without rewriting source
// definitions or letting the hidden teller hand influence the next question.
import { createPractice, availableActions, applyBid, matchesConstraints, bidIndex, getPracticeProfile, practiceNode, handFeatures } from './core.js';
import { declarerFor } from './profile-utils.js';
import { createOpeningPractice, openingActions, applyOpeningCall, advanceOpeningPartner } from './opening-practice.js';

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
      responseLadder: session.pendingAsk.responseLadder,
    }] : session.auction,
  };
}

/** Ask through supported questions in source order, using only public facts
 * and the asker's own cards for action prerequisites. This is a recall coach,
 * not a model of optimal bidding. At the boundary choose a normal final
 * contract; a human asker can also stop on any intervening reply. */
export function advanceAsker(session) {
  if (session.finished || session.revealed) return session;
  const actions = availableActions(session).filter(action => !action.playerConstraints
    || matchesConstraints(session.playerHand, action.playerConstraints, action.trump ?? session.trump));
  const trump = session.trump ?? session.major;
  const last = session.auction.findLast(call => call.bid !== 'Pass')?.bid;
  const usualContracts = new Set(['3NT', '6NT', '7NT', ...[4, 5, 6, 7]
    .filter(level => level >= (['C', 'D'].includes(trump) ? 5 : 4)).map(level => `${level}${trump}`)]);
  if (session.familyId && !session.familyId.startsWith('major-')) {
    for (const bid of [...(getPracticeProfile(session.familyId).signoffs ?? []), ...(practiceNode(session)?.signoffs ?? [])]) usualContracts.add(bid);
  }
  // Human control does not require the recall coach to park on a side-suit
  // answer when its questions end. Offer a normal contract and final Pass.
  const signoffs = actions.filter(action => action.kind === 'signoff');
  // With 16 opposite a public maximum of eight, use a partscore policy.
  // Only the asker's own hand and the shown Horton suits are consulted.
  let hortonPartscore;
  if(session.familyId?.startsWith('horton-') && session.nodeId==='entry' && handFeatures(session.playerHand,trump).hcp<=16) {
    const n=handFeatures(session.playerHand,trump).lengths;
    const second=session.hortonSecondSuit;
    const best=n[second]>n.S?second:'S';
    const opening=session.auction[0].bid;
    const bid=opening===`2${best}`?'Pass':best==='S'?'2S':`3${best}`;
    hortonPartscore=signoffs.find(a=>a.bid===bid) ?? signoffs.find(a=>a.bid==='Pass');
  }
  const action = hortonPartscore ?? actions.find(action => action.kind === 'relay')
    ?? signoffs.find(action => action.bid !== 'Pass' || session.weakExitAllowed || usualContracts.has(last))
    ?? signoffs[0];
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

export function createTrainingPractice({ role = 'asker', auctionMode = false, ...options } = {}) {
  if (auctionMode) return createOpeningPractice(options);
  if (!['asker', 'teller'].includes(role)) throw new Error('Choose asker or teller practice.');
  const session = Object.freeze({ ...createPractice(options), practiceRole: role, pendingAsk: null });
  return role === 'teller' ? advanceAsker(session) : session;
}

export function availablePracticeActions(session) {
  if (session.finished || session.revealed) return [];
  if (session.opening) return openingActions(session);
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

/** Public agreement metadata for every legal call, independent of either hand. */
export function practiceCalls(session) {
  if (session.finished || session.revealed) return [];
  const discussed = new Map(availablePracticeActions(session).map(action => [action.bid, action]));
  const last = practiceView(session).auction.findLast(call => call.bid !== 'Pass');
  const minimum = last ? bidIndex(last.bid) : -1;
  const bids = Array.from({ length: 35 }, (_, index) => `${Math.floor(index / 5) + 1}${['C', 'D', 'H', 'S', 'NT'][index % 5]}`)
    .filter(bid => bidIndex(bid) > minimum);
  // The contract fallback cannot turn an explicitly forcing call into a signoff.
  if (!session.opening || !last?.forcing || discussed.has('Pass')) bids.push('Pass');
  return Object.freeze(bids.map(bid => Object.freeze(discussed.has(bid)
    ? { ...discussed.get(bid), discussed: true }
    : { bid, discussed: false, kind: 'undiscussed', label: 'Undiscussed. Choose this contract; partner will pass. Undo is available.' })));
}

export function applyPracticeBid(session, bid) {
  const call = practiceCalls(session).find(call => call.bid === bid);
  if (!call && bid === 'Pass' && session.opening && session.auction.at(-1)?.forcing) {
    throw new Error(`${session.auction.at(-1).bid} is forcing. Choose a rebid.`);
  }
  if (!call) throw new Error(`${bid} is not an available response or legal call at this point in the auction.`);
  if (!call.discussed) return acceptUndiscussedContract(session,bid);
  if (session.opening) {
    const result=applyOpeningCall(session,bid);
    // A documented but unimplemented continuation is also playable. Preserve
    // the public description; the fallback adds no partner response facts.
    if (result.coverageBoundary) {
      if (result.auction.at(-1)?.forcing) return result;
      return acceptUndiscussedContract(result,bid,true);
    }
    const next=advanceOpeningPartner(result);
    return !next.opening && next.practiceRole === 'teller' ? advanceAsker(next) : next;
  }
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


function acceptUndiscussedContract(session,bid,alreadyRecorded=false) {
  const view=practiceView(session);
  const auction=[...view.auction];
  if(!alreadyRecorded) auction.push({seat:view.playerSeat,bid,meaning:'Undiscussed; selected contract'});
  const last=auction.findLast(call=>call.bid!=='Pass');
  if(!last) {
    auction.push({seat:view.partnerSeat,bid:'Pass',meaning:'Pass out the deal (fallback)'});
    return Object.freeze({...session,auction:Object.freeze(auction.map(c=>Object.freeze(c))),opening:null,pendingAsk:null,
      phase:'finished',finished:true,passedOut:true,contract:null,coverageBoundary:false,undiscussedBid:bid,
      unsupportedReason:'Passed out. Undo to return to the opening.'});
  }
  if(bid!=='Pass') auction.push({seat:view.partnerSeat,bid:'Pass',meaning:'Accept selected contract (fallback; continuation undiscussed)'});
  return Object.freeze({...session,auction:Object.freeze(auction.map(c=>Object.freeze(c))),opening:null,pendingAsk:null,
    phase:'finished',finished:true,coverageBoundary:false,undiscussedBid:bid,
    contract:Object.freeze({bid:last.bid,level:Number(last.bid[0]),strain:last.bid.slice(1),declarer:declarerFor(auction,last.bid.slice(1),last.seat)}),
    unsupportedReason:'Undiscussed continuation: partner passes your selected contract. Undo to try another bid.'});
}
