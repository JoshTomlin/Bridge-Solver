import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_PROFILES, applyBid, handFeatures } from './core.js';
import { advanceAsker, applyPracticeBid, createTrainingPractice, practiceCalls, practiceView } from './practice.js';
import { openingFamilyFor, openingPartnerBid } from './opening-practice.js';
import { loadPracticeProgress, savePracticeProgress } from './progress.js';

// These seeds were collected through the ordinary Just Bid generator.
// Together they reach every study profile and the whole-auction diamond raise.
const relaySeeds = [
  8, 9, 13, 23, 24, 46, 70, 71, 73, 75, 92, 97,
  98, 106, 112, 118, 153, 160, 186, 195, 210, 227, 230, 259,
  266, 275, 284, 287, 317, 324, 325, 345, 346, 365, 378, 412,
  515, 536, 541, 599, 648, 660, 665, 754, 757, 781, 1053,
  1082, 1097, 1196, 1214, 1340, 1533, 1661, 1677, 1720, 1732, 1901, 2028, 2047,
  2432, 3120, 4592, 5083,
  40, 183, 565, 1024, 1855, 3450,
];

function bidOnPolicy(session) {
  if (session.opening) {
    return openingPartnerBid({ ...session.opening, auction:session.auction, hand:practiceView(session).playerHand });
  }
  if (session.practiceRole === 'asker') {
    const next = advanceAsker(session);
    return next.auction[session.auction.length]?.bid ?? next.pendingAsk?.bid ?? 'Pass';
  }
  const after = applyBid(session,session.pendingAsk.bid);
  return after.auction.slice(session.auction.length).find(call => call.seat === session.partnerSeat).bid;
}

test('Just Bid can reach every implemented study entry from the opening in either physical seat', () => {
  const reached = { North:new Set(),South:new Set() };
  for (const number of relaySeeds) {
    const seed = `mixed-opening-coverage-${number}`;
    const random = createTrainingPractice({auctionMode:true,openingFamily:'all',seed});
    const actual = {};
    for (const humanSeat of ['North','South']) {
      const initial = random.wholeAuction.humanSeat === humanSeat ? random
        : createTrainingPractice({auctionMode:true,openingFamily:'all',seed,humanSeat});
      const cards = practiceView(initial).playerHand;
      assert.deepEqual(initial.auction.map(call=>call.bid),humanSeat === 'North' ? [] : [initial.wholeAuction.openingBid ?? '1C'],seed);
      let session = initial;
      for (let i=0;!session.finished && i<36;i++) {
        assert.equal(practiceView(session).playerSeat,humanSeat,seed);
        assert.deepEqual(practiceView(session).playerHand,cards,seed);
        if (!session.opening) reached[humanSeat].add(session.familyId);
        session = applyPracticeBid(session,bidOnPolicy(session));
      }
      assert.ok(session.finished && session.contract,seed);
      actual[humanSeat] = session.auction.map(({seat,bid})=>[seat,bid]);
    }
    assert.deepEqual(actual.North,actual.South,seed);
  }
  const expected = [...PRACTICE_PROFILES.filter(profile => !profile.studyOnly).map(profile => profile.id),'diamond-2nt-raise'].sort();
  for (const set of Object.values(reached)) assert.deepEqual([...set].sort(),expected);
});

