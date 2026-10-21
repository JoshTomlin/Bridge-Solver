import { SYSTEM } from './system.js';
import { postRangeActions, applyPostRangeBid, classifySuitResponse, publicLengthBounds, keycardAction } from './continuations.js';
import { getPracticeProfile, PRACTICE_PROFILES } from './profiles.js';
import { declarerFor } from './profile-utils.js';

export { PRACTICE_PROFILES, getPracticeProfile };

export const SUITS = Object.freeze(['S', 'H', 'D', 'C']);
export const RANKS = Object.freeze(['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']);
export const DECK = Object.freeze(SUITS.flatMap(suit => RANKS.map(rank => suit + rank)));
const DECK_SET = new Set(DECK);
const BID_STRAINS = ['C', 'D', 'H', 'S', 'NT'];
const HCP = { A: 4, K: 3, Q: 2, J: 1 };
const SUIT_NAMES = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function validateMajor(major) {
  if (major !== 'S' && major !== 'H') throw new Error('Major must be S or H.');
}

function validateTrump(trump) {
  if (!SUITS.includes(trump)) throw new Error('Trump must be S, H, D or C.');
}

function validateHand(cards) {
  if (!Array.isArray(cards) || cards.length !== 13 || new Set(cards).size !== 13 || cards.some(card => !DECK_SET.has(card))) {
    throw new Error('A hand must contain 13 distinct canonical cards, such as SA or DT.');
  }
}

/** A stable seed gives the same pseudorandom stream in the browser and Node. */
export function makeRng(seed) {
  const value = String(seed);
  let state = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    state = Math.imul(state ^ value.charCodeAt(index), 16777619);
  }
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sortedHand(cards) {
  return cards.slice().sort((left, right) => DECK.indexOf(left) - DECK.indexOf(right));
}

/** Partial Fisher–Yates: every ordered draw without replacement is equally likely. */
function drawCards(pool, count, rng, unbiased = false) {
  const cards = pool.slice();
  for (let index = 0; index < count; index += 1) {
    const remaining = cards.length - index;
    const next = index + (unbiased ? randomInteger(remaining, rng) : Math.floor(rng() * remaining));
    [cards[index], cards[next]] = [cards[next], cards[index]];
  }
  return cards.slice(0, count);
}

export function handFeatures(cards, major) {
  validateTrump(major);
  validateHand(cards);
  const lengths = Object.fromEntries(SUITS.map(suit => [suit, 0]));
  let hcp = 0;
  let controls = 0;
  let keycards = 0;
  for (const card of cards) {
    const [suit, rank] = card;
    lengths[suit] += 1;
    hcp += HCP[rank] || 0;
    controls += rank === 'A' ? 2 : rank === 'K' ? 1 : 0;
    keycards += rank === 'A' || card === `${major}K` ? 1 : 0;
  }
  const shape = Object.values(lengths).sort((left, right) => right - left);
  return {
    hcp, controls, lengths, keycards,
    trumpQueen: cards.includes(`${major}Q`),
    shape,
    balanced: Object.values(lengths).every(length => length >= 2),
    balanced5332: shape.join('') === '5332',
  };
}

function inTrainingUniverse(features, major, constraint) {
  const sideLengths = SUITS.filter(suit => suit !== major).map(suit => features.lengths[suit]);
  const shortages = sideLengths.filter(length => length <= 1).length;
  return shortages <= (constraint.maxShortages ?? SYSTEM.training.maxShortages)
    && (shortages > 0 || features.hcp >= (constraint.minBalancedHcp ?? SYSTEM.training.minBalancedHcp));
}

function between(value, constraint) {
  return (constraint.min === undefined || value >= constraint.min)
    && (constraint.max === undefined || value <= constraint.max)
    && (constraint.equals === undefined || value === constraint.equals);
}

