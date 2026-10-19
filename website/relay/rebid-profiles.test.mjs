import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { REBID_PROFILES } from './rebid-profiles.js';
import { SHAPES } from './source-utils.js';
import { keycardAction, strengthResponseLadder } from './continuations.js';
import { createPractice, availableActions, applyBid, matchesConstraints, sampleCompatible, DECK } from './core.js';

function abstractMatch(n, points, constraints) {
  return constraints.every(c => {
    const between = value => (c.min === undefined || value >= c.min) && (c.max === undefined || value <= c.max) && (c.equals === undefined || value === c.equals);
    if (c.type === 'hcp') return between(points);
    if (c.type === 'length') return between(n[c.suit]);
    if (c.type === 'balanced') return Object.values(n).every(v => v >= 2) === (c.value ?? true);
    if (c.type === 'shapes') return c.values.includes([n.S, n.H, n.D, n.C].join(''));
    if (c.type === 'anyOf') return c.options.some(option => abstractMatch(n, points, option));
    throw new Error(`Unsupported abstract predicate ${c.type}`);
  });
}

test('reordered entry bids and all ten mini–mega splinters follow the new source positions', () => {
  assert.equal(REBID_PROFILES.length, 23);
  assert.deepEqual(REBID_PROFILES.slice(0, 5).map(p => p.initialAuction.map(c => c.bid).join(' ')), [
    '1C 1D 2D', '1C 1H 2D', '1D 1H 2S', '1D 1S 2H', '1H 1S 3C',
  ]);
  assert.deepEqual(REBID_PROFILES.filter(p => p.id.startsWith('rebid-splinter')).map(p => [...p.initialAuction.map(c => c.bid), p.initialState.shortageSuit].join(' ')), [
    '1C 1D 3C S', '1C 1D 3D D', '1C 1H 3D H', '1C 1H 3H D', '1D 1H 3C S',
    '1D 1H 3D C', '1D 1S 3D H', '1D 1S 3H C', '1H 1S 3D D', '1H 1S 3H C',
  ]);
});

test('every initial shortage ask partitions all admitted shapes and strengths, including reverse upgrades', () => {
  for (const p of REBID_PROFILES.filter(p => !p.id.startsWith('rebid-splinter'))) {
    const asks = p.nodes.entry.actions.filter(action => action.label.startsWith('Ask'));
    assert.ok(asks.length > 0, p.id);
    for (const action of asks) {
      let admitted = 0;
      for (const n of SHAPES) for (let points = 0; points <= 22; points += 1) {
        if (!abstractMatch(n, points, p.partnerConstraints)) continue;
        admitted += 1;
        const responses = action.responses.filter(answer => abstractMatch(n, points, answer.constraints));
        assert.equal(responses.length, 1, `${p.id} ${action.bid} ${JSON.stringify(n)} ${points}`);
        if (p.id.startsWith('rebid-reverse') && points < 16) assert.equal(responses[0].nextNode, 'upgrade');
      }
      assert.ok(admitted > 0, p.id);
    }
  }
});

test('the source playable-game escape examples use the first response beyond the whole answer ladder', () => {
  // Ask, trump, shortage (or ordinary KC), original game rung, upper escape.
  const cases = [
    ['3S', 'C', null, '3NT', '4S'], // R0113
    ['3NT', 'S', null, '4S', '4NT'], // R0126
    ['4C', 'S', 'H', '4S', '5D'], // R0128/R0167 (retain the ordinary count alphabet)
    ['3C', 'C', 'H', '3NT', '4D'], // R0137
    ['3D', 'C', 'S', '3NT', '4H'], // R0139
    ['3H', 'D', null, '3NT', '4H'], // R0149
    ['3S', 'D', 'S', '3NT', '4NT'], // R0151
    ['4D', 'H', 'S', '4H', '5H'], // R0157
    ['3D', 'D', null, '3NT', '4D'], // R0174
    ['3H', 'D', 'H', '3NT', '4S'], // R0176/R0189
    ['3C', 'D', null, '3NT', '4C'], // R0185
    ['3D', 'D', 'H', '3NT', '4H'], // R0187
  ];
  for (const [ask, trump, shortageSuit, game, escape] of cases) {
    const session = { trump, shortageSuit, strengthSplit: { min: 14, split: 17, max: 19 } };
    const ladder = keycardAction(session, ask).responseLadder;
    const lower = ladder.find(row => row.bid === game);
    const upper = ladder.at(-1);
    assert.deepEqual(lower.strength, { min: 14, max: 16 });
    assert.equal(upper.bid, escape);
    assert.deepEqual(upper.strength, { min: 17, max: 19 });
    for (const property of ['values', 'queen', 'void']) assert.deepEqual(upper[property], lower[property]);
    const known = keycardAction({ ...session, strengthKnown: true }, ask).responseLadder;
    assert.equal(known.length, ladder.length - 1);
    assert.equal(known.some(row => row.strength), false);
  }
});

