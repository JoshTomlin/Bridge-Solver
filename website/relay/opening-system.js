// First/second-seat uncontested opening practice. Source: P0631–P0691,
// P0885–P0924, P1311–P1429; revised July minor relays and reordered rebids.
// The sampler may stratify exercises; the bidding policy receives only its
// own cards and the public auction, never the sampling stratum or other hand.
import { DECK, PRACTICE_PROFILES, createPractice, createFamilyPractice, getPracticeProfile, practiceStartState, availableActions, applyBid,
  handFeatures, makeRng, matchesConstraints, bidIndex } from './core.js';
import { NT_SHAPES, usesOpeningRelay, ntOpeningActions, applyNtOpeningCall, ntOpeningPartnerBid, validateNtOpening, startOpeningKeycards } from './nt-opening.js';
import { declarerFor } from './profile-utils.js';
import { entryContinuations } from './bid-reference.js';
import { DIAMOND_RAISE } from './diamond-raise.js';
import { naturalOpeningNode, naturalOpeningActions, naturalOpeningPartnerBid } from './natural-opening.js';
import { PASSED_FAMILIES } from './passed-hand.js';
import { WEAK_NT_COMPETITION } from './weak-notrump-competition.js';
import { weakNotrumpRows, weakNotrumpPartner, weakNotrumpFacts, WEAK_NT_NOTES } from './weak-notrump.js';
import { strongTwoRows, strongTwoPartner, strongTwoEligible, isBalancedStrongTwo, STRONG_TWO_NOTES } from './strong-club-two.js';
import { PREEMPT_BIDS, preemptRows, preemptPartnerBid } from './preempt-opening.js';

import { MAJOR_NODES, MAJOR_NORTH_NODES, isMajorBalanced, majorResponseFacts, ordinaryMajorOptions, ordinaryMajorCheck, ordinaryMajorPartnerBid } from './major-opening.js';

const names = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' };
const other = major => major === 'H' ? 'S' : 'H';
const features = hand => handFeatures(hand, 'C');
const ntShapes=NT_SHAPES;
const action = (bid, label, source) => ({ bid, label, source, kind: 'opening' });
const forcingResponses = {
  '1D': ['1H', '1S', '1NT', '2NT'],
  '1H': ['1S', '2C', '2D'],
  '1S': ['2C', '2D', '2H'],
};

export function isForcingOpeningCall(session) {
  if (!session.opening) return false;
  const last = session.auction.at(-1);
  if (last?.forcing) return true;
  if (session.opening.system === 'passed' && ['controls','strong-rebid'].includes(session.opening.node)) return true;
  if (usesOpeningRelay(session.opening.system, session.auction, session.opening.node)
    && (session.opening.system === '2C' || /^1[HS]$/.test(session.opening.system)))
    return !session.finished && !ntOpeningActions(session).some(row => row.bid === 'Pass');
  if (extraOpenings[session.opening.system] && session.opening.node !== 'open')
    return !extraActions(session).some(row => row.bid === 'Pass');
  // Saves from before the flag was stored still have their original opening and response.
  return session.auction.length === 2 && (forcingResponses[session.opening.system]?.includes(last.bid) ?? false)
    || session.opening.node === 'major-club-resolve' && last?.bid === '3C';
}

export const freezeOpening = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeOpening); Object.freeze(value);
  }
  return value;
};
const openingBids = {C:'1C', D:'1D', H:'1H', S:'1S', WNT:'1NT', '2C':'2C', '2D':'2D', '2H':'2H', '2S':'2S', NT:'2NT',
  ...Object.fromEntries(PREEMPT_BIDS.map(bid => [bid, bid]))};
export const openingBidForFamily = family => openingBids[family];
export const firstSeatOpenings = Object.freeze(Object.values(openingBids));
export const openingFamilyFor = session => session.wholeAuction?.competition ? WEAK_NT_COMPETITION
  : session.wholeAuction?.passedHand ? session.wholeAuction.openingFamily
  : Object.entries(openingBids).find(([, bid]) => bid === (session.dealOpeningBid ?? openingBidFor(session)))?.[0];
const hortonBid = bid => ['2D','2H','2S'].includes(bid);
export const OPENING_FAMILIES = Object.freeze([...Object.keys(openingBids), 'M', 'HT', '3X', WEAK_NT_COMPETITION, 'all', ...PASSED_FAMILIES]);
const extraOpenings = {
  '1NT': { rows:weakNotrumpRows, partner:weakNotrumpPartner },
  '2C': { rows:strongTwoRows, partner:strongTwoPartner },
  ...Object.fromEntries(PREEMPT_BIDS.map(bid => [bid, { rows: preemptRows, partner: preemptPartnerBid }])),
};

function extraActions(context) {
  const auction = context.auction;
  const opening = context.opening ?? context;
  const rows = extraOpenings[opening.system].rows({...opening, auction});
  if (!rows) throw new Error('Saved opening node is invalid.');
  const last = auction.findLast(call => call.bid !== 'Pass');
  const seen = new Set();
  return rows.filter(row => {
    if (seen.has(row.bid) || row.bid !== 'Pass' && last && bidIndex(row.bid) <= bidIndex(last.bid)) return false;
    seen.add(row.bid);
    return true;
  }).map(row => ({...row,kind:'opening'}));
}

export const openingBidFor = session => session.wholeAuction?.passedHand
  ? session.auction.find(call => call.bid !== 'Pass')?.bid ?? session.wholeAuction.openingBid
  : session.wholeAuction?.openingBid ?? '1C';
export const humanIsOpener = session => session.opening?.node === 'first-call'
  || (session.auction.find(call => call.bid !== 'Pass')?.seat ?? 'North') === session.wholeAuction.humanSeat;
export const openingTitle = session => session.opening?.node === 'first-call' ? 'Opening decision'
  : `${openingBidFor(session)} · ${session.wholeAuction?.competition ? 'Doubles and runouts'
    : session.wholeAuction?.passedHand && session.auction[0]?.bid === 'Pass' ? 'Passed hand' : 'Whole auction'}`;