/** Predicate data, never a hidden-hand closure, defines compatible partner hands. */
export function matchesConstraints(cards, constraints, major) {
  const features = handFeatures(cards, major);
  const match = constraint => {
    const trump = constraint.trump ?? major;
    switch (constraint.type) {
      case 'hcp': return between(features.hcp, constraint);
      case 'controls': return between(features.controls, constraint);
      case 'keycards': return between(trump === major ? features.keycards : handFeatures(cards, trump).keycards, constraint);
      case 'keycardOptions': return constraint.values.includes(trump === major ? features.keycards : handFeatures(cards, trump).keycards);
      case 'anyOf': return constraint.options.some(option => option.every(match));
      case 'shapes': return constraint.values.includes(SUITS.map(suit => features.lengths[suit]).join(''));
      case 'card': return cards.includes(`${constraint.suit}${constraint.rank}`) === (constraint.present ?? true);
      case 'suitResponse': return classifySuitResponse(cards, constraint.suit) === constraint.category;
      case 'length': {
        if (!SUITS.includes(constraint.suit)) throw new Error('Unknown constraint suit.');
        return between(features.lengths[constraint.suit], constraint);
      }
      case 'trumpQueen': return cards.includes(`${trump}Q`) === constraint.value;
      case 'balanced': return features.balanced === (constraint.value ?? true);
      case 'balanced5332': return features.balanced5332;
      case 'shapeUniverse': return inTrainingUniverse(features, major, constraint);
      default: throw new Error(`Unknown constraint type: ${constraint.type}`);
    }
  };
  return constraints.every(match);
}

export function bidIndex(bid) {
  const match = /^([1-7])(C|D|H|S|NT)$/.exec(bid);
  if (!match) throw new Error(`Invalid contract bid: ${bid}`);
  return (Number(match[1]) - 1) * 5 + BID_STRAINS.indexOf(match[2]);
}

export function compareBids(left, right) {
  return bidIndex(left) - bidIndex(right);
}

export function nextBid(bid, steps = 1) {
  if (!Number.isInteger(steps) || steps < 1) throw new Error('Bid steps must be a positive integer.');
  const index = bidIndex(bid) + steps;
  if (index >= 35) return null;
  return `${Math.floor(index / 5) + 1}${BID_STRAINS[index % 5]}`;
}

/** Count relay steps using the profile's convention for 3NT. */
export function stepBid(bid, steps = 1, { skip3NT = false, skipMajorGame = false, major } = {}) {
  if (!Number.isInteger(steps) || steps < 1) throw new Error('Bid steps must be a positive integer.');
  let result = bid;
  for (let step = 0; step < steps; step += 1) {
    result = nextBid(result);
    while ((skip3NT && result === '3NT') || (skipMajorGame && result === `4${major}`)) result = nextBid(result);
    if (result === null) return null;
  }
  return result;
}

function lastBid(session) {
  return session.auction.findLast(entry => entry.bid !== 'Pass').bid;
}

function openingConstraints(major) {
  return [
    { type: 'length', suit: major, min: SYSTEM.opening.minMajorLength, label: `At least ${SYSTEM.opening.minMajorLength} ${SUIT_NAMES[major].toLowerCase()}` },
    { type: 'hcp', min: SYSTEM.opening.minHcp, max: SYSTEM.opening.maxHcp, label: `${SYSTEM.opening.minHcp}–${SYSTEM.opening.maxHcp} HCP (training restriction)` },
    ...SUITS.filter(suit => suit !== major).map(suit => ({ type: 'length', suit, max: SYSTEM.training.maxSideSuitLength, label: `${SUIT_NAMES[suit]}: at most ${SYSTEM.training.maxSideSuitLength} cards (training restriction)` })),
    { type: 'shapeUniverse', maxShortages: SYSTEM.training.maxShortages, minBalancedHcp: SYSTEM.training.minBalancedHcp, label: `Training shapes: zero or one shortage; no-shortage hands have at least ${SYSTEM.training.minBalancedHcp} HCP` },
  ];
}

