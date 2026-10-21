// Broad practice choices are separate from the source families used by the
// bidding tables. Every existing exercise belongs to one practice choice.
import { PRACTICE_PROFILES, getPracticeProfile } from './profiles.js';
import { makeRng } from './core.js';

function family(id, name, matches) {
  return Object.freeze({ id, name,
    profileIds: Object.freeze(PRACTICE_PROFILES.filter(matches).map(profile => profile.id)),
  });
}

export const AUCTION_FAMILIES = Object.freeze([
  family('jacoby', 'Jacoby · 1M–2NT', profile => profile.id.startsWith('major-')),
  family('diamond-notrump', '1D–1NT', profile => profile.id.startsWith('minor-d-nt-')),
  family('minor-three-bid', 'Minor 3-bid', profile => profile.family === 'Revised minor relays' && !profile.id.startsWith('minor-d-nt-')),
  family('horton', 'Horton · 2NT', profile => profile.family === 'Horton Two enquiries'),
  family('dappleton', 'Dappleton · 1NT', profile => profile.family === 'Dappleton'),
  family('split-range', 'Split range', profile => profile.family === 'Split-range and support relays'),
  family('reordered-rebid', 'Reordered rebid', profile => profile.id.startsWith('rebid-')),
  family('club-relays', 'Club · 1C–1S', profile => profile.family === 'Club relays'),
]);

export function getAuctionFamily(id) {
  const selected = AUCTION_FAMILIES.find(family => family.id === id);
  if (!selected) throw new Error(`Unknown auction family: ${id}`);
  return selected;
}

export function auctionFamilyForProfile(profileId) {
  const selected = AUCTION_FAMILIES.find(family => family.profileIds.includes(profileId));
  if (!selected) throw new Error(`No auction family for exercise: ${profileId}`);
  return selected;
}

/** A fresh random deal seed also randomizes the entry branch. Reusing a seed
 * reproduces that selection; neither player's cards affect the branch draw. */
export function selectFamilyProfile({ familyId, profileId = '', seed }) {
  const selected = getAuctionFamily(familyId);
  if (profileId) {
    if (!selected.profileIds.includes(profileId)) throw new Error('The study branch must belong to the selected auction family.');
    return getPracticeProfile(profileId);
  }
  const rng = makeRng(`relay-family:${familyId}:${seed}`);
  return getPracticeProfile(selected.profileIds[Math.floor(rng() * selected.profileIds.length)]);
}
