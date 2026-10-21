import test from 'node:test';
import assert from 'node:assert/strict';
import { MINOR_PROFILES } from './minor-profiles.js';
import { SUITS, bidIndex, nextBid, lastBid } from './profile-utils.js';
import {
  DECK, createPractice, availableActions, applyBid, practiceNode,
  matchesConstraints, handFeatures, sampleCompatible,
} from './core.js';

const profile = id => MINOR_PROFILES.find(candidate => candidate.id === id);
const interval = (value, constraint) => (constraint.min === undefined || value >= constraint.min)
  && (constraint.max === undefined || value <= constraint.max)
  && (constraint.equals === undefined || value === constraint.equals);

// Independent finite-domain evaluation: these profiles only partition public
// shape and HCP. It checks every admitted pair, including rare three-suiters
// and strength boundaries that a few random deals would probably miss.
function abstractMatch(shape, hcp, constraints) {
  return constraints.every(constraint => {
    if (constraint.type === 'shapes') return constraint.values.includes(shape);
    if (constraint.type === 'hcp') return interval(hcp, constraint);
    if (constraint.type === 'length') return interval(Number(shape[SUITS.indexOf(constraint.suit)]), constraint);
    if (constraint.type === 'anyOf') return constraint.options.some(option => abstractMatch(shape, hcp, option));
    throw new Error(`Unexpected minor profile predicate: ${constraint.type}`);
  });
}

function shapesIn(constraints) {
  return [...new Set(constraints.flatMap(constraint => constraint.type === 'shapes'
    ? constraint.values : constraint.type === 'anyOf' ? constraint.options.flatMap(shapesIn) : []))];
}

function starting(profile) {
  return {
    familyId: profile.id, nodeId: profile.startNode, phase: 'family',
    trump: profile.defaultTrump, major: profile.defaultTrump,
    constraints: profile.partnerConstraints, auction: profile.initialAuction,
    ...profile.initialState,
  };
}

function resolve(profile, session) {
  const node = profile.nodes[session.nodeId];
  assert.ok(node, `Missing ${profile.id}/${session.nodeId}`);
  return typeof node === 'function' ? node(session) : node;
}

function responseBid(action, response, index) {
  return response.bid ?? nextBid(action.bid, response.step ?? index + 1);
}

function advanceAbstract(session, action, response, bid) {
  const next = { ...session, ...action.state, ...response.state,
    constraints: [...session.constraints, ...response.constraints],
    auction: [...session.auction, { seat: 'South', bid: action.bid }, { seat: 'North', bid }],
    phase: response.phase ?? 'family', nodeId: response.nextNode,
  };
  next.major = next.trump;
  return next;
}

test('all eight revised entries plus the two confirmed base range prefixes are present', () => {
  assert.equal(MINOR_PROFILES.length, 10);
  assert.equal(new Set(MINOR_PROFILES.map(item => item.id)).size, 10);
  const expected = [
    ['minor-d-nt-2d', '1D 1NT 2D', '2H'], ['minor-d-nt-2c', '1D 1NT 2C', '2H'],
    ['minor-d-h-c', '1D 1H 2C', '2S'], ['minor-d-s-c', '1D 1S 2C', '2H'],
    ['minor-d-h-d', '1D 1H 2D', '2S'], ['minor-d-s-d', '1D 1S 2D', '2H'],
    ['minor-d-h-s', '1D 1H 1S', '2C'], ['minor-c-h-s', '1C 1D 1S', '2D'],
    ['minor-c-h-c', '1C 1D 2C', '2D'], ['minor-c-s-c', '1C 1H 2C', '2D'],
  ];
  for (const [id, prefix, ask] of expected) {
    const item = profile(id);
    assert.equal(item.initialAuction.map(call => call.bid).join(' '), prefix);
    assert.deepEqual(item.initialAuction.map(call => call.seat), ['North', 'South', 'North']);
    assert.equal(item.nodes.entry.actions[0].bid, ask);
    assert.ok(item.assumptions.length && item.limitations.length);
  }
});

