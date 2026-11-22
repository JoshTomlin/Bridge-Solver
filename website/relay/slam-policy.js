// Bot decisions only. Human asking calls and source response ladders stay free.
// Inputs contain the asker's own hand and public facts, never partner's cards.
import { DECK, handFeatures, bidIndex } from './core.js';
import { publicLengthBounds } from './continuations.js';

const SUITS = ['S', 'H', 'D', 'C'];
const points = card => ({ A: 4, K: 3, Q: 2, J: 1 })[card[1]] ?? 0;
const controls = card => card[1] === 'A' ? 2 : card[1] === 'K' ? 1 : 0;
const between = (n, c) => (c.min === undefined || n >= c.min) && (c.max === undefined || n <= c.max) && (c.equals === undefined || n === c.equals);
const intersects = (min, max, c) => min <= (c.equals ?? c.max ?? Infinity) && max >= (c.equals ?? c.min ?? -Infinity);
const someFact = (facts, predicate) => facts.some(c => predicate(c) || c.type === 'anyOf' && c.options.some(branch => someFact(branch, predicate)));

function permits(c, model, trump) {
  const sameTrump = (c.trump ?? trump) === trump;
  switch (c.type) {
    case 'anyOf': return c.options.some(branch => branch.every(fact => permits(fact, model, trump)));
    case 'keycards': return !sameTrump || between(model.keycards, c);
    case 'keycardOptions': return !sameTrump || c.values.includes(model.keycards);
    case 'trumpQueen': return !sameTrump || model.queen === c.value;
    case 'hcp': return intersects(...model.hcp, c);
    case 'controls': return intersects(...model.controls, c);
    case 'card': {
      const card = c.suit + c.rank;
      return c.present === false ? !model.required.has(card) : model.available.has(card);
    }
    // Honour presence must fit even in a known void/singleton. Other shape
    // correlations remain over-approximated; they cannot invent extra certainty.
    case 'length': return intersects(model.suitRequired[c.suit], model.suitAvailable[c.suit], c);
    case 'shapes': return c.values.some(shape => SUITS.every((s, i) => Number(shape[i]) >= model.suitRequired[s] && Number(shape[i]) <= model.suitAvailable[s]));
    default: return true;
  }
}

/** At most 64 honour patterns: five keycards and the trump queen. This is
 * a conservative public inference, not an enumeration or sampling of deals.
 * HCP/control bounds and the asker's cards can resolve 0/3 or 1/4 replies. */
export function slamKnowledge({ hand, trump, constraints = [] }) {
  const own = handFeatures(hand, trump), known = new Set(hand);
  const honours = [...SUITS.map(s => `${s}A`), `${trump}K`, `${trump}Q`];
  const unseen = DECK.filter(card => !known.has(card));
  const models = [];
  for (let mask = 0; mask < 64; mask++) {
    const required = new Set(honours.filter((_, i) => mask & (1 << i)));
    if ([...required].some(card => known.has(card))) continue;
    const absent = new Set(honours.filter(card => !required.has(card)));
    const available = new Set(unseen.filter(card => !absent.has(card)));
    const slots = 13 - required.size;
    const optional = [...available].filter(card => !required.has(card));
    if (slots < 0 || optional.length < slots) continue;
    const bounds = score => {
      const base = [...required].reduce((n, card) => n + score(card), 0);
      const sorted = optional.map(score).sort((a, b) => a - b);
      return [base + sorted.slice(0, slots).reduce((a, b) => a + b, 0),
        base + sorted.slice(sorted.length - slots).reduce((a, b) => a + b, 0)];
    };
    const model = { required, available, queen: required.has(`${trump}Q`),
      keycards: honours.slice(0, 5).filter(card => required.has(card)).length,
      hcp: bounds(points), controls: bounds(controls),
      suitRequired: Object.fromEntries(SUITS.map(s => [s, [...required].filter(card => card[0] === s).length])),
      suitAvailable: Object.fromEntries(SUITS.map(s => [s, [...available].filter(card => card[0] === s).length])) };
    if (constraints.every(c => permits(c, model, trump))) models.push({
      keycards: own.keycards + model.keycards, queen: own.trumpQueen || model.queen,
      score: own.keycards + model.keycards + (own.trumpQueen || model.queen ? 0.5 : 0),
    });
  }
  return { models, minimum: Math.min(...models.map(m => m.score)), maximum: Math.max(...models.map(m => m.score)),
    minimumKeycards: Math.min(...models.map(m => m.keycards)), queenUnknown: new Set(models.map(m => m.queen)).size > 1 };
}

