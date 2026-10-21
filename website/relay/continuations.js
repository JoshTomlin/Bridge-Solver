// Shared relay continuations. SKC: source paragraphs P1456/P1462;
// two-answer queen ask and specific-suit answers: partnership chat clarification.
// Bid meanings and compressed ladders depend only on public auction facts.
const SUITS = ['S', 'H', 'D', 'C'];
const STRAINS = ['C', 'D', 'H', 'S', 'NT'];
const NAMES = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

export const SUIT_RESPONSES = Object.freeze([
  Object.freeze({ category: 'none', label: 'No third-round control' }),
  Object.freeze({ category: 'third', label: 'Third-round control' }),
  Object.freeze({ category: 'kLong', label: 'Kxx or longer' }),
  Object.freeze({ category: 'kDoubleton', label: 'Kx' }),
  Object.freeze({ category: 'kq', label: 'King and queen' }),
]);

function indexOfBid(bid) {
  const match = /^([1-7])(C|D|H|S|NT)$/.exec(bid);
  if (!match) throw new Error(`Invalid contract bid: ${bid}`);
  return (Number(match[1]) - 1) * 5 + STRAINS.indexOf(match[2]);
}

function bidAt(index) {
  return index >= 0 && index < 35 ? `${Math.floor(index / 5) + 1}${STRAINS[index % 5]}` : null;
}

function lastBid(session) {
  return session.auction.findLast(call => call.bid !== 'Pass').bid;
}

function agreedTrump(session) {
  const trump = session.trump ?? session.major;
  if (!SUITS.includes(trump)) throw new Error('The agreed trump must be S, H, D, or C.');
  return trump;
}

function explicitTrumpConstraints(session) {
  if (session.familyId?.startsWith('major-')) return false;
  return session.trump !== undefined || session.relayPolicy !== undefined || !['S', 'H'].includes(session.major);
}

function nextAsk(after, session, specific = false, legacySkip3NT = false) {
  const trump = agreedTrump(session);
  const skip3NT = session.relayPolicy ? Boolean(session.relayPolicy.skip3NT) : legacySkip3NT;
  const skipGame = session.relayPolicy ? Boolean(session.relayPolicy.skipMajorGame) : true;
  const game = indexOfBid(`${['C', 'D'].includes(trump) ? 5 : 4}${trump}`);
  const grandTry = indexOfBid(`6${trump}`) - 1;
  for (let index = indexOfBid(after) + 1; index < 35; index += 1) {
    const bid = bidAt(index);
    if (skip3NT && bid === '3NT') continue;
    if (session.relayPolicy?.skipBids?.includes(bid)) continue;
    if (specific) {
      // Trump bids below game remain asking steps in a game-forcing relay.
      if ((STRAINS[index % 5] === trump && index >= game) || index === grandTry) continue;
    } else if (skipGame && bid === `4${trump}`) continue;
    return bid;
  }
  return null;
}

function responseLadder(ask, responses) {
  if (!ask || indexOfBid(ask) + responses.length >= 35) return null;
  return responses.map((response, index) => ({ ...response, bid: bidAt(indexOfBid(ask) + index + 1) }));
}

/** Canonical category: stronger/more specific holdings take priority. */
export function classifySuitResponse(cards, suit) {
  if (!SUITS.includes(suit)) throw new Error('Unknown suit for a specific-suit answer.');
  const length = cards.filter(card => card[0] === suit).length;
  const king = cards.includes(`${suit}K`);
  const queen = cards.includes(`${suit}Q`);
  if (king && queen) return 'kq';
  if (king && length === 2) return 'kDoubleton';
  if (king && length >= 3) return 'kLong';
  if (queen || length <= 2) return 'third';
  return 'none';
}

// There are only 560 possible SHDC length vectors totalling 13. Filtering them
// keeps shape correlations and disjunctions intact before taking an envelope.
const LENGTH_VECTORS = [];
for (let S = 0; S <= 13; S += 1) {
  for (let H = 0; H <= 13 - S; H += 1) {
    for (let D = 0; D <= 13 - S - H; D += 1) LENGTH_VECTORS.push({ S, H, D, C: 13 - S - H - D });
  }
}