function constraintLabel(constraint) {
  if (constraint.label) return constraint.label;
  const interval = constraint.equals ?? (constraint.min === constraint.max ? constraint.min
    : constraint.min === undefined ? `at most ${constraint.max}`
    : constraint.max === undefined ? `at least ${constraint.min}` : `${constraint.min}–${constraint.max}`);
  switch (constraint.type) {
    case 'hcp': return `${interval} HCP`;
    case 'controls': return `${interval} controls (ace = 2, king = 1)`;
    case 'keycardOptions': return `${constraint.values.join(' or ')} keycards`;
    case 'trumpQueen': return constraint.value ? 'Has the trump queen' : 'Does not have the trump queen';
    case 'length': return `${SUIT_NAMES[constraint.suit]}: ${interval} cards`;
    case 'shapes': return `Shape (SHDC): ${constraint.values.join(' / ')}`;
    case 'anyOf': return constraint.options.map(option => option.map(constraintLabel).join('; ')).join(' OR ');
    case 'balanced': return constraint.value === false ? 'At least one singleton or void' : 'No singleton or void';
    case 'card': return `${constraint.present === false ? 'No' : 'Has'} ${constraint.suit}${constraint.rank}`;
    default: return constraint.type;
  }
}

function publicSession(session) {
  const { partnerHand, playerHand, ...known } = session;
  return known;
}

/** Dynamic definitions can see only facts already disclosed in the auction. */
export function practiceNode(session) {
  if (!session.familyId || session.familyId.startsWith('major-') || session.phase !== 'family') return null;
  const node = getPracticeProfile(session.familyId).nodes[session.nodeId];
  if (!node) throw new Error(`Missing practice node: ${session.nodeId}`);
  return typeof node === 'function' ? node(publicSession(session)) : node;
}

function createFamilyPractice(profile, seed) {
  const trump = profile.defaultTrump;
  validateTrump(trump);
  const seedValue = String(seed);
  const rng = makeRng(`${profile.id}:${seedValue}`);
  const constraints = profile.partnerConstraints.map(constraint => ({ ...constraint, label: constraintLabel(constraint) }));
  const base = {
    systemId: SYSTEM.id, familyId: profile.id, playerSeat: profile.playerSeat ?? 'South',
    partnerSeat: profile.partnerSeat ?? 'North', trump, major: trump, seed: seedValue,
    auction: profile.initialAuction.map(call => ({ ...call })), constraints,
    balanced: null, shortageSuit: null, relayPolicy: { skip3NT: true, skipMajorGame: false },
    phase: 'family', nodeId: profile.startNode, revealed: false, finished: false,
    contract: null, unsupportedReason: null, ...profile.initialState,
  };
  const proposal = shapeWeights(base, DECK);
  if (!proposal.totalWeight) throw new Error(`No legal practice shapes for ${profile.name}.`);
  const pools = Object.fromEntries(SUITS.map(suit => [suit, DECK.filter(card => card[0] === suit)]));
  // Each partner hand satisfying the public shape restrictions has equal
  // proposal probability. Reject the entire pair if either hand fails its
  // remaining restrictions, preserving the conditional joint distribution.
  for (let attempts = 0; attempts < 1000000; attempts += 1) {
    const partnerHand = proposeHand(proposal, pools, rng);
    if (!matchesConstraints(partnerHand, constraints, trump)) continue;
    const known = new Set(partnerHand);
    const playerHand = drawCards(DECK.filter(card => !known.has(card)), 13, rng, true);
    if (!matchesConstraints(playerHand, profile.playerConstraints ?? [], trump)) continue;
    return freeze({ ...base, playerHand: sortedHand(playerHand), partnerHand: sortedHand(partnerHand) });
  }
  throw new Error('No practice deal found within the generation limit; choose another seed.');
}

function mergeFamilyState(session, state = {}) {
  const next = { ...session, ...state };
  next.trump = state.trump ?? state.major ?? session.trump;
  next.major = next.trump;
  return next;
}

