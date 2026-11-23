// P1061–P1065 and P1435–P1439, uncontested first/second seat.
import { SUITS, SUIT_NAMES, bidIndex, hcp, length } from './profile-utils.js';
import { handFeatures } from './core.js';

export const PREEMPT_BIDS = ['3C', '3D', '3H', '3S'];
const name = suit => SUIT_NAMES[suit].toLowerCase();
const game = suit => ('HS'.includes(suit) ? '4' : '5') + suit;
const source = 'P1435–P1439';
const row = (bid, label, next, facts = [], extra = {}) => ({ bid, label, next, facts, source, ...extra });
const play = bid => row(bid, 'Play ' + bid, 'preempt-final');
const pass = bid => row('Pass', 'Play ' + bid, 'finish');
const cheapest = (suit, after) => ['3', '4', '5'].map(level => level + suit).find(bid => bidIndex(bid) > bidIndex(after));

export function preemptRows({ system, node, auction }) {
  const opened = system[1];
  if (node === 'open') {
    // Four/five spades with a long side suit belongs to Horton. Six spades take priority.
    const facts = [hcp(0, 8), length(opened, 6, 13), ...(opened === 'S' ? [] : [length('S', 0, 3)])];
    return [row(system, `Natural preempt, six-plus ${name(opened)}, 0–8 HCP`, 'respond', facts)];
  }
  if (node === 'respond') return [
    pass(system), play('3NT'), ...SUITS.map(suit => play(game(suit))),
    ...('CD'.includes(opened) ? [play('4' + opened)] : []),
    ...SUITS.filter(suit => suit !== opened).flatMap(suit => {
      const bid = cheapest(suit, system);
      return bidIndex(bid) < bidIndex(game(suit))
        ? [row(bid, `Natural ${name(suit)}; forcing one round`, 'preempt-rebid', [length(suit, 5, 13)], { forcing: true })]
        : [];
    }),
  ];
  if (node === 'preempt-rebid') {
    const response = auction.at(-1).bid;
    const suit = response[1];
    const raise = cheapest(suit, response);
    const repeat = cheapest(opened, response);
    return [
      row(raise, `Support ${name(suit)} with two-plus`, 'preempt-continue', [length(suit, 2, 13)]),
      row('3NT', `Fewer than two ${name(suit)}; offer to play`, 'preempt-continue', [length(suit, 0, 1)]),
      row(repeat, `Return to ${name(opened)}`, 'preempt-continue'),
    ];
  }
  if (node === 'preempt-continue') return [
    pass(auction.at(-1).bid), play('3NT'), play(game(opened)), play(game(auction[1].bid[1])),
  ];
  if (node === 'preempt-final') return [pass(auction.at(-1).bid)];
  return null;
}

export function preemptPartnerBid({ system, node, auction, hand }, choices) {
  if (node === 'open') return system;
  if (node === 'preempt-final') return 'Pass';
  const f = handFeatures(hand, system[1]);
  const opened = system[1];
  const pick = (...bids) => bids.find(bid => choices.some(row => row.bid === bid));
  if (node === 'respond') {
    if (f.hcp < 16) return 'Pass';
    const natural = choices.filter(row => row.forcing).sort((a, b) => f.lengths[b.bid[1]] - f.lengths[a.bid[1]]);
    if (f.lengths[opened] < 3 && natural.length) return natural[0].bid;
    return pick(...('HS'.includes(opened) && f.lengths[opened] >= 3 ? [game(opened)] : []), '3NT', game(opened));
  }
  if (node === 'preempt-rebid') {
    const response = auction.at(-1).bid;
    return pick(cheapest(response[1], response), '3NT', cheapest(opened, response));
  }
  const last = auction.at(-1).bid;
  const shown = auction[1].bid[1];
  return f.hcp >= 16 && last[1] === shown ? pick(game(shown), 'Pass') : 'Pass';
}