function lengthImplication(lengths, constraint, session) {
  if (Array.isArray(constraint)) return constraint.every(item => lengthImplication(lengths, item, session));
  switch (constraint.type) {
    case 'length': {
      const value = lengths[constraint.suit];
      return (constraint.equals === undefined || value === constraint.equals)
        && (constraint.min === undefined || value >= constraint.min)
        && (constraint.max === undefined || value <= constraint.max);
    }
    case 'shapes': return constraint.values.some(shape =>
      SUITS.every((suit, index) => lengths[suit] === Number(shape[index])));
    case 'anyOf': return constraint.options.some(option => lengthImplication(lengths, option, session));
    case 'balanced': return SUITS.every(suit => lengths[suit] >= 2) === (constraint.value ?? true);
    case 'balanced5332': return Object.values(lengths).sort((a, b) => b - a).join('') === '5332';
    case 'shapeUniverse': {
      const trump = constraint.trump ?? session.trump ?? session.major;
      const shortages = SUITS.filter(suit => suit !== trump && lengths[suit] <= 1).length;
      return constraint.maxShortages === undefined || shortages <= constraint.maxShortages;
    }
    case 'suitResponse': {
      const length = lengths[constraint.suit];
      if (constraint.category === 'none' || constraint.category === 'kLong') return length >= 3;
      if (constraint.category === 'kDoubleton') return length === 2;
      if (constraint.category === 'kq') return length >= 2;
      return true;
    }
    // HCP, keycards and honour constraints alone imply no suit-length bound.
    // Keeping such a branch possible is essential when it occurs inside anyOf.
    default: return true;
  }
}

/** Length implications come from disclosed constraints, never either actual hand. */
export function publicLengthBounds(session) {
  const candidates = LENGTH_VECTORS.filter(lengths =>
    (session.balanced !== true || SUITS.every(suit => lengths[suit] >= 2))
    && (!session.shortageSuit || lengths[session.shortageSuit] <= 1)
    && (session.constraints || []).every(constraint => lengthImplication(lengths, constraint, session)));
  if (!candidates.length) throw new Error('Public length constraints cannot describe a 13-card hand.');
  return Object.fromEntries(SUITS.map(suit => [suit, {
    min: Math.min(...candidates.map(lengths => lengths[suit])),
    max: Math.max(...candidates.map(lengths => lengths[suit])),
  }]));
}

/** Remove only response categories proved impossible by prior public lengths. */
export function suitResponseLadder(session, suit) {
  const { min, max } = publicLengthBounds(session)[suit];
  return SUIT_RESPONSES.filter(({ category }) => {
    if (category === 'none' || category === 'kLong') return max >= 3;
    if (category === 'kDoubleton') return min <= 2 && max >= 2;
    if (category === 'kq') return max >= 2;
    return true;
  }).map(response => ({ ...response }));
}

function unknownSuits(session) {
  if (Array.isArray(session.remainingAskSuits)) return session.remainingAskSuits.slice();
  const suits = SUITS.filter(suit => suit !== agreedTrump(session) && suit !== session.shortageSuit);
  // Three suits: middle/high/low. Two remaining suits: high/low, as in
  // the partnership's explicit spades-then-hearts example with diamonds agreed.
  return suits.length === 3 ? [suits[1], suits[0], suits[2]] : suits;
}

function queenKnown(session) {
  return (session.constraints || []).some(constraint => constraint.type === 'trumpQueen'
    && (constraint.trump ?? agreedTrump(session)) === agreedTrump(session));
}

/** Reordered single-suiters disclose upper strength beyond a playable-game reply. */
export function strengthResponseLadder(session, ask, ladder, trump = agreedTrump(session)) {
  const policy = session.strengthSplit;
  if (!ladder || !policy || session.strengthKnown) return ladder;
  const gameBid = ['C', 'D'].includes(trump) ? '3NT' : `4${trump}`;
  let index = ladder.findIndex(answer => answer.bid === gameBid);
  // R0135 explicitly splits the last ordinary answer after the 2NT ask.
  if (index < 0 && policy.lastKeycardSplitAt === ask && ladder.at(-1).queen === true) index = ladder.length - 1;
  if (index < 0) return ladder;
  const escapedBid = bidAt(indexOfBid(ladder.at(-1).bid) + 1);
  if (!escapedBid) return null;
  const base = ladder[index];
  const lower = { min: policy.min, max: policy.split - 1 };
  const upper = { min: policy.split, max: policy.max };
  return ladder.map((answer, i) => i === index ? { ...answer, strength: lower, label: `${answer.label}; ${lower.min}–${lower.max} HCP` } : answer)
    .concat({ ...base, bid: escapedBid, strength: upper, label: `${base.label}; ${upper.min}–${upper.max} HCP` });
}

function addAction(actions, ask, responses, details, session) {
  const ladder = strengthResponseLadder(session, ask, responseLadder(ask, responses));
  if (ladder) actions.push({ bid: ask, kind: 'relay', ...details, responseLadder: ladder });
}

const KEYCARDS = [
  { values: [0, 3], label: '0 or 3 keycards' },
  { values: [1, 4], label: '1 or 4 keycards' },
  { values: [2, 5], queen: false, label: '2 or 5 keycards, no trump queen' },
  { values: [2, 5], queen: true, label: '2 or 5 keycards and the trump queen' },
];
const HORTON_KEYCARDS = [0, 1, 2].map(count => ({ values: [count], label: `${count} keycard${count === 1 ? '' : 's'}` }));

