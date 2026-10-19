import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK, SUITS, RANKS, makeRng, handFeatures, matchesConstraints,
  createPractice, availableActions, applyBid, revealPractice,
  sampleCompatible, compatibleShapeWeights, bidIndex, nextBid, stepBid,
} from './core.js';
import { SYSTEM } from './system.js';

const cases = new Map();
const searched = { S: 0, H: 0 };
function example(major, shape, rangeIndex) {
  const requested = `${major}:${shape}:${rangeIndex}`;
  if (cases.has(requested)) return cases.get(requested);
  for (; searched[major] < 4000;) {
    const initial = createPractice({ major, seed: `source-case-${searched[major]++}` });
    const features = handFeatures(initial.partnerHand, major);
    const range = features.hcp <= 11 ? 0 : features.hcp <= 14 ? 1 : features.hcp <= 17 ? 2 : 3;
    const shortSuit = SUITS.find(suit => suit !== major && features.lengths[suit] <= 1);
    const branch = features.balanced ? 'balanced' : shortSuit === 'C' ? 'low' : shortSuit === 'D' ? 'middle' : 'high';
    const key = `${major}:${branch}:${range}`;
    cases.set(key, initial);
    if (key === requested) return initial;
  }
  throw new Error(`No deterministic fixture found for ${requested}.`);
}

function rangeResponse(initial) {
  const shape = applyBid(initial, '2NT');
  if (shape.phase !== 'range') return shape;
  return applyBid(shape, availableActions(shape).find(action => action.kind === 'relay').bid);
}

test('deck and feature extraction use bridge ranks, HCP, controls and major keycards', () => {
  assert.equal(DECK.length, 52);
  assert.equal(new Set(DECK).size, 52);
  assert.equal(SUITS.length * RANKS.length, 52);
  const hand = 'SA SK SQ S5 S2 HA H3 H2 DA D2 CA C3 C2'.split(' ');
  const features = handFeatures(hand, 'S');
  assert.deepEqual(features.lengths, { S: 5, H: 3, D: 2, C: 3 });
  assert.equal(features.hcp, 21);
  assert.equal(features.controls, 9);
  assert.equal(features.keycards, 5);
  assert.equal(features.trumpQueen, true);
  assert.equal(features.balanced5332, true);
  assert.equal(handFeatures(hand, 'H').keycards, 4);
  assert.equal(handFeatures(hand, 'H').trumpQueen, false);
  assert.throws(() => handFeatures([...hand.slice(1), 'SK'], 'S'), /distinct/);
  assert.equal(handFeatures(hand, 'D').keycards, hand.filter(card => card[1] === 'A' || card === 'DK').length);
  assert.throws(() => handFeatures(hand, 'NT'), /Trump/);
});

test('constraint predicates support exact strengths, disjunctive keycards and honours', () => {
  const hand = 'SA SK SQ S5 S2 HA H3 H2 DA D2 CA C3 C2'.split(' ');
  const constraints = [
    { type: 'hcp', equals: 21 }, { type: 'controls', min: 8, max: 9 },
    { type: 'keycards', equals: 5 }, { type: 'keycardOptions', values: [2, 5] },
    { type: 'trumpQueen', value: true }, { type: 'length', suit: 'D', max: 2 },
    { type: 'balanced', value: true },
  ];
  assert.equal(matchesConstraints(hand, constraints, 'S'), true);
  for (const failing of [
    { type: 'hcp', max: 20 }, { type: 'controls', min: 10 },
    { type: 'keycards', equals: 4 }, { type: 'keycardOptions', values: [1, 4] },
    { type: 'trumpQueen', value: false }, { type: 'balanced', value: false },
  ]) assert.equal(matchesConstraints(hand, [...constraints, failing], 'S'), false);
  assert.throws(() => matchesConstraints(hand, [{ type: 'madeUp' }], 'S'), /Unknown constraint/);
});

