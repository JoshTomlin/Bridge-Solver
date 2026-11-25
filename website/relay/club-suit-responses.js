// First- and second-seat 1C followed by a positive diamond hand or a weak suit jump.
import { drawConstrainedPair, handFeatures, matchesConstraints } from './core.js';
import { SUITS, SUIT_NAMES, anyOf, bidIndex, hcp, length, nextBid } from './profile-utils.js';

const unbalanced = { type: 'balanced', value: false };
const balanced = { type: 'balanced', value: true };
const row = (bid, label, source, facts = [], extra = {}) => ({ bid, label, source, facts, kind: 'opening', ...extra });
const positiveFacts = [hcp(10), length('D', 6, 13), ...['H','S','C'].map(suit => length(suit, 0, 3))];
const weakSuits = ['D','H','S'];
const diamondRebids = [
  row('2D', '0–2 diamonds, unbalanced. To play opposite 10–13.', 'P0438', [unbalanced, length('D', 0, 2)]),
  row('2H', 'Ask for shortage, then strength (10–12 / 13–15 / 16+) and Shortage Keycard.', 'P0439', [], { forcing: true }),
  row('2S', 'Six-plus decent clubs. Ask for shortage, then strength and Shortage Keycard.', 'P0440', [length('C', 6, 13)], { forcing: true }),
  row('3C', '9–11 with (6)7+ clubs, probably short in diamonds.', 'P0441', [hcp(9, 11), length('C', 6, 13)]),
  row('3D', '9–12 unbalanced with three-plus diamonds. The next step asks for shortage.', 'P0442', [hcp(9, 12), unbalanced, length('D', 3, 13)]),
];

export const clubSuitEntries = [
  row('2C', '10+ with single-suited six-plus diamonds', 'P0255', positiveFacts, { forcing: true }),
  ...weakSuits.map(suit => row(`2${suit}`, `0–6(7) with six or seven ${SUIT_NAMES[suit].toLowerCase()}, natural`,
    'P0256/P0444', [hcp(0, 7), length(suit, 6, 7)])),
  row('3C','3–6(7) with six-plus clubs, natural','P0258',[hcp(3,7),length('C',6,13)]),
  ...weakSuits.map(suit => row(`3${suit}`, `0–6(7) with (6)7+ ${SUIT_NAMES[suit].toLowerCase()}, natural`,
    'P0259',[hcp(0,7),length(suit,6,13)])),
];

export function clubSuitEntryBid(f) {
  if (f.hcp >= 10 && f.lengths.D >= 6 && ['H','S','C'].every(suit => f.lengths[suit] < 4)) return '2C';
  if (f.hcp > 7) return null;
  const weak = SUITS.find(suit => f.lengths[suit] >= 6 && SUITS.every(other => other === suit || f.lengths[other] < 4));
  if (weak === 'C') return f.hcp >= 3 ? '3C' : null;
  return weak ? `${f.lengths[weak] >= 7 ? 3 : 2}${weak}` : null;
}

function positiveRebid(f, hand) {
  if (f.hcp <= 11 && f.lengths.C >= 7) return '3C';
  if (!f.balanced && f.hcp <= 12 && f.lengths.D >= 3) return '3D';
  // Suit quality and whether to investigate are opener's judgement.
  if (f.hcp >= 13 && f.lengths.C >= 6 && ['A','K','Q'].filter(rank => hand.includes('C' + rank)).length >= 2) return '2S';
  if (!f.balanced && f.hcp <= 13 && f.lengths.D <= 2) return '2D';
  return '2H';
}

export function drawClubSuitDeal(rng, positive, jumpLevel = 2) {
  const suits = jumpLevel === 3 ? SUITS : weakSuits;
  const suit = positive ? 'D' : suits[Math.floor(rng() * suits.length)];
  const target = positive ? diamondRebids[Math.floor(rng() * diamondRebids.length)] : null;
  const constraints = positive ? [...positiveFacts, hcp(10, 19)] : [hcp(suit === 'C' ? 3 : 0, 6), length(suit, jumpLevel === 3 && suit !== 'C' ? 7 : 6, 7),
    ...SUITS.filter(side => side !== suit).map(side => length(side, 0, 3))];
  const balancedOpener = [balanced, hcp(14, 19), length('H', 2, 3), length('S', 2, 3),
    length('C', 2, 5), length('D', 2, 5)];
  const opener = !positive || target.bid === '2H' ? balancedOpener
    : [unbalanced, hcp(9, 18), length('C', 5, 8), ...target.facts];
  return drawConstrainedPair({ constraints, trump: 'C', major: 'C' }, opener, rng,
    hand => !positive || positiveRebid(handFeatures(hand, 'C'), hand) === target.bid);
}

