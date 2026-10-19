import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPostRangeBid, classifySuitResponse, keycardAction, postRangeActions,
  publicLengthBounds, suitResponseLadder,
} from './continuations.js';

const defaultHand = 'SA SQ SJ S9 S8 HA HJ H6 D4 CK C8 C6 C2'.split(' ');
const call = (seat, bid) => ({ seat, bid, meaning: '' });

function practice(overrides = {}) {
  return {
    major: 'S', shortageSuit: 'D', balanced: false, phase: 'keycard',
    finished: false, revealed: false, partnerHand: defaultHand,
    playerHand: 'SK ST S7 S6 H4 H3 H2 DA DK DQ DJ CA C3'.split(' '),
    auction: [call('North', '1S'), call('South', '2NT'), call('North', '3D'), call('South', '3H'), call('North', '4C')],
    constraints: [
      { type: 'length', suit: 'S', min: 5 },
      { type: 'length', suit: 'H', max: 4 },
      { type: 'length', suit: 'D', min: 0, max: 1 },
      { type: 'length', suit: 'C', max: 4 },
      { type: 'shapeUniverse', maxShortages: 1 },
    ],
    ...overrides,
  };
}

test('a fixed valid hand follows the shortage-keycard and club-ask example', () => {
  const initial = practice();
  const before = JSON.stringify(initial);
  assert.equal(new Set(initial.partnerHand).size, 13);
  assert.equal(new Set([...initial.partnerHand, ...initial.playerHand]).size, 26);
  assert.deepEqual(postRangeActions(initial).map(a => a.bid), ['4D']);
  const keycards = applyPostRangeBid(initial, '4D');
  assert.equal(keycards.auction.at(-1).bid, '5D');
  assert.equal(keycards.phase, 'post-keycard');
  assert.deepEqual(keycards.constraints.find(c => c.type === 'keycardOptions').values, [2, 5]);
  assert.equal(keycards.constraints.find(c => c.type === 'trumpQueen').value, true);
  assert.deepEqual(postRangeActions(keycards).map(a => [a.bid, a.askSuit]), [['5H', 'H'], ['5NT', 'C']]);
  const clubs = applyPostRangeBid(keycards, '5NT');
  assert.equal(clubs.auction.at(-1).bid, '6H');
  assert.equal(clubs.constraints.at(-1).category, 'kLong');
  assert.equal(clubs.constraints.at(-1).suit, 'C');
  assert.deepEqual(postRangeActions(clubs), [], 'a skipped heart ask cannot be recovered');
  assert.equal(JSON.stringify(initial), before, 'input and fixed hand are unchanged');
  assert.equal(clubs.partnerHand, initial.partnerHand);
});

test('answering the first suit preserves the second ask and skips trump/grand-try bids', () => {
  const keycards = applyPostRangeBid(practice(), '4D');
  const hearts = applyPostRangeBid(keycards, '5H');
  assert.equal(hearts.auction.at(-1).bid, '5S', 'responses count the agreed trump bid');
  assert.deepEqual(postRangeActions(hearts).map(a => [a.bid, a.askSuit]), [['5NT', 'C']]);
  const artificial = { ...hearts, auction: [...hearts.auction, call('North', '6D')] };
  assert.equal(postRangeActions(artificial)[0].bid, '6NT', '6H is the grand try and 6S is trumps');
});

test('SKC identifies a void before normal keycard and every 1M–2NT ask skips 4M', () => {
  const hand = 'SA SQ SJ S9 S8 HA HJ H6 H4 CK C8 C6 C2'.split(' ');
  const voidAnswer = applyPostRangeBid(practice({ partnerHand: hand }), '4D');
  assert.equal(voidAnswer.auction.at(-1).bid, '4H');
  assert.equal(voidAnswer.phase, 'void-keycard');
  assert.deepEqual(voidAnswer.constraints.at(-1), { type: 'length', suit: 'D', equals: 0, label: 'Diamonds void' });
  assert.equal(postRangeActions(voidAnswer)[0].bid, '4NT', 'the next relay skips 4S');
  const cards = applyPostRangeBid(voidAnswer, '4NT');
  assert.equal(cards.auction.at(-1).bid, '5S', 'the normal four-answer ladder includes trump responses');
  assert.equal(cards.constraints.find(c => c.type === 'trumpQueen').value, true);
  const hearts = practice({ major: 'H', shortageSuit: 'D', auction: [call('North', '4D')] });
  assert.equal(postRangeActions(hearts)[0].bid, '4S');
  const responseOnGame = postRangeActions(practice({ major: 'H', auction: [call('North', '4C')] }))[0];
  assert.equal(responseOnGame.responseLadder[0].bid, '4H');
});

