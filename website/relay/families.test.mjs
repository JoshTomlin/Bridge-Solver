import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRACTICE_PROFILES, createPractice, availableActions, applyBid, matchesConstraints,
  sampleCompatible, bidIndex, revealPractice, handFeatures,
} from './core.js';
import { fillOpponentHands, resolveDeclarer } from './evaluation.js';

const families = PRACTICE_PROFILES.filter(profile => !profile.id.startsWith('major-'));

test('every family generates reproducible, disjoint hands satisfying its public prefix', () => {
  assert.equal(new Set(PRACTICE_PROFILES.map(profile => profile.id)).size, PRACTICE_PROFILES.length);
  for (const profile of families) {
    const session = createPractice({ profileId: profile.id, seed: 'family-prefix' });
    assert.deepEqual(createPractice({ profileId: profile.id, seed: 'family-prefix' }), session, profile.id);
    assert.equal(new Set([...session.playerHand, ...session.partnerHand]).size, 26, profile.id);
    assert.equal(matchesConstraints(session.partnerHand, session.constraints, session.trump), true, profile.id);
    assert.equal(matchesConstraints(session.playerHand, profile.playerConstraints, session.trump), true, profile.id);
    assert.equal(session.auction.at(-1).seat, session.partnerSeat, profile.id);
    assert.equal(session.revealed, false);
    assert.equal(Object.isFrozen(session.partnerHand), true);
    for (let index = 0; index < session.auction.length; index += 1) {
      assert.equal(session.auction[index].seat, index % 2 ? 'South' : 'North', profile.id);
      if (index) assert.ok(bidIndex(session.auction[index].bid) > bidIndex(session.auction[index - 1].bid), profile.id);
    }
  }
});

test('all displayed family branches preserve truthful answers and fixed hands', () => {
  let explored = 0;
  for (const profile of families) for (let seed = 0; seed < 6; seed += 1) {
    const initial = createPractice({ profileId: profile.id, seed: `branch-${seed}` });
    const pending = [initial];
    while (pending.length) {
      const session = pending.pop();
      const actions = availableActions(session).filter(action => action.kind === 'relay');
      assert.deepEqual(availableActions({ ...session, partnerHand: ['secret'], playerHand: ['secret'] }), availableActions(session));
      assert.equal(new Set(actions.map(action => action.bid)).size, actions.length, profile.id);
      for (const action of actions) {
        const before = JSON.stringify(session);
        if (action.playerConstraints && !matchesConstraints(session.playerHand, action.playerConstraints, action.trump ?? session.trump)) {
          assert.throws(() => applyBid(session, action.bid), /conditions/, profile.id);
          continue;
        }
        let next;
        try { next = applyBid(session, action.bid); }
        catch (error) { throw new Error(`${profile.id}, seed ${seed}, ${session.auction.map(call => call.bid).join(' ')} → ${action.bid}: ${error.message}`, { cause: error }); }
        assert.equal(JSON.stringify(session), before, profile.id);
        assert.deepEqual(next.partnerHand, initial.partnerHand);
        assert.deepEqual(next.playerHand, initial.playerHand);
        assert.equal(matchesConstraints(next.partnerHand, next.constraints, next.trump), true,
          `${profile.id}: ${next.auction.map(call => call.bid).join(' ')}`);
        assert.equal(next.auction.at(-2).seat, session.playerSeat);
        assert.equal(next.auction.at(-1).seat, session.partnerSeat);
        if (next.auction.at(-1).bid === 'Pass') {
          assert.equal(next.finished, true);
          assert.equal(next.contract.bid, action.bid);
        } else assert.ok(bidIndex(next.auction.at(-1).bid) > bidIndex(action.bid));
        assert.equal(next.major, next.trump);
        explored += 1;
        if (next.phase === 'family') pending.push(next);
        else {
          // Exercise a complete shared-continuation path after every shape branch.
          let current = next;
          for (let step = 0; step < 12; step += 1) {
            const continuation = availableActions(current).find(item => item.kind === 'relay');
            if (!continuation) break;
            current = applyBid(current, continuation.bid);
            assert.equal(matchesConstraints(current.partnerHand, current.constraints, current.trump), true, profile.id);
          }
        }
      }
    }
  }
  assert.ok(explored >= families.length * 6);
});

test('minor and reversed-role samplers use public facts and replay the auction answers', () => {
  for (const profileId of ['minor-d-nt-2c', 'minor-d-h-c', 'club-1s-2s-keycard', 'dappleton-h-c-four-major']) {
    let session = createPractice({ profileId, seed: 'sample-replay' });
    const initial = session;
    const bids = [];
    for (let step = 0; step < 3; step += 1) {
      const action = availableActions(session).find(item => item.kind === 'relay');
      if (!action) break;
      bids.push(action.bid);
      session = applyBid(session, action.bid);
    }
    const publicOnly = { ...session };
    delete publicOnly.partnerHand;
    const result = sampleCompatible(publicOnly, { count: 12, seed: 'public-only', maxAttempts: 200000 });
    assert.equal(result.complete, true, profileId);
    assert.deepEqual(result, sampleCompatible({ ...publicOnly, partnerHand: ['invalid secret'] }, { count: 12, seed: 'public-only', maxAttempts: 200000 }));
    for (const hand of result.hands) {
      assert.equal(matchesConstraints(hand, session.constraints, session.trump), true);
      assert.equal(hand.some(card => initial.playerHand.includes(card)), false);
      let replay = { ...initial, partnerHand: hand };
      for (const bid of bids) replay = applyBid(replay, bid);
      assert.deepEqual(replay.auction.map(call => call.bid), session.auction.map(call => call.bid), profileId);
    }
  }
});

test('North-player final contracts and DDS deals preserve seats and artificial first bidders', () => {
  const session = createPractice({ profileId: 'dappleton-h-d-four-major', seed: 'seats' });
  assert.equal(session.playerSeat, 'North');
  const finished = applyBid(session, '6D');
  assert.equal(finished.contract.declarer, 'South'); // 1D transfer counts.
  const context = { trump: finished.trump, playerSeat: finished.playerSeat, partnerSeat: finished.partnerSeat, auction: finished.auction };
  assert.equal(resolveDeclarer('D', context), finished.contract.declarer);
  assert.equal(resolveDeclarer('NT', context), 'North');
  const deal = fillOpponentHands(session.playerHand, session.partnerHand, 'seats', context);
  assert.deepEqual(deal.North, session.playerHand);
  assert.deepEqual(deal.South, session.partnerHand);
  assert.deepEqual(availableActions(revealPractice(finished)), []);
});

test('known range goes directly from shape to keycards, preserving the 0/3 keycard answer', () => {
  const initial = createPractice({ profileId: 'minor-d-nt-2c', seed: 'range-known' });
  const features = handFeatures(initial.partnerHand, 'D');
  assert.ok(features.hcp >= 12 && features.hcp <= 15);
  let session = initial;
  while (session.phase === 'family') session = applyBid(session, availableActions(session).find(action => action.kind === 'relay').bid);
  assert.equal(session.phase, 'keycard');
  assert.equal(session.weakExitAllowed, false);
  assert.ok(availableActions(session).find(action => action.kind === 'relay').responseLadder.some(answer => answer.values?.join() === '0,3'));
});
