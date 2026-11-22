import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_PROFILES, applyBid } from './core.js';
import { advanceAsker, applyPracticeBid, createTrainingPractice, practiceView } from './practice.js';
import { openingPartnerBid } from './opening-practice.js';

// These seeds were collected through the ordinary Just Bid generator.
// Together they reach every study profile and the whole-auction diamond raise.
const relaySeeds = [
  8, 9, 13, 23, 24, 46, 70, 71, 73, 75, 92, 97,
  98, 106, 112, 118, 153, 160, 186, 195, 210, 227, 230, 259,
  266, 275, 284, 287, 317, 324, 325, 345, 346, 365, 378, 412,
  515, 536, 541, 599, 648, 660, 665, 754, 757, 781, 1053,
  1082, 1097, 1196, 1214, 1340, 1533, 1661, 1677, 1720, 1732, 1901, 2028, 2047,
  2432, 3120, 4592, 5083,
];

function bidOnPolicy(session) {
  if (session.opening) {
    return openingPartnerBid({ ...session.opening, auction:session.auction, hand:practiceView(session).playerHand });
  }
  if (session.practiceRole === 'asker') return advanceAsker(session).pendingAsk?.bid ?? 'Pass';
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
  const expected = [...PRACTICE_PROFILES.map(profile => profile.id),'diamond-2nt-raise'].sort();
  for (const set of Object.values(reached)) assert.deepEqual([...set].sort(),expected);
});

test('Just Bid randomly assigns both physical seats for every supported opening', () => {
  const seedsByOpeningAndSeat = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 13, 14, 17, 19, 21, 24, 34, 36,
    37, 38, 53, 56, 75, 80, 83, 84, 97, 100, 101, 114, 125, 140, 258, 607,
  ];
  const reached = { North:[],South:[] };
  for (const number of seedsByOpeningAndSeat) {
    const session = createTrainingPractice({auctionMode:true,openingFamily:'all',seed:`mixed-opening-coverage-${number}`});
    const { passedHand, humanSeat, openingBid = '1C' } = session.wholeAuction;
    assert.ok(session.auction.every(call => call.seat !== humanSeat || call.bid === 'Pass'));
    assert.equal(session.pendingAsk,null);
    assert.deepEqual(session.auction.filter(call=>call.bid!=='Pass').map(call=>call.bid),humanSeat==='North'?[]:[openingBid]);
    reached[humanSeat].push(passedHand ? `PH-${openingBid}` : openingBid);
  }
  const expected = ['1C','1D','1H','1S','1NT','2C','2D','2H','2S','2NT',
    'PH-1C','PH-1D','PH-1H','PH-1S','PH-1NT','PH-2C','PH-2NT'].sort();
  for (const bids of Object.values(reached)) assert.deepEqual(bids.sort(),expected);
});