test('0/3 and 1/4 leave queen unknown and offer the two-answer ask or direct suit asks', () => {
  const hand = 'SA SJ ST S9 S8 HK HJ H6 D4 CK C8 C6 C2'.split(' ');
  const cards = applyPostRangeBid(practice({ partnerHand: hand }), '4D');
  assert.equal(cards.auction.at(-1).bid, '4NT');
  assert.deepEqual(cards.constraints.find(c => c.type === 'keycardOptions').values, [1, 4]);
  assert.equal(cards.constraints.some(c => c.type === 'trumpQueen'), false);
  assert.deepEqual(postRangeActions(cards).map(a => [a.bid, a.askType, a.askSuit]), [
    ['5C', 'queen', undefined], ['5D', 'suit', 'H'], ['5H', 'suit', 'C'],
  ]);
  const denied = applyPostRangeBid(cards, '5C');
  assert.equal(denied.auction.at(-1).bid, '5D');
  assert.equal(denied.constraints.at(-1).value, false);
  const withQueen = { ...cards, partnerHand: hand.map(card => card === 'ST' ? 'SQ' : card) };
  const shown = applyPostRangeBid(withQueen, '5C');
  assert.equal(shown.auction.at(-1).bid, '5H');
  assert.equal(shown.constraints.at(-1).value, true);
  const skipped = applyPostRangeBid(cards, '5D');
  assert.equal(skipped.constraints.some(c => c.type === 'trumpQueen'), false);
  assert.equal(postRangeActions(skipped).some(a => a.askType === 'queen'), false);
});

test('balanced keycard omits void and supports all five keycards without a false exact count', () => {
  const balanced = practice({
    shortageSuit: null, balanced: true,
    partnerHand: 'SA SK S9 S8 S7 HA H6 H4 DA D4 CA C8 C2'.split(' '),
    constraints: [{ type: 'length', suit: 'S', min: 5 }, { type: 'balanced', value: true }],
  });
  const action = postRangeActions(balanced)[0];
  assert.equal(action.askType, 'keycard');
  assert.equal(action.responseLadder.length, 4);
  assert.equal(action.responseLadder.some(a => a.void), false);
  const cards = applyPostRangeBid(balanced, action.bid);
  assert.deepEqual(cards.constraints.find(c => c.type === 'keycardOptions').values, [2, 5]);
  assert.equal(cards.constraints.find(c => c.type === 'trumpQueen').value, false);
  assert.deepEqual(postRangeActions(cards).map(a => a.askSuit), ['D', 'H', 'C'], 'three suits retain middle/high/low order');
});

test('balanced 3S range answer reserves 3NT to play while shortage 3S retains the relay', () => {
  const auction = [call('North', '1S'), call('South', '2NT'), call('North', '3C'), call('South', '3D'), call('North', '3S')];
  const balanced = practice({ balanced: true, shortageSuit: null, auction });
  assert.equal(postRangeActions(balanced)[0].bid, '4C');
  assert.equal(postRangeActions(practice({ auction }))[0].bid, '3NT');
});

test('specific-suit categories prioritize KQ, Kx, and Kxx over third-round control', () => {
  const cases = [
    ['CA C9 C3', 'none'], ['CQ C9 C3', 'third'], ['CA C3', 'third'],
    ['CK C3', 'kDoubleton'], ['CK C9 C3', 'kLong'], ['CK CQ', 'kq'],
    ['CK CQ C9 C3', 'kq'], ['', 'third'],
  ];
  for (const [holding, category] of cases) assert.equal(classifySuitResponse(holding.split(' ').filter(Boolean), 'C'), category);
});

