// Uncontested third/fourth-seat agreements, main notes P1751–P1783,
// P1808–P1830. This is a separate system from first/second-seat transfers.
import { DECK, makeRng, handFeatures, matchesConstraints, bidIndex } from './core.js';
import { declarerFor } from './profile-utils.js';
import { SHAPES } from './source-utils.js';

export const PASSED_RULES_VERSION = 1;
export const PASSED_FAMILIES = ['PH', 'PH-C', 'PH-D', 'PH-M', 'PH-H', 'PH-S', 'PH-NT', 'PH-2NT', 'PH-2C'];
export const PASSED_NOTES = [
  'Uncontested third/fourth-seat practice. The first pass is real, and both hands are fixed. You remain displayed South.',
  'After clubs, maximum passed hands use artificial 1D: 6–8 nonvulnerable or 7–9 vulnerable. Practice treats the lower band as minimum; borderline judgement is not a new partnership rule.',
  'Club openers are 9–19 in third seat or 13–19 in fourth, balanced or a five-plus club hand. Sub-opening lead-directing choices and extreme shapes are not generated.',
  'After diamonds/majors, fit-showing 2/1 responses follow the printed 5–8 range and promise the side suit plus three-card support. These are not first-seat game forces.',
  'Strong notrumps are (19)20–21 (1NT), 22–23 (2NT), and 24–25 after 2C and a control response. Generated 1NT hands use 20–21; the parenthetical 19 is accepted as judgement. The latter two use Puppet, not Muppet.',
  'The bot uses a disclosed conservative game-choice policy. Human game-force, slam and super-accept judgement is not graded against an invented strength cutoff.',
  'P1780 repeats clubs/diamonds after P1779; the missing hearts/diamonds meaning is unresolved. That one call pauses for clarification. Detailed later natural/slam continuations and competitive auctions remain outside this increment.',
];
const suits = ['S', 'H', 'D', 'C'];
const names = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const feat = hand => handFeatures(hand, 'C');
const hcp = (min, max = 37) => ({ type: 'hcp', min, max });
const len = (suit, min, max = 13) => ({ type: 'length', suit, min, max });
const call = (bid, label, facts = [], source = 'P1751–P1830', next = null) => ({ bid, label, facts, source, next, kind: 'opening' });
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const shapeFact = predicate => ({ type: 'shapes', values: SHAPES.filter(predicate).map(n => suits.map(s => n[s]).join('')) });
const pairs = n => n.H >= 5 && n.C >= 5 ? 'HC' : n.D >= 5 && n.C >= 5 ? 'DC' : n.H >= 5 && n.D >= 5 ? 'HD' : null;

function shapeReply(n) {
  const exact = suits.map(s => n[s]).join('');
  if (['0544', '0445', '0454'].includes(exact)) return ({ '0544': '2NT', '0445': '3C', '0454': '3D' })[exact];
  if (n.S === 4 && n.H === 4 && [n.D, n.C].sort().join('') === '23') return '3H';
  if (n.S >= 5) return '2H';
  if (pairs(n)) return '1NT';
  if (n.H >= 5) return '2D';
  if (n.S === 4) return '2C';
  if (n.H === 4) return '2S';
  return '1S';
}

const describe = [
  ['1S', 'No four-card major', 'P1757'], ['1NT', 'Five-five, not including spades', 'P1758'],
  ['2C', 'Four spades', 'P1759'], ['2D', 'Five hearts', 'P1760'], ['2H', 'Five spades', 'P1761'], ['2S', 'Four hearts', 'P1762'],
  ['2NT', '0544: spade void, five hearts, four-four minors', 'P1763'],
  ['3C', '0445: spade void, four-four red suits, five clubs', 'P1764'],
  ['3D', '0454: spade void, four-four rounded suits, five diamonds', 'P1765'],
  ['3H', 'Four-four majors, three-two minors', 'P1766'],
].map(([bid, label, source]) => call(bid, label, [shapeFact(n => shapeReply(n) === bid)], source, bid === '1NT' ? 'resolve-pairs' : 'choose-game'));

