// Main notes P0228–P0243. The partnership policy sees its own hand and the
// public auction. Opponents follow practice scripts keyed to public calls.
import { bidIndex, drawConstrainedPair, handFeatures, makeRng, matchesConstraints } from './core.js';
import { AUCTION_SEATS } from './table-ui.js';
import { weakNotrumpFacts, weakNotrumpPartner, weakNotrumpRows } from './weak-notrump.js';

export const WEAK_NT_COMPETITION = 'WNT-X';
export const WEAK_NT_COMPETITION_NOTES = [
  'A weak 4333 or 4432 responder with 0–7 acts over 1NT–Pass. Use Junk Stayman or a transfer. With five-plus in a suit, responder may pass and run later.',
  'After a fourth-seat double, opener normally redoubles. A direct responder redouble shows (7)8+ and a balanced or suitable semi-balanced hand.',
  'Over a direct double, a natural two-level bid shows five-plus. Pass asks opener for a five-plus suit or a redouble. After that redouble, responder starts with the lower of two suits.',
  'Immediately over a double, 2NT is Lebensohl. After an initial responder pass and an opponent suit bid, 2NT is scrambling.',
  'After a direct responder redouble or opener’s automatic redouble, our first double of an enemy suit is takeout. Our subsequent doubles are penalty.',
  'Opponents follow a practice script. Their holdings and double-dummy results are outside this exercise.',
];

const suits = ['C', 'D', 'H', 'S'];
const names = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
const sides = { North: 0, East: 1, South: 0, West: 1 };
const contractBid = bid => /^[1-7](C|D|H|S|NT)$/.test(bid);
const nextSeat = seat => AUCTION_SEATS[(AUCTION_SEATS.indexOf(seat) + 1) % 4];
const length = (suit, min) => ({ type: 'length', suit, min });
const points = (min, max) => ({ type: 'hcp', min, max });
const anyOf = (...options) => ({ type: 'anyOf', options });
const longSuit = [anyOf(...suits.map(suit => [length(suit, 5)]))];
const twoSuits = [anyOf(...suits.flatMap((suit, index) => suits.slice(index + 1)
  .map(other => [length(suit, 4), length(other, 4)])))];
const noFiveCardSuit = suits.map(suit => ({ type: 'length', suit, max: 4 }));
const scenarios = [
  { id: 'two-suits', direct: true, opener: noFiveCardSuit, responder: [points(0, 7), ...twoSuits, ...noFiveCardSuit] },
  { id: 'long-suit', direct: true, opener: longSuit, responder: [points(0, 7), ...longSuit] },
  { id: 'values', direct: true, pressure: true, opener: [], responder: [points(8, 11), { type: 'balanced' }] },
  { id: 'reopen', direct: false, opener: [], responder: [points(0, 7), anyOf([length('C', 5)], [length('D', 5)])] },
  { id: 'reopen-pressure', direct: false, pressure: true, opener: [], responder: [points(0, 7), ...longSuit] },
];
const scenarioFor = id => scenarios.find(scenario => scenario.id === id);
const row = (bid, label, source, facts = [], convention) => ({ bid, label, source, facts, convention, kind: 'opening' });
const pass = (label = 'Pass', source = 'Natural competition', facts) => row('Pass', label, source, facts);
const natural = (suit, level, label, source, min = 5) => row(`${level}${suit}`, label, source, [length(suit, min)]);
const lastContract = auction => auction.findLast(call => contractBid(call.bid));
const ourDoubleCount = auction => auction.filter(call => call.bid === 'X' && sides[call.seat] === 0).length;
const pairStartingWith = suit => suits.slice(suits.indexOf(suit) + 1)
  .map(other => [length(suit, 4), length(other, 4)]);
const quietRunoutNodes = new Set(['respond', 'stayman', 'stayman-continue', 'correct-hearts',
  'transfer', 'transfer-continue', 'super-accept', 'retransfer', 'minor-puppet', 'minor-correct', 'final', 'finish']);
