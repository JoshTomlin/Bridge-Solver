import test from 'node:test';
import assert from 'node:assert/strict';
import { DECK, makeRng, handFeatures, matchesConstraints } from './core.js';
import { createPassedPractice, passedActions, applyPassedCall, passedPartnerBid } from './passed-hand.js';
import { createTrainingPractice, applyPracticeBid, practiceView } from './practice.js';
import { openingPartnerBid } from './opening-practice.js';
import { tableView } from './seat-view.js';
import { auctionRounds } from './table-ui.js';
import { savePracticeProgress, loadPracticeProgress } from './progress.js';
import { createHandRecord, recordedCallDetails, loadHandHistory, saveHandHistory } from './hand-history.js';

const cards = text => text.split(' ').flatMap((holding, i) => holding === '-' ? [] : [...holding].map(rank => 'SHDC'[i] + rank));
const southDefault = cards('K32 Q32 J32 9876');
function northFor(south, points, predicate = () => true) {
  const pool = DECK.filter(card => !south.includes(card)), rng = makeRng(`passed-fixture:${south}:${points}`);
  for (let trial = 0; trial < 200000; trial++) {
    const draw = [...pool];
    for (let i = 0; i < 13; i++) { const j = i + Math.floor(rng() * (draw.length - i)); [draw[i], draw[j]] = [draw[j], draw[i]]; }
    const hand = draw.slice(0, 13), f = handFeatures(hand, 'C');
    if (f.hcp === points && f.balanced && predicate(f)) return hand;
  }
  throw new Error('No independent fixture found');
}
function fixture({ family = 'PH-C', south = southDefault, points = 19, north, vulnerable = false, position = 3 } = {}) {
  const initial = createPassedPractice({ openingFamily: family, seed: 'source-fixture', humanSeat: 'North', openingSeatNumber: position, vulnerable });
  const session = { ...initial,
    playerHand: north ?? northFor(south, points, f => family !== 'PH-2C' || ['4333','4432','5332'].includes(f.shape.join(''))),
    partnerHand: south };
  assert.equal(south.length, 13); assert.equal(new Set([...session.playerHand, ...south]).size, 26);
  return applyPassedCall(applyPassedCall(session, 'Pass'), initial.wholeAuction.openingBid);
}

test('passed club maximum bands change with vulnerability; 1D is artificial rather than a heart transfer', () => {
  const nv = fixture();
  assert.doesNotThrow(() => applyPassedCall(nv, '1D'));
  assert.throws(() => applyPassedCall(fixture({ vulnerable: true }), '1D'), /7–9/);
  const seven = cards('K32 Q32 Q32 9876');
  const v = applyPassedCall(fixture({ vulnerable: true, south: seven }), '1D');
  assert.equal(v.opening.node, 'club-rebid');
  assert.deepEqual(v.auction.map(c => c.bid), ['Pass', '1C', '1D']);
});

test('literal passed-club game-force replies follow P1757–P1766, including all five-five resolutions', () => {
  const examples = [
    ['K32 Q32 J32 9876', '1S'], ['32 QJ987 2 K9876', '1NT', '2D'],
    ['32 2 QJ987 K9876', '1NT', '2H'], ['32 QJ987 K9876 2', '1NT', '2S'],
    ['K432 Q32 J32 987', '2C'], ['K32 QJ987 432 98', '2D'],
    ['K5432 QJ3 432 98', '2H'], ['K32 QJ43 432 987', '2S'],
    ['- QJ987 K432 9876', '2NT'], ['- QJ98 K432 98765', '3C'],
    ['- QJ98 K5432 9876', '3D'], ['K432 QJ43 987 65', '3H'],
  ];
  for (const [holding, expected, resolved] of examples) {
    const south = cards(holding);
    let session = fixture({ south });
    session = applyPassedCall(applyPassedCall(session, '1D'), '1H');
    assert.equal(passedPartnerBid({ ...session.opening, auction: session.auction, hand: south }), expected);
    session = applyPassedCall(session, expected);
    if (resolved) session = applyPassedCall(applyPassedCall(session, '2C'), resolved);
    assert.equal(matchesConstraints(south, session.constraints, session.trump), true);
    assert.equal(session.auction.at(-1).bid, resolved ?? expected);
  }
});

