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

/** Clear response choices for generated entry auctions. This is an admission
 * check, not a claim that every borderline/dual-major hand has one right bid.
 * Check the physical responder even in profiles that swap asker/teller. */
export function matchesInitialResponse(auction, features, seat) {
  const [opening, response] = auction ?? [];
  if (!response || response.seat !== seat) return true;
  const {lengths:n,hcp:points}=features;
  let major;
  if(opening.bid==='1D' && ['1H','1S'].includes(response.bid)) {
    major=response.bid.slice(1);
    if(points<5 || n[major]<4 || points>=14 && n[major]===4) return false;
  } else if(opening.bid==='1C' && ['1D','1H'].includes(response.bid)) {
    major=response.bid==='1D'?'H':'S';
    if(n[major]<4) return false;
  } else if(opening.bid==='1D' && response.bid==='1NT') {
    return points>=10 && Math.max(n.H,n.S)<5 && (Math.max(n.H,n.S)<4 || points>=14);
  } else if(opening.bid==='1H' && response.bid==='1S') {
    // P0905–P0908: ordinary support and balanced game forces go via 2C;
    // six-spade/three-heart delayed-support exceptions remain admissible.
    return points>=5 && n.S>=4 && !(n.H>=3 && n.S<6)
      && !(features.balanced && points>=12) && !(n.S>=6 && points<=7)
      && n.H<=n.S;
  } else return true;
  const other=major==='H'?'S':'H';
  if(n[other]>n[major]) return false;
  if(n.H===n.S && n.H>=5) return false; // Keep ambiguous equal long majors out of drills.
  return !(major==='S' && n.H===4 && n.S===4); // Heart response with 4/4.
}
