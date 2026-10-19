/**
 * Source-confirmed shape/range rules within an explicitly restricted practice
 * universe. Paragraph references identify the supplied partnership notes.
 * Do not treat a successful practice auction as validation of the real system.
 * Bidding meanings live here so confirmed notes can replace draft assumptions.
 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const SYSTEM = deepFreeze({
  id: 'source-major-relay-v2',
  name: '1M–2NT · source-based training subset',
  status: 'provisional',
  verified: false,
  opening: { minHcp: 9, maxHcp: 19, minMajorLength: 5 },
  responder: { minHcp: 12, minMajorLength: 4 },
  training: { maxSideSuitLength: 4, maxShortages: 1, minBalancedHcp: 13 },
  raise: '2NT',
  shapeResponses: [
    { bid: '3C', shape: 'balanced', label: 'Balanced: no singleton or void', source: 'P0063, P1470' },
    { bid: '3D', shortage: 'middle', label: 'Middle shortage', source: 'P1471' },
    { bid: '3H', shortage: 'high', label: 'High shortage', source: 'P1472' },
    { bid: '3S', shortage: 'low', label: 'Low shortage', rollsRange: true, source: 'P1475' },
  ],
  shortageSuits: {
    S: { high: 'H', middle: 'D', low: 'C' },
    H: { high: 'S', middle: 'D', low: 'C' },
  },
  ranges: [
    { min: 9, max: 11, label: '9–11 HCP' },
    { min: 12, max: 14, label: '12–14 HCP' },
    { min: 15, max: 17, label: '15–17 HCP' },
    { min: 18, max: 19, label: '18–19 HCP' },
  ],
  rangeAsk: { method: 'next-legal-bid', skip3NTWhenBalanced: true, skipMajorGame: true, source: 'P1476–P1477' },
  rangeResponses: { method: 'successive-legal-bids', skip3NT: false, skipMajorGame: false, source: 'P1475–P1476' },
  assumptions: [
    'Shape and range answers use the supplied notes (P0063, P1467–P1477). This is a first/second-seat, unopposed training subset, not a complete opening-bid judgement model.',
    'Practice openers have 9–19 HCP, at least five cards in the opened major, no side suit longer than four cards, and zero or one side-suit shortages. Hands with no shortage must have at least 13 HCP. These restrictions are disclosed to the sampler.',
    'Practice responders have at least four cards in the opened major and at least 12 HCP. The notes specify game-forcing values; the exact HCP floor is a training choice.',
    'Side suits are ranked high/middle/low after removing the opened major: hearts/diamonds/clubs over spades, and spades/diamonds/clubs over hearts.',
    'Low shortage already shows range: 3S = 9–11, 3NT = 12–14, 4C = 15–17, 4D = 18–19. Balanced, middle and high shortage use a separate range ask (P1475–P1476).',
    'Relay asks reserve 3NT for a balanced hand and reserve game in the opened major. Range answers count every legal bid, including 4M; the partnership confirmed the 4M omission applies only to asks (P1477).',
    'After a balanced range, ordinary keycard omits the impossible void response. The partnership confirmed 0/3, 1/4, 2/5 without the trump queen, and 2/5 with the trump queen; shortage hands first have the additional void step.',
    'Opponents pass throughout and partner passes a selected final contract. All compatible hands are sampled uniformly within the disclosed training restrictions, with no additional bidding-style model.',
  ],
  limitations: [
    'The direct 4M answer showing 9–10 balanced with a great suit (P1474) is excluded by the training filter until suit-quality judgement is agreed.',
    'Two-shortage hands and hands with a five-card side suit are outside this training subset. Weak-NT, preempt and singleton-honour opening choices remain judgemental.',
    'Later asks are limited to the supplied response tables; undefined answers stop the relay with an explanation.',
  ],
});

export const SYSTEM_PROFILE = SYSTEM;
export const DRAFT_SYSTEM = SYSTEM;