const play = (bid, source) => row(bid, 'To play', source);
const games = ['3NT','4H','4S','5C','5D'];
const stop = source => row('Pass', 'Play the current contract', source);
const naturalFollowup = 'Provisional natural continuation after P0438';
const follow = (bid, label, facts = [], next = 'natural-final', forcing = false) =>
  row(bid, label, naturalFollowup, facts, { next, forcing });
const majorSuits = ['H', 'S'];
const majorNames = { H: 'Heart', S: 'Spade' };
const card = (suit, rank) => ({ type: 'card', suit, rank });
const stopper = suit => anyOf([card(suit, 'A')], [card(suit, 'K'), length(suit, 2, 13)],
  [card(suit, 'Q'), length(suit, 3, 13)], [card(suit, 'J'), length(suit, 4, 13)]);
const majorStoppers = majorSuits.map(stopper);
const invite = hcp(14, 15);
const minorGames = ['5C', '5D'];

const diamondPreference = [
  row('Pass', 'Play 2♦ with 10–13', 'P0438', [hcp(10, 13)]),
  ...majorSuits.map(suit => follow(`2${suit}`, `${majorNames[suit]} stopper, 14+, forcing`,
    [hcp(14), stopper(suit)], 'diamond-investigate', true)),
  follow('2NT', 'Natural invite, 14–15 with both majors stopped', [invite, ...majorStoppers], 'diamond-invite'),
  follow('3C', 'Club support, 14+, forcing', [hcp(14), length('C', 3, 13)], 'diamond-investigate', true),
  follow('3D', 'Natural diamond invite, 14–15', [invite], 'diamond-invite'),
  ...['3NT', ...minorGames].map(bid => play(bid, 'Natural contract choice')),
];

function diamondFollowups(node, auction) {
  const last = auction.at(-1);
  const firstTry = auction[3].bid;
  const unshownMajors = majorSuits.filter(suit => firstTry !== `2${suit}`);
  const openerStops = unshownMajors.map(stopper);
  let choices;
  if (node === 'diamond-investigate') {
    choices = [
      ...unshownMajors.map(suit => follow(suit === 'S' && firstTry === '2H' ? '2S' : `3${suit}`,
        `${majorNames[suit]} stopper, forcing`, [stopper(suit)], 'diamond-choice', true)),
      follow('2NT', 'Natural minimum, remaining major stopped', [hcp(9, 10), ...openerStops], 'diamond-choice'),
      follow('3C', 'Natural club preference', [length('C', 5, 13)], 'diamond-choice'),
      follow('3D', 'Doubleton diamond preference', [length('D', 2)], 'diamond-choice'),
      follow('3NT', 'To play with the remaining major stoppers', openerStops),
      follow('4C', 'Natural club preference, to play', [length('C', 5, 13)], 'diamond-choice'),
    ];
  } else if (node === 'diamond-invite') {
    choices = [stop(naturalFollowup),
      follow('3C', 'Decline in clubs', [length('C', 5, 13)], 'diamond-choice'),
      follow('3D', 'Decline with a doubleton diamond', [length('D', 2)], 'diamond-choice'),
      follow('3NT', 'Accept in notrump', firstTry === '2NT' ? [] : openerStops),
    ];
  } else {
    choices = [
      ...(!last.forcing ? [stop(naturalFollowup)] : []),
      follow('2NT', 'Natural, to play'),
      follow('3C', 'Natural club preference, to play', [length('C', 3, 13)]),
      follow('3D', 'Natural diamond preference, to play'),
      follow('3NT', 'To play'),
      follow('4C', 'Natural club preference, to play', [length('C', 3, 13)]),
    ];
  }
  return [...choices, ...minorGames.map(bid => play(bid, naturalFollowup))]
    .filter(({ bid }) => bid === 'Pass' || bidIndex(bid) > bidIndex(last.bid));
}