test('Just Bid randomly assigns both physical seats for every supported opening', () => {
  const seedsByOpeningAndSeat = [
    0, 1, 2, 3, 4, 5, 6, 8, 10, 11, 13, 14, 17, 19, 21, 24, 25, 26, 34, 36, 37, 38,
    48, 51, 53, 56, 75, 80, 83, 97, 111, 114, 116, 223, 258, 306, 307, 313, 373, 561, 661, 679,
  ];
  const reached = { North:[],South:[] };
  for (const number of seedsByOpeningAndSeat) {
    const session = createTrainingPractice({auctionMode:true,openingFamily:'all',seed:`mixed-opening-coverage-${number}`});
    const { passedHand, humanSeat, openingBid = '1C' } = session.wholeAuction;
    assert.ok(session.auction.every(call => call.seat !== humanSeat));
    assert.equal(session.pendingAsk,null);
    assert.deepEqual(session.auction.filter(call=>call.bid!=='Pass').map(call=>call.bid),humanSeat==='North' || passedHand ? [] : [openingBid]);
    reached[humanSeat].push(passedHand ? `PH-${openingBid}` : openingBid);
  }
  const expected = ['1C','1D','1H','1S','1NT','2C','2D','2H','2S','2NT','3C','3D','3H','3S',
    'PH-1C','PH-1D','PH-1H','PH-1S','PH-1NT','PH-2C','PH-2NT'].sort();
  for (const bids of Object.values(reached)) assert.deepEqual(bids.sort(),expected);
});

test('mixed deals make balanced 20+ hands occasional and can replay reweighted passed-hand deals', () => {
  const count = 300;
  let strongBalanced = 0;
  let passedReplay;
  for (let i = 0; i < count; i++) {
    const session = createTrainingPractice({ auctionMode: true, openingFamily: 'all', seed: `mix-balance-audit-${i}` });
    const { hcp, shape } = handFeatures(practiceView(session).playerHand, 'C');
    if (hcp >= 20 && ['4333', '4432', '5332'].includes(shape.join(''))) strongBalanced++;
    if (session.wholeAuction.passedHand && openingFamilyFor(session) !== 'PH') passedReplay ??= session;
  }
  assert.ok(strongBalanced > 0 && strongBalanced < count * 0.08, `${strongBalanced} big balanced hands in ${count} deals`);
  assert.ok(passedReplay);
  const { humanSeat, openingSeatNumber, vulnerable } = passedReplay.wholeAuction;
  assert.deepEqual(createTrainingPractice({ auctionMode: true, seed: passedReplay.seed, openingFamily: openingFamilyFor(passedReplay),
    humanSeat, openingSeatNumber, vulnerable }), passedReplay);
});

test('an alternate opening keeps the original deal, continues normally, and survives reload and Undo', () => {
  const initial = {
    ...createTrainingPractice({ auctionMode: true, openingFamily: 'D', seed: 'reported-spade-opening', humanSeat: 'North' }),
    playerHand: 'ST S6 S5 S4 S2 HQ H4 DK DQ D8 D3 D2 CA'.split(' '),
    partnerHand: 'SA S9 S7 HA HT H3 DA DJ D7 D6 D5 CK C2'.split(' '),
  };
  assert.equal(practiceCalls(initial).find(call => call.bid === '1S').discussed, true);
  const after = applyPracticeBid(initial, '1S');
  assert.deepEqual(after.auction.map(call => call.bid), ['1S', '2C']);
  assert.equal(after.wholeAuction.openingBid, '1S');
  assert.equal(openingFamilyFor(after), 'D', 'Replay uses the original deal generator');
  assert.equal(after.finished, false);
  assert.deepEqual(practiceView(after).playerHand, initial.playerHand);
  assert.deepEqual(practiceView(after).partnerHand, initial.partnerHand);
  assert.equal(applyPracticeBid(applyPracticeBid(after, '2S'), 'Pass').contract.bid, '4S');

  const storage = { setItem(key, value) { this.value = value; }, getItem() { return this.value; } };
  savePracticeProgress({ session: after, history: [initial], preferences: { practiceMode: 'mixed' } }, storage);
  const loaded = loadPracticeProgress(storage);
  assert.equal(loaded.error, undefined);
  assert.deepEqual(loaded.progress.history, [initial]);
  assert.deepEqual(loaded.progress.session, after);

  const unsupported = applyPracticeBid(initial, '4S');
  assert.equal(unsupported.coverageBoundary, true);
  assert.equal(unsupported.contract, null);
  assert.deepEqual(unsupported.auction.map(call => call.bid), ['4S']);
});
