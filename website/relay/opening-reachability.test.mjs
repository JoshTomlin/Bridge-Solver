import test from 'node:test';
import assert from 'node:assert/strict';
import { handFeatures } from './core.js';
import { applyPracticeBid, createTrainingPractice, practiceCalls, practiceView } from './practice.js';
import { auctionCallDetails } from './auction-study.js';
import { loadPracticeProgress, savePracticeProgress } from './progress.js';
import { advanceOpeningPartner } from './opening-practice.js';

const deal = (openingFamily, humanSeat, number) => createTrainingPractice({
  auctionMode: true, openingFamily, humanSeat, seed: `opening-audit-${number}`,
});
const bids = session => practiceView(session).auction.map(call => call.bid);

function restore(session, history) {
  const storage = { setItem(key, value) { this.value = value; }, getItem() { return this.value; } };
  savePracticeProgress({ session, history, preferences: { practiceMode: 'auction' } }, storage);
  const saved = loadPracticeProgress(storage);
  assert.equal(saved.error, undefined);
  assert.deepEqual(saved.progress.session, JSON.parse(JSON.stringify(session)));
}

test('the same no-major deal reaches 1S from either seat and distinguishes the two meanings of 2D', () => {
  for (const [seed, rebid, final, declarer] of [[0,'2C','3NT','North'], [1,'1NT','2D','South']]) {
    for (const seat of ['South','North']) {
      const start = deal('C', seat, seed);
      const history = [start];
      const calls = seat === 'South' ? ['1S','2D', ...(rebid === '2C' ? ['Pass'] : [])]
        : ['1C',rebid, rebid === '2C' ? '3NT' : 'Pass'];
      let s = start;
      for (const bid of calls) {
        s = applyPracticeBid(s, bid);
        if (s.opening?.node === 'club-spade-rebid' || s.opening?.node === 'club-spade-request') {
          assert.equal(practiceCalls(s).some(row => row.bid === 'Pass'), false);
        }
        assert.deepEqual(practiceView(s).playerHand, practiceView(start).playerHand);
        restore(s, history);
        history.push(s);
      }
      assert.deepEqual(bids(s), ['1C','1S',rebid,'2D', ...(rebid === '2C' ? ['3NT'] : []),'Pass']);
      assert.equal(s.contract.bid, final);
      assert.equal(s.contract.declarer, declarer);
      assert.equal(s.undiscussedBid, undefined);
      assert.ok(auctionCallDetails(s, history, 1).alternatives.some(row => row.bid === '2H'));
      assert.ok(auctionCallDetails(s, history, 2).alternatives.some(row => row.bid === '2S' && /Baron/.test(row.label)));
    }
  }
});

test('both two-minor rebids reach the same fixed-hand shortage exercise from opener and responder', () => {
  for (const [seed, rebid, ask] of [[3,'3D','3H'], [142,'3D','3S'], [48,'2NT','3C'], [195,'2NT','3D']]) {
    const start = deal('C','South',seed);
    const s = applyPracticeBid(start,'1S');
    assert.deepEqual(bids(s), ['1C','1S',rebid]);
    assert.equal(s.playerSeat, 'South');
    const otherStart = deal('C','North',seed);
    const other = applyPracticeBid(applyPracticeBid(otherStart,'1C'), rebid);
    assert.deepEqual(bids(other), ['1C','1S',rebid,ask]);
    const result = applyPracticeBid(s,ask);
    const reply = result.auction.at(-1).bid;
    assert.deepEqual(applyPracticeBid(other,reply).auction.slice(0,5), result.auction);
    assert.deepEqual(practiceView(result).playerHand, practiceView(start).playerHand);
    assert.deepEqual(practiceView(other).playerHand, practiceView(otherStart).playerHand);
    restore(other,[otherStart]);
    restore(result,[start,s]);
  }
});

test('dealt 1H–1S hands reach the ordinary 1NT and 2C rebids in both seats', () => {
  for (const [seed, rebid] of [[2,'1NT'],[1,'2C']]) {
    const responder = deal('H','South',seed);
    const next = applyPracticeBid(responder,'1S');
    assert.deepEqual(bids(next), ['1H','1S',rebid]);
    const opener = deal('H','North',seed);
    const turn = applyPracticeBid(opener,'1H');
    assert.deepEqual(bids(turn), ['1H','1S']);
    const continued = applyPracticeBid(turn,rebid);
    assert.equal(continued.undiscussedBid,undefined);
    assert.deepEqual(practiceView(continued).playerHand,practiceView(opener).playerHand);
    restore(next,[responder]);
    restore(continued,[opener,turn]);
  }
});