export const isOpeningFamily = session => session.familyId?.startsWith('opening-');
export const SYSTEM_OPENING_NOTES = [
  ...WEAK_NT_NOTES,
  ...STRONG_TWO_NOTES,
  '2♦/2♥/2♠ Horton openings describe spades and diamonds/hearts/clubs respectively. Whole auction uses the same response tables as the Horton drill.',
  'Natural 3C/3D/3H/3S openings show six-plus cards and 0–8 HCP. A new suit below its game is natural and forcing one round. Opener usually bids 3NT without two-card support when legal.',
  'Whole auction: first/second-seat, uncontested. Both hands are fixed before the opening; your physical seat stays fixed when the asker changes.',
  '1D includes the weak club response, invitational diamond raise, five-plus diamond game-force with 2NT, and the existing 1NT, major-response and reordered routes.',
  '1M includes three-way 2C, natural 2D and 1S–2H responses, Jacoby, weak raises and 1H–1S rebids with a range enquiry over 1NT. New-suit responses are forcing where indicated. The direct 1NT response is nonforcing.',
  'After 1S–2H–2S, 2NT and 3H are treated as natural invitations, and a new minor is natural and forcing for one round. These natural continuations fill out the notes’ explicit 3S route.',
  'Direct 1M–1NT continuations and later natural weak-raise decisions use provisional natural practice choices. Ordinary major practice uses a game-first partner. For limit-raise judgement it declines with 9–11 and accepts with 12+; this is a practice policy, not a partnership rule. Human acceptance alternatives are not graded by that cutoff.',
  '2NT is 20–22 in 4333/4432/5332 shapes; responder is 6–16. Muppet, major transfers, minor Stayman, cue bids and Kickback continue into queen and specific-suit enquiries. Human slam-quality judgements are not graded.',
  'The 2NT practice partner explores a fit with 11+ responder points, then follows the shared keycard questions. It accepts quantitative invitations with 22 and declines with 20/21; these are practice policies, not partnership thresholds. Exclusion reply ladders remain unconfirmed.',
];

const openingGroups = ['C', 'D', 'M', 'NT', 'WNT', '2C', 'HT', 'PH'];
const commonOpeningGroups = ['C', 'D', 'M', 'WNT', 'HT'];
const pick = (choices, rng) => choices[Math.floor(rng() * choices.length)];

export function chooseOpeningFamily(family, seed) {
  if (!OPENING_FAMILIES.includes(family)) throw new Error('Choose a supported opening family.');
  const rng = makeRng(`whole-family:${seed}`);
  if (family === 'all') {
    family = pick(openingGroups, rng);
    const strongBalanced = family === 'NT' || family === '2C' && !systemOpeningDraw('2C', seed).distributional;
    if (strongBalanced && rng() >= 0.25) {
      family = makeRng(`mixed-preempt:${seed}`)() < 0.2 ? '3X' : pick(commonOpeningGroups, rng);
    }
    if (family === 'WNT' && makeRng(`mixed-weak-nt-competition:${seed}`)() < 0.125) return WEAK_NT_COMPETITION;
  }
  if (family === 'HT') return pick(['2D','2H','2S'], rng);
  if (family === '3X') return pick(PREEMPT_BIDS, rng);
  return family === 'M' ? (rng() < 0.5 ? 'H' : 'S') : family;
}

function prefixProfile(auction) {
  const key = auction.map(call => call.bid).join(' ');
  return PRACTICE_PROFILES.find(profile => profile.initialAuction?.map(call => call.bid).join(' ') === key);
}

function physicalHands(session) {
  return { [session.playerSeat]: session.playerHand, [session.partnerSeat]: session.partnerHand };
}

export function startRelay(session, profileId, openerSeat) {
  const base = practiceStartState({ profileId, seed: session.seed });
  const reverseSeats = openerSeat && openerSeat !== base.partnerSeat;
  const playerSeat = reverseSeats ? base.partnerSeat : base.playerSeat;
  const partnerSeat = reverseSeats ? base.playerSeat : base.partnerSeat;
  const hands = physicalHands(session);
  if (!matchesConstraints(hands[partnerSeat], base.constraints, base.trump)) return openingBoundary(session);
  return freezeOpening({ ...session, ...base, auction: session.auction, opening: null,
    playerSeat, partnerSeat, playerHand: hands[playerSeat], partnerHand: hands[partnerSeat],
    ...(reverseSeats ? { relayRolesSwapped: true } : {}),
    constraints: [...base.constraints,...(session.openingConstraintsBySeat?.[partnerSeat] ?? [])],
    practiceRole: session.wholeAuction.humanSeat === playerSeat ? 'asker' : 'teller',
    wholeAuction: session.wholeAuction, openingFacts: session.openingFacts, pendingAsk: null });
}

export function joinOpeningRelay(session, profileId) {
  // Keep the first question pending when the human is the teller.
  const question = session.auction.at(-1);
  const base = startRelay({ ...session, auction: session.auction.slice(0,-1) }, profileId);
  if (base.coverageBoundary) return openingBoundary(session);
  const ladder = availableActions(base).find(option => option.bid === question.bid);
  return base.practiceRole === 'asker' ? applyBid(base, question.bid)
    : freezeOpening({ ...base, pendingAsk: { ...ladder, label: question.meaning } });
}

export function finishOpening(session, accept = false) {
  const seat = session.auction.at(-1).seat === 'North' ? 'South' : 'North';
  const auction = accept ? [...session.auction, { seat, bid: 'Pass', meaning: 'Accept final contract' }] : session.auction;
  const last = auction.findLast(call => call.bid !== 'Pass');
  return freezeOpening({ ...session, auction, opening: null, pendingAsk: null, phase: 'finished', finished: true,
    ...(['C','D','H','S'].includes(last.bid.slice(1))?{major:last.bid.slice(1),trump:last.bid.slice(1)}:{}),
    contract: { bid: last.bid, level: Number(last.bid[0]), strain: last.bid.slice(1),
      declarer: declarerFor(auction, last.bid.slice(1), last.seat) } });
}

export function openingBoundary(session, reason = 'This continuation is not implemented yet. Your bid has not been graded as a system error. Undo to explore another route.') {
  return freezeOpening({ ...session, phase: 'coverage-boundary', finished: true, coverageBoundary: true,
    undiscussedBid: session.auction.at(-1)?.bid,
    unsupportedReason: reason });
}

function diamondOpeningEligible(f) {
  if (f.hcp < 9 || f.lengths.D < 4) return false;
  if (f.balanced) return f.lengths.D >= 6 && f.hcp >= 12;
  return f.lengths.D >= 5 || f.shape.join('') === '4441';
}

const diamondProfiles = PRACTICE_PROFILES.filter(profile => profile.initialAuction?.[0].bid === '1D');
const diamondReorders = diamondProfiles.filter(profile => profile.id.startsWith('rebid-'));