test('public four-card length removes Kx; public doubleton keeps only third, Kx and KQ', () => {
  const knownLength = length => practice({ constraints: [{ type: 'length', suit: 'C', equals: length }] });
  assert.deepEqual(suitResponseLadder(knownLength(4), 'C').map(a => a.category), ['none', 'third', 'kLong', 'kq']);
  assert.deepEqual(suitResponseLadder(knownLength(2), 'C').map(a => a.category), ['third', 'kDoubleton', 'kq']);
  assert.deepEqual(suitResponseLadder(knownLength(1), 'C').map(a => a.category), ['third']);
});

test('compression cannot inspect the hidden hand or the asker’s known cards', () => {
  const initial = practice();
  const expected = suitResponseLadder(initial, 'C');
  assert.equal(expected.some(a => a.category === 'kDoubleton'), true, 'actual four clubs does not establish public length');
  assert.deepEqual(suitResponseLadder({ ...initial, partnerHand: null, playerHand: null }, 'C'), expected);
  assert.deepEqual(suitResponseLadder({ ...initial, partnerHand: ['CK', 'CQ'], playerHand: ['CK'] }, 'C'), expected);
  const cards = applyPostRangeBid(initial, '4D');
  assert.deepEqual(postRangeActions({ ...cards, partnerHand: null, playerHand: null }), postRangeActions(cards));
});

test('13-card total and public previous answers tighten lengths safely', () => {
  const fixed = practice({ constraints: [
    { type: 'length', suit: 'S', equals: 5 }, { type: 'length', suit: 'H', equals: 3 },
    { type: 'length', suit: 'D', equals: 1 },
  ] });
  assert.deepEqual(publicLengthBounds(fixed).C, { min: 4, max: 4 });
  assert.equal(suitResponseLadder(fixed, 'C').some(a => a.category === 'kDoubleton'), false);
  const before = practice();
  assert.equal(publicLengthBounds(before).C.min, 2, 'known single shortage excludes a second shortage');
  const answered = { ...before, constraints: [...before.constraints, { type: 'suitResponse', suit: 'C', category: 'kDoubleton' }] };
  assert.deepEqual(publicLengthBounds(answered).C, { min: 2, max: 2 });
  assert.throws(() => publicLengthBounds({ constraints: [{ type: 'length', suit: 'S', equals: 14 }] }), /cannot describe/);
});

test('compressed answers count consecutive legal bids and expose their public ladder', () => {
  const initial = practice({ partnerHand: defaultHand.map(card => card === 'C6' ? 'CQ' : card) });
  const cards = applyPostRangeBid(initial, '4D');
  const full = applyPostRangeBid(cards, '5NT');
  assert.equal(full.auction.at(-1).bid, '6NT');
  const known = { ...cards, constraints: [...cards.constraints, { type: 'length', suit: 'C', equals: 4 }] };
  const compressed = applyPostRangeBid(known, '5NT');
  assert.equal(compressed.auction.at(-1).bid, '6S', 'KQ moves down when the impossible Kx step is removed');
  assert.deepEqual(compressed.lastResponseLadder.map(a => [a.bid, a.category]), [
    ['6C', 'none'], ['6D', 'third'], ['6H', 'kLong'], ['6S', 'kq'],
  ]);
  assert.deepEqual(compressed.auction.at(-2).responseLadder, compressed.lastResponseLadder);
  assert.equal(compressed.constraints.at(-1).category, 'kq', 'inverse constraint uses semantic category, not response index');
});

test('terminal states and illegal asks preserve state; no overflow response is offered', () => {
  for (const phase of ['range', 'unsupported', 'finished']) assert.deepEqual(postRangeActions(practice({ phase })), []);
  for (const flag of ['finished', 'revealed']) assert.deepEqual(postRangeActions(practice({ [flag]: true })), []);
  const initial = practice();
  const before = JSON.stringify(initial);
  assert.throws(() => applyPostRangeBid(initial, '4S'), /not an available continuation/);
  assert.equal(JSON.stringify(initial), before);
  const high = practice({ phase: 'suit-ask', remainingAskSuits: ['C'], auction: [call('North', '7D')] });
  assert.deepEqual(postRangeActions(high), []);
});

