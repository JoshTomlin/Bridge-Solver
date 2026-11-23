import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingPractice, applyPracticeBid, practiceCalls, practiceView } from './practice.js';
import { openingFamilyFor, openingPartnerBid } from './opening-practice.js';
import { auctionCallDetails } from './auction-study.js';
import { tableView } from './seat-view.js';
import { auctionRounds } from './table-ui.js';
import { savePracticeProgress, loadPracticeProgress } from './progress.js';
import { createHandRecord, saveHandHistory, loadHandHistory, handRecordText } from './hand-history.js';

const start = (seed, humanSeat = 'South', openingFamily = 'WNT-X') =>
  createTrainingPractice({ auctionMode: true, openingFamily, seed, humanSeat });
const bids = session => session.auction.map(call => call.bid);
const calls = (session, ...choices) => choices.reduce(applyPracticeBid, session);
const meaning = (session, bid) => practiceCalls(session).find(option => option.bid === bid)?.label;
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('0–7 with either flat shape must act after 1NT–Pass, including the reported 7-count', () => {
  const session = start('weak-flat', 'South', 'WNT');
  for (const cards of ['SQ ST S4 S3 HA H7 H5 DJ D9 D2 C8 C6 C5',
    'SQ ST S4 S3 HA H7 H5 H2 DJ D9 D2 C8 C6']) {
    const flat = { ...session, partnerHand: cards.split(' ') };
    assert.throws(() => calls(flat, 'Pass'), /Junk Stayman or an advanced-run transfer/);
    assert.ok(meaning(flat, '2C')?.includes('Stayman'));
    assert.ok(meaning(flat, '2H')?.includes('spades'));
  }
  assert.equal(calls({ ...session, partnerHand: 'SQ ST S4 S3 HA H7 DJ D9 C8 C6 C5 C4 C2'.split(' ') }, 'Pass').contract.bid, '1NT');
  assert.equal(calls({ ...session, partnerHand: 'SK ST S4 S3 HA H7 H5 DJ D9 D2 C8 C6 C5'.split(' ') }, 'Pass').contract.bid, '1NT');
});

test('direct penalty double lets weak two-suit responders pass and start with the lower suit after opener redoubles', () => {
  const initial = start('runout-23');
  assert.deepEqual(bids(initial), ['1NT', 'X']);
  const ask = calls(initial, 'Pass');
  assert.deepEqual(bids(ask), ['1NT', 'X', 'Pass', 'Pass', 'XX', 'Pass']);
  assert.match(meaning(ask, '2C'), /Lower of two four-plus suits/);
  assert.throws(() => calls(ask, '2S'), /five-plus spades/);
  const correction = calls(ask, '2C');
  assert.deepEqual(bids(correction).slice(-4), ['2C', 'Pass', '2H', 'Pass']);
  assert.deepEqual(calls(correction, 'Pass').contract, {
    bid: '2H', strain: 'H', level: 2, declarer: 'North', doubling: '',
  });
});

test('fourth-seat double prompts automatic redouble, with a choice to escape or stay in 1NTXX', () => {
  const initial = start('runout-155');
  assert.deepEqual(bids(initial), ['1NT', 'Pass']);
  const reopened = calls(initial, 'Pass');
  assert.deepEqual(bids(reopened), ['1NT', 'Pass', 'Pass', 'X', 'XX', 'Pass']);
  assert.match(reopened.auction[4].meaning, /Automatic redouble/);
  assert.match(meaning(reopened, '2D'), /Natural escape/);
  assert.equal(calls(reopened, '2D').contract.declarer, 'South');
  assert.equal(calls(reopened, 'Pass').contract.doubling, 'XX');
  const north = calls(start('runout-155', 'North'), '1NT');
  assert.equal(meaning(north, 'XX'), 'Automatic redouble after the fourth-seat double');
  assert.equal(meaning(north, 'Pass'), undefined);
});

test('Lebensohl and scrambling remain distinct on opposite sides of an initial pass', () => {
  const lebensohl = start('runout-22');
  assert.match(meaning(lebensohl, '2NT'), /Lebensohl/);
  assert.deepEqual(bids(calls(lebensohl, '2NT', 'Pass')), ['1NT', 'X', '2NT', 'Pass', '3C', 'Pass', 'Pass', 'Pass']);
  const scramble = calls(start('runout-135'), 'Pass');
  assert.match(meaning(scramble, '2NT'), /Scrambling, two places/);
  assert.equal(calls(scramble, '2NT', 'Pass').contract.bid, '3C');
});

test('opponent escape, takeout double, raise and penalty double retain seats, alternatives and the doubled contract', () => {
  const initial = start('runout-9');
  const pressure = calls(initial, 'XX');
  assert.deepEqual(bids(pressure), ['1NT', 'X', 'XX', '2H', 'X', '3H']);
  assert.match(pressure.auction[4].meaning, /^Takeout double$/);
  assert.equal(meaning(pressure, 'X'), 'Penalty double');
  assert.equal(auctionCallDetails(pressure, [initial], 5).alternatives.find(option => option.bid === 'X').label, 'Penalty double');
  const done = calls(pressure, 'X');
  assert.deepEqual(bids(done).slice(-4), ['X', 'Pass', 'Pass', 'Pass']);
  assert.deepEqual(done.contract, { bid: '3H', strain: 'H', level: 3, declarer: 'West', doubling: 'X' });
  assert.deepEqual(tableView(pressure).auction.map(call => call.seat), ['North', 'East', 'South', 'West', 'North', 'East']);
  const rotated = calls(start('runout-9', 'North'), '1NT');
  const view = tableView(rotated);
  assert.deepEqual(auctionRounds(view.auction, false, view.dealerSeat, true)[0].map(call => call?.bid ?? null),
    [null, null, '1NT', 'X']);
  assert.equal(view.playerSeat, 'South');

  const store = storage();
  savePracticeProgress({ session: done, history: [initial, pressure] }, store);
  const restored = loadPracticeProgress(store);
  assert.deepEqual(restored.progress.session, JSON.parse(JSON.stringify(done)));
  assert.deepEqual(restored.progress.history, JSON.parse(JSON.stringify([initial, pressure])));
  assert.deepEqual(start(done.seed, 'South', openingFamilyFor(done)), initial);
  const record = createHandRecord(done, [initial, pressure], { id: 'doubled-hand' });
  saveHandHistory([record], store);
  const { records } = loadHandHistory(store);
  assert.deepEqual(records[0], record);
  assert.match(handRecordText(record), /3♥X by West/);
  assert.match(handRecordText(record), /East 3♥: Competitive heart raise/);
});

test('seeded competition deals can complete from either seat using only the acting hand and auction', () => {
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const auctions = ['North', 'South'].map(humanSeat => {
      let session = start(`runout-${i}`, humanSeat);
      seen.add(session.wholeAuction.competition);
      const hand = practiceView(session).playerHand;
      for (let turn = 0; turn < 12 && !session.finished; turn++) {
        assert.deepEqual(practiceView(session).playerHand, hand);
        const bid = openingPartnerBid({ ...session.opening, auction: session.auction, hand });
        session = calls(session, bid);
      }
      assert.ok(session.finished && session.contract);
      return session.auction;
    });
    assert.deepEqual(auctions[0], auctions[1]);
  }
  assert.equal(seen.size, 5);
});