function diamondRebid(auction, hand, f = features(hand)) {
  const response = auction[1].bid;
  const reordered = diamondReorders.find(profile => profile.initialAuction[1].bid === response
    && matchesConstraints(hand,profile.partnerConstraints,profile.defaultTrump));
  return reordered?.initialAuction[2].bid ?? basicDiamondRebid(response,f);
}

function basicDiamondRebid(response, f) {
  if (response === '1NT') {
    if (f.hcp <= 11) return '2D';
    if (f.hcp <= 15) return '2C';
    if (f.lengths.H >= 4) return '2H';
    if (f.lengths.S >= 4) return '2S';
    if (f.lengths.C >= 4) return '3C';
    if (f.balanced) return '2NT';
    return f.lengths.H <= 1 ? '3D' : f.lengths.S <= 1 ? '3H' : '3S';
  }
  const major = response.slice(1), m = f.lengths[major];
  if (m >= 4) {
    if (f.hcp <= 10) return `2${major}`;
    const outside = [other(major), 'C'];
    const shortage = outside.find(suit => f.lengths[suit] <= 1);
    if (shortage && (f.hcp <= 13 || f.hcp >= 17)) {
      return major === 'H' ? (shortage === 'S' ? '3C' : '3D') : (shortage === 'H' ? '3D' : '3H');
    }
    return `3${major}`;
  }
  if (m === 3 && f.hcp <= 15) return f.hcp <= 10 ? `2${major}` : '1NT';
  if (m === 3 && f.lengths.D >= 6 && f.lengths[other(major)] <= 3 && f.lengths.C <= 3) return '2NT';
  if (major === 'H' && f.lengths.S >= 4) return '1S';
  if (f.lengths.C >= 4) return '2C';
  if (major === 'S' && f.lengths.H >= 4 && f.hcp >= 16) return '3C';
  if (f.lengths.D >= 6 && f.lengths.H <= 3 && f.lengths.S <= 3 && f.hcp >= 14) return major === 'H' ? '2S' : '2H';
  return '2D';
}

function majorResponse(major, f) {
  if (f.lengths[major] >= 4 && f.hcp >= 12) return '2NT';
  if (major === 'H' && f.lengths.S >= 6 && f.hcp <= 7) return f.lengths.S >= 7 ? '3S' : '2S';
  if (f.hcp < 5) return 'Pass';
  if (major === 'H' && f.lengths.S >= 4 && (f.lengths.H <= 2 || f.lengths.S === 4 && f.lengths.H === 3 && f.hcp >= 10 && f.hcp <= 11)
      && !(f.balanced && f.hcp >= 12) && !(f.lengths.S >= 6 && f.hcp <= 7)) return '1S';
  if (f.lengths[major] >= 4 && f.hcp >= 10) return `3${major}`;
  if (f.lengths[major] >= 3) return f.hcp <= 9 ? `2${major}` : '2C';
  if (f.hcp >= 12 && (f.lengths[major]===2 && isMajorBalanced(f) || f.lengths.C >= 5)) return '2C';
  if (f.hcp >= 9 && f.hcp <= 11) {
    const minor = f.lengths.C >= f.lengths.D ? 'C' : 'D';
    if (f.lengths[minor] >= 6) return `3${minor}`;
  }
  if (f.lengths.D >= 5 && f.hcp >= 10) return '2D';
  if (f.hcp >= 10 && isMajorBalanced(f) && f.lengths[major] === 2 && f.lengths.C < 4) return '2C';
  if (major === 'S' && f.lengths.H >= 5 && f.hcp >= 10) return '2H';
  return '1NT';
}

function diamondResponse(f) {
  const { hcp, lengths:n } = f;
  if (hcp < 5) return 'Pass';
  const majors = Math.max(n.H,n.S);
  if (majors >= 5) return n.S > n.H ? '1S' : '1H';
  if (majors >= 4) return hcp >= 14 ? '1NT' : n.H >= 4 ? '1H' : '1S';
  if (hcp >= 14 && n.D >= 5) return '2NT';
  if (hcp >= 9 && hcp <= 12 && n.D >= 5) return '3D';
  if (hcp <= 9) return (n.C >= 6 || n.C === 5 && n.D <= 2) ? '2C' : '2D';
  return '1NT';
}

export function systemOpeningPartnerBid(context) {
  const { system, node, major, auction, hand }=context;
  if (usesOpeningRelay(system, auction, node)) return ntOpeningPartnerBid(context);
  if (extraOpenings[system]) {
    if (node === 'open') return system;
    const choices = extraActions(context).filter(row => matchesConstraints(hand,row.facts,'C'));
    const bid = extraOpenings[system].partner(context,choices);
    if (!choices.some(choice => choice.bid === bid)) throw new Error(`No compatible ${system} partner call at ${node}.`);
    return bid;
  }
  const f = features(hand);
  if (node === 'open') return system;
  const naturalNode = naturalOpeningNode(node, auction);
  if (naturalNode) return naturalOpeningPartnerBid(naturalNode, auction, hand);
  if (node === 'weak-raise' && /^1[HS]$/.test(system)) return ordinaryMajorPartnerBid(context, hand);
  if (node === 'weak-raise' || node === 'final') return 'Pass';
  if (MAJOR_NODES.includes(node) || system === '1H' && node === 'rebid') return ordinaryMajorPartnerBid(context,hand);
  if (system === '1D') {
    if (node === 'respond') return diamondResponse(f);
    return diamondRebid(auction, hand, f);
  }
  if (node === 'respond') return majorResponse(system.slice(1), f);
  throw new Error('No automated continuation for this opening node.');
}

function drawJoint(rng, accepts) {
  for (let attempt = 0; attempt < 500000; attempt++) {
    const cards = [...DECK];
    for (let i = 0; i < 26; i++) { const j = i + Math.floor(rng() * (52-i)); [cards[i],cards[j]] = [cards[j],cards[i]]; }
    const north = cards.slice(0,13), south = cards.slice(13,26);
    if (accepts(features(north),features(south),north,south)) return { North: north, South: south };
  }
  throw new Error('No deal found for this opening subset. Try another seed.');
}

function systemOpeningDraw(openingBid, seed) {
  const rng = makeRng(`whole-system:${openingBid}:${seed}`);
  const drawnSeat = rng() < 0.5 ? 'North' : 'South';
  const distributional = openingBid === '2C' && rng() < 0.35;
  return { rng, drawnSeat, distributional };
}