const minorHand = 'S8 H8 H7 H6 DA DQ DJ DT D9 CK C8 C6 C2'.split(' ');
function minorPractice(overrides = {}) {
  return practice({
    familyId: 'minor-relay-test', major: 'D', trump: 'D',
    playerSeat: 'North', partnerSeat: 'South',
    relayPolicy: { skip3NT: true, skipMajorGame: false },
    shortageSuit: 'S', partnerHand: minorHand,
    auction: [call('North', '1C'), call('South', '1D'), call('North', '2C'), call('South', '3S')],
    constraints: [{ type: 'shapes', values: ['1354'] }, { type: 'hcp', min: 12, max: 15 }],
    ...overrides,
  });
}

test('new policies reserve 3NT but permit a 4C keycard ask with clubs agreed', () => {
  for (const trump of ['C', 'D', 'H', 'S']) {
    const session = minorPractice({ major: trump, trump });
    assert.equal(postRangeActions(session)[0].bid, '4C');
    const preceding = trump === 'C' ? '3NT' : trump === 'D' ? '4C' : trump === 'H' ? '4D' : '4H';
    const onTrump = minorPractice({ major: trump, trump, auction: [call('South', preceding)] });
    assert.equal(postRangeActions(onTrump)[0].bid, `4${trump}`, 'Only an explicit policy may omit that four-level ask');
  }
  const reserved = minorPractice({ major: 'H', trump: 'H', auction: [call('South', '4D')], relayPolicy: { skip3NT: true, skipMajorGame: true } });
  assert.equal(postRangeActions(reserved)[0].bid, '4S');
});

test('minor SKC handles a void and keeps 4C available for the follow-up ask', () => {
  const initial = minorPractice({
    major: 'C', trump: 'C', auction: [call('South', '3H')],
    partnerHand: minorHand.map(card => card === 'S8' ? 'H9' : card),
    constraints: [{ type: 'shapes', values: ['0454'] }],
  });
  const voidAnswer = applyPostRangeBid(initial, '3S');
  assert.equal(voidAnswer.auction.at(-1).bid, '3NT', 'Answers still count every bid');
  assert.equal(voidAnswer.phase, 'void-keycard');
  assert.equal(postRangeActions(voidAnswer)[0].bid, '4C');
  const keycards = applyPostRangeBid(voidAnswer, '4C');
  assert.equal(keycards.auction.at(-1).bid, '4S');
  assert.deepEqual(keycards.constraints.find(c => c.type === 'keycardOptions'), {
    type: 'keycardOptions', trump: 'C', values: [2, 5], label: '2 or 5 keycards, no trump queen',
  });
});

test('alternative trump agreements use public steps and recalculate keycards and queen', () => {
  const initial = minorPractice({ agreementOptions: ['D', 'C', 'H', 'C'] });
  const original = JSON.stringify(initial);
  const actions = postRangeActions(initial);
  assert.deepEqual(actions.map(({ bid, trump }) => [bid, trump]), [['4C', 'D'], ['4D', 'C'], ['4H', 'H']]);
  assert.deepEqual(postRangeActions({ ...initial, partnerHand: null, playerHand: null }), actions);
  assert.ok(actions.every(action => action.responseLadder.some(answer => answer.values?.includes(0))), '12–15 HCP does not remove 0/3');
  const diamonds = applyPostRangeBid(initial, '4C');
  assert.deepEqual(diamonds.constraints.find(c => c.type === 'keycardOptions').values, [1, 4]);
  assert.equal(diamonds.constraints.some(c => c.type === 'trumpQueen'), false);
  const clubs = applyPostRangeBid(initial, '4D');
  assert.equal(clubs.major, 'C');
  assert.equal(clubs.trump, 'C');
  assert.equal(clubs.auction.at(-1).bid, '5C');
  assert.deepEqual(clubs.constraints.find(c => c.type === 'keycardOptions').values, [2, 5]);
  assert.equal(clubs.constraints.find(c => c.type === 'keycardOptions').trump, 'C');
  assert.equal(clubs.constraints.find(c => c.type === 'trumpQueen').trump, 'C');
  assert.equal(clubs.constraints.find(c => c.type === 'trumpQueen').value, false);
  assert.deepEqual(clubs.agreementOptions, []);
  assert.deepEqual(clubs.auction.slice(-2).map(({ seat }) => seat), ['North', 'South']);
  assert.equal(JSON.stringify(initial), original);
});

