import assert from 'node:assert/strict';
import test from 'node:test';
import { auctionRounds } from './table-ui.js';

test('North opening shows East passing and South next without inventing a West call', () => {
  const calls = [{ seat: 'North', bid: '1S', meaning: 'Opening' }];
  const rows = auctionRounds(calls);
  assert.deepEqual(rows[0].map(call => call?.kind ?? null), ['call', 'opponent', 'pending', null]);
  assert.equal(rows[0][0].meaning, 'Opening');
  assert.equal(rows[0][0].index, 0);
  assert.equal(calls.length, 1);
});

test('a South opening leaves the earlier seats blank and wraps to North', () => {
  const rows = auctionRounds([{ seat: 'South', bid: '1C' }]);
  assert.deepEqual(rows.map(row => row.map(call => call?.bid ?? call?.kind ?? null)), [
    [null, null, '1C', 'Pass'], ['pending', null, null, null],
  ]);
});

test('a completed auction preserves every call index, meaning and all intervening passes', () => {
  const calls = [
    { seat: 'North', bid: '1S', meaning: 'Opening' },
    { seat: 'South', bid: '2NT', meaning: 'Relay' },
    { seat: 'North', bid: '3C', meaning: 'Shape' },
    { seat: 'South', bid: '4S', meaning: 'Final contract' },
    { seat: 'North', bid: 'Pass', meaning: 'Accept' },
  ];
  const rows = auctionRounds(calls, true);
  assert.equal(rows.length, 3);
  assert.equal(rows.flat().filter(call => call?.kind === 'pending').length, 0);
  assert.deepEqual(rows.flat().filter(call => call?.kind === 'call').map(({ index, seat, bid, meaning }) => ({ index, seat, bid, meaning })), calls.map((call, index) => ({ index, ...call })));
  assert.deepEqual(rows[2].map(call => call?.bid ?? null), ['Pass', 'Pass', null, null]);
});