const pairRows = [
  call('2D', 'Five hearts and five clubs', [len('H', 5), len('C', 5)], 'P1769', 'choose-game'),
  call('2H', 'Five diamonds and five clubs', [len('D', 5), len('C', 5)], 'P1770', 'choose-game'),
  call('2S', 'Five hearts and five diamonds', [len('H', 5), len('D', 5)], 'P1771', 'choose-game'),
];

function games() { return [call('3NT', 'Choose 3NT', [], 'Natural game choice', 'final'), ...suits.map(s => call(`${['C', 'D'].includes(s) ? 5 : 4}${s}`, `Choose game in ${names[s]}`, [], 'Natural game choice', 'final'))]; }
function lastBid(session) { return session.auction.findLast(row => row.bid !== 'Pass')?.bid; }
function terminal(session) {
  const bid = lastBid(session);
  return freeze({ ...session, opening: null, pendingAsk: null, phase: 'finished', finished: true,
    ...(!bid ? {passedOut:true} : {}), contract: bid ? { bid, level: Number(bid[0]), strain: bid.slice(1), declarer: declarerFor(session.auction, bid.slice(1)) } : null });
}
function pause(session, reason) { return freeze({ ...session, finished: true, phase: 'coverage-boundary', coverageBoundary: true, undiscussedBid: session.auction.at(-1).bid, unsupportedReason: reason }); }