test('system balanced includes 6–3–2–2; the sampler uses explicit training restrictions', () => {
  const balanced = 'SA SK SQ SJ S9 S8 HA H2 D9 D2 C9 C2 C3'.split(' ');
  assert.equal(handFeatures(balanced, 'S').balanced, true);
  assert.equal(handFeatures(balanced, 'S').balanced5332, false);
  const initial = createPractice({ major: 'S', seed: 'training' });
  assert.equal(matchesConstraints(balanced, initial.constraints, 'S'), true);
  const weakBalanced = 'SA S6 S5 S4 S3 S2 HA H2 DJ D2 C9 C2 C3'.split(' ');
  assert.equal(handFeatures(weakBalanced, 'S').hcp, 9);
  assert.equal(matchesConstraints(weakBalanced, initial.constraints, 'S'), false);
  const twoShortages = 'SA SK SQ SJ S9 S8 S7 S6 HA DA C9 C2 C3'.split(' ');
  assert.equal(matchesConstraints(twoShortages, initial.constraints, 'S'), false);
  const longSide = 'SA SK SQ S3 S2 HA H2 C9 C8 C7 C6 C5 C2'.split(' ');
  assert.equal(matchesConstraints(longSide, initial.constraints, 'S'), false);
  const allowedVoid = 'SA SK SQ SJ S9 S8 HA H3 H2 C9 C4 C3 C2'.split(' ');
  assert.equal(matchesConstraints(allowedVoid, initial.constraints, 'S'), true);
  assert.equal(initial.training.minBalancedHcp, 13);
  assert.equal(initial.training.maxSideSuitLength, 4);
});

test('seeded generation repeats immutable deals, conserves cards and hides undisclosed facts', () => {
  const rng1 = makeRng('repeat');
  const rng2 = makeRng('repeat');
  assert.deepEqual(Array.from({ length: 20 }, rng1), Array.from({ length: 20 }, rng2));
  const first = createPractice({ major: 'S', seed: 'fixed deal' });
  assert.deepEqual(first, createPractice({ major: 'S', seed: 'fixed deal' }));
  assert.notDeepEqual(first.partnerHand, createPractice({ major: 'S', seed: 'other deal' }).partnerHand);
  assert.equal(new Set([...first.playerHand, ...first.partnerHand]).size, 26);
  assert.equal(first.playerHand.length, 13);
  assert.equal(first.partnerHand.length, 13);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.partnerHand), true);
  assert.equal(Object.isFrozen(first.constraints[0]), true);
  assert.throws(() => first.partnerHand.push('D2'), TypeError);
  assert.equal(first.revealed, false);
  assert.equal(first.balanced, null);
  assert.equal(first.shortageSuit, null);
  assert.equal(first.rangeIndex, null);
  const other = createPractice({ major: 'S', seed: 'other deal' });
  assert.deepEqual(first.constraints, other.constraints);
  assert.deepEqual(first.training, other.training);
});

test('low-shortage strength rolls into the first answer for both majors', () => {
  for (const major of ['S', 'H']) {
    for (const [rangeIndex, expectedBid] of ['3S', '3NT', '4C', '4D'].entries()) {
      const initial = example(major, 'low', rangeIndex);
      const before = JSON.stringify(initial);
      const response = applyBid(initial, '2NT');
      assert.equal(response.auction.length, 3);
      assert.equal(response.auction.at(-1).bid, expectedBid);
      assert.equal(response.phase, 'keycard');
      assert.equal(response.shortageSuit, 'C');
      assert.equal(response.rangeIndex, rangeIndex);
      assert.equal(response.constraints.at(-1).label, ['9–11 HCP', '12–14 HCP', '15–17 HCP', '18–19 HCP'][rangeIndex]);
      assert.equal(matchesConstraints(response.partnerHand, response.constraints, major), true);
      assert.deepEqual(response.partnerHand, initial.partnerHand);
      assert.equal(JSON.stringify(initial), before);
      assert.equal(availableActions(response).some(action => action.label.includes('HCP range')), false);
    }
  }
});

