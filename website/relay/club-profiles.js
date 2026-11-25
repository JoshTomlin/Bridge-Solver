// First/second-seat, unopposed training subsets from the original Word notes.
// Source map and unresolved branches: docs/relay-club-source.md.
// No function here reads either actual hand: node actions use public state only.
import { SUITS, SUIT_NAMES, length, hcp, shapes, anyOf, nextBid, relayStep } from './profile-utils.js';
import { diamondSupportAsk, diamondDoubletonNode } from './source-utils.js';

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
        actions: [
          { bid: '4D', label: 'Kickback in clubs', kind: 'keycard', trump: 'C', shortageSuit: session.shortageSuit ?? null, keycardMode: 'normal' },
          ...(['2NT', '3C'].includes(session.auction?.at(-1)?.bid) ? [{
            bid: session.auction.at(-1).bid === '2NT' ? '3C' : '3D', kind: 'handover',
            label: `Agree ${session.auction.at(-1).bid === '2NT' ? 'clubs' : 'diamonds'}; opener asks responder’s shortage`,
            source: session.auction.at(-1).bid === '2NT' ? 'P0409' : 'P0410',
            nextNode: 'responder-shortage', state: fitState(session.auction.at(-1).bid === '2NT' ? 'C' : 'D'),
          }] : []),
        ],
      }),
      'responder-shortage': session => ({
        label: 'Opener asks responder’s shortage',
        help: 'The minor is agreed. Opener’s next step asks responder to describe major-suit shortage, high then low.',
        actions: [{ bid: session.trump === 'C' ? '3D' : '3H', kind: 'relay',
          label: `Ask responder’s shortage, ${session.trump === 'C' ? 'clubs' : 'diamonds'} agreed`,
          source: session.trump === 'C' ? 'P0409' : 'P0410',
          responses: twoSuitShortageResponses(['C', 'D'], false, session.trump),
        }],
      }),
    },
    assumptions: [
      'Responder is restricted to 6 clubs/4 diamonds and 12–20 HCP, a minor-oriented slam-training subset of the source Baron entry.',
      'Balanced opener has no five-card major, no six-card minor, and not four-plus cards in both minors; this avoids unspecified Baron response priorities.',
      'Unbalanced opener has exactly one shortage and no five-card side suit. Parenthesized strength boundaries are narrowed to explicit training intervals.',
      'After opener shows a four-card minor, agreeing it hands the enquiry to opener, who asks responder’s shortage. The source-explicit 4♦ club Kickback option remains available.',
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
    partnerConstraints: [hcp(14, 16), length('C', 5, 7), length('D', 2, 3), length(shortageSuit, 0, 1), length(other, 2, 4)],
    playerConstraints: [hcp(12, 20), length('C', 3, 5), length('D', 5, 7), length('S', 0, 3), length('H', 0, 3),
      anyOf([length('D', 5)], [length('C', 4, 5)])],
    startNode: 'select-trump',
    nodes: {
      'select-trump': {
        label: 'Choose the minor', help: '3C asks in clubs. Over 3D opener offers 3NT with two diamonds and answers keycard with three.', preferLongerMinor: true,
        actions: [
          { bid: '3C', label: 'Shortage Keycard in clubs', kind: 'keycard', trump: 'C', shortageSuit, keycardMode: 'shortage' },
          diamondSupportAsk(shortageSuit, 7),
        ],
      },
      'diamond-doubleton': diamondDoubletonNode,
    },
    assumptions: ['Responder has five-plus diamonds, three-plus clubs and 12–20 HCP. A single-suited diamond positive responds 2C instead.'],
    limitations: [...commonLimitations, 'The minimum 2NT preference to 3m is outside this profile.'],
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
        label: 'Agree a minor and ask shortage', preferLongerMinor: true,
        help: 'Opener has a spade or heart shortage. Choose clubs or diamonds before the H/L response.',
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
      'After accepting the minor, SKC asks skip 3NT. After agreeing the major, 3NT is available as an ask and major game is reserved for play. The keycard ask after a void can use major game if it is the next step.',
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

export const MINI_BOURKE = 'club-1s-2d-bourke';
export const MINI_BOURKE_4414 = 'club-1s-2d-bourke-4414';
export const BOURKE_LONG_CLUBS = ['3226', '2326', '2236', '2227'];
const bourkeShortages = [
  { suit: 'H', bid: '3D', ask: '3H', source: 'P0588' },
  { suit: 'S', bid: '3H', ask: '3S', source: 'P0589' },
  { suit: 'D', bid: '3S', ask: '4C', source: 'P0590' },
];

function bourkeShortageFacts(index) {
  return [length(bourkeShortages[index].suit, 0, 1), ...bourkeShortages.slice(0, index).map(({ suit }) => length(suit, 2, 13))];
}

function bourkeShapeReplies(min, max) {
  const range = `${min}–${max}`;
  return [
    { bid: '3C', label: `6+ clubs, ${range}`, constraints: [hcp(min, max), balanced(false), length('C', 6, 13)], nextNode: 'long-club-shortage', source: 'P0587' },
    ...bourkeShortages.map(({ suit, bid, source }, index) => ({ bid, label: `${SUIT_NAMES[suit]} shortage, five clubs, ${range}`,
      constraints: [hcp(min, max), length('C', 5), ...bourkeShortageFacts(index)],
      nextNode: 'known-shortage', state: fitState('C'), source })),
    { bid: '3NT', label: `4414, ${range}`, constraints: [hcp(min, max), shapes('4414')], nextNode: '4414', source: 'P0591' },
  ];
}

function miniBourke(focus4414 = false) {
  const rebid = '9–13, 0–3 diamonds, clubs not solid';
  return {
    id: focus4414 ? MINI_BOURKE_4414 : MINI_BOURKE, family: 'Club relays',
    name: focus4414 ? 'Mini Bourke · 4414' : '1♣–1♠–2♦ · Mini Bourke',
    source: 'Word P0383, P0537, P0583–P0591', defaultTrump: 'C', playerSeat: 'South', partnerSeat: 'North',
    initialAuction: [N('1C', 'Club opening'), S('1S', '(7)8+, usually no four-card major'), N('2D', rebid)],
    partnerConstraints: [hcp(9, 13), length('D', 0, 3), anyOf([shapes('4414')],
      [length('C', 5, 13), balanced(false)], [hcp(11, 13), shapes(BOURKE_LONG_CLUBS)])],
    ...(focus4414 ? { studyOnly: true, dealPartnerConstraints: [hcp(9, 11), shapes('4414')] } : {}),
    playerConstraints: [hcp(14, 20), length('C', 3, 7), length('S', 0, 3), length('H', 0, 3), length('D', 0, 5)],
    startNode: 'entry',
    nodes: {
      entry: { label: 'Mini Bourke', help: '2♥ asks opener to separate strength and shape.', actions: [{
        bid: '2H', label: 'Mini Bourke, game-forcing shape relay', kind: 'relay', source: 'P0537/P0583', responses: [
          { bid: '2S', label: '12–13 unbalanced', constraints: [hcp(12, 13), balanced(false)], nextNode: 'upper-shape', source: 'P0584' },
          { bid: '2NT', label: '(11)12–13, (322)6 or 2227', constraints: [hcp(11, 13), shapes(BOURKE_LONG_CLUBS)], nextNode: 'long-club-balanced', source: 'P0383/P0586' },
          ...bourkeShapeReplies(9, 11),
        ],
      }] },
      'upper-shape': { label: '12–13 unbalanced', actions: [{ bid: '2NT', label: 'Ask shape', kind: 'relay', source: 'P0585', responses: bourkeShapeReplies(12, 13) }] },
      'long-club-balanced': { label: 'Long clubs, no shortage', actions: [{ bid: '4D', label: 'Kickback in clubs', kind: 'keycard', trump: 'C', keycardMode: 'normal', source: 'General minor Kickback' }] },
      'long-club-shortage': { label: 'Find the shortage', actions: [{ bid: '3D', label: 'Shortage in hearts, spades or diamonds', kind: 'relay', source: 'P0587',
        responses: bourkeShortages.map(({ suit }, index) => ({ label: `${SUIT_NAMES[suit]} shortage`, constraints: bourkeShortageFacts(index),
          phase: 'keycard', state: { ...fitState('C'), shortageSuit: suit, balanced: false } })),
      }] },
      'known-shortage': session => {
        const { suit, ask, source } = bourkeShortages.find(({ bid }) => bid === session.auction.at(-1).bid);
        return { label: `Detail the ${SUIT_NAMES[suit].toLowerCase()} shortage`, actions: [{ bid: ask,
          label: `Shortage enquiry, ${SUIT_NAMES[suit].toLowerCase()} void or singleton (provisional)`, kind: 'relay', source,
          responses: [0, 1].map(count => ({ label: count === 0 ? 'Void' : 'Singleton', constraints: [length(suit, count)],
            nextNode: 'known-shortage-keycard', state: { ...fitState('C'), shortageSuit: suit, balanced: false } })),
        }] };
      },
      'known-shortage-keycard': session => ({ label: 'Club keycard', actions: [{
        bid: relayStep(session.auction.at(-1).bid), label: 'Keycards in clubs', kind: 'keycard', trump: 'C', keycardMode: 'normal',
      }] }),
      '4414': { label: '4414', actions: [{ bid: '4C', label: 'Keycards in clubs', kind: 'keycard', trump: 'C', keycardMode: 'normal', source: 'P0591' }] },
    },
    assumptions: ['The (11)12–13 exception can use the no-shortage 2NT reply. The 2S–2NT relay keeps the same shape table at 12–13.'],
    limitations: ['With two shortages the trainer shows the first in heart, spade, diamond order. Where the notes name an enquiry after a shortage has already been shown, void then singleton is provisional.'],
  };
}

export const CLUB_PROFILES = [
  clubBaron(false), clubBaron(true),
  clubKnownShortage('S'), clubKnownShortage('H'),
  clubTwoMinors(false), clubTwoMinors(true),
  miniBourke(), miniBourke(true),
  ...['H', 'S'].flatMap(major => ['C', 'D'].flatMap(minor => [dappletonTransfer(major, minor, false), dappletonTransfer(major, minor, true)])),
  ...['H', 'S'].flatMap(major => ['C', 'D'].map(minor => dappletonBaron(major, minor))),
];
