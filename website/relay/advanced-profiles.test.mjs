import test from 'node:test';
import assert from 'node:assert/strict';
import { STRONG_CLUB_PROFILES } from './strong-club-profiles.js';
import { SPLIT_PROFILES } from './split-profiles.js';
import { HORTON_PROFILES, createHortonProfile } from './horton-profiles.js';
import { SHAPES } from './source-utils.js';
import { createPractice, applyBid, availableActions, matchesConstraints, sampleCompatible, DECK, handFeatures } from './core.js';
import { postRangeActions } from './continuations.js';

const profiles = [...STRONG_CLUB_PROFILES, ...SPLIT_PROFILES, ...HORTON_PROFILES];
const match = (n, points, controls, constraints) => constraints.every(c => {
  const between = value => (c.min === undefined || value >= c.min) && (c.max === undefined || value <= c.max) && (c.equals === undefined || value === c.equals);
  if (c.type === 'hcp') return between(points);
  if (c.type === 'controls') return between(controls);
  if (c.type === 'length') return between(n[c.suit]);
  if (c.type === 'balanced') return Object.values(n).every(v => v >= 2) === (c.value ?? true);
  if (c.type === 'shapes') return c.values.includes([n.S, n.H, n.D, n.C].join(''));
  if (c.type === 'anyOf') return c.options.some(option => match(n, points, controls, option));
  // Balanced serious-cue priority is checked with actual-card tests below.
  throw new Error(`Unsupported abstract predicate ${c.type}`);
});

test('strong-club and Horton first descriptions partition every admitted shape and HCP', () => {
  for (const p of [...STRONG_CLUB_PROFILES, ...HORTON_PROFILES]) {
    const action = p.nodes[p.startNode].actions[0];
    let admitted = 0;
    for (const n of SHAPES) for (let points = 0; points <= 22; points += 1) {
      if (!match(n, points, 0, p.partnerConstraints)) continue;
      if (p.id === 'horton-d' || p.id === 'horton-s') assert.ok(n.H <= 3, 'Four hearts must use the preferred major-suit Horton opening');
      if (p.id === 'horton-s') assert.ok(n.D <= 3, 'The club entry excludes the suit-quality choice with four diamonds');
      admitted += 1;
      const replies = action.responses.filter(answer => match(n, points, 0, answer.constraints));
      assert.equal(replies.length, 1, `${p.id} ${JSON.stringify(n)} ${points}`);
      if (p.id === 'club-1s-2c-2d' && Object.values(n).every(v => v >= 2)) assert.equal(replies[0].bid, '3NT');
    }
    assert.ok(admitted > 0);
  }
});

test('literal split-range shape answers preserve the opened minor and exactly three major cards', () => {
  const expected = {
    'split-c-h': { '2NT': ['4315', '4306'], '3D': ['1345', '0346'] },
    'split-c-s': { '3D': ['3145', '3046'], '3H': ['3415', '3406'] },
    'split-d-h': { '2NT': ['4351', '4360'], '3C': ['1354', '0364'] },
    'split-d-s': { '3C': ['3154', '3064'], '3H': ['3451', '3460'] },
  };
  for (const [id, rows] of Object.entries(expected)) {
    const p = SPLIT_PROFILES.find(item => item.id === id);
    const answers = p.nodes.entry.actions[0].responses;
    for (const [bid, shapes] of Object.entries(rows)) assert.deepEqual(answers.find(answer => answer.bid === bid).constraints.find(c => c.type === 'shapes').values, shapes);
    for (const n of SHAPES) if (match(n, 9, 0, p.partnerConstraints)) {
      const replies = answers.filter(answer => match(n, 9, 0, answer.constraints));
      assert.equal(replies.length, 1, `${id}: ${JSON.stringify(n)}`);
    }
  }
});

test('Horton minimum follow-ups preserve the different 2D and 2H/2S tables', () => {
  const minimum = p => p.nodes.minimum.actions[0];
  assert.equal(minimum(HORTON_PROFILES[0]).bid, '3H');
  assert.deepEqual(minimum(HORTON_PROFILES[0]).responses.map(row => row.bid), ['3S', '3NT']);
  for (const p of HORTON_PROFILES.slice(1)) {
    assert.equal(minimum(p).bid, '3D');
    assert.deepEqual(minimum(p).responses.map(row => row.bid), ['3H', '3S', '3NT']);
  }
  const fiveFive = { S: 5, H: 5, D: 2, C: 1 };
  const answer = minimum(HORTON_PROFILES[1]).responses.filter(row => match(fiveFive, 2, 0, row.constraints));
  assert.equal(answer.length, 1);
  assert.equal(answer[0].bid, '3NT');
  assert.equal(answer[0].constraints.some(c => c.suit === 'H' && c.max === 4), false);
});