function fixed(id, hand) {
  const session = createPractice({ profileId: id, seed: 'source-example' });
  assert.equal(matchesConstraints(hand, session.constraints, session.trump), true, id);
  const known = new Set(hand);
  // Use a legal, disjoint known hand; the partner's cards remain fixed.
  const playerHand = DECK.filter(card => !known.has(card)).filter(card => '23456789T'.includes(card[1])).slice(0, 13);
  return { ...session, partnerHand: hand, playerHand };
}
const cards = holdings => holdings.split(' ').flatMap((holding, index) => [...holding].map(rank => 'SHDC'[index] + rank));

test('R0135 real two-keycard-plus-queen hands split 3S/3NT and a known range does not split again', () => {
  for (const [holdings, expected] of [['AJ2 K2 Q2 KQ9876', '3S'], ['AJ2 K2 KQ KQ9876', '3NT']]) {
    let session = fixed('rebid-single-c-h', cards(holdings));
    session = applyBid(session, '2H');
    assert.equal(session.auction.at(-1).bid, '2S');
    session = applyBid(session, '2NT');
    assert.equal(session.auction.at(-1).bid, expected);
    assert.equal(session.strengthKnown, true);
    assert.equal(matchesConstraints(session.partnerHand, session.constraints, session.trump), true);
    if (expected === '3NT') assert.equal(availableActions(session).some(action => action.bid === 'Pass'), true);
    for (const action of availableActions(session).filter(action => action.kind === 'relay')) assert.equal(action.responseLadder.some(row => row.strength), false);
  }
});

test('R0137 singleton answers and R0178 void answers disclose both keycards/shortage and strength truthfully', () => {
  const fixtures = [
    ['rebid-single-c-h', 'AKQ 2 A32 J98765', ['2H', '3C'], '3NT'], // 14, 2 KC no Q
    ['rebid-single-c-h', 'AK2 2 AK2 Q98765', ['2H', '3C'], '4C'], // 16, 2 KC +Q: not a game rung
    ['rebid-single-c-h', 'AKQ 2 AK2 J98765', ['2H', '3C'], '4D'], // 17, 2 KC no Q
    ['rebid-single-d-h', ' K2 AKQJ9876 J98', ['2NT', '3S'], '3NT'], // 14, spade void
    ['rebid-single-d-h', ' AK AKQJ9876 J98', ['2NT', '3S'], '4NT'], // 18, spade void
  ];
  for (const [id, holdings, bids, expected] of fixtures) {
    let session = fixed(id, cards(holdings));
    for (const bid of bids) session = applyBid(session, bid);
    assert.equal(session.auction.at(-1).bid, expected, holdings);
    assert.equal(matchesConstraints(session.partnerHand, session.constraints, session.trump), true);
    if (expected === '3NT') assert.equal(availableActions(session).some(action => action.bid === 'Pass'), true);
    if (session.shortageSuit === 'S') assert.equal(session.phase, 'void-keycard');
  }
});

test('reverse fourth-step upgrades retain minor keycard, major Kickback and the special heart-game escape', () => {
  const scenarios = [
    ['rebid-reverse-c-h-d', '3S', 'C', '4C', '4S'],
    ['rebid-reverse-c-s-d', '3H', 'C', '3S', '4NT'],
    ['rebid-reverse-c-s-h', '4C', 'C', '4D', '4NT'],
    ['rebid-reverse-c-s-h', '4D', 'H', '4S', '4NT'],
  ];
  for (const [id, reply, trump, minorAsk, majorAsk] of scenarios) {
    const initial = createPractice({ profileId: id, seed: 'upgrade' });
    const session = { ...initial, phase: 'family', nodeId: 'upgrade', trump, major: trump, auction: [...initial.auction, { seat: 'South', bid: '3H' }, { seat: 'North', bid: reply }] };
    const actions = availableActions(session);
    assert.ok(actions.some(action => action.bid === minorAsk && action.askType === 'keycard'), id);
    assert.ok(actions.some(action => action.bid === majorAsk && action.askType === 'keycard'), id);
    if (reply === '4D' && trump === 'H') assert.equal(actions.find(action => action.bid === '4H').kind, 'signoff');
  }
});