function factPromisesThird(c, suit) {
  if (c.type === 'anyOf') return c.options.every(branch => branch.some(fact => factPromisesThird(fact, suit)));
  if (c.type === 'shapes') return c.values.length > 0 && c.values.every(shape => Number(shape[SUITS.indexOf(suit)]) <= 2);
  if (c.suit !== suit) return false;
  if (c.type === 'length') return (c.equals ?? c.max ?? 13) <= 2;
  if (c.type === 'card') return c.rank === 'Q' && c.present !== false;
  return c.type === 'suitResponse' && ['third', 'kDoubleton', 'kq'].includes(c.category);
}

function finalAction(actions, auction, trump, level) {
  const last = auction.findLast(call => call.bid !== 'Pass')?.bid;
  const pass = actions.find(a => a.kind === 'signoff' && a.bid === 'Pass');
  // Never manufacture a grand because a high answer has passed the six level.
  if (last?.slice(1) === trump && Number(last[0]) >= level && Number(last[0]) <= (level === 7 ? 7 : 6)) return pass;
  return actions.filter(a => a.kind === 'signoff' && a.bid !== 'Pass' && a.bid.slice(1) === trump
    && Number(a.bid[0]) >= level && Number(a.bid[0]) <= (level === 7 ? 7 : level === 6 ? 6 : 5))
    .sort((a, b) => bidIndex(a.bid) - bidIndex(b.bid))[0] ?? pass;
}

/** null means the source-order policy still applies before keycard. */
export function slamAction({ hand, trump, phase, constraints, actions, auction }) {
  if (!['post-keycard', 'suit-ask', 'unsupported'].includes(phase)
      || !someFact(constraints, c => ['keycards', 'keycardOptions'].includes(c.type) && (c.trump ?? trump) === trump)) return null;
  const game = ['C', 'D'].includes(trump) ? 5 : 4;
  const stop = level => finalAction(actions, auction, trump, level);
  const knowledge = slamKnowledge({ hand, trump, constraints });
  if (!knowledge.models.length) return stop(game);
  // The queen ask is still useful with four or five keycards. Side-suit
  // enquiries are grand tries, and cannot substitute for a missing queen.
  if (knowledge.minimumKeycards >= 4 && knowledge.queenUnknown) {
    const queen = actions.find(a => a.askType === 'queen');
    if (queen) return queen;
  }
  if (knowledge.minimum < 4.5) return stop(game);
  if (knowledge.minimum < 5.5) return stop(6);

  const own = handFeatures(hand, trump);
  const lengths = publicLengthBounds({ trump, constraints });
  const needs = SUITS.filter(s => s !== trump && own.lengths[s] > 2 && !hand.includes(`${s}Q`)
    && lengths[s].max > 2 && !constraints.some(c => factPromisesThird(c, s)));
  if (!needs.length) return stop(7);
  // Kxx without the queen and with both hands long does not promise the
  // third round. A negative grand try ends the investigation at six.
  if (needs.some(s => someFact(constraints, c => c.type === 'suitResponse' && c.suit === s))) return stop(6);
  return actions.find(a => a.askType === 'suit' && needs.includes(a.askSuit)) ?? stop(6);
}
