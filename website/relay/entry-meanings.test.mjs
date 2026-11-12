import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_PROFILES } from './core.js';
import { createTrainingPractice } from './practice.js';
import { auctionCallDetails } from './auction-study.js';
import { entryContinuations, entryMeaning } from './bid-reference.js';
const auction = bids => bids.split(' ').map((bid,index) => ({ bid, seat: index % 2 ? 'South' : 'North' }));

test('entry descriptions distinguish support, single-suiters, reverses and artificial responses by the full auction', () => {
  for (const [bids, meaning] of [
    ['1D 1H 1NT', /Three hearts; 11–15/], ['1D 1S 1NT', /Three spades; 11–15/],
    ['1C 1D', /Four-plus hearts/], ['1D 1D', null],
    ['1C 1H 2D', /Six-plus clubs; 14\+; no second four-card suit, at most two spades/],
    ['1D 1S 2H', /Six-plus diamonds; 14\+/], ['1D 1H 2NT', /Six-plus diamonds, three hearts; 16\+/],
    ['1C 1D 2S', /Four-plus diamonds|four-plus diamonds/], ['1D 1S 3C', /four-plus hearts; 16\+/],
    ['1C 1D 3C', /Four hearts, spades shortage/], ['1C 1H 3C', /Five-plus clubs, four-plus hearts/],
    ['2D', /Horton.*spades.*diamonds/], ['2H', /Horton.*spades.*hearts/], ['2S', /Horton.*spades.*clubs/],
  ]) {
    const actual = entryMeaning(auction(bids));
    if (meaning) assert.match(actual, meaning, bids); else assert.equal(actual, null, bids);
  }
  const reversed = auction('1D 1H 1NT').map(call => ({ ...call, seat: call.seat === 'North' ? 'South' : 'North' }));
  assert.equal(entryMeaning(reversed), null, 'Never guess meanings for a different seat context');
});

test('the support enquiry and strong-club alternatives retain the source choices rather than a single generated branch', () => {
  assert.deepEqual(entryContinuations(auction('1D 1H 1NT')).map(row => row.bid), ['2C','2H']);
  assert.deepEqual(entryContinuations(auction('1D 1S 1NT')).map(row => row.bid), ['2C','2S']);
  assert.deepEqual(entryContinuations(auction('1C 1S 1NT')).map(row => row.bid), ['2C','2D','2H','2S','2NT','3C','3D','3H','3S','3NT']);
  assert.match(entryMeaning(auction('1C 1S 1NT 2NT')), /Five clubs and four diamonds/);
  assert.match(entryMeaning(auction('1C 1S 1NT 3C')), /Five diamonds and four clubs/);
  assert.match(entryMeaning(auction('1C 1H 1NT 2NT')), /Exactly five clubs.*four spades/);
  assert.equal(entryContinuations(auction('1S 1S 1NT')), null);
});

test('every exercise prefix has a real description and non-opening choices, including restored legacy saves', () => {
  let checked = 0;
  for (const profile of PRACTICE_PROFILES) {
    const session = createTrainingPractice({ profileId: profile.id, seed: 'entry-meanings' });
    for (const legacy of [false,true]) {
      const saved = JSON.parse(JSON.stringify(session));
      if (legacy) for (const call of saved.auction) call.meaning = 'Source-defined relay entry';
      saved.playerHand = ['hidden']; saved.partnerHand = ['hidden'];
      const before = JSON.stringify(saved);
      for (let index = 0; index < saved.auction.length; index++) {
        const detail = auctionCallDetails(saved, [], index);
        assert.ok(detail.call.meaning, profile.id);
        assert.doesNotMatch(detail.call.meaning, /relay entry|source entry/i, `${profile.id}, call ${index}`);
        if (index === 0) {
          assert.equal(detail.isOpening, true);
          assert.deepEqual(detail.alternatives, []);
          assert.deepEqual(detail.callAlternatives, []);
        } else assert.ok(detail.callAlternatives.length, `${profile.id}, call ${index} needs alternatives`);
        checked++;
      }
      assert.equal(JSON.stringify(saved), before, 'Study must not mutate cards, history or saved meanings');
    }
  }
  assert.ok(checked > 350);
});

test('source descriptions retain the historical asker’s other playable contract choices', () => {
  const session = createTrainingPractice({ profileId: 'major-S', role: 'teller', seed: 'entry-choices' });
  const detail = auctionCallDetails({ ...session, playerHand: ['hidden'], partnerHand: ['hidden'] }, [], 1);
  assert.match(detail.callAlternatives.find(option => option.bid === '2NT').label, /Four-plus spades; game-forcing/);
  assert.ok(detail.callAlternatives.some(option => option.bid === '6S'));
});