test('minor queen asks skip 3NT, trump bids and the grand try while counting all replies', () => {
  for (const trump of ['C', 'D']) {
    const initial = minorPractice({
      trump, major: trump, phase: 'post-keycard',
      partnerHand: minorHand.map(card => card === 'CK' ? 'CQ' : card),
      constraints: [{ type: 'shapes', values: ['1354'] }, { type: 'keycardOptions', trump, values: [1, 4] }],
    });
    const queenAsk = postRangeActions(initial)[0];
    assert.equal(queenAsk.askType, 'queen');
    assert.equal(queenAsk.bid, trump === 'C' ? '4D' : '4C');
    const shown = applyPostRangeBid(initial, queenAsk.bid);
    assert.equal(shown.auction.at(-1).bid, trump === 'C' ? '4S' : '4H');
    assert.deepEqual(shown.constraints.at(-1), { type: 'trumpQueen', trump, value: true, label: 'Has the trump queen' });
    const beforeGrand = { ...shown, auction: [call('South', trump === 'C' ? '5S' : '5NT')] };
    assert.equal(postRangeActions(beforeGrand)[0].bid, trump === 'C' ? '6D' : '6H');
    const otherQueen = { ...initial, constraints: [{ type: 'trumpQueen', trump: trump === 'C' ? 'D' : 'C', value: true }] };
    assert.equal(postRangeActions(otherQueen)[0].askType, 'queen', 'A queen in another trump suit does not answer this ask');
  }
});

test('major-family sessions retain legacy unannotated keycard constraints', () => {
  const old = applyPostRangeBid(practice(), '4D');
  const labelled = applyPostRangeBid(practice({ familyId: 'major-S', trump: 'S', playerSeat: 'South', partnerSeat: 'North' }), '4D');
  assert.deepEqual(labelled.constraints, old.constraints);
});

test('source-node helper asks keycard at the supplied bid without an extra relay', () => {
  const initial = minorPractice({ major: 'C', trump: 'C', phase: 'node', auction: [call('South', '2S')] });
  const original = JSON.stringify(initial);
  const action = keycardAction(initial, '3C');
  assert.equal(action.askType, 'shortage-keycard');
  assert.equal(action.trump, 'C');
  assert.equal(action.responseLadder.length, 5);
  const answered = applyPostRangeBid(initial, '3C', action);
  assert.equal(answered.auction.length, initial.auction.length + 2);
  assert.deepEqual(answered.auction.slice(-2).map(({ seat, bid }) => [seat, bid]), [['North', '3C'], ['South', '3NT']]);
  assert.equal(JSON.stringify(initial), original);
  assert.equal(keycardAction(initial, '7H'), null);
  assert.throws(() => applyPostRangeBid(initial, '3D', action), /not a legal continuation/);
});

test('ordinary Kickback preserves known shortage without adding the SKC void rung', () => {
  const initial = minorPractice({ major: 'C', trump: 'C', phase: 'node', auction: [call('South', '3S')] });
  const action = keycardAction(initial, '4D', 'C', 'normal');
  assert.equal(action.askType, 'keycard');
  assert.equal(action.responseLadder.length, 4);
  assert.equal(action.responseLadder.some(answer => answer.void), false);
  const answered = applyPostRangeBid(initial, '4D', action);
  assert.equal(answered.auction.at(-1).bid, '4NT');
  assert.equal(answered.shortageSuit, 'S');
  assert.equal(answered.constraints.some(c => c.type === 'length' && c.suit === 'S' && c.equals === 1), false);
  assert.ok(postRangeActions(answered).every(candidate => candidate.askSuit !== 'S'));
  assert.equal(keycardAction({ ...initial, keycardMode: 'normal' }, '4D').askType, 'keycard');
});

