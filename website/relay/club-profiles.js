// First/second-seat, unopposed training subsets from the original Word notes.
// Source map and unresolved branches: docs/relay-club-source.md.
// No function here reads either actual hand: node actions use public state only.
import { SUITS, SUIT_NAMES, length, hcp, shapes, anyOf, nextBid } from './profile-utils.js';

const balanced = value => ({ type: 'balanced', value });
const call = (seat, bid, meaning) => ({ seat, bid, meaning });
const N = (bid, meaning) => call('North', bid, meaning);
const S = (bid, meaning) => call('South', bid, meaning);
const otherMajor = major => major === 'H' ? 'S' : 'H';
const transfer = major => major === 'H' ? '1D' : '1H';
const minorAskPolicy = { skip3NT: true, skipMajorGame: false };
const majorAskPolicy = { skip3NT: false, skipMajorGame: true };
const commonLimitations = [
  'This is a disclosed training subset, not a complete opening or slam-judgement model.',
  'Bourke and fourth-suit continuations use the separate July-email profiles. Split-range raises and Horton Two enquiries have their own practice families.',
];

function fitState(trump) {
  return { trump, major: trump, agreementOptions: [trump], relayPolicy: trump === 'C' || trump === 'D' ? minorAskPolicy : majorAskPolicy };
}

// The two shown suits leave only two possible shortage suits. Replies still
// count ordinary consecutive bids; asking reservations are separate policy.
function twoSuitShortageResponses(knownSuits, allowBalanced, trump) {
  const [high, low] = SUITS.filter(suit => !knownSuits.includes(suit));
  const responses = [];
  if (allowBalanced) responses.push({
    label: 'No shortage', constraints: [balanced(true)], phase: 'keycard',
    state: { ...fitState(trump), balanced: true, shortageSuit: null },
  });
  responses.push({
    label: `High shortage: ${SUIT_NAMES[high].toLowerCase()}`,
    constraints: [length(high, 0, 1), length(low, 2, 13)], phase: 'keycard',
    state: { ...fitState(trump), balanced: false, shortageSuit: high },
  }, {
    label: `Low shortage: ${SUIT_NAMES[low].toLowerCase()}`,
    constraints: [length(low, 0, 1), length(high, 2, 13)], phase: 'keycard',
    state: { ...fitState(trump), balanced: false, shortageSuit: low },
  });
  return responses;
}

function clubBaron(strong) {
  const rebid = strong ? '2C' : '1NT';
  const baseBalanced = [hcp(strong ? 16 : 14, strong ? 19 : 15), balanced(true), length('S', 2, 4), length('H', 2, 4), length('C', 2, 5), length('D', 2, 5), anyOf([length('C', 2, 3)], [length('D', 2, 3)])];
  const shortage = suit => [hcp(strong ? 17 : 14, strong ? 19 : 16), length('C', 5, 7), length(suit, 0, 1), ...SUITS.filter(s => s !== 'C' && s !== suit).map(s => length(s, 2, 4))];
  const cases = [baseBalanced, shortage('D')];
  if (strong) cases.push(shortage('H'), shortage('S'));
  const responses = [
    { bid: '2NT', label: 'Balanced with four-plus clubs', constraints: [balanced(true), length('C', 4, 5)], nextNode: 'kickback', state: { balanced: true, shortageSuit: null } },
    { bid: '3C', label: 'Balanced with four-plus diamonds', constraints: [balanced(true), length('D', 4, 5)], nextNode: 'kickback', state: { balanced: true, shortageSuit: null } },
    { bid: '3D', label: 'Balanced without a four-card minor', constraints: [balanced(true), length('C', 2, 3), length('D', 2, 3)], nextNode: 'kickback', state: { balanced: true, shortageSuit: null } },
  ];
  if (strong) responses.push(
    { bid: '3H', label: '17–19 HCP, heart shortage', constraints: [hcp(17, 19), length('H', 0, 1)], nextNode: 'kickback', state: { balanced: false, shortageSuit: 'H' } },
    { bid: '3S', label: '17–19 HCP, spade shortage', constraints: [hcp(17, 19), length('S', 0, 1)], nextNode: 'kickback', state: { balanced: false, shortageSuit: 'S' } },
  );
  responses.push({ bid: '3NT', label: `${strong ? '17–19' : '14–16'} HCP, diamond shortage`, constraints: [length('D', 0, 1)], nextNode: 'kickback', state: { balanced: false, shortageSuit: 'D' } });
  return {
    id: `club-1s-${strong ? '2c' : '1nt'}-baron`,
    family: 'Club relays',
    name: `1♣–1♠–${strong ? '2♣' : '1NT'} · Baron and club Kickback`,
    source: 'Word P0376–P0415', defaultTrump: 'C', playerSeat: 'South', partnerSeat: 'North',
    initialAuction: [N('1C', 'Club opening'), S('1S', '(7)8+, usually no four-card major'), N(rebid, strong ? 'Strong balanced or 17+ unbalanced' : 'Lower balanced range or 14–16 diamond shortage')],
    partnerConstraints: [anyOf(...cases)],
    playerConstraints: [hcp(12, 20), length('C', 6), length('D', 4), length('S', 0, 3), length('H', 0, 3)],
    startNode: 'baron',
    nodes: {
      baron: { label: 'Baron', help: 'Ask opener to resolve the mixed balanced/unbalanced rebid.', actions: [{ bid: '2S', label: 'Baron enquiry', kind: 'relay', responses }] },
      kickback: session => ({
        label: 'Club Kickback',
        help: 'With six clubs and four diamonds, this profile follows the explicit 4♦ club-Kickback option after Baron (P0415).',
        actions: [{ bid: '4D', label: 'Kickback in clubs', kind: 'keycard', trump: 'C', shortageSuit: session.shortageSuit ?? null, keycardMode: 'normal' }],
      }),
    },
    assumptions: [
      'Responder is restricted to 6 clubs/4 diamonds and 12–20 HCP, a minor-oriented slam-training subset of the source Baron entry.',
      'Balanced opener has no five-card major, no six-card minor, and not four-plus cards in both minors; this avoids unspecified Baron response priorities.',
      'Unbalanced opener has exactly one shortage and no five-card side suit. Parenthesized strength boundaries are narrowed to explicit training intervals.',
      'The standard minor-agreement continuation changes which hand describes shortage. This profile instead follows the source-explicit 4♦ club Kickback option.',
    ],
    limitations: [...commonLimitations, 'The 2C–2D transfer to 3NT is available as a separate strong-club exercise. Responder-description branches after Baron remain separate paths.'],
  };
}