function prepareFamilyAction(session, action) {
  if (!action.bid || compareBids(action.bid, lastBid(session)) <= 0) return null;
  if (action.kind === 'keycard') {
    const next = mergeFamilyState(session, { ...action.state,
      ...(action.trump ? { trump: action.trump } : {}),
      ...(action.shortageSuit ? { shortageSuit: action.shortageSuit } : {}),
      ...(action.keycardMode ? { keycardMode: action.keycardMode } : {}),
    });
    const prepared = keycardAction(next, action.bid, next.trump);
    return prepared ? { ...action, ...prepared, label: action.label ?? prepared.label, familyKeycard: true, state: {
      ...action.state, trump: next.trump, shortageSuit: next.shortageSuit, keycardMode: next.keycardMode,
    } } : null;
  }
  const responses = (action.responses ?? []).map((response, index) => ({
    ...response, bid: response.bid ?? nextBid(action.bid, response.step ?? index + 1),
  }));
  if (!responses.length || responses.some(response => !response.bid)) return null;
  if (responses.some(response => response.bid !== 'Pass' && compareBids(response.bid, action.bid) <= 0)) throw new Error('A relay answer must be above its ask.');
  return { ...action, kind: action.kind ?? 'relay', responses,
    responseLadder: responses.map(({ bid, label }) => ({ bid, label })) };
}

function familyActions(session) {
  const node = practiceNode(session);
  const actions = node ? node.actions.map(action => prepareFamilyAction(session, action)).filter(Boolean)
    : postRangeActions(session);
  const trump = session.trump;
  const contracts = new Set([`${['C', 'D'].includes(trump) ? 5 : 4}${trump}`, `5${trump}`, `6${trump}`, `7${trump}`, '3NT', '6NT', '7NT']);
  for (const bid of [...(getPracticeProfile(session.familyId).signoffs ?? []), ...(node?.signoffs ?? [])]) contracts.add(bid);
  if (session.requireAgreement) for (const bid of contracts) if (bid !== '3NT') contracts.delete(bid);
  if (session.weakExitAllowed) {
    for (let bid = nextBid(lastBid(session)); bid; bid = nextBid(bid)) contracts.add(bid);
  }
  const assigned = new Set(actions.map(action => action.bid));
  if ((session.weakExitAllowed || contracts.has(lastBid(session))) && session.auction.at(-1).seat === session.partnerSeat
      && (lastBid(session) !== '3NT' || session.threeNTToPlay !== false)) {
    actions.push({ bid: 'Pass', label: `Play ${lastBid(session)}`, kind: 'signoff' });
  }
  for (const bid of [...contracts].sort(compareBids)) {
    if (compareBids(bid, lastBid(session)) > 0 && !assigned.has(bid)) actions.push({ bid, kind: 'signoff', label: `Choose ${bid} as the final contract` });
  }
  return freeze(actions);
}

