import assert from 'node:assert/strict';
import test from 'node:test';
import { PRACTICE_PROFILES } from './profiles.js';
import { AUCTION_FAMILIES, getAuctionFamily, auctionFamilyForProfile, selectFamilyProfile, selectMixedPractice } from './families.js';
import { createTrainingPractice, practiceView } from './practice.js';

test('broad auction families cover every exercise exactly once with the intended entry boundaries', () => {
  const assigned = AUCTION_FAMILIES.flatMap(family => family.profileIds);
  assert.equal(new Set(assigned).size, assigned.length);
  assert.deepEqual([...assigned].sort(), PRACTICE_PROFILES.map(profile => profile.id).sort());
  for (const family of AUCTION_FAMILIES) {
    assert.ok(family.profileIds.length);
    for (const id of family.profileIds) assert.equal(auctionFamilyForProfile(id).id, family.id);
  }
  assert.deepEqual([...getAuctionFamily('diamond-notrump').profileIds].sort(), ['minor-d-nt-2c', 'minor-d-nt-2d']);
  assert.equal(getAuctionFamily('minor-three-bid').profileIds.some(id => id.startsWith('minor-d-nt-')), false);
  const reordered = getAuctionFamily('reordered-rebid').profileIds;
  assert.ok(reordered.some(id => id.startsWith('rebid-single-')));
  assert.ok(reordered.some(id => id.startsWith('rebid-reverse-')));
  assert.ok(reordered.some(id => id.startsWith('rebid-splinter-')));
});

test('seeded family selection can reach every branch and repeats without consulting either hand', () => {
  for (const family of AUCTION_FAMILIES) {
    const reached = new Set();
    for (let draw = 0; draw < 1024; draw += 1) {
      const options = { familyId: family.id, seed: `family-draw-${draw}` };
      const profile = selectFamilyProfile(options);
      assert.equal(selectFamilyProfile(options).id, profile.id);
      assert.ok(family.profileIds.includes(profile.id));
      reached.add(profile.id);
    }
    assert.deepEqual([...reached].sort(), [...family.profileIds].sort(), family.id);
  }
});

test('a study branch stays fixed across new seeds and cannot escape its selected family', () => {
  for (const family of AUCTION_FAMILIES) {
    const profileId = family.profileIds.at(-1);
    for (const seed of ['one', 'two', 'three']) {
      assert.equal(selectFamilyProfile({ familyId: family.id, profileId, seed }).id, profileId);
    }
  }
  assert.throws(() => selectFamilyProfile({ familyId: 'jacoby', profileId: 'horton-d', seed: 'study' }), /must belong/);
  assert.throws(() => getAuctionFamily('missing-family'), /Unknown auction family/);
  assert.throws(() => auctionFamilyForProfile('missing-profile'), /No auction family/);
});

test('random family entries produce usable asker and teller sessions with fixed original seats', () => {
  for (const family of AUCTION_FAMILIES) for (const role of ['asker', 'teller']) {
    const seed = `family-session:${family.id}:${role}`;
    const profile = selectFamilyProfile({ familyId: family.id, seed });
    const session = createTrainingPractice({ profileId: profile.id, seed, role });
    assert.equal(session.familyId, profile.id);
    assert.equal(session.seed, seed);
    assert.equal(practiceView(session).playerSeat, role === 'asker' ? profile.playerSeat : profile.partnerSeat);
    assert.equal(session.revealed, false);
    if (role === 'teller') assert.ok(session.pendingAsk);
  }
});

test('Just bid reaches every branch in both roles with equal family weighting and reproducible draws', () => {
  const reached = new Set();
  const families = new Map(AUCTION_FAMILIES.map(family => [family.id, 0]));
  const roles = { asker: 0, teller: 0 };
  const draws = 8192;
  for (let i = 0; i < draws; i++) {
    const seed = `mixed-selection-${i}`;
    const selected = selectMixedPractice(seed);
    assert.deepEqual(selected, selectMixedPractice(seed));
    const family = auctionFamilyForProfile(selected.profileId);
    assert.ok(['asker', 'teller'].includes(selected.role));
    families.set(family.id, families.get(family.id) + 1);
    roles[selected.role]++;
    reached.add(`${selected.profileId}:${selected.role}`);
  }
  assert.deepEqual([...reached].sort(), PRACTICE_PROFILES.flatMap(profile => ['asker', 'teller'].map(role => `${profile.id}:${role}`)).sort());
  // A fixed broad seed set detects accidental weighting by number of branches
  // and biased roles without making a statistical assertion about live hands.
  for (const count of families.values()) assert.ok(count > draws / families.size * 0.8 && count < draws / families.size * 1.2);
  assert.ok(roles.asker > draws * 0.45 && roles.asker < draws * 0.55);
});