test('a passed-hand two-over-one promises the five-card side suit and exactly three trumps, without a game-force meaning', () => {
  for (const [family, holding, bid, support] of [
    ['PH-D', '432 Q2 K32 J9876', '2C', 'D'], ['PH-H', '432 K32 Q2 J9876', '2C', 'H'],
    ['PH-H', '432 K32 J9876 Q2', '2D', 'H'], ['PH-S', 'K32 432 Q2 J9876', '2C', 'S'],
    ['PH-S', 'K32 432 J9876 Q2', '2D', 'S'], ['PH-S', 'K32 J9876 Q2 432', '2H', 'S'],
  ]) {
    const south = cards(holding), trump = family.slice(3);
    const north = northFor(south, 14, f => f.lengths[trump] >= (trump === 'D' ? 4 : 5));
    const session = fixture({ family, south, points: 14, north });
    const described = applyPassedCall(session, bid);
    assert.equal(handFeatures(south, 'C').lengths[support], 3);
    assert.match(described.auction.at(-1).meaning, /fit-showing/);
    assert.equal(described.opening.node, 'natural-rebid');
    assert.equal(matchesConstraints(south, described.constraints, 'C'), true);
    assert.equal(described.constraints.some(fact => fact.type === 'hcp' && fact.min >= 10), false);
  }
  const badSouth = cards('K432 Q2 J2 98765');
  const north = northFor(badSouth, 14, f => f.lengths.H >= 5);
  const before = fixture({ family: 'PH-H', south: badSouth, north });
  const snapshot = JSON.stringify(before);
  assert.throws(() => applyPassedCall(before, '2C'), /three hearts/);
  assert.equal(JSON.stringify(before), snapshot);
  // A five-card side suit must not turn four-card support into a three-card promise.
  for (const trump of ['D', 'H', 'S']) {
    const lengths = { D: '32 Q2 K432 J9876', H: '32 K432 Q2 J9876', S: 'K432 32 Q2 J9876' };
    const south = cards(lengths[trump]);
    assert.equal(passedPartnerBid({ node: 'respond', bid: `1${trump}`, hand: south }), `2${trump}`);
  }
});

test('strong passed-hand notrump ranges and Puppet replies differ from first-seat Muppet', () => {
  for (const [holding, expected] of [
    ['AK2 AKQJ9 K32 Q2', '3H'], ['AKQJ9 AK2 K32 Q2', '3S'],
    ['AKQ9 AKJ9 K32 Q2', '3D'], ['AKQ AKJ K432 Q32', '3NT'],
  ]) {
    const north = cards(holding);
    const pool = DECK.filter(card => !north.includes(card));
    const south = pool.filter(card => !'AK'.includes(card[1])).slice(0, 13);
    const initial = createPassedPractice({ openingFamily: 'PH-2NT', seed: 'puppet-fixture', humanSeat: 'North' });
    let session = { ...initial, playerHand: north, partnerHand: south };
    assert.equal(handFeatures(north, 'C').hcp, 22);
    session = applyPassedCall(applyPassedCall(applyPassedCall(session, 'Pass'), '2NT'), '3C');
    assert.equal(passedPartnerBid({ ...session.opening, auction: session.auction, hand: north }), expected);
    assert.doesNotThrow(() => applyPassedCall(session, expected));
  }
  for (const [holding, response] of [
    ['Q32 Q32 Q32 9876', '2D'], ['K32 Q32 J32 9876', '2D'], ['A32 Q32 432 9876', '2H'],
    ['A32 K32 432 9876', '2S'], ['A32 A32 432 9876', '2D'],
  ]) {
    const south = cards(holding);
    let session = fixture({ family: 'PH-2C', south, points: 24 });
    session = applyPassedCall(session, response);
    session = applyPassedCall(session, '2NT');
    assert.equal(session.opening.node, 'puppet-response');
    assert.ok(session.openingConstraintsBySeat.North.some(fact => fact.type === 'hcp' && fact.min === 24 && fact.max === 25));
    assert.match(passedActions(session).find(row => row.bid === '3C').label, /Puppet/);
  }
});

test('the inconsistent P1780 call pauses without inventing shape or changing cards', () => {
  const south = cards('32 QJ987 K9876 2');
  let session = fixture({ south });
  session = applyPassedCall(applyPassedCall(session, '1D'), '1NT');
  const before = session;
  const paused = applyPassedCall(session, '2S');
  assert.equal(paused.coverageBoundary, true);
  assert.match(paused.unsupportedReason, /P1780/);
  assert.deepEqual(paused.constraints, before.constraints);
  assert.deepEqual(paused.partnerHand, south);
  const inPractice = applyPracticeBid({ ...session, practiceRole: 'teller', wholeAuction: { ...session.wholeAuction, humanSeat: 'South' } }, '2S');
  assert.equal(inPractice.sourceAmbiguity, true);
  assert.equal(inPractice.contract, null, 'The source conflict cannot become an ordinary contract fallback');
});

test('third/fourth-seat auctions display exactly two/three prior passes in either human role', () => {
  for (const position of [3, 4]) for (const humanSeat of ['North', 'South']) {
    const initial = createPassedPractice({ openingFamily: 'PH-C', seed: 'prior-passes', humanSeat, openingSeatNumber: position });
    const session = applyPassedCall(applyPassedCall(initial, 'Pass'), '1C'), view = tableView(session);
    const calls = auctionRounds(view.auction, false, view.dealerSeat).flat().filter(Boolean);
    const opening = calls.findIndex(call => call.bid === '1C');
    assert.equal(calls.slice(0, opening).filter(call => call.bid === 'Pass').length, position - 1);
    assert.equal(view.playerSeat, 'South');
    const record = createHandRecord(session, [], { id: `passed-${position}-${humanSeat}` });
    const storage = { setItem(key, value) { this.value = value; }, getItem() { return this.value; } };
    saveHandHistory([record], storage);
    const loaded = loadHandHistory(storage).records[0];
    assert.deepEqual(loaded, record);
    assert.equal(recordedCallDetails(loaded, 1).dealerSeat, view.dealerSeat);
    const archived = auctionRounds(loaded.auction, false, loaded.dealerSeat).flat().filter(Boolean);
    assert.equal(archived.findIndex(call => call.bid === '1C'), position - 1);
  }
});