function clubKnownShortage(shortageSuit) {
  const other = shortageSuit === 'S' ? 'H' : 'S';
  const rebid = shortageSuit === 'S' ? '2H' : '2S';
  return {
    id: `club-1s-${rebid.toLowerCase()}-keycard`,
    family: 'Club relays',
    name: `1♣–1♠–${rebid === '2H' ? '2♥' : '2♠'} · choose club or diamond SKC`,
    source: 'Word P0384–P0385, P0422–P0425', defaultTrump: 'C', playerSeat: 'South', partnerSeat: 'North',
    initialAuction: [N('1C', 'Club opening'), S('1S', '(7)8+, usually no four-card major'), N(rebid, `14–16 HCP, ${SUIT_NAMES[shortageSuit].toLowerCase()} shortage, two/three diamonds and five-plus clubs`)],
    partnerConstraints: [hcp(14, 16), length('C', 5, 7), length('D', 3), length(shortageSuit, 0, 1), length(other, 2, 4)],
    playerConstraints: [hcp(12, 20), length('C', 3, 5), length('D', 5, 7), length('S', 0, 3), length('H', 0, 3)],
    startNode: 'select-trump',
    nodes: {
      'select-trump': {
        label: 'Choose the minor', help: 'This disclosed subset gives opener three diamonds, so both minor enquiries have a supported fit.',
        actions: [
          { bid: '3C', label: 'Shortage Keycard in clubs', kind: 'keycard', trump: 'C', shortageSuit, keycardMode: 'shortage' },
          { bid: '3D', label: 'Show five diamonds and ask Shortage Keycard', kind: 'keycard', trump: 'D', shortageSuit, keycardMode: 'shortage' },
        ],
      },
    },
    assumptions: ['Training opener has exactly three diamonds. The source also permits two, when the diamond continuation instead receives 3NT to play.', 'Responder has five-plus diamonds, three-plus clubs and 12–20 HCP; no four-card major.'],
    limitations: [...commonLimitations, 'The doubleton-diamond 3NT branch and the minimum 2NT preference to 3m are outside this profile.'],
  };
}

