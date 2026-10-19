// Shared bid arithmetic for source definitions. Asking and answering omissions
// are chosen by each branch; there is deliberately no universal skip rule.
export const SUITS = Object.freeze(['S', 'H', 'D', 'C']);
export const SUIT_NAMES = Object.freeze({ S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' });
const STRAINS = ['C', 'D', 'H', 'S', 'NT'];

export function bidIndex(bid) {
  const match = /^([1-7])(C|D|H|S|NT)$/.exec(bid);
  if (!match) throw new Error(`Invalid contract bid: ${bid}`);
  return (Number(match[1]) - 1) * 5 + STRAINS.indexOf(match[2]);
}

export function nextBid(bid, steps = 1) {
  if (!Number.isInteger(steps) || steps < 1) throw new Error('Bid steps must be a positive integer.');
  const index = bidIndex(bid) + steps;
  return index < 35 ? `${Math.floor(index / 5) + 1}${STRAINS[index % 5]}` : null;
}

export function relayStep(bid, steps = 1, { skip3NT = true, skip = [] } = {}) {
  let answer = bid;
  for (let index = 0; index < steps; index += 1) {
    do { answer = nextBid(answer); }
    while (answer && ((skip3NT && answer === '3NT') || skip.includes(answer)));
    if (!answer) return null;
  }
  return answer;
}

export function lastBid(session) {
  return session.auction.findLast(call => call.bid !== 'Pass').bid;
}

export const length = (suit, min, max = min) => ({ type: 'length', suit, min, max });
export const hcp = (min, max = 37) => ({ type: 'hcp', min, max });
export const shapes = (...values) => ({ type: 'shapes', values: values.flat() });
export const anyOf = (...options) => ({ type: 'anyOf', options });

export function declarerFor(auction, strain, fallback = 'South') {
  return auction.find(call => ['North', 'South'].includes(call.seat)
    && /^([1-7])(C|D|H|S|NT)$/.exec(call.bid)?.[2] === strain)?.seat ?? fallback;
}