export function createSystemOpeningPractice({ seed, humanSeat, openingBid }) {
  seed = String(seed);
  const { rng, drawnSeat, distributional } = systemOpeningDraw(openingBid, seed);
  humanSeat ??= drawnSeat;
  if (!['North','South'].includes(humanSeat)) throw new Error('Choose North or South.');
  const horton = hortonBid(openingBid);
  const extra = Boolean(extraOpenings[openingBid]);
  let hands;
  if (horton) {
    const profileId = `horton-${openingBid[1].toLowerCase()}`;
    const fitDraw = makeRng(`horton-fit:${seed}`)();
    if (fitDraw < 0.2) {
      const second = getPracticeProfile(profileId).initialState.hortonSecondSuit;
      const [trump, otherShown] = fitDraw < 0.1 ? ['S', second] : [second, 'S'];
      const deal = createFamilyPractice(getPracticeProfile(profileId), seed, [
        {type:'length', suit:trump, min:5}, {type:'length', suit:otherShown, max:4},
        {type:'hcp', min:19}, {type:'keycards', trump, min:3},
      ]);
      hands = { North:deal.partnerHand, South:deal.playerHand };
    } else {
      const base = practiceStartState({profileId});
      hands = drawJoint(rng, (n,s,north) => s.hcp >= 4 && s.hcp <= 24 && matchesConstraints(north,base.constraints,'S'));
    }
  } else if (PREEMPT_BIDS.includes(openingBid)) {
    const [opening] = preemptRows({ system: openingBid, node: 'open' });
    hands = drawJoint(rng, (n,s,north) => matchesConstraints(north,opening.facts,'C') && s.hcp <= 23);
  } else if (openingBid === '1NT') {
    hands = drawJoint(rng, (n,s,north) => matchesConstraints(north,weakNotrumpFacts,'C') && s.hcp <= 22);
  } else if (openingBid === '2C') {
    hands = drawJoint(rng, (n,s,north) => s.controls <= 5 && (distributional
      ? !n.balanced && n.hcp >= 18 && n.hcp <= 26 && ['C','D','H','S'].some(suit =>
        n.lengths[suit] >= 7 && ['A','K','Q'].filter(rank => north.includes(suit+rank)).length >= 2)
      : n.hcp <= 27 && isBalancedStrongTwo(north)));
  } else if (openingBid === '2NT') hands = drawJoint(rng, (n,s) => {
    const shape = Object.values(n.lengths).sort((a,b) => b-a).join('');
    if (n.hcp < 20 || n.hcp > 22 || !['4333','4432','5332'].includes(shape) || s.hcp < 6 || s.hcp > 16) return false;
    return true;
  });
  else if (openingBid === '1D' && makeRng(`direct-diamond:${seed}`)() < 0.3) {
    const route = ['2C','3D','2NT'][Math.floor(rng()*3)];
    hands = drawJoint(rng, (n,s,north) => matchesConstraints(north,DIAMOND_RAISE.partnerConstraints,'D')
      && s.hcp >= 5 && s.hcp <= 19 && diamondResponse(s) === route);
  }
  else if (['1H','1S'].includes(openingBid) && makeRng(`natural-major:${seed}`)() < 0.24) {
    const major = openingBid[1];
    const routes = ['1NT','1NT','3C','3D',...(major === 'H' ? ['2S','3S'] : [])];
    const route = routes[Math.floor(rng()*routes.length)];
    hands = drawJoint(rng,(n,s,sampledNorth,sampledSouth) => {
      if(n.hcp<9 || n.hcp>19 || n.lengths[major]<5 || n.lengths[other(major)]>4
        || n.balanced && n.hcp<12 || s.hcp<5 || s.hcp>11 || majorResponse(major,s)!==route) return false;
      return route!=='1NT' || matchesConstraints(sampledSouth,majorResponseFacts(major,route),major);
    });
  }
  else if (['1H','1S'].includes(openingBid) && makeRng(`ordinary-major:${seed}`)() < 0.6) {
    const major=openingBid.slice(1);
    const targets=major==='H'?['2C','2D','1S']:['2C','2D','2H'];
    const target=targets[Math.floor(rng()*targets.length)];
    hands=drawJoint(rng,(n,s,north)=>{
      if(n.hcp<9||n.hcp>19||n.lengths[major]<5||n.lengths[other(major)]>4||n.balanced&&n.hcp<12||s.hcp<10||s.hcp>19) return false;
      if(majorResponse(major,s)!==target) return false;
      if(target==='2D' && s.lengths.D>=6 && s.hcp<12) return false;
      // Restrict generation to complete mechanical routes, including each NT enquiry.
      const node=target==='1S'?'rebid':target==='2C'?'major-club-rebid':target==='2D'?'major-diamond-rebid':'major-heart-rebid';
      const context={system:openingBid,node,auction:[{bid:openingBid},{bid:target}]};
      const rebid=ordinaryMajorPartnerBid(context, north);
      // The jump-rebid drills already supply 1H–1S hands. This draw gives
      // the natural 1NT range enquiry and 2C resolver an entry from the deal.
      return target === '1S' ? ['1NT','2C'].includes(rebid) : Boolean(rebid);
    });
  }
  else if (rng() < 0.2) {
    const major = openingBid.slice(1);
    const gameTry = openingBid !== '1D' && makeRng(`major-game-try:${seed}`)() < 0.4;
    hands = drawJoint(rng, (n,s) => {
      if (n.hcp < (gameTry ? 15 : 9) || n.hcp > (gameTry ? 17 : 11) || n.balanced || s.hcp < 5 || s.hcp > 8) return false;
      if (openingBid === '1D') return n.lengths.D >= 6 && s.lengths.D >= 4 && Math.max(s.lengths.H,s.lengths.S) <= 3;
      return n.lengths[major] >= 5 && n.lengths[other(major)]<=3 && n.lengths.C<=4 && n.lengths.D<=4 && s.lengths[major] === 3 && s.lengths[other(major)] <= 3;
    });
  }
  else {
    const major = openingBid.slice(1);
    const candidates = openingBid === '1D' ? diamondProfiles
      : openingBid === '1H' && rng() < 0.3 ? PRACTICE_PROFILES.filter(p => p.id === 'rebid-single-h-s' || p.id.startsWith('rebid-splinter-h-s-'))
      : [PRACTICE_PROFILES.find(p => p.id === `major-${major}`)];
    for (let attempt = 0; attempt < 320; attempt++) {
      const profile = candidates[Math.floor(rng()*candidates.length)];
      const deal = createPractice({ profileId: profile.id, seed: `${seed}:opening:${attempt}` });
      const pair = { [deal.playerSeat]: deal.playerHand, [deal.partnerSeat]: deal.partnerHand };
      const n = features(pair.North), s = features(pair.South);
      // A naturally forcing spade response to a strong diamond/heart reverse
      // can be lighter than the ordinary game-force practice sample.
      const minimum = profile.id === 'rebid-reverse-d-s-h' ? 10 : 14;
      if (s.hcp < minimum || s.hcp > 19) continue;
      if (openingBid === '1D') {
        if (n.hcp > 19 || !diamondOpeningEligible(n) || s.lengths.H >= 4 && s.lengths.S >= 4 && Math.max(s.lengths.H,s.lengths.S) >= 5) continue;
        const response = diamondResponse(s);
        if (!['1H','1S','1NT'].includes(response)) continue;
        const auction = [{seat:'North',bid:'1D'},{seat:'South',bid:response}];
        const rebid = diamondRebid(auction,pair.North,n);
        auction.push({seat:'North',bid:rebid});
        const target = prefixProfile(auction);
        if (!target || !matchesConstraints(pair.North, practiceStartState({profileId:target.id}).constraints, target.defaultTrump)) continue;
      } else if (majorResponse(major,s) !== '2NT') {
        if (openingBid !== '1H' || majorResponse(major,s) !== '1S') continue;
        const auction = [{seat:'North',bid:'1H'},{seat:'South',bid:'1S'}];
        const rebid = ordinaryMajorPartnerBid({ system:'1H', node:'rebid', auction }, pair.North);
        if (!rebid || !prefixProfile([...auction,{seat:'North',bid:rebid}])) continue;
      }
      hands = pair; break;
    }
    if (!hands) throw new Error('No complete opening route found within this subset. Try another seed.');
  }
  const hcp=(min,max)=>({type:'hcp',min,max}), length=(suit,min,max)=>({type:'length',suit,min,max});
  const m=openingBid.slice(1);
  const southRestriction=openingBid==='2NT'?{type:'hcp',min:6,max:16,label:'Responder: 6–16 in this practice subset'}
    : {type:'anyOf',label:openingBid==='1D'?'Responder: weak raise or clear game force in this practice subset':'Responder: weak raise or 10–19 in this practice subset',options:openingBid==='1D'
      ?[[hcp(5,8),length('D',4,13),length('H',0,3),length('S',0,3)],[hcp(5,9),length('C',5,13)],[hcp(9,12),length('D',4,13)],[hcp(10,13),length('S',4,13)],[hcp(14,19)]]
      :[[hcp(5,8),length(m,3,3),length(other(m),0,3)],[hcp(5,9),length(m,0,2)],[hcp(14,19),length(m,4,13)],[hcp(10,19)],
        ...(m==='H'?[[hcp(5,7),length('S',6,8)],[hcp(14,19),length('S',4,13),length('H',0,2),{type:'balanced',value:false}]]:[])]};
  const initialSouth = extra || horton ? [] : [southRestriction];
  return createSystemOpeningState({ seed, humanSeat, openingBid, hands, initialSouth });
}