test('balanced, middle and high shortage use source-defined range ladders', () => {
  const ladders = {
    balanced: { shapeBid: '3C', ask: '3D', answers: ['3H', '3S', '3NT', '4C'] },
    middle: { shapeBid: '3D', ask: '3H', answers: ['3S', '3NT', '4C', '4D'] },
    high: { shapeBid: '3H', ask: '3S', answers: ['3NT', '4C', '4D', '4H'] },
  };
  for (const major of ['S', 'H']) {
    for (const [branch, ladder] of Object.entries(ladders)) {
      for (let rangeIndex = branch === 'balanced' ? 1 : 0; rangeIndex < 4; rangeIndex += 1) {
        const initial = example(major, branch, rangeIndex);
        const shape = applyBid(initial, '2NT');
        assert.equal(shape.auction.at(-1).bid, ladder.shapeBid);
        assert.equal(shape.phase, 'range');
        assert.equal(shape.rangeIndex, null);
        assert.equal(shape.balanced, branch === 'balanced');
        assert.equal(shape.shortageSuit, branch === 'balanced' ? null : branch === 'middle' ? 'D' : major === 'S' ? 'H' : 'S');
        assert.equal(availableActions(shape).find(action => action.kind === 'relay').bid, ladder.ask);
        const response = applyBid(shape, ladder.ask);
        assert.equal(response.auction.at(-1).bid, ladder.answers[rangeIndex]);
        assert.equal(matchesConstraints(response.partnerHand, response.constraints, major), true);
        assert.equal(response.phase, 'keycard');
        assert.equal(response.unsupportedReason, null);
      }
    }
  }
});

test('3NT and game are contextual relay steps; opener may answer 4M', () => {
  assert.equal(SYSTEM.rangeResponses.skipMajorGame, false);
  assert.equal(nextBid('3S'), '3NT');
  assert.equal(stepBid('3S', 1, { skip3NT: true }), '4C');
  assert.equal(stepBid('4D', 1, { skipMajorGame: true, major: 'H' }), '4S');
  assert.equal(stepBid('4H', 1, { skipMajorGame: true, major: 'S' }), '4NT');
  assert.equal(stepBid('3S', 4, { skip3NT: true, skipMajorGame: true, major: 'H' }), '4NT');
  assert.equal(stepBid('7S', 2, { skip3NT: true }), null);
  assert.throws(() => stepBid('3S', 0), /positive integer/);
  const low = applyBid(example('S', 'low', 0), '2NT');
  assert.equal(availableActions(low).find(action => action.bid === '3NT').kind, 'relay');
  const balanced = applyBid(example('S', 'balanced', 1), '2NT');
  assert.equal(availableActions(balanced).find(action => action.bid === '3NT').kind, 'signoff');
  const balancedRange = applyBid(balanced, '3D');
  assert.equal(balancedRange.auction.at(-1).bid, '3S');
  assert.equal(availableActions(balancedRange).find(action => action.bid === '3NT').kind, 'signoff');
  assert.equal(availableActions(balancedRange).find(action => action.kind === 'relay').bid, '4C');
  const highHeart = rangeResponse(example('H', 'high', 3));
  assert.equal(highHeart.auction.at(-1).bid, '4H');
  assert.equal(availableActions(highHeart).find(action => action.kind === 'relay').bid, '4S');
  assert.ok(availableActions(highHeart).some(action => action.bid === 'Pass'));
});

test('invalid actions do not mutate; initial 3NT cannot be used as a false signoff', () => {
  const initial = createPractice({ major: 'H', seed: 'signoff' });
  const before = JSON.stringify(initial);
  for (const invalid of ['Pass', '1C', '2H', '8NT', '2nt', '3D', '3NT']) {
    assert.throws(() => applyBid(initial, invalid), /not an available action/);
    assert.equal(JSON.stringify(initial), before);
  }
  const major = applyBid(initial, '6H');
  assert.deepEqual(major.contract, { bid: '6H', level: 6, strain: 'H', declarer: 'North' });
  assert.equal(major.finished, true);
  assert.equal(major.auction.at(-1).bid, 'Pass');
  assert.deepEqual(availableActions(major), []);
  assert.equal(major.revealed, false);
  const balanced = applyBid(example('H', 'balanced', 1), '2NT');
  assert.equal(applyBid(balanced, '3NT').contract.declarer, 'South');
  const revealed = revealPractice(major);
  assert.equal(revealed.revealed, true);
  assert.deepEqual(revealed.contract, major.contract);
  assert.deepEqual(revealed.constraints, major.constraints);
  assert.deepEqual(availableActions(revealPractice(initial)), []);
  assert.throws(() => applyBid(revealed, '7H'), /not an available action/);
});