function clubTwoMinors(weak) {
  const rebid = weak ? '3D' : '2NT';
  const clubAsk = weak ? '3H' : '3C';
  const diamondAsk = weak ? '3S' : '3D';
  return {
    id: `club-1s-${weak ? '3d' : '2nt'}-minors`,
    family: 'Club relays',
    name: `1♣–1♠–${weak ? '3♦' : '2NT'} · two-minor shortage relay`,
    source: weak ? 'Word P0388, P0433–P0434; H/L ordering P0427' : 'Word P0386, P0426–P0427',
    defaultTrump: 'C', playerSeat: 'South', partnerSeat: 'North',
    initialAuction: [N('1C', 'Club opening'), S('1S', '(7)8+, usually no four-card major'), N(rebid, `${weak ? '9–13' : '14–16'} HCP, five-plus clubs and four-plus diamonds`)],
    partnerConstraints: [hcp(weak ? 9 : 14, weak ? 13 : 16), shapes('3145', '4045', '1345', '0445', '2146', '1246', '3046', '0346')],
    playerConstraints: [hcp(weak ? 16 : 12, 22), length('C', 4, 6), length('D', 4, 6), length('S', 0, 3), length('H', 0, 3)],
    startNode: 'shortage',
    nodes: {
      shortage: {
        label: 'Agree a minor and ask shortage', help: 'Opener has a spade or heart shortage. Choose clubs or diamonds before the H/L response.',
        actions: [
          { bid: clubAsk, label: 'Agree clubs and ask shortage', kind: 'relay', state: fitState('C'), responses: twoSuitShortageResponses(['C', 'D'], false, 'C') },
          { bid: diamondAsk, label: 'Agree diamonds and ask shortage', kind: 'relay', state: fitState('D'), responses: twoSuitShortageResponses(['C', 'D'], false, 'D') },
        ],
      },
    },
    assumptions: ['Opener is restricted to five/six clubs, exactly four diamonds and exactly one major-suit shortage; responder has four-plus cards in both minors.', 'Strength is already disclosed by the initial rebid. The shortage answer proceeds directly to SKC, without another strength enquiry.', ...(weak ? ['The H/L order uses the explicitly defined equivalent two-minor shortage branch at P0427.'] : [])],
    limitations: [...commonLimitations, 'Five-five minors, two shortages and opening-judgement exceptions are outside the training subset.'],
  };
}

function dappletonTransfer(major, minor, viaPuppet) {
  const majorLength = viaPuppet ? 5 : 4;
  const minorTransfer = minor === 'C' ? '2NT' : '3C';
  const accept = minor === 'C' ? '3C' : '3D';
  const otherM = otherMajor(major);
  const otherMinor = minor === 'C' ? 'D' : 'C';
  const initialAuction = [N('1C', 'Club opening'), S(transfer(major), `Four-plus ${SUIT_NAMES[major].toLowerCase()}`), N('1NT', '18/19 balanced with two/three cards in the transferred major')];
  if (viaPuppet) initialAuction.push(S('2C', 'Puppet to 2♦; establishes the five-major route'), N('2D', 'Puppet acceptance'));
  initialAuction.push(S(minorTransfer, `Exactly five ${SUIT_NAMES[minor].toLowerCase()}, ${majorLength} cards in the major, slam interest`));
  const actions = [{
    bid: accept, label: `Accept the ${SUIT_NAMES[minor].toLowerCase()} transfer and ask shortage`, kind: 'relay',
    state: fitState(minor), responses: twoSuitShortageResponses([major, minor], !viaPuppet, minor),
  }];
  if (viaPuppet) actions.push({
    bid: `3${major}`, label: `Agree ${SUIT_NAMES[major].toLowerCase()} instead and ask shortage`, kind: 'relay',
    playerConstraints: [length(major, 3), length(minor, 3)], state: fitState(major),
    responses: twoSuitShortageResponses([major, minor], false, major),
  });
  return {
    id: `dappleton-${major.toLowerCase()}-${minor.toLowerCase()}-${viaPuppet ? 'five-major' : 'four-major'}`,
    family: 'Dappleton',
    name: `Dappleton ${major === 'H' ? '♥' : '♠'} · ${majorLength} major / 5 ${minor === 'C' ? '♣' : '♦'}`,
    source: 'Word P0446–P0467, P0518–P0520', defaultTrump: minor, playerSeat: 'North', partnerSeat: 'South',
    initialAuction,
    partnerConstraints: [hcp(12, 19), length(major, majorLength), length(minor, 5), length(otherM, 0, 3), length(otherMinor, 0, 4)],
    playerConstraints: [hcp(18, 19), balanced(true), length(major, 2, 3), length(otherM, 2, 4), length(minor, 3, 6)],
    startNode: 'accept-transfer',
    nodes: { 'accept-transfer': { label: 'Responder describes shortage', help: `You are opener North. Accept the minor${viaPuppet ? ', or agree the five-card major with a good three-card fit and no four-card minor fit' : ''}; South then describes the fixed hidden hand.`, actions } },
    assumptions: [
      'The opening 1NT rebid is narrowed to 18/19 balanced with two/three cards in the transferred major. This excludes the exceptional four-card-major escape.',
      `Responder has exactly ${majorLength} major cards and five in the transferred minor, 12–19 HCP, and no four-card second major.`,
      `${viaPuppet ? 'Five-five shape cannot have no shortage: the answers are high/low.' : 'Four-five shape can be balanced: the answers are no shortage/high/low.'} Response bids count consecutively, including NT or trump bids.`,
      'After accepting the minor, SKC asks skip 3NT. After agreeing the major, 3NT is available as an ask and game in the agreed major is reserved for play.',
      ...(viaPuppet ? ['For the optional major agreement, the program checks a three-card major fit and no four-card fit in the shown minor. The source’s “good” fit requirement remains a player judgement; no honour formula is invented.'] : []),
    ],
    limitations: [...commonLimitations, 'Transfer rejection, exceptional four-card-major support and responder shapes with a longer second major are outside this profile.'],
  };
}