test('public shape alternatives retain correlations when intersected with other constraints', () => {
  const session = {
    trump: 'D', constraints: [
      { type: 'shapes', values: ['4351', '4054'] },
      { type: 'length', suit: 'H', min: 2 },
    ],
  };
  assert.deepEqual(publicLengthBounds(session), { S: { min: 4, max: 4 }, H: { min: 3, max: 3 }, D: { min: 5, max: 5 }, C: { min: 1, max: 1 } });
  assert.deepEqual(suitResponseLadder(session, 'C').map(answer => answer.category), ['third']);
  assert.deepEqual(publicLengthBounds({ trump: 'D', constraints: [{ type: 'shapes', values: ['4351', '4054'] }] }).C, { min: 1, max: 4 });
});

test('anyOf takes the union of whole conjunctions before deriving safe length bounds', () => {
  const alternatives = { type: 'anyOf', options: [
    [{ type: 'shapes', values: ['4351'] }, { type: 'hcp', min: 12 }],
    [{ type: 'shapes', values: ['4054'] }, { type: 'hcp', min: 16 }],
  ] };
  const session = { constraints: [alternatives] };
  assert.deepEqual(publicLengthBounds(session).H, { min: 0, max: 3 });
  assert.deepEqual(publicLengthBounds(session).C, { min: 1, max: 4 });
  assert.deepEqual(publicLengthBounds({ constraints: [alternatives, { type: 'length', suit: 'C', min: 3 }] }).H, { min: 0, max: 0 });
  const unknownBranch = { constraints: [{ type: 'anyOf', options: [[{ type: 'hcp', min: 20 }], [{ type: 'length', suit: 'C', equals: 4 }]] }] };
  assert.deepEqual(publicLengthBounds(unknownBranch).C, { min: 0, max: 13 }, 'An HCP-only branch cannot be treated as a length restriction');
  assert.throws(() => publicLengthBounds({ constraints: [alternatives, { type: 'length', suit: 'H', equals: 2 }] }), /cannot describe/);
  assert.deepEqual(publicLengthBounds({ ...session, playerHand: null, partnerHand: null }), publicLengthBounds(session));
});

test('generated hands retain truthful public constraints through both complete relay paths', async () => {
  const { applyBid, availableActions, createPractice, matchesConstraints } = await import('./core.js');
  const reached = new Set();
  for (const major of ['S', 'H']) {
    for (let seed = 0; seed < 60; seed += 1) {
      let session = createPractice({ major, seed: `integration-${seed}` });
      const originalHand = session.partnerHand;
      for (let turn = 0; turn < 12; turn += 1) {
        reached.add(session.phase);
        const actions = availableActions(session).filter(action => action.kind === 'relay');
        if (!actions.length) break;
        // Exercise optional queen bypasses and skipped first suits as well as
        // the complete lowest-step path; all decisions use public actions.
        const action = seed % 3 === 0 ? actions.at(-1) : actions[0];
        session = applyBid(session, action.bid);
        assert.equal(session.partnerHand, originalHand);
        assert.equal(matchesConstraints(originalHand, session.constraints, major), true, `${major}, seed ${seed}`);
      }
    }
  }
  for (const phase of ['range', 'keycard', 'void-keycard', 'post-keycard', 'suit-ask', 'unsupported']) assert.ok(reached.has(phase), phase);
});

test('samples after specific-suit information reproduce all disclosed answers without the actual hand', async () => {
  const { applyBid, availableActions, createPractice, sampleCompatible } = await import('./core.js');
  for (const major of ['S', 'H']) {
    const initial = createPractice({ major, seed: 'integration-0' });
    let session = initial;
    const asks = [];
    while (asks.length < 8 && !session.constraints.some(c => c.type === 'suitResponse')) {
      const action = availableActions(session).find(candidate => candidate.kind === 'relay');
      assert.ok(action);
      asks.push(action.bid);
      session = applyBid(session, action.bid);
    }
    const settings = { count: 5, seed: 'public-constraints', maxAttempts: 200000 };
    const samples = sampleCompatible(session, settings);
    assert.equal(samples.complete, true);
    assert.deepEqual(sampleCompatible({ ...session, partnerHand: null }, settings), samples);
    for (const partnerHand of samples.hands) {
      let replay = { ...initial, partnerHand };
      for (const bid of asks) replay = applyBid(replay, bid);
      assert.deepEqual(replay.auction, session.auction);
      assert.deepEqual(replay.constraints, session.constraints);
    }
  }
});