test('a range answer at game can be passed; shortage 3NT is not an offer to play', () => {
  const range = rangeResponse(example('H', 'high', 3));
  assert.deepEqual(availableActions(range).find(action => action.bid === 'Pass'), { bid: 'Pass', label: 'Play 4H', kind: 'signoff' });
  const finished = applyBid(range, 'Pass');
  assert.equal(finished.contract.bid, '4H');
  assert.equal(finished.contract.declarer, 'North');
  assert.equal(finished.auction.at(-1).seat, 'South');
  assert.deepEqual(finished.constraints, range.constraints);
  const balanced = rangeResponse(example('S', 'balanced', 2));
  assert.equal(balanced.auction.at(-1).bid, '3NT');
  assert.equal(applyBid(balanced, 'Pass').contract.declarer, 'South');
  const low = applyBid(example('S', 'low', 1), '2NT');
  assert.equal(low.auction.at(-1).bid, '3NT');
  assert.equal(availableActions(low).some(action => action.bid === 'Pass'), false);
});

test('generated deals and continuation facts stay compatible with the fixed hidden hand', () => {
  for (const major of ['S', 'H']) {
    for (let index = 0; index < 60; index += 1) {
      const initial = createPractice({ major, seed: `walk-${index}` });
      const player = handFeatures(initial.playerHand, major);
      assert.ok(player.hcp >= 12 && player.lengths[major] >= 4);
      let state = initial;
      for (let depth = 0; depth < 12; depth += 1) {
        assert.equal(matchesConstraints(state.partnerHand, state.constraints, major), true);
        assert.deepEqual(state.partnerHand, initial.partnerHand);
        const actions = availableActions(state);
        assert.equal(new Set(actions.map(action => action.bid)).size, actions.length);
        for (const action of actions) {
          if (action.bid !== 'Pass') assert.ok(bidIndex(action.bid) > bidIndex(state.auction.at(-1).bid));
        }
        const relay = actions.find(action => action.kind === 'relay');
        if (!relay) break;
        const prior = JSON.stringify(state);
        const next = applyBid(state, relay.bid);
        assert.equal(JSON.stringify(state), prior);
        state = next;
      }
    }
  }
});

test('bounded compatible sampling excludes known cards and replays corrected answers', () => {
  const start = example('S', 'low', 1);
  const final = applyBid(start, '2NT');
  const settings = { count: 24, seed: 'replay', maxAttempts: 120000 };
  const sampled = sampleCompatible(final, settings);
  assert.equal(sampled.complete, true);
  assert.equal(sampled.hands.length, 24);
  assert.deepEqual(sampled, sampleCompatible(final, settings));
  assert.deepEqual(sampled, sampleCompatible(revealPractice(final), settings));
  assert.deepEqual(sampled, sampleCompatible({ ...final, partnerHand: null }, settings));
  const known = new Set(final.playerHand);
  for (const hand of sampled.hands) {
    assert.equal(new Set(hand).size, 13);
    assert.equal(hand.some(card => known.has(card)), false);
    assert.equal(matchesConstraints(hand, final.constraints, final.major), true);
    assert.deepEqual(applyBid({ ...start, partnerHand: hand }, '2NT').auction, final.auction);
  }
  const impossible = { ...final, constraints: [...final.constraints, { type: 'hcp', min: 40 }] };
  assert.deepEqual(sampleCompatible(impossible, { count: 1, maxAttempts: 37 }), { hands: [], attempts: 37, complete: false });
  assert.deepEqual(sampleCompatible(final, { count: 1, maxAttempts: 0 }), { hands: [], attempts: 0, complete: false });
  assert.deepEqual(sampleCompatible(final, { count: 0 }), { hands: [], attempts: 0, complete: true });
  assert.throws(() => sampleCompatible(final, { count: -1 }), /Sample count/);
  assert.throws(() => sampleCompatible(final, { count: 1, maxAttempts: 1.5 }), /maxAttempts/);
});