export function createSystemOpeningState({ seed, humanSeat, openingBid, hands, initialSouth = [] }) {
  const horton = hortonBid(openingBid);
  const relaySeat = horton || openingBid === '2NT';
  const extra = Boolean(extraOpenings[openingBid]);
  const trump = horton ? 'S' : extra || openingBid === '2NT' ? 'C' : openingBid.slice(1);
  return freezeOpening({ familyId: `opening-${openingBid}`, systemId: 'outback-acol', seed,
    playerSeat: relaySeat?'South':'North', partnerSeat: relaySeat?'North':'South',
    playerHand: relaySeat?hands.South:hands.North, partnerHand: relaySeat?hands.North:hands.South,
    practiceRole: humanSeat === (relaySeat?'South':'North') ? 'asker' : 'teller', major:trump, trump,
    auction: [], constraints: relaySeat?[]:initialSouth, openingFacts: { North: [], South: [] }, openingConstraintsBySeat: { North: [], South: initialSouth },
    wholeAuction: { rulesVersion: 1, humanSeat, openingBid },
    opening: { system: openingBid, node: 'open', seat: 'North', major: extra || openingBid === '2NT' ? null : trump },
    phase: 'opening', pendingAsk: null, revealed: false, finished: false, contract: null });
}

function openingActionsTable(session) {
  const { system, node, major } = session.opening;
  const ordinary=ordinaryMajorOptions({...session.opening,auction:session.auction});
  if(ordinary) return ordinary.map(({bid,label,source,forcing})=>({ ...action(bid,label,source), ...(forcing ? {forcing} : {}) }));
  const calls = rows => rows.map(([bid,label,source]) => action(bid,label,source));
  const games = [['3NT','Play 3NT'], ...(major ? [[`4${major}`,`Play 4${major}`]] : [])];
  if (node === 'open') return calls([[system, system === '2NT' ? '20–22 balanced' : system === '1D' ? 'Diamond opening' : `Five-plus ${names[major]}; 9+`, system === '2NT' ? 'P1312' : system === '1D' ? 'P0631–P0636' : 'P0886']]);
  if (node === 'final') return calls([['Pass','Accept final contract'],...games.filter(([bid]) => bidIndex(bid)>bidIndex(session.auction.findLast(call=>call.bid!=='Pass').bid))]);
  if (system !== '2NT') {
    if (node === 'respond') return system === '1D' ? [
      ...(entryContinuations(session.auction) ?? []).map(row => ({
        ...action(row.bid,row.label,'P0638–P0647'), ...(forcingResponses[system].includes(row.bid) ? {forcing:true} : {}),
      })), action('Pass', 'Weak hand, play 1D', 'Natural pass'),
    ] : calls([
      ['Pass', `Weak hand, play ${system}`, 'Natural pass'],
      ...(major==='H' ? [['1S','Four-plus spades; forcing one round','P0904–P0909']] : []),
      ['1NT','5–9, or 10/11 with clubs; nonforcing, fewer than three trumps','P0889'],
      ['2C','Three-way: invitational-plus raise, balanced game force, or game-forcing clubs','P1479'],
      ['2D','Five-plus diamonds; 10+, forcing one round','P0891/P1019/P1036'],
      ...(major==='S' ? [['2H','Five-plus hearts; 10+, forcing one round','P0894']] : [
        ['2S','Six-plus spades; weak, nonforcing','P0893'], ['3S','Long spades; weak, nonforcing','P0898'],
      ]),
      [`2${major}`,'Three-plus support; 5–9','P0892'],['2NT','Four-plus support; game-forcing','P0895'],
      ['3C','Six-plus clubs; natural invitation','P0896'], ['3D','Six-plus diamonds; natural invitation','P0896'],
      ...(major === 'S' ? [['3H','Six-plus hearts; natural invitation','P0897']] : []),
      [`3${major}`,'Four-plus support; 8–12, invitational','P0899'], ['3NT','Five-plus/six-plus minors; 9–13','P0900'],
      ...['C','D'].map(suit => [`4${suit}`, `Seven-plus ${names[suit].toLowerCase()}; weak, to play`,'P0901']),
      [`4${other(major)}`,`Natural; play 4${other(major)}`,'P0902–P0903'],
    ]).map(row => forcingResponses[system].includes(row.bid) ? {...row,forcing:true} : row);
    if (node === 'weak-raise') return calls([['Pass',`Play ${session.auction.at(-1).bid}`], ...games]);
    return (entryContinuations(session.auction) ?? []).map(row => action(row.bid,row.label,'July email / Reordering'));
  }
  throw new Error('Unknown opening-practice node.');
}

