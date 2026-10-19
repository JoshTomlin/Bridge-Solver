// Reusable declarative facts for the source-based relay families.
import { SUITS, SUIT_NAMES, length, shapes, anyOf, nextBid, bidIndex } from './profile-utils.js';
import { keycardAction } from './continuations.js';

export const SHAPES = [];
for (let S = 0; S <= 9; S += 1) for (let H = 0; H <= 9; H += 1) {
  for (let D = 0; D <= 9; D += 1) {
    const C = 13 - S - H - D;
    if (C >= 0 && C <= 9) SHAPES.push({ S, H, D, C });
  }
}
export const shapeSet = predicate => shapes(...SHAPES.filter(predicate).map(n => SUITS.map(s => n[s]).join('')));
export const oneShortage = (n, known) => SUITS.filter(s => !known.includes(s) && n[s] <= 1).length <= 1;
export const game = trump => `${['C', 'D'].includes(trump) ? 5 : 4}${trump}`;
export const kickback = trump => ({ C: '4D', D: '4H', H: '4S', S: '4NT' })[trump];
export const fit = (trump, extra = {}) => ({ trump, major: trump, agreementOptions: [],
  relayPolicy: { skip3NT: true, skipMajorGame: ['H', 'S'].includes(trump) }, ...extra });
export const prefix = bids => bids.map((bid, i) => ({ seat: i % 2 ? 'South' : 'North', bid, meaning: 'Source-defined relay entry' }));
export const name = suit => SUIT_NAMES[suit].toLowerCase();

/** NHL/HL is relative to the two suits that have not already been shown. */
export function shortageResponses(knownSuits, trump, { allowNone = true, state = {}, nextNode, phase = 'keycard' } = {}) {
  const [high, low] = SUITS.filter(s => !knownSuits.includes(s));
  const answer = (label, constraints, shortageSuit) => ({ label, constraints, ...(nextNode ? { nextNode } : { phase }),
    state: fit(trump, { balanced: shortageSuit === null, shortageSuit, threeNTToPlay: false, ...state }) });
  return [
    ...(allowNone ? [answer('No shortage', [length(high, 2, 13), length(low, 2, 13)], null)] : []),
    answer(`High shortage: ${name(high)}`, [length(high, 0, 1), length(low, 2, 13)], high),
    answer(`Low shortage: ${name(low)}`, [length(low, 0, 1), length(high, 2, 13)], low),
  ];
}

export function singleSuitShortageResponses(trump) {
  const [high, middle, low] = SUITS.filter(s => s !== trump);
  return [middle, high, low].map(suit => ({ label: `${name(suit)} shortage`,
    constraints: [length(suit, 0, 1), ...SUITS.filter(s => s !== trump && s !== suit).map(s => length(s, 2, 13))],
    phase: 'keycard', state: fit(trump, { shortageSuit: suit, balanced: false, threeNTToPlay: false }),
  }));
}

/** Encode source asks whose answer ladder skips a separately reserved call. */
export function explicitKeycardResponses(bid, trump, shortageSuit, extra = [], skip = []) {
  const action = keycardAction({ trump, shortageSuit }, bid, trump);
  let answerBid = bid;
  return action.responseLadder.map(answer => {
    do { answerBid = nextBid(answerBid); } while (skip.includes(answerBid));
    return { bid: answerBid, label: answer.label,
      constraints: [...extra,
        { type: 'length', suit: shortageSuit, equals: answer.void ? 0 : 1 },
        ...(answer.values ? [{ type: 'keycardOptions', trump, values: answer.values, label: answer.label }] : []),
        ...(answer.queen !== undefined ? [{ type: 'trumpQueen', trump, value: answer.queen, label: answer.queen ? 'Has the trump queen' : 'No trump queen' }] : []),
      ], phase: answer.void ? 'void-keycard' : 'post-keycard',
      state: fit(trump, { shortageSuit, balanced: false }),
    };
  });
}

export const control = suit => anyOf([{ type: 'card', suit, rank: 'A' }], [{ type: 'card', suit, rank: 'K' }], [length(suit, 0, 1)]);
export const noControl = suit => [{ type: 'card', suit, rank: 'A', present: false }, { type: 'card', suit, rank: 'K', present: false }, length(suit, 2, 13)];

/** A disclosed cheapest-control practice policy after a forcing agreement. */
export function cueResponses(agreement, trump, nextNode = 'kickback') {
  const responses = [];
  const denied = [];
  for (let bid = nextBid(agreement); bid && bidIndex(bid) < bidIndex(game(trump)); bid = nextBid(bid)) {
    if (trump === 'H' && bid === '3S') continue;
    const suit = trump === 'H' && bid === '3NT' ? 'S' : bid.slice(1);
    if (suit === 'NT' || suit === trump) continue;
    responses.push({ bid, label: `Control in ${name(suit)}`, constraints: [...denied, control(suit)], nextNode,
      state: fit(trump, { requireAgreement: false }) });
    denied.push(...noControl(suit));
  }
  responses.push({ bid: game(trump), label: 'No cheaper control cue; game in the agreed suit', constraints: denied,
    nextNode, state: fit(trump, { requireAgreement: false }) });
  return responses;
}