function applyFamilyBid(session, bid) {
  const action = availableActions(session).find(candidate => candidate.bid === bid);
  if (!action) throw new Error(`${bid} is not an available action at this point in the auction.`);
  if (action.playerConstraints && !matchesConstraints(session.playerHand, action.playerConstraints, action.trump ?? session.trump)) {
    throw new Error('Your hand does not meet the stated conditions for this agreement.');
  }
  let next = mergeFamilyState(session, action.state);
  next.weakExitAllowed = false;
  if (action.kind === 'signoff') {
    next.auction = [...session.auction, { seat: session.playerSeat, bid, meaning: action.label }];
    const contractBid = bid === 'Pass' ? lastBid(session) : bid;
    const [, level, strain] = /^([1-7])(C|D|H|S|NT)$/.exec(contractBid);
    next.contract = { bid: contractBid, level: Number(level), strain, declarer: declarerFor(next.auction, strain, session.playerSeat) };
    if (bid !== 'Pass') next.auction.push({ seat: session.partnerSeat, bid: 'Pass', meaning: 'Partner accepts your final contract; opponents pass throughout' });
    return freeze({ ...next, phase: 'finished', finished: true });
  }
  if (action.familyKeycard) return freeze(applyPostRangeBid(next, bid, action));
  if (session.phase !== 'family') return freeze(applyPostRangeBid(next, bid));
  const matches = action.responses.filter(response => matchesConstraints(session.partnerHand, response.constraints ?? [], next.trump));
  if (matches.length !== 1) throw new Error(`Relay definition must give exactly one answer for the fixed partner hand (found ${matches.length}).`);
  const response = matches[0];
  next = mergeFamilyState(next, response.state);
  next.auction = [...session.auction,
    { seat: session.playerSeat, bid, meaning: action.label, source: action.source, responseLadder: action.responseLadder },
    { seat: session.partnerSeat, bid: response.bid, meaning: response.label, source: response.source ?? action.source },
  ];
  next.constraints = [...session.constraints, ...(response.constraints ?? []).map(constraint => ({
    ...constraint, label: constraintLabel(constraint), source: constraint.source ?? response.source ?? action.source,
  }))];
  next.lastResponseLadder = action.responseLadder;
  next.phase = response.phase ?? (response.nextNode ? 'family' : 'unsupported');
  if (response.nextNode) next.nodeId = response.nextNode;
  next.unsupportedReason = next.phase === 'unsupported'
    ? response.unsupportedReason ?? 'This continuation is not yet defined in this practice exercise. Choose a final contract or reveal partner.' : null;
  if (response.bid === 'Pass' || response.finish) {
    const contractBid = lastBid(next);
    const [, level, strain] = /^([1-7])(C|D|H|S|NT)$/.exec(contractBid);
    next.contract = { bid: contractBid, level: Number(level), strain, declarer: declarerFor(next.auction, strain, session.playerSeat) };
    next.phase = 'finished';
    next.finished = true;
  }
  return freeze(next);
}

export function createPractice({ major = 'S', profileId, seed = String(Date.now()) } = {}) {
  if (profileId && !profileId.startsWith('major-')) return createFamilyPractice(getPracticeProfile(profileId), seed);
  if (profileId) major = getPracticeProfile(profileId).defaultTrump;
  validateMajor(major);
  const seedValue = String(seed);
  const rng = makeRng(seedValue);
  const constraints = openingConstraints(major);
  // Reject the entire joint deal, preserving the uniform distribution on deals
  // satisfying both training restrictions. No answers affect either hand later.
  for (let attempts = 1; attempts <= 200000; attempts += 1) {
    const deal = drawCards(DECK, 26, rng);
    const partnerHand = deal.slice(0, 13);
    if (!matchesConstraints(partnerHand, constraints, major)) continue;
    const playerHand = deal.slice(13, 26);
    const player = handFeatures(playerHand, major);
    if (player.hcp < SYSTEM.responder.minHcp || player.lengths[major] < SYSTEM.responder.minMajorLength) continue;
    return freeze({
      systemId: SYSTEM.id,
      familyId: `major-${major}`,
      playerSeat: 'South', partnerSeat: 'North', trump: major,
      major,
      seed: seedValue,
      playerHand: sortedHand(playerHand),
      partnerHand: sortedHand(partnerHand),
      auction: [{ seat: 'North', bid: `1${major}`, meaning: `Natural opening; ${SYSTEM.opening.minHcp}–${SYSTEM.opening.maxHcp} HCP and at least ${SYSTEM.opening.minMajorLength} ${SUIT_NAMES[major].toLowerCase()} in this training subset` }],
      constraints,
      training: SYSTEM.training,
      balanced: null,
      shortageSuit: null,
      rangeIndex: null,
      phase: 'raise',
      revealed: false,
      finished: false,
      contract: null,
      unsupportedReason: null,
    });
  }
  throw new Error('No practice deal found within the generation limit; choose another seed.');
}

