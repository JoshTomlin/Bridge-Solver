// First- and second-seat 1C followed by a positive diamond hand or a weak suit jump.
import { drawConstrainedPair, handFeatures } from './core.js';
import { SUITS, SUIT_NAMES, hcp, length, nextBid } from './profile-utils.js';

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
export const clubSuitNodes = ['diamond-positive', 'diamond-preference', 'weak-jump', 'weak-invite', 'weak-three', 'natural-final'];

export function clubSuitActions(node, auction) {
  const last = auction.at(-1).bid;
  if (node === 'diamond-positive') return diamondRebids;
  if (node === 'diamond-preference') return [
    ...(last === '2D' ? [row('Pass', 'Play 2♦ with 10–13', 'P0438', [hcp(10, 13)])] : [stop('Natural contract choice')]),
    ...(last === '3D' ? [row('3H', 'Ask opener for shortage', 'P0442', [], { forcing: true })] : []),
    ...['3NT', '5C', '5D'].map(bid => play(bid, 'Natural contract choice')),
  ];
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
  if (node === 'diamond-preference') {
    const last = auction.at(-1).bid;
    if (last === '2D') return f.hcp <= 13 ? 'Pass' : '3NT';
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