test('shape weights partition all 13-of-39 hands exactly by the binomial identity', () => {
  const session = { major: 'S', playerHand: DECK.slice(0, 13), constraints: [] };
  const proposal = compatibleShapeWeights(session);
  function factorial(value) {
    let result = 1n;
    for (let next = 2n; next <= BigInt(value); next += 1n) result *= next;
    return result;
  }
  const choose = (total, count) => factorial(total) / (factorial(count) * factorial(total - count));
  assert.equal(BigInt(proposal.totalWeight), choose(39, 13));
  assert.equal(proposal.shapes.length, 105);
  let cumulative = 0n;
  for (const shape of proposal.shapes) {
    assert.equal(shape.lengths.S, 0);
    assert.equal(Object.values(shape.lengths).reduce((sum, length) => sum + length, 0), 13);
    const count = choose(13, shape.lengths.H) * choose(13, shape.lengths.D) * choose(13, shape.lengths.C);
    assert.equal(BigInt(shape.weight), count);
    cumulative += count;
    assert.equal(BigInt(shape.cumulativeWeight), cumulative);
  }
  assert.equal(cumulative, BigInt(proposal.totalWeight));
});

test('a computable 170-hand universe uses hand counts, not equal shape probabilities', () => {
  const session = {
    major: 'S', playerHand: DECK.slice(0, 13), seed: 'tiny',
    constraints: [
      { type: 'length', suit: 'S', equals: 0 }, { type: 'length', suit: 'C', equals: 0 },
      { type: 'length', suit: 'H', min: 12 }, { type: 'length', suit: 'D', max: 1 },
    ],
  };
  const proposal = compatibleShapeWeights(session);
  // One all-heart hand, or any of 13 omitted hearts paired with 13 diamonds.
  assert.equal(proposal.totalWeight, 1 + 13 * 13);
  assert.equal(proposal.shapes.find(shape => shape.lengths.H === 13).weight, 1);
  assert.equal(proposal.shapes.find(shape => shape.lengths.H === 12).weight, 169);
  const sample = sampleCompatible(session, { count: 6800, maxAttempts: 6800, seed: 'tiny-uniformity' });
  assert.equal(sample.complete, true);
  assert.equal(sample.attempts, 6800);
  assert.equal(new Set(sample.hands.map(hand => hand.join(' '))).size, 170);
  const allHearts = sample.hands.filter(hand => hand.every(card => card[0] === 'H')).length;
  // Expected 40. This broad deterministic check rejects the severe 50/50
  // shape-selection bias without pretending to establish randomness quality.
  assert.ok(allHearts >= 15 && allHearts <= 75, `All-heart frequency was ${allHearts}/6800.`);
});

test('shape-incompatible known cards and contradictory bounds stop without proposals', () => {
  const session = { major: 'S', playerHand: DECK.slice(0, 13), constraints: [{ type: 'length', suit: 'S', min: 1 }] };
  assert.deepEqual(compatibleShapeWeights(session), { shapes: [], totalWeight: 0 });
  assert.deepEqual(sampleCompatible(session, { count: 1, maxAttempts: 20 }), { hands: [], attempts: 0, complete: false });
  const contradiction = { ...session, constraints: [{ type: 'length', suit: 'H', min: 10 }, { type: 'length', suit: 'D', min: 10 }] };
  assert.deepEqual(sampleCompatible(contradiction, { count: 1 }), { hands: [], attempts: 0, complete: false });
});

test('late relay completes 1000 uniform compatible samples and preserves auction replay', () => {
  const initial = createPractice({ major: 'S', seed: 'relay-1' });
  const bids = ['2NT', '4C', '5D', '5NT', '6S'];
  const final = bids.reduce((state, bid) => applyBid(state, bid), initial);
  const original = JSON.stringify(final);
  const sampled = sampleCompatible(final, { count: 1000, seed: 'late', maxAttempts: 500000 });
  assert.equal(sampled.complete, true);
  assert.equal(sampled.hands.length, 1000);
  assert.ok(sampled.attempts < 200000, `Late relay needed ${sampled.attempts} proposals.`);
  const known = new Set(initial.playerHand);
  for (const hand of sampled.hands) {
    assert.equal(hand.some(card => known.has(card)), false);
    assert.equal(matchesConstraints(hand, final.constraints, final.major), true);
  }
  for (const hand of sampled.hands.slice(0, 25)) {
    const replay = bids.reduce((state, bid) => applyBid(state, bid), { ...initial, partnerHand: hand });
    assert.deepEqual(replay.auction, final.auction);
  }
  assert.equal(JSON.stringify(final), original);
});