test('expanded minor entries admit every HCP from 9 to the entry maximum, including 11', () => {
  for (const [id, shape, maxHcp, answer] of [
    ['minor-d-h-c', '1255', 22, '3H'], ['minor-d-s-c', '1255', 22, '3H'],
    ['minor-d-h-d', '3163', 14, '3C'], ['minor-d-s-d', '1363', 14, '3D'],
    ['minor-d-h-s', '4153', 22, '2H'], ['minor-c-h-s', '4135', 22, '2S'],
    ['minor-c-h-c', '3136', 13, '2NT'], ['minor-c-s-c', '1336', 13, '3D'],
  ]) {
    const item = profile(id);
    for (let points = 8; points <= maxHcp + 1; points++) {
      assert.equal(abstractMatch(shape, points, item.partnerConstraints), points >= 9 && points <= maxHcp,
        `${id}: ${shape}, ${points} HCP`);
    }
    const answers = item.nodes.entry.actions[0].responses.filter(row => abstractMatch(shape, 11, row.constraints));
    assert.equal(answers.length, 1, `${id}: an 11-count must have exactly one answer`);
    assert.equal(answers[0].bid, answer, `${id}: an ordinary 11-count describes shape`);
  }
});

test('an 11-count after 1D–1S–2C follows the shape relay and remains available to sampling', () => {
  const initial = {
    ...createPractice({ profileId: 'minor-d-s-c', seed: 'eleven-count-regression' }),
    partnerHand: 'S2 HA H2 DK DT D9 D7 D6 CA CT C9 C8 C7'.split(' '),
    playerHand: 'SA SQ SJ S9 S6 HQ HT H9 D8 D5 D3 CK CJ'.split(' '),
  };
  assert.equal(new Set([...initial.partnerHand, ...initial.playerHand]).size, 26);
  assert.equal(handFeatures(initial.partnerHand, 'D').hcp, 11);
  assert.equal(matchesConstraints(initial.partnerHand, initial.constraints, 'D'), true);
  assert.equal(matchesConstraints(initial.playerHand, profile(initial.familyId).playerConstraints, 'D'), true);
  assert.match(initial.constraints[0].label, /9–22 HCP/);
  const shape = applyBid(initial, '2H');
  assert.equal(shape.auction.at(-1).bid, '3H');
  assert.equal(shape.weakExitAllowed, false);
  assert.ok(shape.constraints.some(constraint => constraint.type === 'hcp' && constraint.min === 11 && constraint.max === 22));
  const keycards = applyBid(shape, '3S');
  assert.equal(keycards.auction.at(-1).bid, '4C');
  assert.equal(availableActions(keycards).find(action => action.askType === 'queen').bid, '4D');
  assert.equal(keycards.partnerHand, initial.partnerHand);
  const samples = sampleCompatible({ ...shape, constraints: [...shape.constraints, { type: 'hcp', equals: 11 }] },
    { count: 5, seed: 'eleven-count-samples', maxAttempts: 30000 });
  assert.equal(samples.complete, true);
  for (const partnerHand of samples.hands) {
    assert.equal(handFeatures(partnerHand, 'D').hcp, 11);
    assert.deepEqual(applyBid({ ...initial, partnerHand }, '2H').auction, shape.auction);
  }
});