export function availableActions(session) {
  if (session.finished || session.revealed) return [];
  if (session.familyId && !session.familyId.startsWith('major-')) return familyActions(session);
  const actions = [];
  const finalContracts = [`4${session.major}`, `5${session.major}`, `6${session.major}`, `7${session.major}`, '6NT', '7NT'];
  if (session.balanced === true) finalContracts.push('3NT');
  if (session.phase === 'raise') {
    actions.push({ bid: SYSTEM.raise, label: 'Start the major-suit relay', kind: 'relay',
      responseLadder: SYSTEM.shapeResponses.flatMap(response => {
        const label = response.shortage
          ? `${response.label}: ${SUIT_NAMES[SYSTEM.shortageSuits[session.major][response.shortage]].toLowerCase()} singleton or void`
          : response.label;
        return response.rollsRange
          ? SYSTEM.ranges.map((range, index) => ({ bid: index ? nextBid(response.bid, index) : response.bid, label: `${label}; ${range.label}` }))
          : [{ bid: response.bid, label }];
      }),
    });
  } else if (session.phase === 'range') {
    const bid = stepBid(lastBid(session), 1, { ...SYSTEM.rangeAsk, major: session.major, skip3NT: session.balanced && SYSTEM.rangeAsk.skip3NTWhenBalanced });
    actions.push({
      bid,
      label: 'Ask opener’s HCP range', kind: 'relay', source: 'P1476–P1477',
      responseLadder: SYSTEM.ranges.map((range, index) => ({
        bid: stepBid(bid, index + 1, { ...SYSTEM.rangeResponses, major: session.major }), label: range.label,
      })),
    });
  } else {
    actions.push(...postRangeActions(session));
  }
  if (session.phase !== 'raise' && session.phase !== 'range' && session.auction.at(-1).seat === 'North' && finalContracts.includes(lastBid(session))) {
    actions.push({ bid: 'Pass', label: `Play ${lastBid(session)}`, kind: 'signoff' });
  }
  const relayBids = new Set(actions.map(action => action.bid));
  for (const bid of finalContracts.sort(compareBids)) {
    // A bid already assigned a relay meaning cannot also be used as a signoff.
    if (compareBids(bid, lastBid(session)) > 0 && !relayBids.has(bid)) {
      actions.push({ bid, label: `Choose ${bid} as the final contract`, kind: 'signoff' });
    }
  }
  return freeze(actions);
}

function shapeResponse(session) {
  const features = handFeatures(session.partnerHand, session.major);
  if (features.balanced) return SYSTEM.shapeResponses.find(response => response.shape === 'balanced');
  const shortageSuit = SUITS.find(suit => suit !== session.major && features.lengths[suit] <= 1);
  const rank = Object.entries(SYSTEM.shortageSuits[session.major]).find(([, suit]) => suit === shortageSuit)?.[0];
  const response = SYSTEM.shapeResponses.find(response => response.shortage === rank);
  if (!response) throw new Error('Partner hand falls outside the draft training profile.');
  return response;
}