export function systemOpeningActions(session) {
  if (usesOpeningRelay(session.opening.system, session.auction, session.opening.node)) return ntOpeningActions(session);
  if (extraOpenings[session.opening.system]) return extraActions(session);
  if (hortonBid(session.opening.system)) {
    const bid = session.opening.system;
    const second = { '2D':'diamonds', '2H':'hearts', '2S':'clubs' }[bid];
    return [action(bid,`Horton: four/five spades, four-plus ${second}, 0–8`,'P1060–P1065')];
  }
  const naturalNode = naturalOpeningNode(session.opening.node, session.auction);
  if (naturalNode) return naturalOpeningActions(naturalNode, session.auction);
  const choices=openingActionsTable(session);
  const last=session.auction.findLast(call=>call.bid!=='Pass');
  if ((session.opening.system==='2NT' || MAJOR_NODES.includes(session.opening.node)) && session.opening.seat==='South' && last?.seat==='North') {
    // The asking hand controls the contract, including artificial answers.
    if (!isForcingOpeningCall(session) && !choices.some(call=>call.bid==='Pass')) choices.push(action('Pass',`Play ${last.bid}`));
    for (const level of [6,7]) for (const strain of ['C','D','H','S','NT']) {
      const bid=`${level}${strain}`;
      if (!choices.some(call=>call.bid===bid)) choices.push({...action(bid,`Play ${bid}`),kind:'opening-final'});
    }
  }
  return choices.filter(call=>call.bid==='Pass' || !last || bidIndex(call.bid)>bidIndex(last.bid));
}

function openingFactsForCall(session,bid) {
  const { system,node,major }=session.opening;
  if (extraOpenings[system] || hortonBid(system)) return [];
  const length=(suit,min,max)=>({type:'length',suit,...(min===undefined?{}:{min}),...(max===undefined?{}:{max})});
  const control=suit=>({type:'anyOf',options:[[{type:'card',suit,rank:'A'}],[{type:'card',suit,rank:'K'}],[length(suit,0,1)]]});
  const points=(min,max)=>({type:'hcp',min,...(max===undefined?{}:{max})});
  if (node==='open') return system==='2NT'?[points(20,22),{type:'balanced'},{type:'shapes',values:ntShapes}]:system==='1D'?[points(9,19),length('D',4)]:[points(9,19),length(major,5)];
  if (system==='1D' && node==='respond') {
    if (bid==='1H'||bid==='1S') return [points(5),length(bid.slice(1),4)];
    if (bid==='1NT') return [{type:'anyOf',options:[[points(10),length('H',0,3),length('S',0,3)],[points(14),length('H',0,4),length('S',0,4)]]}];
    if (bid==='2D') return [points(5,9),length('D',3)];
    if (bid==='2C') return [points(5,9),length('C',5)];
    if (bid==='3D') return [points(9,12),length('D',4)];
    if (bid==='2NT') return [points(12),length('D',5)];
  }
  if (['1H','1S'].includes(system) && node==='respond' && (['1NT','2C','2D'].includes(bid) || system==='1S'&&bid==='2H')) return majorResponseFacts(major,bid);
  const naturalNode = naturalOpeningNode(node, session.auction);
  if (naturalNode) return naturalOpeningActions(naturalNode, session.auction).find(row => row.bid === bid)?.facts ?? [];
  const ordinary = ordinaryMajorOptions({...session.opening,auction:session.auction});
  if (ordinary) return ordinary.find(row => row.bid === bid)?.facts ?? [];
  if (system!=='2NT' && node==='respond') {
    if (bid==='2NT') return [points(12),length(major,4)];
    if (bid===`2${major}`) return [points(5,9),length(major,3)];
    if (bid===`3${major}`) return [points(8,12),length(major,4)];
    if (['3C','3D'].includes(bid) || system==='1S' && bid==='3H') return [length(bid[1],6)];
    if (['4C','4D'].includes(bid)) return [length(bid[1],7)];
    if (bid==='1S') return [points(5),length('S',4)];
    if (system==='1H' && ['2S','3S'].includes(bid)) return [points(0,7),length('S',6)];
  }
  if (system!=='2NT') return [];
  if (node==='respond' && ['3D','3H','4H'].includes(bid)) return [length(bid==='3D'?'H':'S',5)];
  if (node==='muppet') return bid==='3D'?[{type:'anyOf',options:[[length('H',4,4)],[length('S',4,4)]]},length('H',0,4),length('S',0,4)]
    :bid==='3H'?[length('H',0,3),length('S',0,3)]:[length(bid==='3S'?'S':'H',5,5)];
  if (node==='four-major' && (bid==='3H'||bid==='3S')) return [length(bid==='3H'?'S':'H',4)];
  if (node==='fit-major') return [length(major,bid==='3NT'?0:4,bid==='3NT'?3:5),...(['4C','4D'].includes(bid)?[control(bid.slice(1))]:[])];
  if (node==='no-major' && bid==='3NT') return [length('S',5,5),length('H',4,4)];
  if (node==='transfer') return [length(major,bid===`3${major}`?0:bid==='3NT'?3:4,bid===`3${major}`||bid==='3NT'?3:5),...(bid==='3NT'?[{type:'shapes',values:ntShapes.filter(shape=>shape.split('').sort().join('')!=='3334')}]:[]),...((major==='H'?['4C','4D']:['4D','4H']).includes(bid)?[control(bid.slice(1))]:[])];
  if (node==='pick-game' && bid!=='Pass') return [length(major,3)];
  if (node==='minor-stayman' && bid!=='3NT') { const suit=['4C','4H'].includes(bid)?'C':'D',size=['4H','4S'].includes(bid)?5:4; return [length(suit,size,size)]; }
  return [];
}