export function passedActions(session) {
  const { node, bid: opening, vulnerable, major } = session.opening;
  const maximum = vulnerable ? [7, 9] : [6, 8];
  let rows;
  if (node === 'open') {
    const strongRange = ({ '1NT': [19, 21], '2NT': [22, 23] })[opening];
    const facts = opening === '2C' ? [] : strongRange ? [hcp(...strongRange), { type: 'balanced' }]
      : opening === '1C' ? [hcp(session.wholeAuction.openingSeatNumber === 4 ? 13 : 9, 19), { type: 'anyOf', options: [[{ type: 'balanced' }], [len('C', 5)]] }]
      : [hcp(9, 19), len(opening.slice(1), opening === '1D' ? 4 : 5)];
    const range = opening === '2C' ? '; strong game force, control responses' : strongRange ? `; ${opening === '1NT' ? '(19)20–21' : '22–23'} balanced` : '';
    rows = [call(opening, `${opening} opening in ${session.wholeAuction.openingSeatNumber === 3 ? 'third' : 'fourth'} seat${range}`, facts, opening === '2C' ? 'P1300–P1304/P1829' : 'P1753/P1808/P1828–P1829', opening === '2C' ? 'controls' : 'respond'), call('Pass', 'Pass out the deal')];
  }
  else if (node === 'controls') rows = [call('2D', 'Zero, one or four controls', [{ type: 'anyOf', options: [0, 1, 4].map(n => [{ type: 'controls', equals: n }]) }], 'P1302', 'strong-rebid'),
    call('2H', 'Two or five controls', [{ type: 'anyOf', options: [2, 5].map(n => [{ type: 'controls', equals: n }]) }], 'P1303', 'strong-rebid'),
    call('2S', 'Three controls', [{ type: 'controls', equals: 3 }], 'P1304', 'strong-rebid')];
  else if (node === 'strong-rebid') rows = [call('2NT', '24–25 balanced', [hcp(24, 25), { type: 'balanced' }], 'P1829', 'puppet-response')];
  else if (node === 'respond' && opening === '1C') rows = [
    call('Pass', 'Play clubs with a weak passed hand', [hcp(0, maximum[0] - 1)], 'Natural weak pass'),
    call('1D', `Maximum passed hand: ${maximum.join('–')}`, [hcp(...maximum)], 'P1754', 'club-rebid'),
    ...['H', 'S'].map(s => call(`1${s}`, `Natural four/five ${names[s]}; minimum passed hand`, [hcp(0, maximum[0] - 1), len(s, 4, 5)], 'P1772–P1773', 'natural-rebid')),
    call('1NT', 'Natural; minimum passed hand', [hcp(0, maximum[0] - 1)], 'P1773', 'natural-rebid'),
    call('2C', 'Five clubs; minimum passed hand', [hcp(0, maximum[0] - 1), len('C', 5, 5)], 'P1773', 'natural-rebid'),
    ...pairRows.map(row => ({ ...row, facts: [hcp(0, maximum[0] - 1), ...row.facts], next: 'natural-rebid', source: 'P1772' })),
    ...describe.filter(row => ['2NT', '3C', '3D'].includes(row.bid)).map(row => ({ ...row, facts: [hcp(0, maximum[0] - 1), ...row.facts], next: 'natural-rebid', source: 'P1772' })),
  ];
  else if (node === 'respond' && ['1D', '1H', '1S'].includes(opening)) {
    const trump = opening.slice(1);
    rows = [call('Pass', `Play ${opening}`)];
    if (trump === 'D' || trump === 'H') rows.push(...(trump === 'D' ? ['H', 'S'] : ['S']).map(s => call(`1${s}`, `Natural four-plus ${names[s]}; 5–8`, [hcp(5, 8), len(s, 4)], trump === 'D' ? 'P1811' : 'P1815', 'natural-rebid')));
    if (trump !== 'D') rows.push(call('1NT', 'Natural passed-hand response', [], 'P1816/P1821', 'natural-rebid'));
    for (const s of trump === 'D' ? ['C'] : trump === 'H' ? ['C', 'D'] : ['C', 'D', 'H']) rows.push(call(`2${s}`, `Five-plus ${names[s]}, three ${names[trump]}; 5–8, fit-showing`, [hcp(5, 8), len(s, 5), len(trump, 3, 3)], 'P1812/P1817–P1818/P1822–P1824', 'natural-rebid'));
    rows.push(call(`2${trump}`, `Three-plus ${names[trump]}; 5–8${trump === 'D' ? ', usually four-plus diamonds' : ''}`, [hcp(5, 8), len(trump, 3)], 'P1813/P1819/P1825', 'natural-rebid'));
  }
  else if (node === 'club-rebid') rows = [call('1H', 'Artificial game force', [], 'P1755', 'describe'), call('1NT', 'To play unless responder describes shape', [], 'P1755/P1775', 'escape')];
  else if (node === 'describe') rows = describe;
  else if (node === 'resolve-pairs') rows = [call('2C', 'Ask which two suits are five-five', [], 'P1767', 'show-pairs')];
  else if (node === 'show-pairs') rows = pairRows;
  else if (node === 'escape') rows = [call('Pass', 'Play 1NT'),
    call('2C', 'Five hearts or five spades; request correctable 2H', [{ type: 'anyOf', options: [[len('H', 5)], [len('S', 5)]] }], 'P1777', 'puppet-hearts'),
    { ...pairRows[0], source: 'P1778' }, { ...pairRows[1], source: 'P1779' },
    call('2S', 'Unclear source row: P1780 duplicates the club/diamond description', [], 'P1780', 'unresolved'),
    ...describe.filter(row => ['2NT', '3C', '3D'].includes(row.bid)).map(row => ({ ...row, source: 'P1781–P1783' })),
  ];
  else if (node === 'puppet-hearts') rows = [call('2H', 'Correctable preference; responder may pass or bid 2S', [], 'P1777', 'correct-major')];
  else if (node === 'correct-major') rows = [call('Pass', 'Play hearts', [len('H', 5)]), call('2S', 'Correct to five-plus spades', [len('S', 5)], 'P1777', 'final')];
  else if (node === 'respond' && opening === '1NT') rows = [call('Pass', 'Play 1NT'),
    ...describe.filter(row => !['1S', '1NT'].includes(row.bid)).map(row => ({ ...row, facts: ['2C', '2D', '2H', '2S'].includes(row.bid)
      ? [len(['2C', '2H'].includes(row.bid) ? 'S' : 'H', ['2D', '2H'].includes(row.bid) ? 5 : 4, ['2D', '2H'].includes(row.bid) ? 13 : 4)] : row.facts })),
    call('3S', 'Five-five minors', [len('D', 5), len('C', 5)], 'P1828', 'choose-game'), call('3NT', 'Play 3NT', [], 'P1828', 'final')];
  else if (node === 'respond' && opening === '2NT' || node === 'puppet-response') rows = [call('Pass', 'Play 2NT'), call('3C', 'Puppet Stayman', [], 'P1829', 'puppet'),
    call('3D', 'Transfer: five-plus hearts', [len('H', 5)], 'P1830', 'transfer'), call('3H', 'Transfer: five-plus spades', [len('S', 5)], 'P1830', 'transfer'), call('3NT', 'Play 3NT', [], 'Natural game choice', 'final')];
  else if (node === 'puppet') rows = [call('3D', 'One or two four-card majors', [shapeFact(n => Math.max(n.H, n.S) === 4)], 'P1829', 'puppet-four-majors'),
    call('3H', 'Five hearts', [len('H', 5, 5)], 'P1829', 'choose-game'), call('3S', 'Five spades', [len('S', 5, 5)], 'P1829', 'choose-game'),
    call('3NT', 'No four/five-card major', [len('H', 0, 3), len('S', 0, 3)], 'P1829', 'choose-game')];
  else if (node === 'puppet-four-majors') rows = [
    call('3H', 'Four spades', [len('S', 4, 4)], 'P1829; P1330', 'puppet-fit'),
    call('3S', 'Four hearts', [len('H', 4, 4)], 'P1829; P1331', 'puppet-fit'),
    call('3NT', 'Play 3NT', [], 'P1332', 'final'),
    call('4D', 'Four-four majors; choose game', [len('H', 4, 4), len('S', 4, 4)], 'P1334', 'puppet-both'),
  ];
  else if (node === 'puppet-fit') rows = [call('3NT', 'No fit; play 3NT', [len(major, 0, 3)], 'P1330–P1331', 'final'),
    call(`4${major}`, `Four-card ${names[major]} fit; play game`, [len(major, 4, 4)], 'P1330–P1331', 'final')];
  else if (node === 'puppet-both') rows = ['H', 'S'].map(s => call(`4${s}`, `Choose ${names[s]}`, [len(s, 4, 4)], 'P1334', 'final'));
  else if (node === 'transfer') rows = [call(`3${major}`, `Accept the ${names[major]} transfer`, [], 'P1830', 'choose-game'), call(`4${major}`, `Super-accept in ${names[major]}; slam judgement remains yours`, [len(major, 3)], 'P1830', 'final')];
  else if (node === 'natural-rebid') {
    const response = session.auction.at(-1).bid;
    const offered = new Set([opening.slice(1), response.slice(1)]);
    rows = [call('Pass', `Play ${response}`), ...[1, 2, 3].flatMap(level => [...offered].filter(s => names[s]).map(s => call(`${level}${s}`, `Natural ${names[s]} continuation`, [len(s, s === opening.slice(1) ? 4 : 3)], 'Natural continuations; practice policy', 'final'))), ...games()];
    if (opening === '1C' && ['1H', '1S'].includes(response)) rows.push(call('1NT', 'Natural notrump rebid; responder may show a good five-card major', [], 'P1774', 'weak-major-exit'));
  }
  else if (node === 'weak-major-exit') rows = [call('Pass', 'Play 1NT'), call(`2${major}`, 'Good five-card major; to play', [len(major, 5, 5)], 'P1774', 'final')];
  else if (node === 'choose-game') rows = [call('Pass', `Play ${lastBid(session)}`), ...games()];
  else if (node === 'final') rows = [call('Pass', `Play ${lastBid(session)}`), ...games()];
  else rows = [];
  const last = lastBid(session), unique = new Map();
  for (const row of rows) if (row.bid === 'Pass' || !last || bidIndex(row.bid) > bidIndex(last)) if (!unique.has(row.bid)) unique.set(row.bid, row);
  return [...unique.values()];
}