test('direct Horton Kickback selects the agreed trump and its 0/1/2 ladder from both seats', () => {
  for (const [seed, ask, trump, ladder] of [[2,'4D','C',['4H','4S','4NT']], [46,'4NT','S',['5C','5D','5H']]]) {
    const start = deal('2S','South',seed);
    const choices = practiceCalls(start);
    const direct = choices.find(row => row.bid === ask);
    assert.deepEqual(direct.responseLadder.map(row => row.bid),ladder);
    assert.deepEqual(direct.responseLadder.map(row => row.values), [[0],[1],[2]]);
    assert.equal(choices.find(row => row.bid === '4H').kind, 'signoff');
    const result = applyPracticeBid(start,ask);
    const count = handFeatures(start.partnerHand,trump).keycards;
    assert.deepEqual(bids(result), ['2S',ask,ladder[count]]);
    assert.equal(result.trump,trump);
    assert.deepEqual(result.relayPolicy.skipBids, [trump === 'S' ? '4S' : '5C']);
    assert.equal(result.queenAskAllowed, count !== 2);
    const opener = deal('2S','North',seed);
    const pending = applyPracticeBid(opener,'2S');
    assert.deepEqual(bids(pending), ['2S',ask]);
    assert.throws(() => applyPracticeBid(pending, ladder[(count + 1) % 3]), /does not match/);
    const answered = applyPracticeBid(pending,ladder[count]);
    assert.deepEqual(answered.auction.slice(0,3), result.auction);
    restore(answered,[opener,pending]);
  }
});

test('the human Horton opener may accept or decline the same mild invitation without adding strength facts', () => {
  for (const [seed, invite, game] of [[83,'4C','5C'], [88,'3S','4S']]) {
    const start = deal('2S','North',seed);
    const pending = applyPracticeBid(start,'2S');
    assert.deepEqual(bids(pending), ['2S',invite]);
    for (const [answer, contract] of [['Pass',invite],[game,game]]) {
      const end = applyPracticeBid(pending,answer);
      assert.equal(end.contract.bid, contract);
      assert.equal(end.contract.declarer, invite === '3S' ? 'North' : 'South');
      assert.deepEqual(end.constraints,pending.constraints);
      assert.equal(end.undiscussedBid,undefined);
      restore(end,[start,pending]);
    }
  }
});

test('a diamond positive reaches every documented opener rebid in both seats on the same cards', () => {
  const rebids = ['2D','2H','2S','3C','3D'];
  for (const [seed, rebid] of [[11,'2D'],[64,'2H'],[20,'2S'],[88,'3C'],[19,'3D']]) {
    const responder = deal('C','South',seed);
    const opener = deal('C','North',seed);
    const turn = applyPracticeBid(opener,'1C');
    assert.deepEqual(practiceView(turn).auction.map(c => c.bid), ['1C','2C']);
    assert.deepEqual(practiceCalls(turn).filter(row => row.discussed).map(row => row.bid), rebids);
    assert.throws(() => applyPracticeBid(turn,'Pass'), /forcing/);
    const north = applyPracticeBid(turn,rebid);
    const south = applyPracticeBid(responder,'2C');
    assert.deepEqual(north.auction.slice(0,3),south.auction);
    assert.deepEqual(south.auction[2].callAlternatives.map(row => row.bid),rebids);
    assert.deepEqual(north.playerHand,responder.playerHand);
    assert.deepEqual(north.partnerHand,responder.partnerHand);
    restore(north,[opener,turn]);
    restore(south,[responder]);
    if (['2H','2S'].includes(rebid)) {
      for (const session of [north,south]) {
        assert.equal(session.sourceAmbiguity,true);
        assert.equal(session.contract,null);
        assert.match(session.unsupportedReason,/reply steps/);
        assert.deepEqual(auctionCallDetails(session,[],2).alternatives,[]);
      }
    }
    if (rebid === '3D') {
      const ask = applyPracticeBid(south,'3H');
      assert.equal(ask.auction.at(-1).seat,'South');
      assert.equal(ask.sourceAmbiguity,true);
      assert.equal(ask.contract,null);
      assert.equal(applyPracticeBid(south,'5D').contract.declarer,'North');
    }
  }
});

