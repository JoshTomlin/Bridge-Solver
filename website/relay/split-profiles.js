// Word P1524–P1687. Corrected diamond shape typos use the later explicit examples.
import { SUITS, length, hcp, shapes, anyOf, nextBid, lastBid, bidIndex, relayStep } from './profile-utils.js';
import { shapeSet, oneShortage, fit, prefix, kickback, cueResponses, control, noControl, name } from './source-utils.js';

const controls = (min, max = 12) => ({ type: 'controls', min, max });
const rowsFor = (minor, major) => {
  const single = { bid: `3${minor}`, label: `Six-plus ${name(minor)}; no undisclosed four-card suit`,
    fact: shapeSet(n => n[major] === 3 && n[minor] >= 6 && SUITS.filter(s => ![minor, major].includes(s)).every(s => n[s] <= 3) && oneShortage(n, [minor, major]) && SUITS.some(s => n[s] <= 1)), single: true };
  if (minor === 'C' && major === 'H') return [
    { bid: '2NT', label: 'Four spades; diamond shortage', fact: shapes('4315', '4306'), short: 'D', second: 'S' }, single,
    { bid: '3D', label: 'Four diamonds; spade shortage', fact: shapes('1345', '0346'), short: 'S', second: 'D' },
  ];
  if (minor === 'C') return [single,
    { bid: '3D', label: 'Four diamonds; heart shortage', fact: shapes('3145', '3046'), short: 'H', second: 'D' },
    { bid: '3H', label: 'Four hearts; diamond shortage', fact: shapes('3415', '3406'), short: 'D', second: 'H' },
  ];
  if (major === 'H') return [
    { bid: '2NT', label: 'Four spades; club shortage', fact: shapes('4351', '4360'), short: 'C', second: 'S' },
    { bid: '3C', label: 'Four clubs; spade shortage', fact: shapes('1354', '0364'), short: 'S', second: 'C' }, single,
  ];
  return [
    { bid: '3C', label: 'Four clubs; heart shortage', fact: shapes('3154', '3064'), short: 'H', second: 'C' }, single,
    { bid: '3H', label: 'Four hearts; club shortage', fact: shapes('3451', '3460'), short: 'C', second: 'H' },
  ];
};

function balancedResponses(major) {
  const nonSerious = major === 'H' ? '3S' : '3NT';
  const responses = [
    { bid: nonSerious, label: '14–15 balanced, four trumps; non-serious slam interest', constraints: [hcp(14, 15), { type: 'balanced' }, length(major, 4), controls(4, 4)], nextNode: 'kickback', state: fit(major, { threeNTToPlay: false }) },
  ];
  const denied = [];
  const cues = major === 'H' ? [['3NT', 'S'], ['4C', 'C'], ['4D', 'D']] : [['4C', 'C'], ['4D', 'D'], ['4H', 'H']];
  for (const [bid, suit] of cues) {
    responses.push({ bid, label: `14–15 balanced, four trumps; serious ${name(suit)} control`,
      constraints: [hcp(14, 15), { type: 'balanced' }, length(major, 4), controls(5), ...denied, control(suit)], nextNode: 'kickback', state: fit(major, { threeNTToPlay: false }) });
    denied.push(...noControl(suit));
  }
  responses.push({ bid: `4${major}`, label: '14–15 balanced, four trumps; poor slam prospects',
    constraints: [hcp(14, 15), { type: 'balanced' }, length(major, 4), anyOf([controls(0, 3)], [controls(5), ...denied])],
    nextNode: 'kickback', state: fit(major) });
  return responses;
}