test('the two literal E5 stacks retain every printed bid and rare support exception', () => {
  const hearts = profile('minor-d-h-c').nodes.entry.actions[0];
  const spades = profile('minor-d-s-c').nodes.entry.actions[0];
  assert.deepEqual(hearts.responses.map(row => row.bid), ['2NT', '3C', '3D', '3H', '3S', '3NT']);
  assert.deepEqual(spades.responses.map(row => row.bid), ['2S', '2NT', '3C', '3D', '3H', '3S', '3NT']);
  for (const [action, shape, hcp, answer] of [
    [hearts, '1255', 12, '3H'], [hearts, '2155', 12, '3S'],
    [hearts, '1354', 16, '3NT'], [spades, '1444', 12, '3D'],
    [spades, '0454', 12, '3D'], [spades, '0355', 12, '3H'],
    [spades, '3154', 16, '3NT'],
  ]) {
    const answers = action.responses.filter(row => abstractMatch(shape, hcp, row.constraints));
    assert.equal(answers.length, 1);
    assert.equal(answers[0].bid, answer);
  }
  assert.equal(abstractMatch('1354', 15, profile('minor-d-h-c').partnerConstraints), false);
  assert.equal(abstractMatch('3154', 15, profile('minor-d-s-c').partnerConstraints), false);
  assert.equal(abstractMatch('4351', 15, profile('minor-d-h-s').partnerConstraints), false);
  assert.equal(abstractMatch('4315', 10, profile('minor-c-h-s').partnerConstraints), false);
  assert.equal(abstractMatch('4315', 12, profile('minor-c-h-s').partnerConstraints), true);
  // The club email exception is specifically (322)6. The separate diamond
  // exception also names 2272; do not extrapolate seven clubs from that rule.
  for (const shape of ['3226', '2326', '2236']) {
    assert.equal(abstractMatch(shape, 12, profile('minor-c-h-c').partnerConstraints), true);
  }
  assert.equal(abstractMatch('2227', 12, profile('minor-c-h-c').partnerConstraints), false);
});

test('the base already-known ranges bypass the poor-hand screen and preserve exact three-suiter bids', () => {
  for (const [id, low, high] of [['minor-d-nt-2d', 9, 11], ['minor-d-nt-2c', 12, 15]]) {
    const item = profile(id);
    assert.equal(item.initialState.rangeKnown, true);
    for (const points of [low - 1, low, high, high + 1]) {
      assert.equal(abstractMatch('1453', points, item.partnerConstraints), points >= low && points <= high);
    }
    const initial = starting(item);
    const entry = resolve(item, initial).actions[0];
    assert.equal(entry.responses[0].bid, '2S');
    assert.equal(entry.responses[0].nextNode, 'hearts');
    const h = advanceAbstract(initial, entry, entry.responses[0], '2S');
    const action = resolve(item, h).actions[0];
    assert.equal(action.bid, '2NT');
    assert.deepEqual(action.responses.map((row, index) => responseBid(action, row, index)), ['3C', '3D', '3H', '3S']);
    assert.deepEqual(action.responses[2].constraints[0].values, ['1444', '0454']);
    assert.deepEqual(action.responses[3].constraints[0].values, ['4441', '4450']);
    assert.deepEqual(action.responses[3].state.agreementOptions, ['D', 'H', 'S']);
    assert.equal(action.responses[3].state.agreementOptions.includes('C'), false);
    const alternate = resolve(item, h).actions[1];
    assert.equal(alternate.bid, '3C');
    assert.equal(alternate.state.trump, 'H');
  }
  for (const points of [9, 11, 12, 13, 14, 15]) {
    assert.equal(abstractMatch('2272', points, profile('minor-d-nt-2c').partnerConstraints), points === 12 || points === 13);
    assert.equal(abstractMatch('2272', points, profile('minor-d-nt-2d').partnerConstraints), false);
  }
});