/** Accept only currently displayed actions and return a new, frozen session. */
export function applyBid(session, bid) {
  if (session.familyId && !session.familyId.startsWith('major-')) return applyFamilyBid(session, bid);
  const action = availableActions(session).find(candidate => candidate.bid === bid);
  if (!action) throw new Error(`${bid} is not an available action at this point in the auction.`);
  if (action.kind !== 'signoff' && session.phase !== 'raise' && session.phase !== 'range') {
    return freeze(applyPostRangeBid(session, bid));
  }
  const next = { ...session, auction: session.auction.slice(), constraints: session.constraints.slice() };
  next.auction.push({ seat: 'South', bid, meaning: action.label });
  if (action.kind === 'signoff') {
    const contractBid = bid === 'Pass' ? lastBid(session) : bid;
    const match = /^([1-7])(C|D|H|S|NT)$/.exec(contractBid);
    next.contract = { bid: contractBid, level: Number(match[1]), strain: match[2], declarer: match[2] === 'NT' ? 'South' : 'North' };
    if (bid !== 'Pass') next.auction.push({ seat: 'North', bid: 'Pass', meaning: 'Partner accepts your selected final contract; opponents pass throughout' });
    next.phase = 'finished';
    next.finished = true;
    return freeze(next);
  }
  if (session.phase === 'raise') {
    const response = shapeResponse(session);
    let meaning = response.label;
    let responseBid = response.bid;
    if (response.shape === 'balanced') {
      next.constraints.push({ type: 'balanced', value: true, label: 'Balanced: no singleton or void', source: response.source });
      next.balanced = true;
      next.phase = 'range';
    } else {
      const suit = SYSTEM.shortageSuits[session.major][response.shortage];
      meaning = `${response.label}: ${SUIT_NAMES[suit].toLowerCase()} singleton or void`;
      next.constraints.push({ type: 'length', suit, min: 0, max: 1, label: `${SUIT_NAMES[suit]} shortage: singleton or void`, source: response.source });
      next.balanced = false;
      next.shortageSuit = suit;
      next.phase = 'range';
      if (response.rollsRange) {
        addRange(next, handFeatures(session.partnerHand, session.major).hcp, 'P1475');
        responseBid = next.rangeIndex === 0 ? response.bid : nextBid(response.bid, next.rangeIndex);
        meaning += `; ${SYSTEM.ranges[next.rangeIndex].label} (rolling range)`;
      }
    }
    next.auction.push({ seat: 'North', bid: responseBid, meaning, source: response.source });
  } else if (session.phase === 'range') {
    const hcp = handFeatures(session.partnerHand, session.major).hcp;
    addRange(next, hcp, 'P1476');
    const range = SYSTEM.ranges[next.rangeIndex];
    next.auction.push({ seat: 'North', bid: stepBid(bid, next.rangeIndex + 1, { ...SYSTEM.rangeResponses, major: session.major }), meaning: range.label, source: 'P1476' });
  }
  return freeze(next);
}

function addRange(session, hcp, source) {
  const rangeIndex = SYSTEM.ranges.findIndex(range => hcp >= range.min && hcp <= range.max);
  if (rangeIndex < 0) throw new Error('Partner strength falls outside the training ranges.');
  const range = SYSTEM.ranges[rangeIndex];
  session.rangeIndex = rangeIndex;
  session.constraints.push({ type: 'hcp', min: range.min, max: range.max, label: range.label, source });
  session.phase = 'keycard';
  session.unsupportedReason = null;
}

export function revealPractice(session) {
  return freeze({ ...session, revealed: true, finished: true, phase: 'finished' });
}

// Rejection of the incomplete tail avoids modulo/rounding bias. Shape totals
// can exceed 2^32, but every 13-of-39 hand count is an exact safe JS integer.
function randomInteger(max, rng) {
  if (!Number.isSafeInteger(max) || max < 1) throw new Error('Random integer bound must be a positive safe integer.');
  const space = max <= 4294967296 ? 4294967296 : 9007199254740992;
  const limit = space - space % max;
  let value;
  do {
    value = space === 4294967296 ? Math.floor(rng() * space)
      : Math.floor(rng() * 2097152) * 4294967296 + Math.floor(rng() * 4294967296);
  } while (value >= limit);
  return value % max;
}

function combinations(total, count) {
  if (count < 0 || count > total) return 0;
  let result = 1;
  for (let index = 1; index <= Math.min(count, total - count); index += 1) result = result * (total - index + 1) / index;
  return result;
}

function matchesShape(lengths, constraints, major) {
  const balanced = SUITS.every(suit => lengths[suit] >= 2);
  return constraints.every(constraint => {
    if (constraint.type === 'anyOf') return constraint.options.some(option => matchesShape(lengths, option, major));
    if (constraint.type === 'shapes') return constraint.values.includes(SUITS.map(suit => lengths[suit]).join(''));
    if (constraint.type === 'length') return between(lengths[constraint.suit], constraint);
    if (constraint.type === 'balanced') return balanced === (constraint.value ?? true);
    if (constraint.type === 'balanced5332') return Object.values(lengths).sort((left, right) => right - left).join('') === '5332';
    if (constraint.type === 'shapeUniverse') {
      return SUITS.filter(suit => suit !== major && lengths[suit] <= 1).length <= (constraint.maxShortages ?? SYSTEM.training.maxShortages);
    }
    // HCP, controls and exact honours are evaluated after proposing cards.
    return true;
  });
}

