// Literal response calls from Reordering Opener's Rebid. Kept separate from
// hand predicates so entry meanings and executable trees share a public table.
const single = major => [
  ['2H', 'Shortage ask: no/middle/high/low; clubs agreed'], ['2S', 'Minimum, 5–6'],
  ['2NT', 'Subminimum, 0–4(5); return to clubs'], ['3C', 'Invitation, 7–9'],
  ['3D', `Six-plus ${major}; playable opposite singleton ten or better`],
  ['3H', `Solid six-plus ${major}; sets trumps`], ['3S', 'Request opener to bid 3NT'], ['3NT', 'To play'],
];
const major = suit => `Six-plus ${suit}; solid or playable opposite singleton ten or better`;
const nt = ['3S', 'Request opener to bid 3NT'], play = ['3NT', 'To play'];
export const REBID_RESPONSE_TABLES = [
  ['1C 1D 2D', single('hearts')], ['1C 1H 2D', single('spades')],
  ['1D 1H 2S', [['2NT', 'Shortage ask: no/middle/high/low; diamonds agreed'], ['3C', 'Minimum, 5–6'], ['3D', 'Invitation, 7–9'], ['3H', major('hearts')], nt, play]],
  ['1D 1S 2H', [['2S', 'Shortage ask: no/middle/high/low; diamonds agreed'], ['2NT', 'Minimum, 5–6'], ['3C', 'Subminimum, 0–4; return to diamonds'], ['3D', 'Invitation, 7–9'], ['3H', major('spades')], nt, play]],
  ['1H 1S 3C', [['3D', 'Shortage ask: no/middle/high/low; hearts agreed'], ['3H', 'Minimum, 5–7; to play'], ['3S', major('spades')], play]],
  ['1C 1D 2S', [['2NT', 'Shortage ask: high/low/equal; clubs agreed'], ['3C', 'Minimum, 0–6(7); to play'], ['3D', 'Shortage ask: high/low/equal; diamonds agreed'], ['3H', major('hearts')], nt, play]],
  ['1C 1H 2H', [['2S', 'Shortage ask: high/low/equal; clubs agreed'], ['2NT', 'Minimum, 5–7'], ['3C', 'Subminimum, 0–4; to play'], ['3D', 'Shortage ask: high/low/equal; diamonds agreed'], ['3H', major('spades')], nt, play]],
  ['1C 1H 3C', [['3D', 'Shortage ask: high/low/equal; clubs agreed'], ['3H', 'Shortage ask: high/low/equal; hearts agreed'], ['3S', major('spades')], play]],
  ['1D 1S 3C', [['3D', 'Minimum, 5–6; to play'], ['3H', 'Shortage ask: high/low/equal; diamonds agreed'], ['3S', major('spades')], play]],
  ...[['C','1D','H'], ['C','1H','S'], ['D','1H','H'], ['D','1S','S']].map(([minor, response, m]) => [
    `1${minor} ${response} 2NT`, [
      [minor === 'C' ? '3C' : '3D', `Return to ${minor === 'C' ? 'clubs' : 'diamonds'}`],
      [minor === 'C' ? '3D' : '3C', `Shortage ask; ${minor === 'C' ? 'clubs' : 'diamonds'} agreed`],
      [m === 'H' ? '3S' : '3H', `Shortage ask; ${m === 'H' ? 'hearts' : 'spades'} agreed`],
      [`3${m}`, `Five ${m === 'H' ? 'hearts' : 'spades'}; weak, to play`], play,
    ],
  ]),
];