/** Build an exact source-node ask without adding another relay step. */
export function keycardAction(session, bid, trump = agreedTrump(session), mode = session.keycardMode ?? (session.shortageSuit ? 'shortage' : 'normal')) {
  if (!SUITS.includes(trump)) throw new Error('The agreed trump must be S, H, D, or C.');
  if (!['normal', 'shortage', 'horton', 'horton-shortage'].includes(mode)) throw new Error('Unknown keycard response mode.');
  const shortage = mode === 'shortage' || mode === 'horton-shortage';
  if (shortage && !session.shortageSuit) throw new Error('Shortage Keycard requires a known shortage suit.');
  const horton = mode.startsWith('horton');
  const ordinary = horton ? HORTON_KEYCARDS : KEYCARDS;
  const responses = shortage ? [{ void: true, label: 'Void in the known shortage' }, ...ordinary] : ordinary;
  const ladder = strengthResponseLadder(session, bid, responseLadder(bid, responses), trump);
  if (!ladder) return null;
  const askLabel = shortage ? 'Ask Shortage Keycard' : 'Ask keycards';
  return {
    bid, kind: 'relay',
    label: trump === agreedTrump(session) ? askLabel : `Agree ${NAMES[trump].toLowerCase()} and ${askLabel.toLowerCase()}`,
    askType: shortage ? 'shortage-keycard' : 'keycard',
    ...(horton ? { keycardScheme: 'horton' } : {}),
    trump, responseLadder: ladder,
  };
}

export function postRangeActions(session) {
  if (session.finished || session.revealed) return [];
  const actions = [];
  if (session.phase === 'keycard') {
    const shortage = Boolean(session.shortageSuit);
    const trump = agreedTrump(session);
    const agreements = [trump, ...new Set((session.agreementOptions || []).filter(suit => suit !== trump))];
    let after = lastBid(session);
    for (const agreement of agreements) {
      const ask = nextAsk(after, session, false, !shortage);
      if (!ask) break;
      const action = keycardAction(session, ask, agreement);
      if (action) actions.push(action);
      after = ask;
    }
    // Reordering R0066/R0103: a natural unbid minor can instead agree that
    // suit. The step remains reserved for the already agreed suit.
    for (const suit of session.naturalMinorKeycardSuits ?? []) {
      if (!['C', 'D'].includes(suit) || suit === trump || suit === session.shortageSuit) continue;
      if (publicLengthBounds(session)[suit].min < 2) continue;
      const bid = Array.from({ length: 7 }, (_, i) => `${i + 1}${suit}`).find(candidate => indexOfBid(candidate) > indexOfBid(lastBid(session)));
      if (!bid || actions.some(action => action.bid === bid)) continue;
      const action = keycardAction(session, bid, suit);
      if (action) actions.push({ ...action, playerConstraints: [{ type: 'length', suit, min: 5, max: 9 }] });
    }
  } else if (session.phase === 'void-keycard') {
    // User confirmed 1M–2NT asks skip 4M here too. The document's splinter
    // exception which includes 4M does not govern this separate auction family.
    addAction(actions, nextAsk(lastBid(session), session), session.keycardScheme === 'horton' ? HORTON_KEYCARDS : KEYCARDS,
      { label: 'Ask keycards after the void answer', askType: 'keycard' }, session);
  } else if (session.phase === 'post-keycard' || session.phase === 'suit-ask') {
    let after = lastBid(session);
    if (session.phase === 'post-keycard' && session.queenAskAllowed !== false && !queenKnown(session)) {
      const queenAsk = nextAsk(after, session, true);
      addAction(actions, queenAsk, [{ queen: false, label: 'No trump queen' }, { queen: true, label: 'Trump queen' }],
        { label: 'Ask for the trump queen', askType: 'queen' }, session);
      if (!queenAsk) return actions;
      after = queenAsk;
    }
    for (const [suitIndex, suit] of unknownSuits(session).entries()) {
      const ask = nextAsk(after, session, true);
      if (!ask) break;
      addAction(actions, ask, suitResponseLadder(session, suit),
        { label: `Ask about ${NAMES[suit].toLowerCase()}`, askType: 'suit', askSuit: suit, suitIndex }, session);
      after = ask;
    }
  }
  return actions;
}