function splitProfile(minor, major, rangeEntry = false) {
  const rows = rowsFor(minor, major).filter(row => !(rangeEntry && major === 'H' && row.bid === '2NT'));
  const initial = [minor === 'C' ? '1C' : '1D', minor === 'C' ? (major === 'H' ? '1D' : '1H') : `1${major}`, rangeEntry ? '1NT' : `2${major}`];
  const weakFour = shapeSet(n => n[major] === 4 && n[minor] >= 4 && oneShortage(n, [minor, major]) && SUITS.some(s => n[s] <= 1));
  const balanced = [{ type: 'balanced' }, length(major, 4), length(major === 'H' ? 'S' : 'H', 2, 4)];
  const shapeState = row => fit(major, { shortageSuit: row.short ?? null, balanced: false, requireAgreement: true });
  const shapeResponses = (points, exactBids = true) => rows.map((row, i) => ({
    ...(exactBids ? { bid: row.bid } : {}), label: row.label, constraints: [points, { ...row.fact, label: row.label }], nextNode: row.single ? 'single-shortage' : `agree-${i}`, state: shapeState(row),
  }));
  const nodes = {};
  const makeAsk = (bid, points) => ({ bid, label: 'Game-forcing shape relay', kind: 'relay', responses: shapeResponses(points) });
  if (!rangeEntry) {
    const action = makeAsk(nextBid(`2${major}`), hcp(9, 10));
    action.responses.push({ bid: `3${major}`, label: '9–10 HCP, four-card major support', constraints: [hcp(9, 10), weakFour], nextNode: 'four-support', state: fit(major) });
    if (minor === 'C') action.responses.push(...balancedResponses(major));
    nodes.entry = { label: 'Resolve the major raise', help: 'The next step is game-forcing. Opener shows three-card-support shape, four-card support, or the balanced split-range hand.', actions: [action] };
  } else {
    const response = (bid, min, max, nextNode) => ({ bid, label: `${min}–${max} HCP, three-card major support`, constraints: [hcp(min, max), length(major, 3)], nextNode });
    nodes.entry = { label: 'Ask the diamond opener’s range', help: 'Practice intervals are 11–12 minimum, 13 middle, and 14–15 maximum. Maximum hands describe shape immediately.', actions: [{
      bid: '2C', label: 'Ask range and three-card-support shape', kind: 'relay', responses: [
        response('2D', 13, 13, 'further'), response(`2${major}`, 11, 12, 'further'), ...shapeResponses(hcp(14, 15)),
      ],
    }] };
    nodes.further = session => ({ label: 'Continue the three-card-support relay', help: '2M can be played when legal; 2NT continues to shape.', signoffs: [`2${major}`],
      actions: [makeAsk('2NT', hcp(11, 13))] });
  }
  nodes['single-shortage'] = session => {
    const [high, low] = SUITS.filter(s => ![minor, major].includes(s));
    const after = lastBid(session);
    const ask = nextBid(after) === `3${major}` ? nextBid(after, 2) : nextBid(after);
    return { label: 'Find the remaining shortage', help: major === 'H' && minor === 'D' ? '3H agrees hearts; 3S is the shortage enquiry.' : 'The next step asks high/low shortage. You can agree a known suit instead.',
      actions: [{ bid: ask, label: 'Ask high/low shortage', kind: 'relay', responses: [high, low].map(suit => ({
        label: `${name(suit)} shortage`, constraints: [length(suit, 0, 1), length(suit === high ? low : high, 2, 13)], nextNode: 'agree-single', state: fit(major, { shortageSuit: suit, balanced: false, requireAgreement: false }),
      })) }, ...agreementActions(session, [major, minor])],
    };
  };
  function agreementActions(session, suits) {
    const after = lastBid(session);
    return suits.map(trump => {
      let bid = trump === major ? `3${major}` : `4${minor}`;
      if (trump === minor && bidIndex(`3${minor}`) > bidIndex(after)) bid = `3${minor}`;
      if (trump !== minor && trump !== major) bid = nextBid(after); // replaced by source-shortage cue below
      if (trump !== minor && trump !== major) {
        for (let candidate = nextBid(after); candidate; candidate = nextBid(candidate)) if (candidate.slice(1) === session.shortageSuit) { bid = candidate; break; }
      }
      if (bidIndex(bid) <= bidIndex(after) || bid === `4${trump}` && ['S', 'H'].includes(trump)) return null;
      return { bid, label: `Agree ${name(trump)} below game`, kind: 'relay', state: fit(trump), responses: cueResponses(bid, trump) };
    }).filter(Boolean);
  }
  function agreementsWithKeycards(session, suits) {
    const agreements = agreementActions(session, suits);
    const assigned = new Set(agreements.map(action => action.bid));
    // P1595: after the 3H shape answer, 4D agrees hearts. Club Kickback
    // cannot reuse it; agree clubs and follow the cue/4NT route instead.
    return [...agreements, ...directKeycards(session, suits).filter(action => !assigned.has(action.bid))];
  }
  rows.forEach((row, i) => { if (!row.single) nodes[`agree-${i}`] = session => ({
    label: 'Agree a suit at the lowest level', help: 'Agree the major or opened minor, or cue opener’s shortage to agree the second suit. 3NT is to play.',
    actions: agreementsWithKeycards(session, [major, minor, row.second]),
  }); });
  nodes['agree-single'] = session => ({ label: 'Agree a suit or choose a contract', help: 'The shortage is now known. Agree the minor, use Kickback, or choose game.',
    actions: agreementsWithKeycards(session, [major, minor]) });
  nodes['four-support'] = session => ({ label: 'Four-card support established', help: 'Continue with Kickback or choose a final contract.', actions: directKeycards(session, [major]) });
  nodes.kickback = session => {
    const after = lastBid(session);
    const bid = bidIndex(kickback(session.trump)) > bidIndex(after) ? kickback(session.trump) : '4NT';
    return { label: 'Continue after the agreement', help: 'The fit is established. The source uses Kickback, or 4NT after the higher minor agreement and cue.', actions: bidIndex(bid) > bidIndex(after)
      ? [{ bid, kind: 'keycard', trump: session.trump, keycardMode: 'normal', label: `Ask keycards in ${name(session.trump)}` }] : [] };
  };
  return {
    id: `split-${minor.toLowerCase()}-${major.toLowerCase()}${rangeEntry ? '-1nt' : ''}`,
    name: `${initial.join('–')} · ${rangeEntry ? 'three-card support' : 'split-range/support relay'}`, family: 'Split-range and support relays',
    source: 'Word P1524–P1687; later explicit diamond examples resolve earlier copied shape typos',
    defaultTrump: major, playerSeat: 'South', partnerSeat: 'North', initialAuction: prefix(initial), startNode: 'entry', nodes,
    partnerConstraints: rangeEntry ? [hcp(11, 15), { ...anyOf(...rows.map(row => [row.fact])), label: 'Exactly three-card major support in the listed diamond-opening shapes' }]
      : [{ ...anyOf([hcp(9, 10), anyOf(...rows.map(row => [row.fact]), [weakFour])], ...(minor === 'C' ? [[hcp(14, 15), ...balanced]] : [])),
        label: minor === 'C' ? '9–10 unbalanced with three/four-card support, or 14–15 balanced with four-card support' : '9–10 unbalanced with three/four-card major support' }],
    playerConstraints: [hcp(14, 21), length(major, 4, 6)],
    assumptions: [
      'The direct club raise combines weak unbalanced three/four-card support and 14–15 balanced four-card support. The direct diamond raise contains only the weak option.',
      'Practice narrows the weak 9–10(11) range to 9–10. The 1NT support entry uses disjoint 11–12 / 13 / 14–15 intervals for the source’s overlapping boundaries.',
      'Balanced slam judgement uses a disclosed control policy: up to three controls signs off, four is non-serious, five-plus cues a control. It is a practice policy for the notes’ subjective descriptions.',
      'After a forcing suit agreement, the bot cues its cheapest ace, king or shortage. In hearts 3S is reserved and 3NT can cue spades. Subsequent keycard uses the source Kickback/4NT route.',
      'Source shape typos are resolved using P1600 (4351/4360) and P1617 (3154/3064), retaining three-card major support and the opened minor.',
    ],
    limitations: ['Borderline 11-count weak raises and exceptional singleton-honour opening choices are excluded. The superseded Bourke-support prefixes are not reintroduced alongside the July revisions.'],
  };
}

function directKeycards(session, suits) {
  return [...new Set(suits)].map(trump => ({ bid: kickback(trump), kind: 'keycard', trump, keycardMode: 'normal', label: `Kickback in ${name(trump)}` }))
    .filter(action => bidIndex(action.bid) > bidIndex(lastBid(session)));
}

export const SPLIT_PROFILES = ['C', 'D'].flatMap(minor => ['H', 'S'].map(major => splitProfile(minor, major)))
  .concat(['H', 'S'].map(major => splitProfile('D', major, true)));