export function applyPassedCall(session, bid) {
  const row = passedActions(session).find(row => row.bid === bid);
  const seat = session.opening.seat;
  const next = { ...session, opening: { ...session.opening }, auction: [...session.auction, { seat, bid,
    meaning: row?.label ?? 'Outside the implemented passed-hand continuation', source: row?.source,
    callAlternatives: passedActions(session).map(({ bid, label }) => ({ bid, label })) }],
    openingFacts: { North: [...session.openingFacts.North], South: [...session.openingFacts.South] },
    openingConstraintsBySeat: { North: [...session.openingConstraintsBySeat.North], South: [...session.openingConstraintsBySeat.South] } };
  if (!row) return pause(next, 'This passed-hand continuation is not yet transcribed. Undo to try a listed source route.');
  const hand = seat === session.playerSeat ? session.playerHand : session.partnerHand;
  if (!matchesConstraints(hand, row.facts, session.trump)) throw new Error(`This call shows: ${row.label}.`);
  if (bid === 'Pass') return terminal(next);
  if (row.next === 'unresolved') return freeze({ ...pause(next, 'P1780 repeats clubs/diamonds already shown by 2H. The intended 2S meaning needs clarification; no shape fact has been invented.'), sourceAmbiguity: true });
  next.openingFacts[seat].push(row.label);
  next.openingConstraintsBySeat[seat].push(...row.facts.map(fact => ({ ...fact, label: row.label, source: row.source })));
  next.constraints = next.openingConstraintsBySeat[next.partnerSeat];
  next.opening = { ...next.opening, node: row.next, seat: seat === 'North' ? 'South' : 'North', shownFacts: row.facts };
  if (session.opening.node === 'respond' && /^1[HS]$/.test(bid)) next.opening.major = bid.slice(1);
  if (session.opening.node === 'transfer') next.opening.major = session.opening.major;
  if ((session.opening.node === 'respond' && ['2NT', '2C'].includes(session.opening.bid) || session.opening.node === 'puppet-response') && ['3D', '3H'].includes(bid)) next.opening.major = bid === '3D' ? 'H' : 'S';
  if (session.opening.node === 'puppet-four-majors' && ['3H', '3S'].includes(bid)) next.opening.major = bid === '3H' ? 'S' : 'H';
  return freeze(next);
}