/** Return a new session; caller may freeze it. The original hand never changes. */
export function applyPostRangeBid(session, bid, actionOverride) {
  const action = actionOverride ?? postRangeActions(session).find(candidate => candidate.bid === bid);
  if (!action) throw new Error(`${bid} is not an available continuation.`);
  if (action.bid !== bid || indexOfBid(bid) <= indexOfBid(lastBid(session))) throw new Error(`${bid} is not a legal continuation.`);
  if (actionOverride && !['keycard', 'shortage-keycard'].includes(action.askType)) throw new Error('Only an explicit keycard action may override the relay step.');
  const next = { ...session, auction: session.auction.slice(), constraints: session.constraints.slice(), unsupportedReason: null };
  const trump = action.trump ?? agreedTrump(session);
  if (action.keycardScheme) next.keycardScheme = action.keycardScheme;
  next.major = trump;
  if (session.trump !== undefined || trump !== session.major) next.trump = trump;
  if (trump !== agreedTrump(session)) delete next.remainingAskSuits;
  if (action.askType === 'shortage-keycard' || action.askType === 'keycard') {
    if (session.agreementOptions !== undefined) next.agreementOptions = [];
    if (session.naturalMinorKeycardSuits !== undefined) next.naturalMinorKeycardSuits = [];
  }
  const constraintTrump = explicitTrumpConstraints(session) ? { trump } : {};
  next.auction.push({ seat: session.playerSeat ?? 'South', bid, meaning: action.label, responseLadder: action.responseLadder });
  next.lastResponseLadder = action.responseLadder;
  const points = session.partnerHand.reduce((total, card) => total + ({ A: 4, K: 3, Q: 2, J: 1 }[card[1]] ?? 0), 0);
  const inStrength = answer => !answer.strength || points >= answer.strength.min && points <= answer.strength.max;
  let response;
  if (action.askType === 'shortage-keycard' && !session.partnerHand.some(card => card[0] === session.shortageSuit)) {
    response = action.responseLadder.find(answer => answer.void && inStrength(answer));
    next.constraints.push({ type: 'length', suit: session.shortageSuit, equals: 0, label: `${NAMES[session.shortageSuit]} void` });
    next.phase = 'void-keycard';
  } else if (action.askType === 'shortage-keycard' || action.askType === 'keycard') {
    const count = session.partnerHand.filter(card => card[1] === 'A' || card === `${trump}K`).length;
    const queen = session.partnerHand.includes(`${trump}Q`);
    response = action.responseLadder.find(answer => answer.values?.includes(count) && (answer.queen === undefined || answer.queen === queen) && inStrength(answer));
    if (!response) throw new Error('The fixed partner hand has an invalid keycard count.');
    if (action.askType === 'shortage-keycard') next.constraints.push({ type: 'length', suit: session.shortageSuit, equals: 1, label: `${NAMES[session.shortageSuit]} singleton` });
    next.constraints.push({ type: 'keycardOptions', ...constraintTrump, values: response.values.slice(), label: response.label });
    if (next.keycardScheme === 'horton') next.queenAskAllowed = count !== 2;
    if (response.queen !== undefined) next.constraints.push({ type: 'trumpQueen', ...constraintTrump, value: response.queen, label: response.queen ? 'Has the trump queen' : 'Does not have the trump queen' });
    next.phase = 'post-keycard';
  } else if (action.askType === 'queen') {
    const queen = session.partnerHand.includes(`${trump}Q`);
    response = action.responseLadder.find(answer => answer.queen === queen && inStrength(answer));
    next.constraints.push({ type: 'trumpQueen', ...constraintTrump, value: queen, label: queen ? 'Has the trump queen' : 'Does not have the trump queen' });
    next.phase = 'post-keycard';
  } else {
    const category = classifySuitResponse(session.partnerHand, action.askSuit);
    response = action.responseLadder.find(answer => answer.category === category && inStrength(answer));
    if (!response) throw new Error('The fixed partner hand contradicts the public response ladder.');
    next.constraints.push({ type: 'suitResponse', suit: action.askSuit, category, label: `${NAMES[action.askSuit]}: ${response.label}` });
    next.remainingAskSuits = unknownSuits(session).slice(action.suitIndex + 1);
    next.phase = 'suit-ask';
  }
  if (!response) throw new Error('The fixed partner hand has no legal response in this strength range.');
  if (response.strength) {
    next.constraints.push({ type: 'hcp', ...response.strength, label: `${response.strength.min}–${response.strength.max} HCP`, source: 'Reordering R0105–R0108' });
    next.strengthKnown = true;
    if (response.bid === '3NT' && ['C', 'D'].includes(trump)) next.threeNTToPlay = true;
  }
  next.auction.push({ seat: session.partnerSeat ?? 'North', bid: response.bid, meaning: action.askType === 'suit' ? `${NAMES[action.askSuit]}: ${response.label}` : response.label });
  if (next.phase === 'suit-ask' && !next.remainingAskSuits.length) {
    next.phase = 'unsupported';
    next.unsupportedReason = 'The remaining specific suits have been answered or skipped. Choose a final contract or reveal partner; general-grand-try responses are not yet defined.';
  } else if (!postRangeActions(next).length) {
    next.phase = 'unsupported';
    next.unsupportedReason = 'No further complete response ladder fits below 7NT. Choose a final contract or reveal partner.';
  }
  return next;
}
