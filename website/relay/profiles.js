import { SYSTEM } from './system.js';
import { MINOR_PROFILES } from './minor-profiles.js';
import { CLUB_PROFILES } from './club-profiles.js';
import { STRONG_CLUB_PROFILES } from './strong-club-profiles.js';
import { SPLIT_PROFILES } from './split-profiles.js';
import { HORTON_PROFILES } from './horton-profiles.js';
import { REBID_PROFILES } from './rebid-profiles.js';

const majors = ['S', 'H'].map(major => ({
  id: `major-${major}`, name: `1${major}–2NT`, defaultTrump: major,
  family: 'Major raises', playerSeat: 'South', partnerSeat: 'North',
  assumptions: SYSTEM.assumptions, limitations: SYSTEM.limitations,
}));

export const PRACTICE_PROFILES = [...majors, ...MINOR_PROFILES, ...CLUB_PROFILES, ...STRONG_CLUB_PROFILES, ...SPLIT_PROFILES, ...HORTON_PROFILES, ...REBID_PROFILES];
export function getPracticeProfile(id) {
  const profile = PRACTICE_PROFILES.find(candidate => candidate.id === id);
  if (!profile) throw new Error(`Unknown practice family: ${id}`);
  return profile;
}