test('the unusual 4414 opens 1C, rebids 2D, then shows shape with 3NT and answers club keycard', () => {
  const fixed = createTrainingPractice({ profileId: 'club-1s-2d-bourke-4414', seed: 'mini-bourke-memory' });
  const start = { ...deal('C', 'North', 'mini-bourke-memory'), playerHand: fixed.partnerHand, partnerHand: fixed.playerHand };
  const open = applyPracticeBid(start, '1C');
  const waiting = applyPracticeBid(open, '2D');
  assert.deepEqual(bids(waiting), ['1C', '1S', '2D', '2H']);
  assert.throws(() => applyPracticeBid(waiting, '3S'), /does not match/);
  const shown = applyPracticeBid(waiting, '3NT');
  assert.equal(shown.auction.at(-1).meaning, '4414, 9–11');
  assert.equal(shown.pendingAsk.bid, '4C');
  assert.equal(shown.pendingAsk.label, 'Keycards in clubs');
  restore(shown, [start, open, waiting]);
});

test('2D is a discussed low-range rebid while the reported 15-count with four diamonds uses 2NT', () => {
  const start = { ...deal('C', 'North', 'twice-long-minors'),
    playerHand: 'SK HA H7 DA D8 D6 D5 CK CJ C7 C6 C4 C3'.split(' '),
    partnerHand: 'SA SQ S9 HJ H8 H6 DK DQ D4 CA C9 C8 C2'.split(' ') };
  const turn = applyPracticeBid(start, '1C');
  assert.equal(practiceCalls(turn).find(call => call.bid === '2D').discussed, true);
  assert.throws(() => applyPracticeBid(turn, '2D'), /9–13/);
  assert.equal(applyPracticeBid(turn, '2NT').auction[2].bid, '2NT');
});

const clubOpener = 'SA SK S4 HK H8 H2 D5 CJ CT C9 C7 C6 C2';
const reportedDiamondHand = 'SQ SJ S9 HA DA DQ DT D9 D8 D6 CK CQ C8';
function diamondPositiveFixture(humanSeat, north = clubOpener, south = reportedDiamondHand) {
  const initial = deal('C', 'North', 'strong-diamond-preference');
  return advanceOpeningPartner({ ...initial, playerHand: north.split(' '), partnerHand: south.split(' '),
    wholeAuction: { ...initial.wholeAuction, humanSeat }, practiceRole: humanSeat === 'North' ? 'asker' : 'teller' });
}

test('the reported six-diamond hand can investigate notrump after 1C–2C–2D from either seat', () => {
  const start = diamondPositiveFixture('South');
  const preference = applyPracticeBid(start, '2C');
  assert.deepEqual(bids(preference), ['1C', '2C', '2D']);
  assert.deepEqual(practiceCalls(preference).filter(call => call.discussed).map(call => call.bid),
    ['2H', '2S', '2NT', '3C', '3D', '3NT', '5C', '5D', 'Pass']);
  assert.throws(() => applyPracticeBid(preference, 'Pass'), /10–13/);
  assert.throws(() => applyPracticeBid(preference, '2NT'), /14–15/);

  const inquiry = applyPracticeBid(preference, '2H');
  assert.deepEqual(bids(inquiry), ['1C', '2C', '2D', '2H', '2S']);
  assert.throws(() => applyPracticeBid(inquiry, 'Pass'), /2S is forcing/);
  const result = applyPracticeBid(inquiry, '3NT');
  assert.deepEqual(result.contract, { bid: '3NT', level: 3, strain: 'NT', declarer: 'South' });
  assert.ok(result.auction[4].callAlternatives.some(call => call.bid === '3C'));
  restore(result, [start, preference, inquiry]);

  const open = diamondPositiveFixture('North');
  const afterOpening = applyPracticeBid(open, '1C');
  const afterRebid = applyPracticeBid(afterOpening, '2D');
  assert.equal(bids(afterRebid).at(-1), '2H');
  assert.throws(() => applyPracticeBid(afterRebid, 'Pass'), /2H is forcing/);
  const game = applyPracticeBid(afterRebid, '2S');
  assert.deepEqual(applyPracticeBid(game, 'Pass').auction, result.auction);
  restore(game, [open, afterOpening, afterRebid]);
});