test('the human can open a Horton two or pass on the same fourth-seat practice deal', () => {
  const options = { openingFamily: 'PH-D', seed: 'human-first-call', humanSeat: 'South', openingSeatNumber: 4 };
  const initial = { ...createTrainingPractice({ ...options, auctionMode: true }),
    playerHand: cards('AKQ J98 AQ95 J98'), partnerHand: cards('J642 6 T862 KQ52') };
  assert.equal(new Set([...initial.playerHand, ...initial.partnerHand]).size, 26);
  assert.equal(initial.opening.node, 'first-call');
  assert.deepEqual(initial.auction, []);
  assert.deepEqual(initial.constraints, []);
  const view = tableView(initial);
  assert.deepEqual(auctionRounds(view.auction, false, view.dealerSeat).flat().map(cell => cell?.bid ?? cell?.kind ?? null),
    [null, 'Pass', 'pending', null]);
  assert.throws(() => applyPracticeBid(initial, '2H'), /four-plus hearts/);

  const passed = applyPracticeBid(initial, 'Pass');
  assert.deepEqual(passed.auction.map(({seat,bid}) => [seat,bid]), [['South','Pass'],['North','1D']]);
  assert.equal(passed.opening.node, 'respond');
  for (const bid of ['2D','2S']) {
    const opened = applyPracticeBid(initial, bid);
    assert.deepEqual(tableView(opened).auction.map(({seat,bid}) => [seat,bid]), [['South',bid],['North','2NT']]);
    assert.deepEqual(practiceView(opened).playerHand, initial.partnerHand);
    assert.deepEqual(practiceView(opened).partnerHand, initial.playerHand);
    assert.equal(opened.familyId, `horton-${bid[1].toLowerCase()}`);
    const answer = applyPracticeBid(opened, '3S');
    assert.equal(answer.auction.at(-1).bid, '3S');
    const store = { setItem(key, value) { this.value = value; }, getItem() { return this.value; } };
    savePracticeProgress({ session: answer, history: [initial, opened], preferences: { practiceMode:'mixed' } }, store);
    const restored = loadPracticeProgress(store);
    assert.equal(restored.error, undefined);
    assert.deepEqual(restored.progress.history, JSON.parse(JSON.stringify([initial, opened])));
    assert.deepEqual(restored.progress.session, JSON.parse(JSON.stringify(answer)));
  }

  const legacy = { ...passed, auction: [{ seat: 'South', bid: 'Pass' }, passed.auction[1]] };
  const store = { setItem(key, value) { this.value = value; }, getItem() { return this.value; } };
  savePracticeProgress({ session: legacy, history: [], preferences: { practiceMode:'mixed' } }, store);
  assert.deepEqual(loadPracticeProgress(store).progress.session, initial);
});

test('all passed opening families replay, finish with fixed hands and restore each human turn across position/vulnerability', () => {
  for (const family of ['PH-C', 'PH-D', 'PH-H', 'PH-S', 'PH-NT', 'PH-2NT', 'PH-2C']) for (const humanSeat of ['North', 'South'])
    for (const openingSeatNumber of [3, 4]) for (const vulnerable of [false, true]) for (let seed = 0; seed < 4; seed++) {
    const options = { auctionMode: true, openingFamily: family, humanSeat, seed: `passed-walk-${seed}`, openingSeatNumber, vulnerable };
    let session = createTrainingPractice(options);
    assert.deepEqual(session, createTrainingPractice(options));
    const hands = [session.playerHand, session.partnerHand], history = [];
    for (let turns = 0; !session.finished && turns < 20; turns++) {
      const storage = { value: null, setItem(key, value) { this.value = value; }, getItem() { return this.value; } };
      savePracticeProgress({ session, history, preferences: { practiceMode: 'auction', openingFamily: family } }, storage);
      const loaded = loadPracticeProgress(storage);
      assert.equal(loaded.error, undefined, `${family}: ${loaded.error}`);
      const bid = openingPartnerBid({ ...session.opening, auction: session.auction,
        hand: session.opening.seat === session.playerSeat ? session.playerHand : session.partnerHand });
      history.push(session); session = applyPracticeBid(session, bid);
      for (const seat of ['North', 'South']) assert.equal(matchesConstraints(seat === session.playerSeat ? session.playerHand : session.partnerHand,
        session.openingConstraintsBySeat[seat], session.trump), true, `${family}: ${seat} facts`);
      assert.deepEqual([session.playerHand, session.partnerHand], hands);
      assert.equal(tableView(session).playerSeat, 'South');
    }
    assert.equal(session.finished, true, family);
  }
});