test('all split-range shape agreements follow their source positions without a duplicate Kickback meaning', () => {
  const expected = {
    'split-c-h': { '2NT': { '3C': 'clubs', '3D': 'spades', '3H': 'hearts' }, '3D': { '3H': 'hearts', '3S': 'diamonds', '4C': 'clubs' } },
    'split-c-s': { '3D': { '3H': 'diamonds', '3S': 'spades', '4C': 'clubs' }, '3H': { '3S': 'spades', '4C': 'clubs', '4D': 'hearts' } },
    'split-d-h': { '2NT': { '3C': 'spades', '3D': 'diamonds', '3H': 'hearts' }, '3C': { '3D': 'diamonds', '3H': 'hearts', '3S': 'clubs' } },
    'split-d-s': { '3C': { '3D': 'diamonds', '3H': 'clubs', '3S': 'spades' }, '3H': { '3S': 'spades', '4C': 'hearts', '4D': 'diamonds' } },
  };
  for (const p of SPLIT_PROFILES) {
    const initial = createPractice({ profileId: p.id, seed: 'agreement-table' });
    const baseId = p.id.replace('-1nt', '');
    const rows = p.nodes.entry.actions[0].responses.filter(row => row.nextNode?.startsWith('agree-'));
    for (const row of rows) {
      const session = { ...initial, ...row.state, nodeId: row.nextNode, auction: [...initial.auction,
        { seat: 'South', bid: p.nodes.entry.actions[0].bid }, { seat: 'North', bid: row.bid }] };
      const actions = availableActions(session).filter(action => action.kind === 'relay');
      assert.equal(new Set(actions.map(action => action.bid)).size, actions.length, `${p.id} ${row.bid}`);
      for (const [bid, suit] of Object.entries(expected[baseId][row.bid])) {
        assert.equal(actions.find(action => action.bid === bid)?.label, `Agree ${suit} below game`, `${p.id} ${row.bid} ${bid}`);
      }
    }
  }
});

test('balanced split raises retain game, non-serious and serious cue responses under the disclosed policy', () => {
  const cases = [
    ['HA HQ H9 H8 SK SQ S9 DQ DJ D9 CJ C9 C8', '4H', '4S'],
    ['HA HQ H9 H8 SA S9 S8 DQ DJ D9 CJ C9 C8', '3S', '3NT'],
    ['HA HQ H9 H8 SA S9 S8 DK DJ D9 C9 C8 C7', '3NT', '4D'],
  ];
  for (const major of ['H', 'S']) for (const [cards, heartReply, spadeReply] of cases) {
    const hand = cards.split(' ').map(card => major === 'S' ? (card[0] === 'H' ? 'S' : card[0] === 'S' ? 'H' : card[0]) + card[1] : card);
    const initial = createPractice({ profileId: `split-c-${major.toLowerCase()}`, seed: 'balanced-fixture' });
    assert.equal(matchesConstraints(hand, initial.constraints, major), true);
    const next = applyBid({ ...initial, partnerHand: hand }, major === 'H' ? '2S' : '2NT');
    assert.equal(next.auction.at(-1).bid, major === 'H' ? heartReply : spadeReply);
    assert.equal(matchesConstraints(hand, next.constraints, major), true);
    if (next.auction.at(-1).bid === '3NT') assert.equal(availableActions(next).some(action => action.bid === 'Pass'), false);
  }
});

test('Horton minimum policy is configurable separately from its source response schedule', () => {
  const p = createHortonProfile('H', { minimumMaxHcp: 3, maxHcp: 8 });
  assert.equal(p.nodes.entry.actions[0].responses[0].constraints[0].max, 3);
  assert.deepEqual(p.nodes.entry.actions[0].responses.map(row => row.bid), ['3C', '3D', '3H', '3S', '3NT', '4C', '4D']);
  assert.throws(() => createHortonProfile('H', { minimumMaxHcp: 8, maxHcp: 8 }), /Invalid/);
});

function fixedHorton(hand) {
  const initial = createPractice({ profileId: 'horton-h', seed: 'horton-keys' });
  const known = new Set(hand);
  let session = { ...initial, partnerHand: hand, playerHand: DECK.filter(card => !known.has(card)).slice(0, 13) };
  session = applyBid(session, '2NT');
  if (session.auction.at(-1).bid === '3C') session = applyBid(session, '3D');
  session = applyBid(session, '4C');
  assert.equal(session.auction.at(-1).bid, '4D');
  return session;
}