const ntSemiBalanced = { type: 'shapes', values: ['5422', '4522', '5242', '2542', '5224', '2524',
  '4252', '2452', '4225', '2425', '2254', '2245'] };

export function createWeakNotrumpCompetition({ seed, humanSeat }) {
  const rng = makeRng(`weak-notrump-competition:${seed}`);
  const scenario = scenarios[Math.floor(rng() * scenarios.length)];
  const sampledSeat = rng() < 0.5 ? 'North' : 'South';
  humanSeat ??= sampledSeat;
  if (!['North', 'South'].includes(humanSeat)) throw new Error('Choose North or South.');
  const hands = drawConstrainedPair({ constraints: [...weakNotrumpFacts, ...scenario.opener], trump: 'C', major: 'C' },
    scenario.responder, rng, (responder, opener) => !scenario.pressure
      || handFeatures(responder, 'C').lengths.H + handFeatures(opener, 'C').lengths.H <= 6);
  return {
    familyId: 'opening-weak-nt-competition', systemId: 'outback-acol', seed,
    playerSeat: 'North', partnerSeat: 'South', dealerSeat: 'North',
    practiceRole: humanSeat === 'North' ? 'asker' : 'teller',
    playerHand: hands.partnerHand, partnerHand: hands.playerHand,
    major: 'C', trump: 'C', auction: [], constraints: [], openingFacts: { North: [], South: [] },
    wholeAuction: { rulesVersion: 1, humanSeat, openingBid: '1NT', openingFamily: WEAK_NT_COMPETITION,
      competition: scenario.id },
    opening: { system: WEAK_NT_COMPETITION, node: 'competition', seat: 'North', quiet: 'open' },
    phase: 'opening', finished: false, revealed: false, contract: null, pendingAsk: null,
  };
}

// All positions after the first opponent double are derived from public calls.
function position(auction) {
  const bids = auction.map(call => call.bid).join(' ');
  if (bids === '1NT X') return 'direct';
  if (bids === '1NT Pass Pass X') return 'automatic-redouble';
  if (bids === '1NT X Pass Pass') return 'opener-runout';
  if (bids === '1NT X Pass Pass XX Pass') return 'lower-suit';
  if (bids === '1NT Pass Pass X XX Pass') return 'reopening-runout';
  if (bids === '1NT X 2NT Pass') return 'lebensohl-puppet';
  if (bids === '1NT X 2NT Pass 3C Pass') return 'lebensohl-correction';
  if (/^1NT X Pass Pass XX Pass 2[CDH] Pass$/.test(bids)) return 'lower-suit-correction';
  return 'compete';
}

function competitiveRows(auction, seat) {
  const contract = lastContract(auction);
  const enemySuit = sides[contract.seat] === 1 && contract.bid.slice(1) !== 'NT';
  const redoubles = auction.filter(call => call.bid === 'XX');
  const takeoutSequence = redoubles.some(call => call.seat === 'South' || auction[1].bid === 'Pass');
  const penalty = takeoutSequence && ourDoubleCount(auction) > 0;
  const takeout = auction.find(call => call.convention === 'takeout');
  const scrambleIndex = auction.findIndex(call => call.convention === 'scrambling' && call.bid === '2NT');
  if (scrambleIndex >= 0 && !enemySuit && Number(contract.bid[0]) < 4) {
    const enemyStrain = lastContract(auction.slice(0, scrambleIndex)).bid.slice(1);
    return [
      ...(contract !== auction[scrambleIndex] ? [pass('Play in the chosen suit', 'P0243')] : []),
      ...suits.filter(suit => suit !== enemyStrain)
        .map(suit => ({ ...natural(suit, 3, `Scramble to ${names[suit]}`, 'P0243', 3), convention: 'scrambling' })),
    ];
  }
  const responderInitiallyPassed = auction[2]?.bid === 'Pass';
  return [
    pass(enemySuit ? 'Defend' : 'Play the current contract'),
    ...(enemySuit && !auction.slice(auction.lastIndexOf(contract) + 1).some(call => call.bid !== 'Pass')
      ? [row('X', penalty ? 'Penalty double' : 'Takeout double',
        takeoutSequence ? 'P0232–P0233' : 'P0238–P0242', [], penalty ? 'penalty' : 'takeout')] : []),
    ...(enemySuit && responderInitiallyPassed && seat === 'South'
      ? [row('2NT', 'Scrambling, two places to play at the three level', 'P0235/P0243', twoSuits, 'scrambling')] : []),
    ...[2, 3, 4].flatMap(level => suits.filter(suit => !enemySuit || suit !== contract.bid.slice(1))
      .filter(suit => level < 4 || ['H', 'S'].includes(suit))
      .map(suit => natural(suit, level, `Natural ${names[suit]}, to play`, 'Natural competition',
        takeout && takeout.seat !== seat ? 4 : 5))),
  ];
}