export function applySystemOpeningCall(session,bid) {
  if (usesOpeningRelay(session.opening.system, session.auction, session.opening.node)) return applyNtOpeningCall(session,bid);
  const { system,node,major,seat } = session.opening;
  const option = systemOpeningActions(session).find(call => call.bid === bid);
  const next = { ...session, opening: { ...session.opening }, constraints: [...session.constraints],
    openingFacts: { North: [...session.openingFacts.North], South: [...session.openingFacts.South] },
    auction: [...session.auction,{ seat,bid,meaning:option?.label ?? 'Not implemented in whole-auction practice',source:option?.source,
      ...(option?.forcing ? {forcing:true} : {}),
      callAlternatives: systemOpeningActions(session).map(({bid,label}) => ({bid,label})) }] };
  if (!option) return openingBoundary(next);
  next.openingConstraintsBySeat = { North: [...(session.openingConstraintsBySeat?.North ?? [])], South: [...(session.openingConstraintsBySeat?.South ?? [])] };
  next.openingConstraintsBySeat[seat].push(...openingFactsForCall(session,bid).map(fact=>({...fact,label:option.label,source:option.source})));
  next.constraints=next.openingConstraintsBySeat[next.partnerSeat];
  const hand = physicalHands(session)[seat];
  const f = features(hand);
  const require = (condition,message) => { if (!condition) throw new Error(message); };
  const move = (node,extras={}) => {
    if (node==='final' && ['C','D','H','S'].includes(bid.slice(1))) {next.major=bid.slice(1);next.trump=next.major;}
    next.opening = { ...next.opening, node, seat: seat === 'North' ? 'South' : 'North',...extras };
    next.openingFacts[seat].push(option.label);
    return freezeOpening(next);
  };
  if (hortonBid(system)) {
    const profileId = `horton-${bid[1].toLowerCase()}`;
    require(matchesConstraints(hand, practiceStartState({profileId}).constraints, 'S'), `This opening shows ${option.label}.`);
    return startRelay(next, profileId);
  }
  if (extraOpenings[system]) {
    if (system === '2C' && node === 'open') require(strongTwoEligible(hand), '2C needs 23+ balanced or a distributional game force.');
    if (node === 'open' && PREEMPT_BIDS.includes(system) && system !== '3S'
        && f.lengths[system[1]] >= 6 && [4, 5].includes(f.lengths.S)) {
      throw new Error('With four or five spades and that long side suit, use the corresponding Horton two.');
    }
    const weakFlatPass = system === '1NT' && node === 'respond' && bid === 'Pass';
    require(matchesConstraints(hand,option.facts,'C'), weakFlatPass
      ? 'With 0–7 HCP and 4333 or 4432, choose Junk Stayman or an advanced-run transfer.'
      : `This call shows ${option.label.toLowerCase()}.`);
    next.openingConstraintsBySeat[seat].push(...option.facts.map(fact=>({...fact,label:option.label,source:option.source})));
    next.constraints = next.openingConstraintsBySeat[next.partnerSeat];
    if (option.next === 'finish') return finishOpening(next);
    return move(option.next, {major:option.major ?? major,second:option.second ?? session.opening.second});
  }
  if (node === 'open') {
    if (system === '2NT') { next.balanced=true;next.shortageSuit=null; }
    if (system === '2NT') require(f.hcp>=20 && f.hcp<=22 && ntShapes.includes(['S','H','D','C'].map(suit=>f.lengths[suit]).join('')),'The 2NT opening shows 20–22 balanced in this subset.');
    else if (system === '1D') require(diamondOpeningEligible(f),'This diamond opening needs diamonds and an admitted unbalanced/long-diamond hand.');
    else require(f.hcp>=9 && f.lengths[major]>=5 && (!f.balanced || f.hcp>=12),'A major opening requires five-plus cards and opening values; weak balanced hands open 1NT.');
    return move('respond');
  }
  if(option.kind==='opening-final') return move('final');
  const context = {...session.opening,auction:session.auction};
  if (ordinaryMajorOptions(context)) {
    const row=ordinaryMajorCheck(context,bid,physicalHands(session)[seat]);
    if (bid === 'Pass' && !row) return finishOpening(next); // Generic signoff added to an ordinary asking node.
    if(!row || row.next==='boundary') return openingBoundary(next);
    if(row.next==='finish') return finishOpening(next);
    if (row.next === 'nt-answer') {
      next.openingFacts[seat].push(option.label);
      return startOpeningKeycards(next, row.trump);
    }
    if (row.trump) {
      next.major = next.trump = row.trump;
      return move(row.next, { major: row.trump });
    }
    if (row.next === 'relay-handover') {
      const target = prefixProfile(next.auction);
      if (!target) return openingBoundary(next);
      require(matchesConstraints(physicalHands(session).North, practiceStartState({profileId:target.id}).constraints, target.defaultTrump),
        'This relay entry does not match the shape and range shown by the rebid.');
      return startRelay(next,target.id);
    }
    return move(row.next);
  }

  if (naturalOpeningNode(node, session.auction)) {
    require(matchesConstraints(hand,option.facts,major), `This call shows ${option.label.toLowerCase()}.`);
    return option.next === 'finish' ? finishOpening(next) : move(option.next);
  }
  if (node === 'weak-raise' || node === 'final') return bid === 'Pass' ? finishOpening(next) : move('final');
  if (node === 'respond' && bid === 'Pass') {
    require(f.hcp <= 4, 'A weak pass shows 0–4 HCP in this practice subset.');
    return finishOpening(next);
  }
  if (system === '1D' && node === 'respond') {
    if (bid === '1H' || bid === '1S') {
      const suit=bid.slice(1);
      require(f.lengths[suit]>=4 && f.hcp>=5,`A 1${suit} response needs four-plus ${names[suit]} and response values.`);
      require(!(f.hcp>=14 && f.lengths[suit]===4),'With only a four-card major and game-forcing values, use the 1NT enquiry.');
      return move('rebid',{major:suit});
    }
    if (bid === '1NT') { require(f.hcp>=10 && Math.max(f.lengths.H,f.lengths.S)<5 && (Math.max(f.lengths.H,f.lengths.S)<4 || f.hcp>=14),'The 1NT enquiry needs 10+, no five-card major, and game-forcing values with a four-card major.'); return move('rebid',{major:null}); }
    if (bid === '2D') { require(f.hcp>=5 && f.hcp<=9 && f.lengths.D>=3,'A simple diamond raise shows 5–9 and three/four-plus diamonds.'); return move('weak-raise',{major:'D'}); }
    if (['2C','3D','2NT'].includes(bid)) {
      require(matchesConstraints(hand, openingFactsForCall(session,bid), 'D'), `This response shows ${option.label.toLowerCase()}.`);
      return bid === '2NT' ? joinOpeningRelay(next, DIAMOND_RAISE.id) : move('ordinary-rebid');
    }
    return openingBoundary(next);
  }
  if (system !== '2NT' && node === 'respond') {
    if (bid === '2NT') { require(f.hcp>=12 && f.lengths[major]>=4,'Jacoby 2NT needs four-plus support and game-forcing values (12+ in this subset).'); return joinOpeningRelay(next, `major-${major}`); }
    if (bid === `2${major}`) { require(f.hcp>=5 && f.hcp<=9 && f.lengths[major]>=3,'A simple major raise shows 5–9 with three-plus support.'); return move('weak-raise'); }
    if (bid === `3${major}` || ['3C','3D'].includes(bid) || system === '1S' && bid === '3H') {
      require(matchesConstraints(physicalHands(session)[seat], openingFactsForCall(session,bid), major), `This invitation shows ${option.label.toLowerCase()}.`);
      return move('major-invitation');
    }
    if (['4C','4D'].includes(bid) || bid === `4${other(major)}`) {
      require(matchesConstraints(physicalHands(session)[seat], openingFactsForCall(session,bid), major), `This response shows ${option.label.toLowerCase()}.`);
      return move('final');
    }
    if (bid === '1S') {
      require(major==='H' && f.lengths.S>=4 && f.hcp>=5,'The 1S response needs four-plus spades and response values.');
      require(!(f.lengths.S===5 && f.lengths.H===3),'With five spades and three hearts, use the heart raise or three-way 2C.');
      require(!(f.balanced && f.hcp>=12),'A game-forcing balanced hand uses the three-way 2C response.');
      return move('rebid');
    }
    if (major === 'H' && ['2S','3S'].includes(bid)) {
      require(f.hcp <= 7 && f.lengths.S >= 6, 'This spade jump shows a weak hand with at least six spades.');
      return move('final');
    }
    if (['1NT','2C','2D','2H'].includes(bid)) {
      require(matchesConstraints(physicalHands(session)[seat],majorResponseFacts(major,bid),major),`This response shows ${option.label.toLowerCase()}.`);
      if(bid==='2C') return move('major-club-rebid');
      if(bid==='2D') return move('major-diamond-rebid');
      if(bid==='2H' && major==='S') return move('major-heart-rebid');
      if(bid==='1NT') return move('ordinary-rebid');
    }
    return openingBoundary(next);
  }
  if (system !== '2NT') {
    const expected = diamondRebid(session.auction,hand,f);
    const target = prefixProfile(next.auction);
    require(bid===expected || target && matchesConstraints(physicalHands(session).North,practiceStartState({profileId:target.id}).constraints,target.defaultTrump),`This rebid does not match the shown shape/range. The source route for this hand is ${expected}.`);
    return target ? startRelay(next,target.id) : openingBoundary(next);
  }
  return openingBoundary(next);
}