function shapeWeights(session, pool) {
  let bounds;
  try {
    bounds = publicLengthBounds(session);
  } catch (error) {
    if (error.message === 'Public length constraints cannot describe a 13-card hand.') return { shapes: [], totalWeight: 0 };
    throw error;
  }
  const counts = Object.fromEntries(SUITS.map(suit => [suit, pool.filter(card => card[0] === suit).length]));
  const shapes = [];
  let totalWeight = 0;
  const lengths = {};
  function enumerate(index, remaining) {
    const suit = SUITS[index];
    const min = Math.max(0, Math.ceil(bounds[suit].min));
    const max = Math.min(counts[suit], Math.floor(bounds[suit].max), remaining);
    for (let length = min; length <= max; length += 1) {
      lengths[suit] = length;
      if (index < SUITS.length - 1) {
        enumerate(index + 1, remaining - length);
      } else if (length === remaining && matchesShape(lengths, session.constraints, session.major)) {
        const weight = SUITS.reduce((product, cardSuit) => product * combinations(counts[cardSuit], lengths[cardSuit]), 1);
        totalWeight += weight;
        shapes.push({ lengths: { ...lengths }, weight, cumulativeWeight: totalWeight });
      }
    }
  }
  enumerate(0, 13);
  if (!Number.isSafeInteger(totalWeight)) throw new Error('Shape proposal count exceeds exact integer precision.');
  return { shapes, totalWeight };
}

/** Inspect the combinatorial proposal, using only public facts and known cards. */
export function compatibleShapeWeights(session) {
  validateTrump(session.trump ?? session.major);
  validateHand(session.playerHand);
  const known = new Set(session.playerHand);
  return freeze(shapeWeights(session, DECK.filter(card => !known.has(card))));
}

function proposeHand(proposal, pools, rng) {
  const ticket = randomInteger(proposal.totalWeight, rng);
  let low = 0;
  let high = proposal.shapes.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (ticket < proposal.shapes[middle].cumulativeWeight) high = middle;
    else low = middle + 1;
  }
  const shape = proposal.shapes[low].lengths;
  return SUITS.flatMap(suit => drawCards(pools[suit], shape[suit], rng, true));
}

/**
 * Propose only feasible shapes, each weighted by its number of possible hands,
 * then choose uniformly within each suit. Every proposed 13-card hand has the
 * same probability: product(C(n,k))/total * product(1/C(n,k)) = 1/total.
 * Rejecting remaining predicates therefore preserves the uniform distribution
 * on compatible hands. partnerHand and reveal/contract state are never read.
 * Samples are independent, so repeats are valid.
 */
export function sampleCompatible(session, { count = 1000, seed = `${session.seed}:sample`, maxAttempts = Math.max(10000, count * 500) } = {}) {
  if (!Number.isSafeInteger(count) || count < 0 || count > 100000) throw new Error('Sample count must be an integer from 0 to 100000.');
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 0) throw new Error('maxAttempts must be a nonnegative integer.');
  validateTrump(session.trump ?? session.major);
  validateHand(session.playerHand);
  const knownCards = new Set(session.playerHand);
  const pool = DECK.filter(card => !knownCards.has(card));
  if (count === 0 || maxAttempts === 0) return freeze({ hands: [], attempts: 0, complete: count === 0 });
  const proposal = shapeWeights(session, pool);
  if (!proposal.totalWeight) return freeze({ hands: [], attempts: 0, complete: false });
  const pools = Object.fromEntries(SUITS.map(suit => [suit, pool.filter(card => card[0] === suit)]));
  const rng = makeRng(seed);
  const hands = [];
  let attempts = 0;
  while (hands.length < count && attempts < maxAttempts) {
    attempts += 1;
    const cards = proposeHand(proposal, pools, rng);
    if (matchesConstraints(cards, session.constraints, session.major)) hands.push(sortedHand(cards));
  }
  return freeze({ hands, attempts, complete: hands.length === count });
}