export function weakNotrumpCompetitionActions({ auction, quiet, seat, major, second }) {
  const p = position(auction);
  let rows;
  if (quiet) {
    rows = weakNotrumpRows({ node: quiet, auction: auction.filter(call => sides[call.seat] === 0), major, second })
      .filter(option => quietRunoutNodes.has(option.next) && !/^(?:3NT|[4-7])/.test(option.bid))
      .map(option => ({ ...option, kind: 'opening' }));
  } else switch (p) {
    case 'direct': rows = [
      row('XX', '(7)8+ balanced, or a stronger suitable semi-balanced hand', 'P0233', [anyOf([points(7, 37), { type: 'balanced' }], [points(8, 37), ntSemiBalanced])]),
      pass('Ask opener for a five-plus suit or a redouble', 'P0233'),
      ...suits.map(suit => natural(suit, 2, `Natural runout, five-plus ${names[suit]}`, 'P0234')),
      row('2NT', 'Lebensohl, puppet to 3♣ to play a long suit with more willingness to defend', 'P0235/P0240', longSuit),
      ...suits.map(suit => natural(suit, 3, `Natural ${names[suit]}, extra shape and more willingness to sacrifice`, 'P0240')),
    ]; break;
    case 'automatic-redouble': rows = [row('XX', 'Automatic redouble after the fourth-seat double', 'P0230')]; break;
    case 'opener-runout': rows = [
      row('XX', 'Redouble for responder to start with the lower of two suits', 'P0233'),
      ...suits.map(suit => natural(suit, 2, `Five-plus ${names[suit]}`, 'P0233')),
      pass('Rare pass to play 1NT doubled with 4333', 'P0233', [{ type: 'shapes', values: ['4333', '3433', '3343', '3334'] }]),
    ]; break;
    case 'lower-suit': rows = [
      pass('Play 1NT redoubled if willing to stand it', 'P0233', [points(8, 37)]),
      ...suits.map(suit => row(`2${suit}`, pairStartingWith(suit).length
        ? `Lower of two four-plus suits, or a delayed natural escape with five-plus ${names[suit]}`
        : 'Delayed natural escape with five-plus spades',
      'P0233–P0234', [anyOf(...pairStartingWith(suit), [length(suit, 5)])])),
    ]; break;
    case 'lower-suit-correction': rows = [
      pass('Accept the offered suit', 'Natural runout'),
      ...suits.map(suit => natural(suit, 2, `Suggest ${names[suit]} as a higher fit`, 'Natural runout', 4)),
    ]; break;
    case 'reopening-runout': rows = [
      pass('Play 1NT redoubled', 'P0230–P0231'),
      ...suits.map(suit => natural(suit, 2, `Natural escape, five-plus ${names[suit]}`, 'P0231')),
    ]; break;
    case 'lebensohl-puppet': rows = [row('3C', 'Forced Lebensohl puppet', 'P0235/P0240')]; break;
    case 'lebensohl-correction': rows = [
      pass('Play 3♣', 'P0235/P0240', [length('C', 5)]),
      ...suits.slice(1).map(suit => natural(suit, 3, `Sign off in ${names[suit]}`, 'P0235/P0240')),
    ]; break;
    default: rows = competitiveRows(auction, seat);
  }
  const last = lastContract(auction);
  const minimum = last ? bidIndex(last.bid) : -1;
  return rows.filter(option => !contractBid(option.bid) || bidIndex(option.bid) > minimum);
}