export function validateSystemOpeningSession(session) {
  const whole=session.wholeAuction;
  if (whole.rulesVersion!==1 || !['North','South'].includes(whole.humanSeat)
      || !Object.values(openingBids).includes(whole.openingBid)
      || session.practiceRole!==(whole.humanSeat===session.playerSeat?'asker':'teller')
      || !session.openingFacts || !Array.isArray(session.openingFacts.North) || !Array.isArray(session.openingFacts.South)) throw new Error('Saved opening rules or settings are incompatible.');
  if (whole.openingBid==='2NT')return validateNtOpening(session);
  if (session.opening) {
    const { system,node,seat }=session.opening;
    if (system!==whole.openingBid || !['North','South'].includes(seat) || typeof node!=='string') throw new Error('Saved opening node is invalid.');
    if (usesOpeningRelay(system, session.auction, node)) return validateNtOpening(session);
    if (extraOpenings[system] || hortonBid(system)) {
      if (hortonBid(system) && node !== 'open') throw new Error('Saved Horton opening node is invalid.');
      systemOpeningActions(session);
      if (!session.finished && seat !== whole.humanSeat) throw new Error('Saved opening turn is invalid.');
      return;
    }
    if (naturalOpeningNode(node, session.auction)) {
      const last = session.auction.at(-1);
      if (seat === last?.seat || !session.finished && seat !== whole.humanSeat) throw new Error('Saved opening turn is invalid.');
      systemOpeningActions(session);
      return;
    }
    const nodes=system==='2NT'?['open','respond','muppet','four-major','fit-major','both-majors','no-major','puppet-nt','shown-five','transfer','after-transfer','pick-game','super-fit','retransfer','minor-stayman','shown-minor','final']:[ 'open','respond','rebid','weak-raise','final',...(['1H','1S'].includes(system)?MAJOR_NODES:[]) ];
    if (!nodes.includes(node)) throw new Error('Saved opening node is invalid.');
    const northNodes=[...MAJOR_NORTH_NODES,'open','rebid','weak-raise','muppet','fit-major','both-majors','puppet-nt','transfer','pick-game','retransfer','minor-stayman'];
    if (node!=='final' && seat!==(northNodes.includes(node)?'North':'South')) throw new Error('Saved opening seat is invalid.');
    if (session.opening.major!==null && !Object.hasOwn(names,session.opening.major)) throw new Error('Saved opening suit is invalid.');
    systemOpeningActions(session);
    if (!session.finished && seat!==whole.humanSeat) throw new Error('Saved opening turn is invalid.');
  }
}
