import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_PROFILES } from './club-profiles.js';
import { SUITS, bidIndex, nextBid } from './profile-utils.js';
import {
  createPractice, availableActions, applyBid, matchesConstraints, sampleCompatible,
} from './core.js';

const profiles = new Map(CLUB_PROFILES.map(profile => [profile.id, profile]));
const lengthsOf = shape => Object.fromEntries(SUITS.map((suit, index) => [suit, Number(shape[index])]));

// Independent feature-level checks exhaust the declarative shape/strength
// universe without relying on generated deals to happen to visit every answer.
function featureMatches(shape, points, constraints) {
  const lengths = lengthsOf(shape);
  return constraints.every(constraint => {
    switch (constraint.type) {
      case 'hcp': return points >= constraint.min && points <= constraint.max;
      case 'length': return lengths[constraint.suit] >= constraint.min && lengths[constraint.suit] <= constraint.max;
      case 'balanced': return SUITS.every(suit => lengths[suit] >= 2) === constraint.value;
      case 'shapes': return constraint.values.includes(shape);
      case 'anyOf': return constraint.options.some(option => featureMatches(shape, points, option));
      default: throw new Error(`Add an independent check for profile predicate ${constraint.type}.`);
    }
  });
}

const shapeUniverse = [];
for (let S = 0; S <= 9; S += 1) {
  for (let H = 0; H <= 9; H += 1) {
    for (let D = 0; D <= 9; D += 1) {
      const C = 13 - S - H - D;
      if (C >= 0 && C <= 9) shapeUniverse.push(`${S}${H}${D}${C}`);
    }
  }
}

test('club definitions have unique source-labelled entries, correct seats and legal lead-ins', () => {
  assert.equal(CLUB_PROFILES.length, 18);
  assert.equal(profiles.size, CLUB_PROFILES.length);
  for (const profile of CLUB_PROFILES) {
    assert.match(profile.source, /Word P\d{4}/, profile.id);
    assert.ok(profile.assumptions.length && profile.limitations.length, profile.id);
    assert.equal(profile.family, profile.id.startsWith('dappleton-') ? 'Dappleton' : 'Club relays');
    assert.ok(profile.nodes[profile.startNode], profile.id);
    assert.equal(profile.initialAuction.at(-1).seat, profile.partnerSeat);
    assert.notEqual(profile.playerSeat, profile.partnerSeat);
    let previous = -1;
    for (const [index, call] of profile.initialAuction.entries()) {
      assert.equal(call.seat, index % 2 === 0 ? 'North' : 'South', profile.id);
      assert.ok(bidIndex(call.bid) > previous, `${profile.id}: ${call.bid}`);
      previous = bidIndex(call.bid);
    }
    const node = profile.nodes[profile.startNode];
    for (const action of node.actions) {
      assert.ok(bidIndex(action.bid) > previous, `${profile.id}: ${action.bid}`);
      if (action.kind === 'keycard') continue;
      for (const [index, response] of action.responses.entries()) {
        assert.ok(bidIndex(response.bid ?? nextBid(action.bid, index + 1)) > bidIndex(action.bid));
        assert.ok(response.nextNode || response.phase === 'keycard', `${profile.id}: named supported destination`);
      }
    }
  }
});

test('every admitted shape and point count has exactly one answer to each initial relay', () => {
  for (const profile of CLUB_PROFILES) {
    const node = profile.nodes[profile.startNode];
    let admitted = 0;
    for (const shape of shapeUniverse) {
      for (let points = 0; points <= 37; points += 1) {
        if (!featureMatches(shape, points, profile.partnerConstraints)) continue;
        admitted += 1;
        for (const action of node.actions.filter(action => action.kind === 'relay')) {
          const answers = action.responses.filter(response => featureMatches(shape, points, response.constraints));
          assert.equal(answers.length, 1, `${profile.id}, ${shape}, ${points} HCP, ${action.bid}`);
          const state = answers[0].state;
          if (state?.shortageSuit) assert.ok(lengthsOf(shape)[state.shortageSuit] <= 1);
          if (state?.balanced) assert.ok(SUITS.every(suit => lengthsOf(shape)[suit] >= 2));
          if (state?.trump) assert.ok(lengthsOf(shape)[state.trump] >= 4);
        }
      }
    }
    assert.ok(admitted > 0, `${profile.id} must admit hands`);
  }
});

test('two-minor entries mean five/six clubs and exactly four diamonds in SHDC order', () => {
  for (const [id, points, clubAsk, diamondAsk] of [
    ['club-1s-2nt-minors', 15, '3C', '3D'],
    ['club-1s-3d-minors', 11, '3H', '3S'],
  ]) {
    const profile = profiles.get(id);
    const shapeSet = profile.partnerConstraints.find(constraint => constraint.type === 'shapes').values;
    assert.equal(shapeSet.length, 8);
    for (const shape of shapeSet) {
      const lengths = lengthsOf(shape);
      assert.equal(lengths.D, 4);
      assert.ok([5, 6].includes(lengths.C));
      assert.equal([lengths.S, lengths.H].filter(value => value <= 1).length, 1);
    }
    assert.ok(featureMatches('3145', points, profile.partnerConstraints));
    assert.equal(featureMatches('3154', points, profile.partnerConstraints), false);
    assert.deepEqual(profile.nodes.shortage.actions.map(action => action.bid), [clubAsk, diamondAsk]);
    assert.deepEqual(profile.nodes.shortage.actions[0].responses.map(response => response.state.shortageSuit), ['S', 'H']);
  }
});

