// Natural continuations where the notes specify the response but omit the
// opener rebid table. Shape promises are checked. Strength choices are practice.
import { handFeatures, matchesConstraints, bidIndex } from './core.js';

const names = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
const minLength = (suit, min) => ({ type: 'length', suit, min });
const balanced = { type: 'balanced' };
const row = (bid, label, next, facts = []) => ({
  bid, label, next, facts, kind: 'opening', source: 'Natural continuation (provisional practice)',
});
const stop = bid => row('Pass', `Play ${bid}`, 'finish');
const play = bid => row(bid, `Play ${bid}`, 'ordinary-final');
const game = suit => `${'HS'.includes(suit) ? 4 : 5}${suit}`;
const games = suits => ['3NT', ...suits.map(game)].map(play);

export function naturalOpeningNode(node, auction) {
  // A previously saved 1M–1NT used the simple raise node.
  if (node === 'weak-raise' && /^1[HS]$/.test(auction[0]?.bid) && auction[1]?.bid === '1NT') return 'ordinary-rebid';
  return ['ordinary-rebid','ordinary-continue','ordinary-final'].includes(node) ? node : null;
}

export function naturalOpeningActions(node, auction) {
  const last = auction.at(-1).bid;
  const opening = auction[0].bid[1];
  const response = auction[1].bid;
  const firstResponseSuit = response === '1NT' ? null : response[1];
  const choices = [...new Set([opening, firstResponseSuit, ...auction.slice(2).map(call => call.bid.slice(1)).filter(suit => names[suit])].filter(Boolean))];
  let rows;
  if (node === 'ordinary-rebid') {
    rows = [stop(last), ...games(choices)];
    if (response === '3D') return rows;
    rows.push(row('2NT', 'Natural notrump invitation', 'ordinary-continue', [balanced]));
    if (response === '2C') rows.push(row('3C', 'Club raise with three-plus support', 'ordinary-continue', [minLength('C', 3)]));
    for (const suit of ['C','D','H','S']) {
      if (suit === firstResponseSuit) continue;
      const minimum = suit === opening ? ('HS'.includes(suit) ? 6 : 5) : 4;
      rows.push(row(`2${suit}`, `${minimum}+ ${names[suit]}, natural`,
        'ordinary-continue', [minLength(suit, minimum)]));
    }
    if ('HS'.includes(opening)) rows.push(row(`3${opening}`, `Six-plus ${names[opening]}, natural invitation`, 'ordinary-continue', [minLength(opening, 6)]));
  } else if (node === 'ordinary-continue') {
    rows = [stop(last), ...games(choices)];
    if (last === '2NT') {
      for (const suit of choices) rows.push(row(`3${suit}`, `Five-plus ${names[suit]}, to play`, 'ordinary-final', [minLength(suit, 5)]));
    } else if (last[0] === '2') {
      rows.push(row(`2${opening}`, `Preference for ${names[opening]}, to play`, 'ordinary-final', [minLength(opening, 2)]));
    }
  } else {
    rows = [stop(last)];
  }
  return rows.filter((entry, i) => (entry.bid === 'Pass' || bidIndex(entry.bid) > bidIndex(last))
    && rows.findIndex(row => row.bid === entry.bid) === i);
}

export function naturalOpeningPartnerBid(node, auction, hand) {
  const { hcp, lengths } = handFeatures(hand, 'C');
  const opening = auction[0].bid[1];
  const response = auction[1].bid;
  const last = auction.at(-1).bid;
  const choices = naturalOpeningActions(node, auction).filter(row => matchesConstraints(hand, row.facts, opening));
  const pick = (...bids) => bids.find(bid => choices.some(row => row.bid === bid));
  if (node === 'ordinary-rebid') {
    if (response === '3D') {
      return hcp >= 15 ? pick(lengths.D >= 6 ? '5D' : '3NT', 'Pass') : 'Pass';
    }
    if (response === '2C' && hcp >= 13 && lengths.C >= 3) return '3C';
    if (response === '2C' && lengths.C >= 2 && hcp <= 13) return 'Pass';
    if (hcp >= 17 && choices.some(row => row.bid === '2NT')) return '2NT';
    if (hcp >= 16 && lengths[opening] >= 6 && 'HS'.includes(opening)) return `3${opening}`;
    if (lengths[opening] >= 6) return pick(`2${opening}`, 'Pass');
    const newSuit = ['C','D','H','S'].filter(suit => suit !== opening && suit !== response[1])
      .sort((left, right) => lengths[right] - lengths[left])[0];
    const reverse = opening === 'H' && newSuit === 'S';
    if (lengths[newSuit] >= 4 && (!reverse || hcp >= 16)) return pick(`2${newSuit}`, `2${opening}`, 'Pass');
    return response === '2C' ? pick(`2${opening}`, 'Pass') : 'Pass';
  }
  if (node === 'ordinary-continue') {
    if (last === '2NT') {
      const threshold = auction[0].bid === '1C' ? 6 : 8;
      if (hcp >= threshold) return pick('3NT', 'Pass');
      return pick(...['C','D','H','S'].sort((a,b) => lengths[b]-lengths[a]).map(suit => `3${suit}`), 'Pass');
    }
    if (last === `3${opening}` && hcp >= 8 && lengths[opening] >= 2) return pick(game(opening), 'Pass');
    if (last[0] === '2' && lengths[last[1]] < 3 && lengths[opening] >= 2) return pick(`2${opening}`, 'Pass');
  }
  return 'Pass';
}