const diamondFollowupNodes = ['diamond-investigate', 'diamond-invite', 'diamond-choice'];
export const clubSuitNodes = ['diamond-positive', 'diamond-preference', ...diamondFollowupNodes,
  'weak-jump', 'weak-invite', 'weak-three', 'natural-final'];

export function clubSuitActions(node, auction) {
  const last = auction.at(-1).bid;
  if (node === 'diamond-positive') return diamondRebids;
  if (node === 'diamond-preference' && last === '2D') return diamondPreference;
  if (node === 'diamond-preference') return [
    stop('Natural contract choice'),
    ...(last === '3D' ? [row('3H', 'Ask opener for shortage', 'P0442', [], { forcing: true })] : []),
    ...['3NT', '5C', '5D'].map(bid => play(bid, 'Natural contract choice')),
  ];
  if (diamondFollowupNodes.includes(node)) return diamondFollowups(node, auction);
  if (node === 'weak-invite') return [stop('P0444'), play('3' + auction[1].bid[1], 'P0444'), ...games.map(bid => play(bid, 'P0444'))];
  if (node === 'weak-three') return [stop('Natural partscore choice'), ...games.map(bid=>play(bid,'Natural game choice'))];
  if (node === 'natural-final') return [stop('Natural contract choice')];
  const options = [stop('P0444')];
  for (let bid = nextBid(last); bid; bid = nextBid(bid)) {
    options.push(bid === '2NT' ? row(bid, 'Genuine invitation. Responder may correct to three of their suit or choose game.', 'P0444')
      : play(bid, 'P0444'));
  }
  return options;
}

export function clubSuitPartnerBid(node, auction, hand, f) {
  if (node === 'diamond-positive') return positiveRebid(f, hand);
  const last = auction.at(-1).bid;
  const hasStop = suit => matchesConstraints(hand, [stopper(suit)], 'C');
  if (node === 'diamond-preference' && last === '2D') {
    if (f.hcp <= 13) return 'Pass';
    if (f.hcp <= 15 && majorSuits.every(hasStop)) return '2NT';
    return majorSuits.map(suit => `2${suit}`).find(bid => hasStop(bid[1]))
      ?? (f.lengths.C >= 3 ? '3C' : f.hcp <= 15 ? '3D' : '5D');
  }
  if (diamondFollowupNodes.includes(node)) {
    const rows = diamondFollowups(node, auction).filter(option => matchesConstraints(hand, option.facts, 'C'));
    const choose = (...bids) => bids.find(bid => rows.some(option => option.bid === bid));
    if (node === 'diamond-investigate') {
      const clubFitGame = last === '3C' && f.hcp >= 11 ? choose('3NT') : undefined;
      return clubFitGame ?? rows.find(option => option.forcing)?.bid ?? choose('3D', '3C', '4C');
    }
    if (node === 'diamond-invite') {
      return (f.hcp >= 11 ? choose('3NT') : undefined)
        ?? (last === '2NT' && f.lengths.C >= 6 ? choose('3C') : undefined) ?? 'Pass';
    }
    const shown = [auction[3].bid, last].filter(bid => /^[23][HS]$/.test(bid)).map(bid => bid[1]);
    if (majorSuits.every(suit => shown.includes(suit) || hasStop(suit))) {
      return (f.hcp <= 15 ? choose('Pass') : undefined) ?? '3NT';
    }
    const preferClubs = f.lengths.C >= 3 && [auction[3].bid, last].some(bid => ['3C', '4C'].includes(bid));
    return (f.hcp <= 15 ? choose('Pass', preferClubs ? '4C' : '3D', '3C') : undefined)
      ?? (preferClubs ? '5C' : '5D');
  }
  if (node === 'diamond-preference') {
    if (f.hcp <= 13) return 'Pass';
    if (last === '3D' && f.hcp >= 17) return '3H';
    return last === '3D' && !f.balanced ? '5D' : '3NT';
  }
  if (node === 'natural-final') return 'Pass';
  const suit = auction[1].bid[1];
  if (node === 'weak-three') return f.hcp >= 18 && f.lengths[suit] >= 3 && 'HS'.includes(suit) ? '4'+suit : 'Pass';
  if (node === 'weak-invite') return f.hcp >= 6 ? (suit === 'D' ? '3NT' : '4' + suit) : '3' + suit;
  if (f.hcp >= 17) return '2NT';
  return f.lengths[suit] >= 3 ? '3' + suit : 'Pass';
}