function actingChoices(context, hand) {
  return weakNotrumpCompetitionActions(context).filter(option => matchesConstraints(hand, option.facts, 'C'));
}

export function weakNotrumpCompetitionPartner(context) {
  const { auction, quiet, hand, seat, major, second } = context;
  if (quiet === 'open') return '1NT';
  const choices = actingChoices(context, hand);
  if (quiet === 'respond' && choices.some(option => option.bid === 'Pass')) return 'Pass';
  if (quiet) return weakNotrumpPartner({ node: quiet, auction: auction.filter(call => sides[call.seat] === 0), hand, major, second }, choices);
  const p = position(auction);
  const f = handFeatures(hand, 'C');
  const has = bid => choices.some(option => option.bid === bid);
  const longest = [...suits].sort((a, b) => f.lengths[b] - f.lengths[a]);
  const suitBid = level => longest.map(suit => `${level}${suit}`).find(has);
  if (p === 'direct') {
    if (f.hcp >= 8 && has('XX')) return 'XX';
    if (f.shape[0] >= 7 && suitBid(3)) return suitBid(3);
    if (f.shape[0] === 6 && has('2NT')) return '2NT';
    return suitBid(2) ?? 'Pass';
  }
  if (p === 'opener-runout') return suitBid(2) ?? 'XX';
  if (p === 'lower-suit') {
    const lower = suits.find(suit => f.lengths[suit] >= 4);
    return has('Pass') ? 'Pass' : lower && has(`2${lower}`) ? `2${lower}` : suitBid(2);
  }
  if (p === 'reopening-runout') return suitBid(2) ?? 'Pass';
  if (p === 'lebensohl-correction') return suitBid(3) ?? 'Pass';
  if (p === 'lower-suit-correction') return f.lengths[lastContract(auction).bid[1]] >= 3 ? 'Pass' : suitBid(2) ?? 'Pass';
  if (choices.length === 1) return choices[0].bid;

  const contract = lastContract(auction);
  const strain = contract.bid.slice(1);
  if (sides[contract.seat] === 0) {
    if (contract.bid === '1NT' && seat === 'South' && f.hcp <= 7) return suitBid(2) ?? 'Pass';
    if (contract.bid === '2NT' && !has('Pass')) return suitBid(3);
    if (suitBid(3) && contract.convention === 'scrambling' && f.lengths[strain] < 3) return suitBid(3);
    return 'Pass';
  }
  if (has('X')) {
    const takeout = choices.find(option => option.bid === 'X').convention === 'takeout';
    if (takeout && f.hcp >= 9 && f.lengths[strain] <= 2 && longest.slice(0, 2).every(suit => f.lengths[suit] >= 4)) return 'X';
    if (!takeout && f.lengths[strain] >= 4 && f.controls >= 2) return 'X';
  }
  if (has('2NT') && f.hcp <= 7 && f.lengths[strain] <= 1) return '2NT';
  const level = Number(contract.bid[0]);
  const currentDouble = auction.slice(auction.lastIndexOf(contract) + 1).find(call => call.bid === 'X');
  if (currentDouble?.convention === 'penalty') return 'Pass';
  if (currentDouble?.convention === 'takeout' && currentDouble.seat !== seat) {
    return suitBid(level) ?? suitBid(3) ?? 'Pass';
  }
  return suitBid(level) ?? (level === 2 && f.shape[0] >= 6 ? suitBid(3) : null) ?? 'Pass';
}