export function passedPartnerBid({ node, bid, vulnerable, auction, major, hand, shownFacts = [] }) {
  const f = feat(hand), n = f.lengths, minimum = vulnerable ? 7 : 6;
  if (node === 'open') return bid;
  if (node === 'controls') return [0, 1, 4].includes(f.controls) ? '2D' : [2, 5].includes(f.controls) ? '2H' : '2S';
  if (node === 'strong-rebid') return '2NT';
  if (node === 'club-rebid') return f.hcp >= 19 || !f.balanced && f.hcp >= 17 && n.C >= 6 ? '1H' : '1NT';
  if (node === 'describe') return shapeReply(n);
  if (node === 'resolve-pairs') return '2C';
  if (node === 'show-pairs') return pairs(n) === 'HC' ? '2D' : pairs(n) === 'DC' ? '2H' : '2S';
  if (node === 'respond' && bid === '1C') {
    if (f.hcp >= minimum) return '1D';
    if (pairs(n)) return pairs(n) === 'HC' ? '2D' : pairs(n) === 'DC' ? '2H' : '2S';
    if (['2NT', '3C', '3D'].includes(shapeReply(n))) return shapeReply(n);
    return n.H >= 4 && n.H <= 5 ? '1H' : n.S >= 4 && n.S <= 5 ? '1S' : n.C === 5 ? '2C' : '1NT';
  }
  if (node === 'respond' && ['1D', '1H', '1S'].includes(bid)) {
    const trump = bid.slice(1);
    if (f.hcp < 5) return 'Pass';
    if (n[trump] === 3) return n.C >= 5 ? '2C' : trump !== 'D' && n.D >= 5 ? '2D' : trump === 'S' && n.H >= 5 ? '2H' : `2${trump}`;
    if (n[trump] >= 4) return `2${trump}`;
    if (trump === 'D' && n.H >= 4) return '1H';
    if (trump !== 'S' && n.S >= 4) return '1S';
    return trump === 'D' ? 'Pass' : '1NT';
  }
  if (node === 'respond' && bid === '1NT') {
    if (f.hcp < minimum) return 'Pass';
    if (n.D >= 5 && n.C >= 5) return '3S';
    const answer = shapeReply(n); return answer === '1S' ? '3NT' : answer === '1NT' ? '2D' : answer;
  }
  if (node === 'respond' && bid === '2NT' || node === 'puppet-response') return n.H >= 5 ? '3D' : n.S >= 5 ? '3H' : Math.max(n.H, n.S) >= 4 ? '3C' : '3NT';
  if (node === 'puppet') return n.H === 5 ? '3H' : n.S === 5 ? '3S' : Math.max(n.H, n.S) === 4 ? '3D' : '3NT';
  if (node === 'puppet-four-majors') return n.H === 4 && n.S === 4 ? '4D' : n.S === 4 ? '3H' : n.H === 4 ? '3S' : '3NT';
  if (node === 'puppet-fit') return n[major] === 4 ? `4${major}` : '3NT';
  if (node === 'puppet-both') return n.H === 4 ? '4H' : '4S';
  if (node === 'transfer') return `3${major}`;
  if (node === 'escape') {
    if (['2NT', '3C', '3D'].includes(shapeReply(n))) return shapeReply(n);
    return pairs(n) === 'HC' ? '2D' : pairs(n) === 'DC' ? '2H' : pairs(n) === 'HD' ? '2S' : Math.max(n.H, n.S) >= 5 ? '2C' : 'Pass';
  }
  if (node === 'puppet-hearts') return '2H';
  if (node === 'correct-major') return n.H >= 5 ? 'Pass' : '2S';
  if (node === 'weak-major-exit') return n[major] === 5 ? `2${major}` : 'Pass';
  if (node === 'natural-rebid') {
    const response = auction.at(-1).bid, trump = bid.slice(1), suit = response.slice(1);
    if (['H', 'S'].includes(trump) && response !== `2${trump}` && response[0] === '2') return `2${trump}`;
    if (trump === 'D' && response === '2C') return '2D';
    if (['H', 'S'].includes(suit) && response[0] === '1') return n[suit] >= 3 ? `2${suit}` : n[trump] >= (trump === 'D' ? 4 : 5) ? `2${trump}` : '1NT';
    return 'Pass';
  }
  if (node === 'final') return 'Pass';
  if (node === 'choose-game') {
    const previous = auction.at(-1);
    if (previous.seat === 'North' && f.hcp < 4) return 'Pass';
    for (const suit of ['H', 'S']) {
      const promised = Math.max(0, ...shownFacts.map(fact => fact.type === 'length' && fact.suit === suit ? fact.min ?? fact.equals ?? 0
        : fact.type === 'shapes' && fact.values.length ? Math.min(...fact.values.map(shape => Number(shape[suits.indexOf(suit)]))) : 0));
      if (promised >= 5 && n[suit] >= 3 || promised >= 4 && n[suit] >= 4) return `4${suit}`;
    }
    if (previous.seat === 'North' && major && n[major] >= 5) return `4${major}`;
    return bidIndex(previous.bid) >= bidIndex('3NT') ? 'Pass' : '3NT';
  }
  throw new Error('No passed-hand partner action for this public node.');
}