test('real Horton zero/one/two-keycard hands use three answers and the correct queen-ask rule', () => {
  for (const [count, cards] of [
    [0, 'SQ S9 S8 S7 HJ H9 H8 H7 D9 D8 D7 C9 C8'],
    [1, 'SK S9 S8 S7 HJ H9 H8 H7 D9 D8 D7 C9 C8'],
    [2, 'SA SK S8 S7 H9 H8 H7 H6 D9 D8 D7 C9 C8'],
  ]) {
    let session = fixedHorton(cards.split(' '));
    const ask = availableActions(session).find(action => action.kind === 'relay');
    assert.deepEqual(ask.responseLadder.map(answer => answer.values), [[0], [1], [2]]);
    session = applyBid(session, ask.bid);
    assert.equal(session.constraints.at(-1).values[0], count);
    assert.equal(postRangeActions(session).some(action => action.askType === 'queen'), count < 2);
    assert.equal(matchesConstraints(session.partnerHand, session.constraints, 'S'), true);
  }
});

test('Horton void-first SKC is followed by the three-rung ordinary keycard ladder', () => {
  const hand = 'SK S9 S8 S7 HJ H9 H8 H7 C9 C8 C7 C6 C5'.split(' ');
  const initial = createPractice({ profileId: 'horton-h', seed: 'void-fixture' });
  let session = { ...initial, partnerHand: hand };
  for (const bid of ['2NT', '3D', '4C']) session = applyBid(session, bid);
  assert.equal(session.shortageSuit, 'D');
  assert.equal(session.auction.at(-1).bid, '4H');
  const skc = availableActions(session).find(action => action.kind === 'relay');
  assert.equal(skc.bid, '4NT'); // 4S is game in the agreed suit.
  assert.equal(skc.responseLadder.length, 4);
  session = applyBid(session, skc.bid);
  assert.equal(session.phase, 'void-keycard');
  const ordinary = availableActions(session).find(action => action.kind === 'relay');
  assert.deepEqual(ordinary.responseLadder.map(answer => answer.values), [[0], [1], [2]]);
  session = applyBid(session, ordinary.bid);
  assert.deepEqual(session.constraints.at(-1).values, [1]);
  assert.equal(matchesConstraints(hand, session.constraints, 'S'), true);
});

test('Horton Last Train and 3NT reservations do not become artificial shortage asks', () => {
  const p = HORTON_PROFILES.find(p => p.id === 'horton-h');
  const initial = createPractice({ profileId: p.id, seed: 'reserved' });
  const publicState = { ...initial, phase: 'family', nodeId: 'choose-trump', auction: [...initial.auction,
    { seat: 'South', bid: '2NT' }, { seat: 'North', bid: '3S' }],
  };
  const actions = availableActions(publicState);
  assert.equal(actions.find(action => action.bid === '3NT').kind, 'signoff');
  assert.equal(actions.some(action => action.bid === '4D'), false);
  assert.ok(actions.some(action => action.bid === '4C' && action.label.includes('spades')));
  assert.ok(actions.some(action => action.bid === '5C' && action.label.includes('hearts')));
});

test('strong diamond SKC reserves 3NT for two diamonds while three-card hands answer immediately', () => {
  const p = STRONG_CLUB_PROFILES[0];
  const node = p.nodes['major-shortage']({ shortageSuit: 'S' });
  const ask = node.actions.find(action => action.bid === '3D');
  assert.deepEqual(ask.responses.map(answer => answer.bid), ['3H', '3S', '3NT', '4C', '4D', '4H']);
  assert.equal(ask.responses.find(answer => answer.bid === '3NT').constraints[0].max, 2);
  for (const answer of ask.responses.filter(answer => answer.bid !== '3NT')) assert.ok(answer.constraints.some(c => c.suit === 'D' && c.min === 3 && c.max === 3));
});

test('new exercises replay samples through the same source asks and preserve fixed cards', () => {
  for (const p of profiles) {
    let session = createPractice({ profileId: p.id, seed: 'advanced-replay' });
    const initial = session;
    const bids = [];
    for (let step = 0; step < 3; step += 1) {
      const ask = availableActions(session).find(action => action.kind === 'relay');
      if (!ask) break;
      bids.push(ask.bid);
      session = applyBid(session, ask.bid);
      assert.deepEqual(session.partnerHand, initial.partnerHand);
      assert.equal(matchesConstraints(session.partnerHand, session.constraints, session.trump), true, p.id);
    }
    const publicOnly = { ...session };
    delete publicOnly.partnerHand;
    const samples = sampleCompatible(publicOnly, { count: 4, maxAttempts: 200000, seed: 'advanced-public' });
    assert.equal(samples.complete, true, p.id);
    for (const hand of samples.hands) {
      let replay = { ...initial, partnerHand: hand };
      for (const bid of bids) replay = applyBid(replay, bid);
      assert.deepEqual(replay.auction.map(call => call.bid), session.auction.map(call => call.bid), p.id);
    }
  }
});
