// The source interpreter keeps its original seats: player = asker, partner =
// teller. This controller changes the human's view without rewriting source
// definitions or letting the hidden teller hand influence the next question.
import { createPractice, availableActions, applyBid, matchesConstraints, bidIndex, getPracticeProfile, practiceNode, handFeatures } from './core.js';
import { declarerFor } from './profile-utils.js';
import { isForcingOpeningCall, openingBoundary } from './opening-system.js';
import { createOpeningPractice, openingChoices, selectOpening, applyOpeningCall, advanceOpeningPartner } from './opening-practice.js';
import { slamAction } from './slam-policy.js';

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

/** Ask source questions using the asker's own cards and public facts. After
 * keycard, apply the partnership's game/slam/grand thresholds. */
export function advanceAsker(session) {
  if (session.finished || session.revealed) return session;
  const actions = availableActions(session).filter(action => !action.playerConstraints
    || matchesConstraints(session.playerHand, action.playerConstraints, action.trump ?? session.trump));
  const trump = session.trump ?? session.major;
  const node = practiceNode(session);
  const last = session.auction.findLast(call => call.bid !== 'Pass')?.bid;
  const usualContracts = new Set([4, 5, 6, 7]
    .filter(level => level >= (['C', 'D'].includes(trump) ? 5 : 4)).map(level => `${level}${trump}`));
  if (!node?.trumpContractsOnly) {
    for (const bid of ['3NT', '6NT', '7NT']) usualContracts.add(bid);
    if (session.familyId && !session.familyId.startsWith('major-')) {
      for (const bid of getPracticeProfile(session.familyId).signoffs ?? []) usualContracts.add(bid);
    }
  }
  for (const bid of node?.signoffs ?? []) usualContracts.add(bid);
  // Human control does not require the recall coach to park on a side-suit
  // answer when its questions end. Offer a normal contract and final Pass.
  const signoffs = actions.filter(action => action.kind === 'signoff');
  // With 16 opposite a public maximum of eight, use a partscore policy.
  // Only the asker's own hand and the shown Horton suits are consulted.
  let hortonResponse;
  if (session.familyId?.startsWith('horton-') && session.phase === 'family' && session.nodeId === 'entry') {
    const f = handFeatures(session.playerHand, trump);
    const n = f.lengths;
    const second=session.hortonSecondSuit;
    const best=n[second]>n.S?second:'S';
    if (f.hcp <= 16) {
      const opening=session.auction[0].bid;
      const bid=opening===`2${best}`?'Pass':best==='S'?'2S':`3${best}`;
      hortonResponse=signoffs.find(a=>a.bid===bid) ?? signoffs.find(a=>a.bid==='Pass');
      if (f.hcp >= 12 && f.hcp <= 15 && n[best] >= 5) {
        hortonResponse = actions.find(a => a.kind === 'invitation' && a.trump === best) ?? hortonResponse;
      }
    } else if (f.hcp >= 19 && n[best] >= 5 && handFeatures(session.playerHand, best).keycards >= 3) {
      // With a known nine-card fit and substantial controls, practise the
      // direct ask. Otherwise keep the source's range/shape enquiry.
      hortonResponse = actions.find(a => a.askType === 'keycard' && a.trump === best);
    }
    hortonResponse ??= f.hcp >= 17 ? actions.find(action => action.kind === 'cue' && n[action.trump] >= 6
      && ['A', 'K', 'Q', 'J'].filter(rank => session.playerHand.includes(action.trump + rank)).length >= 3) : undefined;
  }
  const slam = slamAction({ hand: session.playerHand, trump, phase: session.phase,
    constraints: session.constraints, actions, auction: session.auction });
  let minorFit;
  if (node?.preferLongerMinor) {
    const lengths = handFeatures(session.playerHand, trump).lengths;
    const preferred = lengths.D > lengths.C ? 'D' : 'C';
    minorFit = actions.find(action => action.kind === 'relay' && (action.trump ?? action.state?.trump) === preferred);
  }
  const action = slam ?? hortonResponse ?? minorFit ?? actions.find(action => action.kind === 'relay' || action.kind === 'transfer-to-3nt')
    ?? actions.find(action => action.kind === 'handover')
    ?? signoffs.find(action => action.bid !== 'Pass' || session.weakExitAllowed || usualContracts.has(last))
    ?? signoffs[0];
  if (!action) return Object.freeze({ ...session, pendingAsk: null, finished: true,
    unsupportedReason: session.unsupportedReason ?? 'No further supported question or final contract is available in this exercise.' });
  if (action.kind === 'handover') {
    const next = applyBid(session, action.bid);
    return next.practiceRole === 'teller' ? advanceAsker(next) : next;
  }
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
  if (session.opening) return openingChoices(session);
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
  if (!isForcingOpeningCall(session) || discussed.has('Pass')) bids.push('Pass');
  const openingTurn = session.opening?.node === 'open';
  return Object.freeze(bids.map(bid => Object.freeze(discussed.has(bid)
    ? { ...discussed.get(bid), discussed: true }
    : { bid, discussed: false, kind: 'undiscussed', label: openingTurn && bid !== 'Pass'
      ? 'This opening is outside practice coverage.'
      : 'Undiscussed. Choose this contract; partner will pass. Undo is available.' })));
}

export function applyPracticeBid(session, bid) {
  const call = practiceCalls(session).find(call => call.bid === bid);
  if (!call && bid === 'Pass' && isForcingOpeningCall(session)) {
    throw new Error(`${session.auction.at(-1).bid} is forcing. Choose a rebid.`);
  }
  if (!call) throw new Error(`${bid} is not an available response or legal call at this point in the auction.`);
  if (!call.discussed) {
    if (session.opening?.node === 'open' && bid !== 'Pass') {
      const auction = [...session.auction, { seat: practiceView(session).playerSeat, bid, meaning: call.label }];
      return openingBoundary({ ...session, auction }, 'This opening is outside practice coverage. Undo to choose another call.');
    }
    return acceptUndiscussedContract(session,bid);
  }
  if (session.opening) {
    const routed = selectOpening(session, bid);
    const result = applyOpeningCall(routed, bid);
    // A documented but unimplemented continuation is also playable. Preserve
    // the public description; the fallback adds no partner response facts.
    if (result.coverageBoundary) {
      if (result.sourceAmbiguity || isForcingOpeningCall(result)) return result;
      return acceptUndiscussedContract(result,bid,true);
    }
    let next;
    try {
      next = advanceOpeningPartner(result);
    } catch (error) {
      if (routed === session) throw error;
      return openingBoundary(result, 'Partner has no implemented response to this opening on these cards. Undo to explore another call.');
    }
    return !next.opening && next.practiceRole === 'teller' ? advanceAsker(next) : next;
  }
  if (session.practiceRole !== 'teller') {
    const next = applyBid(session, bid);
    return next.practiceRole === 'teller' ? advanceAsker(next) : next;
  }
  if (!availablePracticeActions(session).some(action => action.bid === bid)) {
    throw new Error(`${bid} is not an available response to partner’s question.`);
  }
  const next = applyBid({ ...session, pendingAsk: null }, session.pendingAsk.bid, bid);
  const answer = next.auction.slice(session.auction.length).find(call => call.seat === session.partnerSeat);
  if (!answer || answer.bid !== bid) {
    throw new Error('That response does not match your hand. Try again, or turn on “Show meanings” to review the response steps.');
  }
  return next.practiceRole === 'teller' ? advanceAsker(next) : next;
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