test('the natural invitations resolve and a 10–13 responder can still pass 2D', () => {
  const inviteHand = reportedDiamondHand.replace('DA', 'D3');
  const invited = applyPracticeBid(diamondPositiveFixture('South', clubOpener, inviteHand), '2C');
  const accepted = applyPracticeBid(invited, '2NT');
  assert.equal(bids(accepted).at(-1), '3NT');
  assert.equal(applyPracticeBid(accepted, 'Pass').contract.bid, '3NT');
  const declined = applyPracticeBid(applyPracticeBid(
    diamondPositiveFixture('South', clubOpener.replace('HK', 'HJ'), inviteHand), '2C'), '3D');
  assert.equal(declined.contract.bid, '3D');
  const lower = applyPracticeBid(diamondPositiveFixture('South', clubOpener, inviteHand.replace('CK', 'C3')), '2C');
  assert.equal(applyPracticeBid(lower, 'Pass').contract.bid, '2D');
});

test('after a weak jump only 2NT invites, while a direct raise is playable in either seat', () => {
  for (const [seed, suit] of [[114,'D'],[4,'H'],[82,'S']]) {
    const responder = deal('C','South',seed);
    const invited = applyPracticeBid(responder,'2' + suit);
    assert.deepEqual(bids(invited),['1C','2' + suit,'2NT']);
    const opener = deal('C','North',seed);
    const turn = applyPracticeBid(opener,'1C');
    assert.deepEqual(bids(turn),['1C','2' + suit]);
    const alternatives = practiceCalls(turn);
    assert.match(alternatives.find(row => row.bid === '2NT').label,/invitation/);
    assert.match(alternatives.find(row => row.bid === '3' + suit).label,/To play/);
    const direct = applyPracticeBid(turn,'3' + suit);
    assert.deepEqual(bids(direct),['1C','2' + suit,'3' + suit,'Pass']);
    const game = suit === 'D' ? '3NT' : '4' + suit;
    for (const bid of ['Pass', '3' + suit, game]) {
      const ended = applyPracticeBid(invited,bid);
      assert.equal(ended.contract.bid,bid === 'Pass' ? '2NT' : bid);
      assert.equal(ended.contract.declarer,bid === 'Pass' || bid === '3NT' ? 'North' : 'South');
      assert.equal(ended.undiscussedBid,undefined);
      restore(ended,[responder,invited]);
    }
    restore(direct,[opener,turn]);
    assert.throws(() => applyPracticeBid(responder,'2C'), /single-suited/);
  }
});

test('both routes to direct major shortage reserve 3NT for two diamonds in actual auctions', () => {
  for (const [seed,rebid,reply] of [[2,'2S','3NT'],[100,'2H','3NT'],[90,'2H','4C'],[10,'2S','4D']]) {
    const responder = deal('C','South',seed), opener = deal('C','North',seed);
    const ask = applyPracticeBid(responder,'1S');
    const answer = applyPracticeBid(ask,'3D');
    assert.deepEqual(bids(answer), ['1C','1S',rebid,'3D',reply]);
    const north = applyPracticeBid(applyPracticeBid(opener,'1C'),rebid);
    assert.equal(north.pendingAsk.bid,'3D');
    assert.deepEqual(north.pendingAsk.responseLadder.map(c => c.bid),['3H','3S','3NT','4C','4D','4H']);
    const answered = applyPracticeBid(north,reply);
    assert.deepEqual(answered.auction.slice(0,5),answer.auction);
    restore(answer,[responder,ask]);
    restore(answered,[opener,north]);
    const count = handFeatures(ask.partnerHand,'D').lengths.D;
    if (reply === '3NT') {
      assert.equal(count,2);
      assert.equal(answer.constraints.some(c => c.type === 'keycardOptions'),false);
      assert.equal(applyPracticeBid(answer,'Pass').contract.declarer,'North');
    } else {
      assert.equal(count,3);
      assert.equal(answer.trump,'D');
      assert.deepEqual(answer.constraints.find(c => c.type === 'keycardOptions').values,reply === '4C' ? [1,4] : [2,5]);
    }
  }
});