test('unbid-minor agreement retains the step for opener’s suit and requires a known nonshortage plus five cards', () => {
  let session = fixed('rebid-single-c-h', cards('AKQ 2 A32 J98765'));
  session = applyBid(session, '2H'); // 2NT, heart shortage; 3C remains club SKC.
  const actions = availableActions(session);
  assert.equal(actions.find(action => action.bid === '3C').trump, 'C');
  assert.equal(actions.find(action => action.bid === '3D').trump, 'D');
  assert.deepEqual(actions.find(action => action.bid === '3D').playerConstraints, [{ type: 'length', suit: 'D', min: 5, max: 9 }]);
  const playerHand = cards('T9 T987 JT987 32');
  session = applyBid({ ...session, playerHand }, '3D');
  assert.equal(session.trump, 'D');
  assert.equal(session.constraints.findLast(c => c.type === 'keycardOptions').trump, 'D');
  const initial = fixed('rebid-single-c-h', cards('AJ2 K2 Q2 KQ9876'));
  const noShortage = applyBid(initial, '2H'); // 2S: 2NT is club KC; natural 3D can agree diamonds.
  assert.equal(availableActions(noShortage).find(action => action.bid === '3D').trump, 'D');
});

test('mini splinters pass 3M while mega hands raise, and an opener Pass finishes with the correct declarer', () => {
  for (const [holdings, expected] of [['2 KQ98 A32 K9876', 'Pass'], ['2 AKQ9 AK2 K9876', '4H']]) {
    const session = fixed('rebid-splinter-c-h-s', cards(holdings));
    const next = applyBid(session, '3H');
    assert.equal(next.auction.at(-1).bid, expected);
    if (expected === 'Pass') {
      assert.equal(next.finished, true);
      assert.deepEqual(next.contract, { bid: '3H', level: 3, strain: 'H', declarer: 'South' });
    }
  }
});

test('all reordered exercises sample public constraints and reproduce the tested auction with immutable cards', () => {
  for (const p of REBID_PROFILES) {
    const initial = createPractice({ profileId: p.id, seed: 'reorder-replay' });
    let session = initial;
    const bids = [];
    for (let step = 0; step < 3; step += 1) {
      const ask = availableActions(session).find(action => action.kind === 'relay' && (!action.playerConstraints || matchesConstraints(session.playerHand, action.playerConstraints, action.trump ?? session.trump)));
      if (!ask) break;
      bids.push(ask.bid);
      session = applyBid(session, ask.bid);
      assert.deepEqual(session.partnerHand, initial.partnerHand);
    }
    const publicOnly = { ...session };
    delete publicOnly.partnerHand;
    const result = sampleCompatible(publicOnly, { count: 3, maxAttempts: 200000, seed: 'reorder-public' });
    assert.equal(result.complete, true, p.id);
    for (const hand of result.hands) {
      let replay = { ...initial, partnerHand: hand };
      for (const bid of bids) replay = applyBid(replay, bid);
      assert.deepEqual(replay.auction.map(call => call.bid), session.auction.map(call => call.bid), p.id);
    }
  }
});

test('strength distinction also applies to public queen/specific answers and refuses an overflowing ladder', () => {
  const session = { trump: 'H', strengthSplit: { min: 14, split: 17, max: 19 } };
  assert.deepEqual(strengthResponseLadder(session, '4C', [{ bid: '4D', queen: false }, { bid: '4H', queen: true }]).map(row => row.bid), ['4D', '4H', '4S']);
  assert.equal(strengthResponseLadder({ ...session, trump: 'S' }, '7C', [{ bid: '4S', category: 'third' }, { bid: '7NT', category: 'kq' }]), null);
});

test('retained source originals and searchable email/Word extracts match their portable manifest', () => {
  const sourceRoot = new URL('../../docs/system-sources/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', sourceRoot), 'utf8'));
  assert.equal(manifest.files.length, 5);
  for (const entry of manifest.files) {
    const content = fs.readFileSync(new URL(entry.file, sourceRoot));
    assert.equal(content.length, entry.bytes, entry.file);
    assert.equal(createHash('sha256').update(content).digest('hex'), entry.sha256, entry.file);
  }
  assert.equal(manifest.files.find(entry => entry.file === 'main-notes.docx').sha256, 'b114d3fba9f4280082a338c87ea1aa93b9b7ef83200786ccb7449a253a69f59c');
  assert.equal(manifest.files.find(entry => entry.file === 'reordering-openers-rebid.docx').sha256, '93bbc53bef5a5d91ca6eb4d876e2391a238a5f30490e7ff21eea4593ca025fe8');
});