test('every admitted shape/HCP pair has exactly one answer at every shape relay and every trump choice', () => {
  let cases = 0;
  let actionsChecked = 0;
  const visited = new Map();
  for (const item of MINOR_PROFILES) {
    const walk = (session, shape, points, depth = 0) => {
      assert.ok(depth < 5, 'The bounded shape relay must terminate');
      if (session.phase !== 'family') {
        assert.equal(session.phase, 'keycard');
        assert.equal(abstractMatch(shape, points, session.constraints), true);
        if (session.shortageSuit) assert.ok(Number(shape[SUITS.indexOf(session.shortageSuit)]) <= 1);
        else assert.equal([...shape].every(n => Number(n) >= 2), true);
        return;
      }
      const node = resolve(item, session);
      assert.ok(node.actions.length);
      for (const action of node.actions) {
        actionsChecked++;
        assert.ok(bidIndex(action.bid) > bidIndex(lastBid(session)));
        assert.notEqual(action.bid, '3NT', 'Responder 3NT is to play');
        const answers = action.responses.map((response, index) => ({ response, index }))
          .filter(({ response }) => abstractMatch(shape, points, response.constraints));
        assert.equal(answers.length, 1, `${item.id}/${session.nodeId}/${action.bid}, ${shape}, ${points} HCP`);
        const { response, index } = answers[0];
        const bid = responseBid(action, response, index);
        assert.ok(bidIndex(bid) > bidIndex(action.bid));
        const visitKey = `${item.id}/${session.nodeId}/${index}`;
        visited.set(visitKey, (visited.get(visitKey) || 0) + 1);
        walk(advanceAbstract(session, action, response, bid), shape, points, depth + 1);
      }
    };
    for (const shape of shapesIn(item.partnerConstraints)) for (let points = 0; points <= 37; points++) {
      if (!abstractMatch(shape, points, item.partnerConstraints)) continue;
      cases++;
      walk(starting(item), shape, points);
    }
    for (const [nodeId, definition] of Object.entries(item.nodes)) {
      if (typeof definition === 'function') continue;
      for (const action of definition.actions) for (let index = 0; index < action.responses.length; index++) {
        assert.ok(visited.has(`${item.id}/${nodeId}/${index}`), `${item.id}/${nodeId} unreachable answer ${index}`);
      }
    }
  }
  assert.ok(cases > 700, `Only ${cases} shape/HCP pairs were covered`);
  assert.ok(actionsChecked > cases);
});

test('fixed hands survive generated auctions; public choices never inspect either private hand', () => {
  for (const item of MINOR_PROFILES) for (let seed = 0; seed < 6; seed++) {
    let session = createPractice({ profileId: item.id, seed: `minor-walk-${seed}` });
    assert.equal(matchesConstraints(session.partnerHand, item.partnerConstraints, session.trump), true);
    assert.equal(matchesConstraints(session.playerHand, item.playerConstraints, session.trump), true);
    assert.equal(new Set([...session.partnerHand, ...session.playerHand]).size, 26);
    const partner = session.partnerHand;
    const player = session.playerHand;
    let count = 0;
    while (!session.finished && count++ < 12) {
      const before = JSON.stringify(session);
      const actions = availableActions(session);
      const poisoned = { ...session };
      Object.defineProperty(poisoned, 'partnerHand', { get() { throw new Error('Read hidden partner hand'); } });
      // Dynamic nodes should not use the asker's hand either: relay meanings
      // and compression must remain functions of the public auction alone.
      Object.defineProperty(poisoned, 'playerHand', { get() { throw new Error('Read private player hand'); } });
      // Public-session construction strips the two own properties explicitly,
      // so use unrelated replacement hands for the generic-node check itself.
      if (session.phase === 'family') {
        assert.deepEqual(practiceNode({ ...session, partnerHand: [], playerHand: [] }), practiceNode(session));
      } else assert.deepEqual(availableActions(poisoned), actions);
      assert.equal(new Set(actions.map(action => action.bid)).size, actions.length);
      if (bidIndex(lastBid(session)) < bidIndex('3NT')) assert.equal(actions.find(action => action.bid === '3NT')?.kind, 'signoff');
      const relays = actions.filter(action => action.kind !== 'signoff');
      const action = relays[(seed % 2) && relays.length > 1 ? 1 : 0]
        ?? actions.find(action => action.bid !== 'Pass') ?? actions[0];
      if (!action) break;
      const next = applyBid(session, action.bid);
      assert.equal(JSON.stringify(session), before, 'No prior state may mutate');
      assert.deepEqual(next.partnerHand, partner);
      assert.deepEqual(next.playerHand, player);
      assert.equal(matchesConstraints(partner, next.constraints, next.trump), true);
      assert.equal(Object.isFrozen(next), true);
      session = next;
    }
    assert.ok(count < 12, `${item.id} failed to terminate`);
  }
});