test('1C–1S Baron resolves mixed rebids with the source response table', () => {
  for (const [id, cases] of [
    ['club-1s-1nt-baron', [['3334', 14, '2NT'], ['3343', 15, '3C'], ['4333', 14, '3D'], ['3316', 16, '3NT']]],
    ['club-1s-2c-baron', [['3334', 16, '2NT'], ['3343', 19, '3C'], ['4333', 18, '3D'], ['3145', 17, '3H'], ['1345', 18, '3S'], ['3316', 19, '3NT']]],
  ]) {
    const profile = profiles.get(id);
    for (const [shape, points, expectedBid] of cases) {
      assert.ok(featureMatches(shape, points, profile.partnerConstraints), `${id}: source fixture ${shape}`);
      const answer = profile.nodes.baron.actions[0].responses.find(response => featureMatches(shape, points, response.constraints));
      assert.equal(answer.bid, expectedBid);
    }
    // This endpoint is the source's explicit Kickback option; the ordinary
    // minor-agreement route changes which partner describes the hand.
    const [action] = profile.nodes.kickback({ shortageSuit: 'D' }).actions;
    assert.deepEqual([action.bid, action.trump, action.keycardMode], ['4D', 'C', 'normal']);
    assert.equal(featureMatches('3244', 15, profile.partnerConstraints), false, 'ambiguous four-four minor priorities are outside the subset');
  }
});

test('Dappleton transfer routes distinguish four/five major cards and their shortage alphabets', () => {
  for (const major of ['H', 'S']) {
    for (const minor of ['C', 'D']) {
      for (const route of ['four-major', 'five-major']) {
        const profile = profiles.get(`dappleton-${major.toLowerCase()}-${minor.toLowerCase()}-${route}`);
        const node = profile.nodes[profile.startNode];
        const five = route === 'five-major';
        assert.equal(profile.playerSeat, 'North');
        assert.equal(profile.partnerSeat, 'South');
        assert.equal(profile.partnerConstraints.find(c => c.type === 'length' && c.suit === major).min, five ? 5 : 4);
        assert.equal(profile.partnerConstraints.find(c => c.type === 'length' && c.suit === minor).min, 5);
        assert.equal(profile.initialAuction.some(call => call.bid === '2D'), five);
        assert.equal(node.actions[0].responses.length, five ? 2 : 3);
        assert.equal(node.actions[0].state.relayPolicy.skip3NT, true);
        if (five) {
          assert.equal(node.actions[1].bid, `3${major}`);
          assert.equal(node.actions[1].state.trump, major);
          assert.equal(node.actions[1].state.relayPolicy.skip3NT, false);
          assert.equal(node.actions[1].state.relayPolicy.skipMajorGame, true);
        } else assert.equal(node.actions.length, 1);
      }
    }
  }
});

test('Dappleton Baron fixed lead-ins preserve the responder-description role and alternative major', () => {
  for (const major of ['H', 'S']) {
    for (const minor of ['C', 'D']) {
      const profile = profiles.get(`dappleton-${major.toLowerCase()}-baron-${minor.toLowerCase()}`);
      assert.equal(profile.initialAuction.at(-1).seat, 'South');
      assert.equal(profile.initialAuction.at(-1).bid, `3${minor}`);
      const [minorAsk, majorAsk] = profile.nodes.shortage.actions;
      assert.deepEqual([minorAsk.bid, majorAsk.bid], minor === 'C' ? ['3D', '3H'] : ['3H', '3S']);
      assert.equal(minorAsk.state.trump, minor);
      assert.equal(majorAsk.state.trump, major);
      assert.equal(minorAsk.responses.length, 3);
      assert.equal(majorAsk.responses.length, 3);
    }
  }
});

test('each club scenario plays with fixed cards and sampled hands reproduce the complete tested relay', () => {
  for (const profile of CLUB_PROFILES) {
    const initial = createPractice({ profileId: profile.id, seed: 'club-source-tests' });
    assert.ok(matchesConstraints(initial.partnerHand, profile.partnerConstraints, initial.trump), profile.id);
    assert.ok(matchesConstraints(initial.playerHand, profile.playerConstraints, initial.trump), profile.id);
    assert.equal(new Set([...initial.playerHand, ...initial.partnerHand]).size, 26);
    for (const firstAction of availableActions(initial).filter(action => action.kind !== 'signoff')) {
      if (firstAction.playerConstraints && !matchesConstraints(initial.playerHand, firstAction.playerConstraints, firstAction.trump ?? initial.trump)) {
        assert.throws(() => applyBid(initial, firstAction.bid), /conditions/);
        continue;
      }
      const bids = [firstAction.bid];
      let session = applyBid(initial, firstAction.bid);
      for (let step = 0; step < 2; step += 1) {
        const action = availableActions(session).find(candidate => candidate.kind !== 'signoff');
        if (!action) break;
        bids.push(action.bid);
        session = applyBid(session, action.bid);
      }
      assert.strictEqual(session.partnerHand, initial.partnerHand, profile.id);
      assert.ok(matchesConstraints(session.partnerHand, session.constraints, session.trump), profile.id);
      const sampled = sampleCompatible(session, { count: 6, seed: `${profile.id}:${firstAction.bid}`, maxAttempts: 100000 });
      assert.equal(sampled.complete, true, `${profile.id}: bounded sampling after ${bids.join(' ')}`);
      for (const hand of sampled.hands) {
        assert.ok(hand.every(card => !initial.playerHand.includes(card)));
        let replay = { ...initial, partnerHand: hand };
        for (const bid of bids) replay = applyBid(replay, bid);
        assert.deepEqual(replay.auction.map(call => call.bid), session.auction.map(call => call.bid), profile.id);
      }
    }
  }
});
