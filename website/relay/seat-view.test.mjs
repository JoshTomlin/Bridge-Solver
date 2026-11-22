import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_PROFILES } from './core.js';
import { createTrainingPractice, practiceView, applyPracticeBid } from './practice.js';
import { tableView, tableSeat, tableContract, tableCallDetails } from './seat-view.js';
import { auctionCallDetails } from './auction-study.js';
import { resolveDeclarer } from './evaluation.js';

test('every family and role keeps the human South and partner North without changing cards or source state', () => {
  for (const profile of PRACTICE_PROFILES) for (const role of ['asker', 'teller']) {
    const session = createTrainingPractice({ profileId: profile.id, role, seed: 'fixed-south' });
    const before = JSON.stringify(session);
    const source = practiceView(session), view = tableView(session);
    assert.equal(view.playerSeat, 'South');
    assert.equal(view.partnerSeat, 'North');
    assert.deepEqual(view.playerHand, source.playerHand);
    assert.deepEqual(view.partnerHand, source.partnerHand);
    for (const [index, call] of view.auction.entries()) {
      assert.equal(call.seat, source.auction[index].seat === source.playerSeat ? 'South' : 'North');
    }
    const sourceDetail = auctionCallDetails(session, [], 0);
    const detail = tableCallDetails(session, sourceDetail);
    assert.equal(detail.call.seat, tableSeat(session, sourceDetail.call.seat));
    assert.deepEqual(tableCallDetails(session, detail), detail, 'Archived/displayed calls are not rotated twice');
    assert.equal(JSON.stringify(session), before);
  }
});

test('whole-auction opener and responder roles are both displayed South and retain their actual cards', () => {
  for (const humanSeat of ['North', 'South']) {
    const session = createTrainingPractice({ auctionMode: true, humanSeat, seed: 'opening-fixed-south' });
    assert.equal(tableView(session).playerSeat, 'South');
    assert.deepEqual(tableView(session).playerHand, practiceView(session).playerHand);
  }
});

test('rotated Dappleton declarer agrees with the displayed first strain bidder and assessment context', () => {
  const initial = createTrainingPractice({ profileId: 'dappleton-h-d-four-major', seed: 'fixed-south-dds' });
  const completed = applyPracticeBid(initial, '6D');
  const view = tableView(completed);
  const context = { ...view, trump: completed.trump };
  assert.equal(tableContract(completed).declarer, resolveDeclarer('D', context));
  assert.equal(tableContract(completed).declarer, 'North', 'Partner first bid artificial diamonds');
});