test('compatible samples use accumulated public facts and can reproduce the same source-defined shape answers', () => {
  for (const item of MINOR_PROFILES) {
    const initial = createPractice({ profileId: item.id, seed: 'minor-sample' });
    let session = initial;
    const asks = [];
    while (session.phase === 'family') {
      const action = availableActions(session).find(action => action.kind === 'relay');
      asks.push(action.bid);
      session = applyBid(session, action.bid);
    }
    const sample = sampleCompatible(session, { count: 5, seed: 'public-minor-sample', maxAttempts: 30000 });
    assert.equal(sample.hands.length, 5, item.id);
    const withoutSecret = sampleCompatible({ ...session, partnerHand: DECK.slice(0, 13) }, { count: 5, seed: 'public-minor-sample', maxAttempts: 30000 });
    assert.deepEqual(sample, withoutSecret);
    for (const hand of sample.hands) {
      assert.equal(matchesConstraints(hand, session.constraints, session.trump), true);
      assert.equal(hand.some(card => session.playerHand.includes(card)), false);
      let replay = { ...initial, partnerHand: hand };
      for (const bid of asks) replay = applyBid(replay, bid);
      assert.deepEqual(replay.auction, session.auction);
      assert.equal(replay.shortageSuit, session.shortageSuit);
    }
  }
});

test('diamond game force retains 4D for the queen after the 3S SKC ask and 4C reply', () => {
  const initial = createPractice({ profileId: 'minor-d-s-c', seed: 'relay-1' });
  const keycards = applyBid(applyBid(initial, '2H'), '3S');
  assert.deepEqual(keycards.auction.map(call => call.bid), ['1D', '1S', '2C', '2H', '3H', '3S', '4C']);
  assert.equal(keycards.trump, 'D');
  const asks = availableActions(keycards).filter(action => action.kind === 'relay');
  assert.deepEqual(asks.map(({ bid, askType, askSuit }) => [bid, askType, askSuit]), [
    ['4D', 'queen', undefined], ['4H', 'suit', 'H'], ['4S', 'suit', 'C'],
  ]);
  assert.deepEqual(asks[0].responseLadder.map(({ bid, queen }) => [bid, queen]), [
    ['4H', false], ['4S', true],
  ]);
  const queen = applyBid(keycards, '4D');
  assert.equal(queen.partnerHand, initial.partnerHand);
  assert.equal(queen.playerHand, initial.playerHand);
  assert.equal(matchesConstraints(queen.partnerHand, queen.constraints, 'D'), true);
  assert.equal(availableActions(queen).some(action => action.askType === 'queen'), false);
  const samples = sampleCompatible(queen, { count: 5, seed: 'diamond-queen-replay', maxAttempts: 30000 });
  assert.equal(samples.complete, true);
  for (const partnerHand of samples.hands) {
    let replay = { ...initial, partnerHand };
    for (const bid of ['2H', '3S', '4D']) replay = applyBid(replay, bid);
    assert.deepEqual(replay.auction, queen.auction);
  }
});

test('poor-hand continuations admit all non-relay exits and exclude impossible strong support categories', () => {
  for (const item of MINOR_PROFILES.filter(item => !item.id.includes('-nt-'))) {
    let initial;
    for (let seed = 0; seed < 100; seed++) {
      const candidate = createPractice({ profileId: item.id, seed: `minor-weak-${seed}` });
      if (handFeatures(candidate.partnerHand, candidate.trump).hcp <= 10) { initial = candidate; break; }
    }
    assert.ok(initial, `${item.id} weak fixture`);
    const weak = applyBid(initial, item.nodes.entry.actions[0].bid);
    assert.equal(weak.weakExitAllowed, true);
    const actions = availableActions(weak);
    assert.equal(actions.find(action => action.bid === 'Pass')?.kind, 'signoff');
    const relay = actions.find(action => action.kind === 'relay');
    assert.ok(relay);
    for (let bid = nextBid(lastBid(weak)); bid; bid = nextBid(bid)) assert.ok(actions.some(action => action.bid === bid), `${item.id}: ${bid}`);
    for (const response of relay.responses) {
      assert.equal(response.constraints.some(c => c.type === 'hcp' && c.min > 10), false);
    }
    const end = applyBid(weak, 'Pass');
    assert.equal(end.contract.bid, lastBid(weak));
    assert.equal(end.finished, true);
  }
});