export function createPassedPractice({ seed, humanSeat, openingFamily = 'PH', openingSeatNumber = 3, vulnerable = false } = {}) {
  if (![3, 4].includes(Number(openingSeatNumber))) throw new Error('Choose third or fourth seat.');
  openingSeatNumber = Number(openingSeatNumber); vulnerable = vulnerable === true;
  const rng = makeRng(`passed:${openingFamily}:${openingSeatNumber}:${vulnerable}:${seed}`);
  const choices = ['1C', '1D', '1H', '1S', '1NT', '2NT', '2C'];
  const selected = openingFamily.slice(3);
  const bid = openingFamily === 'PH' ? choices[Math.floor(rng() * choices.length)] : selected === 'M' ? rng() < 0.5 ? '1H' : '1S' : selected === 'NT' ? '1NT' : ['2NT', '2C'].includes(selected) ? selected : `1${selected}`;
  const drawnHumanSeat = rng() < 0.5 ? 'North' : 'South';
  humanSeat ??= drawnHumanSeat;
  if (!['North', 'South'].includes(humanSeat) || !choices.includes(bid)) throw new Error('Choose a supported passed-hand opening and seat.');
  const maxPassed = bid === '1C' || ['1NT', '2NT', '2C'].includes(bid) ? vulnerable ? 9 : 8 : 8;
  const strong = ({ '1NT': [20, 21], '2NT': [22, 23], '2C': [24, 25] })[bid];
  const forceClub = bid === '1C' && rng() < 0.4;
  for (let attempt = 0; attempt < 750000; attempt++) {
    const deck = [...DECK];
    for (let i = 0; i < 26; i++) { const j = i + Math.floor(rng() * (52 - i)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const north = deck.slice(0, 13), south = deck.slice(13, 26), n = feat(north), s = feat(south);
    if (s.hcp > maxPassed || Math.max(...Object.values(s.lengths)) > 7) continue;
    if (strong ? n.hcp < strong[0] || n.hcp > strong[1] || !['4333', '4432', '5332'].includes(n.shape.join(''))
      : n.hcp < (bid === '1C' && openingSeatNumber === 4 ? 13 : 9) || n.hcp > 19 || forceClub && n.hcp !== 19) continue;
    if (!strong && (bid === '1C' ? !n.balanced && n.lengths.C < 5 : bid === '1D' ? n.lengths.D < 4 || n.balanced && n.lengths.D < 6 : n.lengths[bid.slice(1)] < 5)) continue;
    const constraints = [hcp(0, maxPassed)];
    return freeze({ familyId: 'opening-passed', systemId: 'outback-acol', seed: String(seed),
      playerSeat: 'North', partnerSeat: 'South', playerHand: north, partnerHand: south,
      practiceRole: humanSeat === 'North' ? 'asker' : 'teller', major: strong ? 'C' : bid.slice(1), trump: strong ? 'C' : bid.slice(1),
      dealerSeat: openingSeatNumber === 3 ? 'South' : 'East',
      auction: [{ seat: 'South', bid: 'Pass', meaning: `Passed hand, at most ${maxPassed} HCP in this practice subset` }], constraints,
      openingFacts: { North: [], South: [`Passed hand; at most ${maxPassed} HCP in this practice subset`] },
      openingConstraintsBySeat: { North: [], South: constraints },
      wholeAuction: { rulesVersion: 1, passedRulesVersion: PASSED_RULES_VERSION, passedHand: true, humanSeat, openingBid: bid, openingFamily, openingSeatNumber, vulnerable },
      opening: { system: 'passed', node: 'open', seat: 'North', bid, vulnerable, major: null },
      phase: 'opening', pendingAsk: null, finished: false, revealed: false, contract: null });
  }
  throw new Error('No passed-hand deal found in the generation limit. Try another seed.');
}

export function validatePassedSession(session) {
  if (session.wholeAuction?.passedRulesVersion !== PASSED_RULES_VERSION || ![3, 4].includes(session.wholeAuction.openingSeatNumber)
    || !['North', 'South'].includes(session.wholeAuction.humanSeat) || session.auction[0]?.seat !== 'South' || session.auction[0]?.bid !== 'Pass') throw new Error('Saved passed-hand practice is incompatible.');
  if (session.opening && (session.opening.system !== 'passed' || session.opening.bid !== session.wholeAuction.openingBid || !passedActions(session).length))
    throw new Error('Saved opening node is invalid.');
  if (session.opening && !session.finished && session.opening.seat !== session.wholeAuction.humanSeat) throw new Error('Saved passed-hand turn is invalid.');
}
