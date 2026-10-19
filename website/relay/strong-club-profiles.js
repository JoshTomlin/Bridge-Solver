// Word P0402–P0436; balanced 3NT and unbalanced 16+ confirmed by the user.
import { SUITS, hcp, length, anyOf } from './profile-utils.js';
import { shapeSet, oneShortage, shortageResponses, singleSuitShortageResponses, explicitKeycardResponses, fit, prefix, name } from './source-utils.js';

const unbalanced = n => n.C >= 5 && oneShortage(n, ['C']) && SUITS.some(s => n[s] <= 1);
const rows = [
  { bid: '2H', label: 'Spade shortage; five-plus clubs and two/three diamonds',
    fact: shapeSet(n => unbalanced(n) && n.S <= 1 && n.D >= 2 && n.D <= 3 && n.H <= 4), short: 'S', node: 'major-shortage' },
  { bid: '2S', label: 'Heart shortage; five-plus clubs and two/three diamonds',
    fact: shapeSet(n => unbalanced(n) && n.H <= 1 && n.D >= 2 && n.D <= 3 && n.S <= 4), short: 'H', node: 'major-shortage' },
  { bid: '3C', label: 'Long clubs, diamond shortage',
    fact: shapeSet(n => unbalanced(n) && n.D <= 1 && n.S <= 4 && n.H <= 4), node: 'clubs-shortage' },
  { bid: '3D', label: 'Five-plus clubs and four-plus diamonds',
    fact: shapeSet(n => unbalanced(n) && n.D >= 4 && n.S <= 3 && n.H <= 3), node: 'minors-shortage' },
  ...['H', 'S'].map(suit => ({ bid: `3${suit}`, label: `Six-plus clubs and five ${name(suit)}`,
    fact: shapeSet(n => unbalanced(n) && n.C >= 6 && n[suit] === 5), second: suit, node: `major-${suit}` })),
];
const balanced = [{ type: 'balanced', value: true }, length('S', 2, 4), length('H', 2, 4), length('C', 2, 7)];

export const STRONG_CLUB_PROFILES = [{
  id: 'club-1s-2c-2d', name: '1C–1S–2C–2D · strong-hand descriptions', family: 'Club relays',
  source: 'Word P0402–P0436; subsequent partnership clarification', defaultTrump: 'C', playerSeat: 'South', partnerSeat: 'North',
  initialAuction: prefix(['1C', '1S', '2C']),
  partnerConstraints: [{ ...anyOf([hcp(16, 20), ...balanced], ...rows.map(row => [hcp(16, 22), row.fact])),
    label: 'Opener: 16–20 balanced, or 16–22 in the listed unbalanced club families' }],
  playerConstraints: [hcp(10, 20), length('S', 0, 3), length('H', 0, 3), length('C', 4, 6), length('D', 4, 6)],
  startNode: 'resolve', nodes: {
    resolve: { label: 'Resolve the strong club rebid', help: '2D requests 3NT. Balanced hands bid 3NT; 16+ unbalanced hands describe shape.', actions: [{
      bid: '2D', label: 'Request 3NT or the strong unbalanced description', kind: 'relay', responses: [
        ...rows.map(row => ({ bid: row.bid, label: `16+ HCP; ${row.label.toLowerCase()}`, constraints: [hcp(16, 22), { ...row.fact, label: row.label }],
          nextNode: row.node, state: { balanced: false, shortageSuit: row.short ?? null } })),
        { bid: '3NT', label: '16–20 HCP, balanced', constraints: [hcp(16, 20), ...balanced],
          phase: 'unsupported', state: { balanced: true, shortageSuit: null, threeNTToPlay: true },
          unsupportedReason: 'Balanced strength resolved. Pass 3NT or choose a final contract; the separate responder 5332 continuation is not included here.' },
      ],
    }] },
    'major-shortage': session => ({ label: 'Choose the minor', help: '3C asks SKC in clubs. 3D shows five diamonds; opener needs three for SKC.', actions: [
      { bid: '3C', kind: 'keycard', trump: 'C', shortageSuit: session.shortageSuit, label: 'Shortage Keycard in clubs' },
      { bid: '3D', kind: 'relay', label: 'Show five diamonds and ask SKC if opener has three', playerConstraints: [length('D', 5, 6)], responses: [
        ...explicitKeycardResponses('3D', 'D', session.shortageSuit, [length('D', 3)], ['3NT']).slice(0, 2),
        { bid: '3NT', label: 'Two diamonds; to play', constraints: [length('D', 2)], nextNode: 'diamond-doubleton', state: { threeNTToPlay: true } },
        ...explicitKeycardResponses('3D', 'D', session.shortageSuit, [length('D', 3)], ['3NT']).slice(2),
      ] },
    ] }),
    'diamond-doubleton': { label: 'Diamonds did not fit', help: 'Opener has shown a doubleton diamond and offered 3NT.', actions: [] },
    'clubs-shortage': { label: 'Agree clubs and ask shortage', help: 'The source uses 3D as the club shortage enquiry.', actions: [{
      bid: '3D', label: 'Agree clubs and ask shortage', kind: 'relay', state: fit('C'),
      responses: singleSuitShortageResponses('C'),
    }] },
    'minors-shortage': { label: 'Choose a minor and ask shortage', help: '3H agrees clubs; 3S agrees diamonds.', actions: ['C', 'D'].map((trump, i) => ({
      bid: i ? '3S' : '3H', label: `Agree ${name(trump)} and ask shortage`, kind: 'relay', state: fit(trump),
      responses: shortageResponses(['C', 'D'], trump, { allowNone: false }),
    })) },
    ...Object.fromEntries(['H', 'S'].map(second => [`major-${second}`, {
      label: 'Agree a suit and ask shortage', help: '3NT is to play. The next two steps agree clubs or the shown major.',
      actions: ['C', second].map((trump, i) => ({ bid: i ? '4D' : '4C', label: `Agree ${name(trump)} and ask shortage`, kind: 'relay', state: fit(trump),
        responses: shortageResponses(['C', second], trump, { allowNone: false }),
      })),
    }])),
  },
  assumptions: [
    'Balanced opener always bids 3NT, including 19/20; the user clarification supersedes the older 2NT supermaximum exception.',
    'The user confirmed 16+ for the unbalanced route. Practice caps are 20 balanced and 22 unbalanced; responder has both minors and no four-card major.',
    'The strong schedule retains 2H/2S major shortages, relocates two-minor hands to 3D, and uses 3C for the remaining diamond-short club hands. Responses retain their known shape facts.',
    'The single-club shortage enquiry uses the system’s middle/high/low order; the restricted prefix already excludes the impossible shortage categories.',
  ],
  limitations: ['Four-club 4414 opening exceptions and hands with two shortages are excluded. The separate reordering document applies to natural one-level suit responses, so it does not alter this artificial 1C–1S entry.'],
}];