function dappletonBaron(major, minor) {
  const otherM = otherMajor(major);
  const otherMinor = minor === 'C' ? 'D' : 'C';
  const baronAnswer = minor === 'C' ? '2NT' : '3C';
  const agreement = `3${minor}`;
  const ask = nextBid(agreement);
  const majorAsk = nextBid(ask);
  return {
    id: `dappleton-${major.toLowerCase()}-baron-${minor.toLowerCase()}`,
    family: 'Dappleton',
    name: `Dappleton ${major === 'H' ? '♥' : '♠'} Baron · agree ${minor === 'C' ? '♣' : '♦'}`,
    source: 'Word P0452/P0465, P0503–P0512', defaultTrump: minor, playerSeat: 'North', partnerSeat: 'South',
    initialAuction: [
      N('1C', 'Club opening'), S(transfer(major), `Four-plus ${SUIT_NAMES[major].toLowerCase()}`), N('1NT', '18/19 balanced with two/three in the major'),
      S('2C', 'Puppet to 2♦; five-major route'), N('2D', 'Puppet acceptance'), S('2S', 'Baron: five major cards and a four/six-card minor'),
      N(baronAnswer, `Four-plus ${SUIT_NAMES[minor].toLowerCase()}`), S(agreement, `Agree ${SUIT_NAMES[minor].toLowerCase()}`),
    ],
    partnerConstraints: [hcp(12, 19), length(major, 5), length(minor, 4), length(otherM, 0, 3), length(otherMinor, 0, 4)],
    playerConstraints: [hcp(18, 19), balanced(true), length(major, 2, 3), length(otherM, 2, 4), length(minor, 4), length(otherMinor, 2, 3)],
    startNode: 'shortage',
    nodes: {
      shortage: {
        label: 'Ask responder for shortage', help: 'The full Baron lead-in has established the minor fit. North now asks South to describe shortage.',
        actions: [
          { bid: ask, label: `Ask shortage, ${SUIT_NAMES[minor].toLowerCase()} agreed`, kind: 'relay', state: fitState(minor), responses: twoSuitShortageResponses([major, minor], true, minor) },
          { bid: majorAsk, label: `Agree ${SUIT_NAMES[major].toLowerCase()} instead and ask shortage`, kind: 'relay', playerConstraints: [length(major, 3)], state: fitState(major), responses: twoSuitShortageResponses([major, minor], true, major) },
        ],
      },
    },
    assumptions: ['The complete fixed lead-in includes the five-major puppet route, Baron answer and minor agreement. Opener is North; responder South answers the shortage and keycard enquiries.', 'Responder is restricted to exactly five major/four minor cards, 12–19 HCP, with at most three in the other major. Opener has exactly four cards in the agreed minor and 18/19 balanced.', 'Known suits remove their impossible shortages; the remaining shortage categories are no shortage/high/low. Step+1 can agree responder’s five-card major (P0512).'],
    limitations: [...commonLimitations, 'The six-card-minor Baron descriptions, special six-club opener replies and quantitative declines are outside this fixed-entry scenario.'],
  };
}

export const CLUB_PROFILES = [
  clubBaron(false), clubBaron(true),
  clubKnownShortage('S'), clubKnownShortage('H'),
  clubTwoMinors(false), clubTwoMinors(true),
  ...['H', 'S'].flatMap(major => ['C', 'D'].flatMap(minor => [dappletonTransfer(major, minor, false), dappletonTransfer(major, minor, true)])),
  ...['H', 'S'].flatMap(major => ['C', 'D'].map(minor => dappletonBaron(major, minor))),
];