function opponentCall(scenario, auction, seat) {
  const { bid, convention } = auction.at(-1);
  if ((auction.length === 1 && scenario.direct) || (auction.length === 3 && bid === 'Pass' && !scenario.direct))
    return { seat, bid: 'X', meaning: 'Penalty double of 1NT' };
  if (scenario.pressure && bid === 'XX' && (auction.length === 3 || auction.length === 5))
    return { seat, bid: '2H', meaning: 'Natural escape to hearts' };
  if (scenario.pressure && bid === 'X' && convention === 'takeout' && lastContract(auction).bid === '2H')
    return { seat, bid: '3H', meaning: 'Competitive heart raise' };
  return { seat, bid: 'Pass', meaning: 'Pass' };
}

function biddingComplete(auction) {
  return Boolean(lastContract(auction)) && auction.length >= 4 && auction.slice(-3).every(call => call.bid === 'Pass');
}

function finalContract(auction) {
  const last = lastContract(auction);
  const strain = last.bid.slice(1);
  const modifier = auction.slice(auction.lastIndexOf(last) + 1).findLast(call => ['X', 'XX'].includes(call.bid));
  return { bid: last.bid, level: Number(last.bid[0]), strain, doubling: modifier?.bid ?? '',
    declarer: auction.find(call => contractBid(call.bid) && call.bid.slice(1) === strain
      && sides[call.seat] === sides[last.seat]).seat };
}

export function applyWeakNotrumpCompetitionCall(session, bid) {
  const context = { ...session.opening, auction: session.auction };
  const { seat, quiet } = context;
  const choices = weakNotrumpCompetitionActions(context);
  const option = choices.find(action => action.bid === bid);
  const hand = seat === 'North' ? session.playerHand : session.partnerHand;
  if (!option || !matchesConstraints(hand, option.facts, 'C')) {
    if (quiet === 'respond' && bid === 'Pass') throw new Error('With 0–7 HCP and 4333 or 4432, choose Junk Stayman or an advanced-run transfer.');
    throw new Error(option ? `This call shows ${option.label}.` : 'Choose a call available in this competitive auction.');
  }
  const auction = [...session.auction, { seat, bid, meaning: option.label, source: option.source,
    ...(option.convention ? { convention: option.convention } : {}),
    callAlternatives: choices.map(({ bid, label }) => ({ bid, label })) }];
  const opening = { ...session.opening, seat: nextSeat(seat) };
  const openingFacts = bid === 'Pass' && option.source === 'Natural competition' ? session.openingFacts
    : { ...session.openingFacts, [seat]: [...session.openingFacts[seat], option.label] };
  const next = { ...session, opening, auction, openingFacts };
  if (option.next) {
    opening.quiet = option.next === 'finish' ? 'final' : option.next;
    opening.major = option.major ?? opening.major;
    opening.second = option.second ?? opening.second;
  }
  if (!biddingComplete(auction)) {
    auction.push(opponentCall(scenarioFor(session.wholeAuction.competition), auction, opening.seat));
    opening.seat = nextSeat(opening.seat);
    if (auction.at(-1).bid === 'X') opening.quiet = null;
  }
  if (biddingComplete(auction)) {
    next.finished = true;
    next.phase = 'finished';
    next.contract = finalContract(auction);
  }
  return next;
}

export function validateWeakNotrumpCompetition(session) {
  const { wholeAuction, opening, auction } = session;
  if (wholeAuction.rulesVersion !== 1 || !scenarioFor(wholeAuction.competition) || !['North', 'South'].includes(wholeAuction.humanSeat)
      || opening?.system !== WEAK_NT_COMPETITION || opening.node !== 'competition' || session.dealerSeat !== 'North'
      || session.practiceRole !== (wholeAuction.humanSeat === 'North' ? 'asker' : 'teller')
      || !Array.isArray(session.openingFacts?.North) || !Array.isArray(session.openingFacts?.South)
      || !Array.isArray(auction) || auction.some((call, i) => call?.seat !== AUCTION_SEATS[i % 4])
      || (!session.finished && !session.revealed && (opening.seat !== wholeAuction.humanSeat
        || opening.seat !== AUCTION_SEATS[auction.length % 4]))
      || (session.contract && JSON.stringify(finalContract(auction)) !== JSON.stringify(session.contract))) {
    throw new Error('Saved weak notrump competition is incompatible.');
  }
}
