// Reordering Opener's Rebid, retained at docs/system-sources/, R0001–R0192.
import { SUITS, hcp, length, shapes, anyOf, nextBid, relayStep, lastBid, bidIndex } from './profile-utils.js';
import { shapeSet, oneShortage, fit, prefix, name, kickback, cueResponses } from './source-utils.js';

const singleEntries = [
  ['c-h', 'C', 'H', '1D', '2D', '2H'],
  ['c-s', 'C', 'S', '1H', '2D', '2H'],
  ['d-h', 'D', 'H', '1H', '2S', '2NT'],
  ['d-s', 'D', 'S', '1S', '2H', '2S'],
  ['h-s', 'H', 'S', '1S', '3C', '3D'],
];

function relayState(trump, extra = {}) {
  return fit(trump, { threeNTToPlay: false,
    relayPolicy: { skip3NT: true, skipMajorGame: ['H', 'S'].includes(trump) }, ...extra });
}

function playableNode(label = 'Choose a final contract') {
  return { label, help: 'The natural continuation is established. Pass the offered contract or choose another final contract.', actions: [] };
}

function majorAction(bid, c, solid = false) {
  const { open, major, min, split, max } = c;
  const goodSingleton = anyOf(...['A', 'K', 'Q', 'J', 'T'].map(rank => [{ type: 'card', suit: major, rank }]));
  const hasFit = anyOf([length(major, 2, 3)], [length(major, 1), goodSingleton]);
  const noFit = anyOf([length(major, 0)], [length(major, 1), ...['A', 'K', 'Q', 'J', 'T'].map(rank => ({ type: 'card', suit: major, rank, present: false }))]);
  const playerConstraints = [length(major, 6, 9), ...(solid ? ['A', 'K', 'Q', 'J', 'T', '9'].map(rank => ({ type: 'card', suit: major, rank })) : [])];
  if (solid) return { bid, kind: 'relay', label: `Solid six-plus ${name(major)}; set trumps`, playerConstraints,
    responses: cueResponses(bid, major, 'major-keycard') };
  const cues = cueResponses(bid, major, 'major-keycard').map(response => ({ ...response,
    constraints: [hasFit, hcp(split, max), ...response.constraints] }));
  return { bid, kind: 'relay', label: `Six-plus ${name(major)}, playable opposite singleton ten or better`, playerConstraints, responses: [
    { bid: '3NT', label: 'No suitable major fit; offer 3NT', constraints: [noFit], nextNode: 'play', state: { threeNTToPlay: true } },
    { bid: `4${major}`, label: 'Suitable major fit, lower strength', constraints: [hasFit, hcp(min, split - 1)], nextNode: 'major-keycard', state: relayState(major) },
    ...cues,
  ] };
}

function naturalNodes(c) {
  return {
    play: playableNode(),
    'major-keycard': session => ({ label: 'Major fit established', help: 'Continue with ordinary Kickback or choose your contract.',
      actions: bidIndex(kickback(c.major)) > bidIndex(lastBid(session)) ? [{ bid: kickback(c.major), kind: 'keycard', trump: c.major, keycardMode: 'normal', label: `Kickback in ${name(c.major)}` }] : [] }),
  };
}

function naturalActions(c) {
  const { open, major, rebid, min, split, max } = c;
  const actions = [];
  const minimum = (bid, low, high, reply) => ({ bid, label: `${low}–${high} HCP minimum response`, kind: 'relay', playerConstraints: [hcp(low, high)], responses: [
    { bid: reply, label: `Return to ${name(open)}`, constraints: [], nextNode: 'play', state: { threeNTToPlay: false } },
  ] });
  if (open === 'C') actions.push(minimum('2S', 5, 6, '3C'), minimum('2NT', 0, 4, '3C'));
  else if (open === 'D' && major === 'H') actions.push(minimum('3C', 5, 6, '3D'));
  else if (open === 'D') actions.push(minimum('2NT', 5, 6, '3D'), minimum('3C', 0, 4, '3D'));
  else actions.push(minimum('3H', 5, 7, 'Pass'));
  if (open !== 'H') {
    actions.push({ bid: `3${open}`, label: 'Invite game with 7–9 HCP', kind: 'relay', playerConstraints: [hcp(7, 9)], responses: [
      { bid: 'Pass', label: 'Lower range; decline the invitation', constraints: [hcp(min, split - 1)] },
      { bid: '3NT', label: 'Upper range; accept the invitation in 3NT', constraints: [hcp(split, max)], nextNode: 'play', state: { threeNTToPlay: true, strengthKnown: true } },
    ] });
  }
  if (open === 'C') actions.push(majorAction('3D', c), majorAction('3H', c, true));
  else actions.push(majorAction(open === 'H' ? '3S' : '3H', c));
  if (open !== 'H') actions.push({ bid: '3S', label: 'Request opener to play 3NT', kind: 'relay', responses: [
    { bid: '3NT', label: 'Accept the transfer to 3NT', constraints: [], nextNode: 'play', state: { threeNTToPlay: true } },
  ] });
  return actions.filter(action => bidIndex(action.bid) > bidIndex(rebid));
}

function singleProfile(entry, support = false) {
  const [suffix, open, major, response, rebid, initialAsk] = entry;
  const min = support && open === 'D' ? 16 : 14;
  const split = support && open === 'D' ? 18 : 17;
  const max = 19;
  const c = { open, major, rebid: support ? '2NT' : rebid, min, split, max };
  const entryBids = [`1${open}`, response, c.rebid];
  const shape = shapeSet(n => n[open] >= 6 && (support ? n[major] === 3 : n[major] <= 2)
    && SUITS.filter(s => s !== open).every(s => n[s] <= 3) && oneShortage(n, [open]));
  const strengthSplit = open === 'H' ? undefined : { min, split, max, ...(open === 'C' && !support ? { lastKeycardSplitAt: '2NT' } : {}) };
  const makeState = (trump, shortageSuit, band) => relayState(trump, {
    shortageSuit, balanced: shortageSuit === null, strengthSplit, strengthKnown: Boolean(band),
    naturalMinorKeycardSuits: open === 'C' ? ['D'] : open === 'D' ? ['C'] : ['D', 'C'],
    relayPolicy: { skip3NT: trump === open, skipMajorGame: ['H', 'S'].includes(trump) },
  });
  const row = (bid, shortageSuit, trump, band) => {
    const fact = shortageSuit ? [length(shortageSuit, 0, 1), ...SUITS.filter(s => ![open, shortageSuit].includes(s)).map(s => length(s, 2, 3))]
      : [{ type: 'balanced', value: true }];
    const points = band === 'lower' ? hcp(min, split - 1) : band === 'upper' ? hcp(split, max) : null;
    return { bid, label: `${shortageSuit ? `${name(shortageSuit)} shortage` : 'No shortage'}${points ? `; ${points.min}–${points.max} HCP` : ''}`,
      constraints: [...fact, ...(points ? [points] : [])], phase: 'keycard', state: {
        ...makeState(trump, shortageSuit, band),
        threeNTToPlay: bid === '3NT' && (trump === open || shortageSuit === null) && Boolean(band),
      } };
  };
  const nodes = naturalNodes(c);
  const actions = [];
  if (!support) {
    const remaining = SUITS.filter(s => s !== open);
    const [high, middle, low] = remaining;
    let bids;
    if (open === 'C') bids = ['2S', '2NT', '3C', '3D', '3H'];
    else if (open === 'D' && major === 'H') bids = ['3C', '3D', '3H', '3S', '3NT'];
    else if (open === 'D') bids = ['2NT', '3C', '3D', '3H', '3S'];
    else bids = ['3H', '3S', '3NT', '4C'];
    const replies = [row(bids[0], null, open), row(bids[1], middle, open), row(bids[2], high, open),
      row(bids[3], low, open, strengthSplit ? 'lower' : null),
      ...(strengthSplit ? [row(bids[4], low, open, 'upper')] : []),
    ];
    actions.push({ bid: initialAsk, label: `Ask no/middle/high/low shortage, agreeing ${name(open)}`, kind: 'relay', state: makeState(open, null), responses: replies });
    actions.push(...naturalActions(c));
  } else {
    const high = major === 'H' ? 'S' : 'H';
    const low = open === 'C' ? 'D' : 'C';
    const ask = open === 'C' ? '3D' : '3C';
    const minorBids = open === 'C' ? ['3H', '3S', '3NT', '4C'] : ['3D', '3H', '3S', '3NT'];
    actions.push({ bid: ask, label: `Ask shortage, agreeing ${name(open)}`, kind: 'relay', state: makeState(open, null), responses: [
      row(minorBids[0], null, open), row(minorBids[1], high, open), row(minorBids[2], low, open, 'lower'), row(minorBids[3], low, open, 'upper'),
    ] });
    const majorAsk = major === 'H' ? '3S' : '3H';
    const majorRows = major === 'H' && open === 'C'
      ? [row('3NT', null, major, 'lower'), row('4C', high, major), row('4D', low, major), row('4H', null, major, 'upper')]
      : major === 'H'
        ? [row('3NT', null, major), row('4C', high, major), row('4D', low, major, 'lower'), row('4H', low, major, 'upper')]
        : [row('3S', null, major), row('3NT', high, major), row('4C', low, major, 'lower'), row('4D', low, major, 'upper')];
    actions.push({ bid: majorAsk, label: `Ask shortage, agreeing ${name(major)}`, kind: 'relay', state: makeState(major, null), responses: majorRows });
    actions.push({ bid: open === 'C' ? '3C' : '3D', label: `Return to ${name(open)}`, kind: 'relay', responses: [{ bid: 'Pass', label: 'Play the selected minor', constraints: [] }] });
  }
  nodes.entry = { label: support ? 'Six-card suit with three-card major support' : 'Reordered strong single-suit rebid',
    help: 'Use the source shortage enquiry, a natural minimum/invitation, or the major-suit/3NT continuation. Range is disclosed when a playable game answer requires it.', actions };
  return {
    id: `rebid-single-${suffix}${support ? '-support' : ''}`, name: `${entryBids.join('–')} · ${support ? 'three-card support and range' : 'reordered single-suiter'}`,
    family: 'Reordered opener rebids', source: 'Reordering R0022–R0066, R0104–R0192', defaultTrump: open,
    playerSeat: 'South', partnerSeat: 'North', initialAuction: prefix(entryBids), startNode: 'entry', nodes,
    initialState: { strengthSplit, strengthKnown: false },
    signoffs: [`3${open}`, `4${major}`, `5${open}`],
    partnerConstraints: [hcp(min, max), { ...shape, label: `Six-plus ${name(open)}, ${support ? 'exactly three' : 'zero–two'} ${name(major)}; no second four-card suit and at most one shortage` }],
    playerConstraints: [hcp(0, 22), length(major, 4, 7)],
    assumptions: [
      'The separate reordering document controls the rebid and its listed continuations. The hand is generated before responder acts.',
      `Opener is ${min}–${max} HCP. Minimum/invitational responses use the explicit source intervals; accepting an invitation in the upper range is a disclosed practice choice.`,
      'Strong six-card major quality remains a player judgement; the solid-major option is conservatively restricted to AKQJT9 or better.',
      'No-shortage shape facts are derived from the opened suit and promised major length, correcting copied minor/major-order typos in the examples.',
      ...(strengthSplit ? [`Playable-game relay answers distinguish ${min}–${split - 1} from ${split}–${max}; an undisclosed upper-range answer moves to the first impossible response. Low-shortage range replies follow the explicit tables.`] : ['The eight 1m strength-escape entries in R0108 do not include 1H–1S–3C.']),
    ],
    limitations: ['Two-shortage single-suit hands are excluded. Discretionary cue choices and bidding on over a deliberate final signoff use the trainer’s existing practice policies.'],
  };
}

const reverseEntries = [
  { id: 'c-h-d', open: 'C', major: 'H', response: '1D', rebid: '2S', second: 'D', asks: [['2NT', 'C'], ['3D', 'D']], upgrade: '1345', minimum: [['3C', 0, 7, 'Pass']] },
  { id: 'c-s-d', open: 'C', major: 'S', response: '1H', rebid: '2H', second: 'D', asks: [['2S', 'C'], ['3D', 'D']], upgrade: '3145', minimum: [['2NT', 5, 7, '3C'], ['3C', 0, 4, 'Pass']] },
  { id: 'c-s-h', open: 'C', major: 'S', response: '1H', rebid: '3C', second: 'H', asks: [['3D', 'C'], ['3H', 'H']], upgrade: '3415', minimum: [] },
  { id: 'd-s-h', open: 'D', major: 'S', response: '1S', rebid: '3C', second: 'H', asks: [['3H', 'D']], minimum: [['3D', 5, 6, 'Pass']] },
];

function reverseProfile(c) {
  const { open, major, second } = c;
  const [high, low] = SUITS.filter(s => ![open, second].includes(s));
  const base = shapeSet(n => n[open] >= 5 && n[second] >= 4 && n[open] >= n[second]
    && n[major] <= 3 && SUITS.filter(s => ![open, second].includes(s)).every(s => n[s] <= 3));
  const upgrade = c.upgrade ? [hcp(14, 15), shapes(c.upgrade)] : null;
  const nodes = naturalNodes({ ...c, min: 16, split: 19, max: 22 });
  nodes.upgrade = session => {
    const ask = relayStep(lastBid(session), 1, { skip3NT: true, skip: ['H', 'S'].includes(session.trump) ? [`4${session.trump}`] : [] });
    const majorKick = kickback(major);
    const actions = [{ bid: ask, kind: 'keycard', trump: session.trump, keycardMode: 'normal', label: `Ask keycards in ${name(session.trump)}` }];
    if (majorKick !== ask && bidIndex(majorKick) > bidIndex(lastBid(session))) actions.push({ bid: majorKick, kind: 'keycard', trump: major, keycardMode: 'normal', label: `Kickback in ${name(major)}` });
    return { label: '14–15 reverse with three-card major support', help: 'The fourth answer establishes the rare support upgrade. Continue with keycard in the agreed suit or Kickback in responder’s major.', actions };
  };
  const actions = c.asks.map(([bid, trump]) => ({ bid, kind: 'relay', label: `Ask high/low/equal shortage, agreeing ${name(trump)}`, state: relayState(trump), responses: [
    ...['high', 'low', 'equal'].map(category => {
      const fact = shapeSet(n => category === 'high' ? n[high] < n[low] : category === 'low' ? n[low] < n[high] : n[high] === n[low]);
      const shortageSuit = category === 'equal' ? null : category === 'high' ? high : low;
      return { label: `${category === 'equal' ? 'Equal outside lengths' : `${category} shortage: ${name(shortageSuit)}`}; 16+ HCP`,
        constraints: [hcp(16, 22), fact], phase: 'keycard', state: relayState(trump, { shortageSuit, balanced: null, keycardMode: shortageSuit ? 'shortage' : 'normal',
          naturalMinorKeycardSuits: ['D', 'C'].filter(suit => ![open, second].includes(suit)) }) };
    }),
    ...(upgrade ? [{ label: `${c.upgrade}, 14–15 HCP, three-card ${name(major)} support`, constraints: upgrade, nextNode: 'upgrade',
      state: relayState(trump, { shortageSuit: SUITS.find(s => Number(c.upgrade[SUITS.indexOf(s)]) === 1), balanced: false, strengthKnown: true }) }] : []),
  ] }));
  actions.push(...c.minimum.map(([bid, min, max, reply]) => ({ bid, kind: 'relay', label: `Minimum ${min}–${max} HCP`, playerConstraints: [hcp(min, max)], responses: [
    { bid: reply, label: reply === 'Pass' ? 'Play responder’s minor preference' : `Return to ${name(open)}`, constraints: [], nextNode: 'play' },
  ] })));
  actions.push(majorAction(second === 'D' ? '3H' : '3S', { ...c, min: upgrade ? 14 : 16, split: 19, max: 22 }));
  if (second === 'D') actions.push({ bid: '3S', label: 'Request opener to play 3NT', kind: 'relay', responses: [
    { bid: '3NT', label: 'Accept the transfer to 3NT', constraints: [], nextNode: 'play', state: { threeNTToPlay: true } },
  ] });
  nodes.entry = { label: `Reordered reverse into ${name(second)}`, help: 'The shortage enquiry, minimum escapes and major-suit options follow the separate reordering notes.', actions };
  return {
    id: `rebid-reverse-${c.id}`, name: `1${open}–${c.response}–${c.rebid} · reverse into ${name(second)}`, family: 'Reordered opener rebids',
    source: 'Reordering R0067–R0103', defaultTrump: open, playerSeat: 'South', partnerSeat: 'North', initialAuction: prefix([`1${open}`, c.response, c.rebid]), startNode: 'entry', nodes,
    partnerConstraints: [{ ...anyOf([hcp(16, 22), base], ...(upgrade ? [upgrade] : [])), label: `16–22 reversing shape${upgrade ? `, or 14–15 ${c.upgrade} upgrade` : ''}` }],
    playerConstraints: [hcp(0, 22), length(major, 4, 7)], signoffs: [`3${open}`, `4${major}`, `4${second}`],
    assumptions: ['The first two shortage replies compare the outside suits high/low; the third describes equal lengths, including the no-shortage 5422 case.',
      'Normal reverses have at least five in the opened suit, four in the reverse suit, the opened suit at least as long, and no outside four-card suit. Practice caps strength at 22.',
      'The fourth shortage reply is reserved for the exact 14/15 three-card-support upgrade. Normal 16+ hands of the same shape retain the ordinary shortage answer.',
      'Copied suit names are resolved from the auction: the 1C–1H upgrade supports spades, and a 1H single-suiter’s keycard suit is hearts.'],
    limitations: ['Minimum escape strength and major-suit quality retain the source’s player judgement where no precise honour rule is given.'],
  };
}

const splinterEntries = [
  ['C', 'H', '1D', '3C', 'S'], ['C', 'H', '1D', '3D', 'D'],
  ['C', 'S', '1H', '3D', 'H'], ['C', 'S', '1H', '3H', 'D'],
  ['D', 'H', '1H', '3C', 'S'], ['D', 'H', '1H', '3D', 'C'],
  ['D', 'S', '1S', '3D', 'H'], ['D', 'S', '1S', '3H', 'C'],
  ['H', 'S', '1S', '3D', 'D'], ['H', 'S', '1S', '3H', 'C'],
];

function splinterProfile([open, major, response, rebid, shortage]) {
  const nodes = naturalNodes({ open, major });
  const strengths = anyOf([hcp(11, 13)], [hcp(17, 19)]);
  const megaCues = bid => cueResponses(bid, major, 'major-keycard').map(answer => ({ ...answer,
    constraints: [hcp(17, 19), ...answer.constraints] }));
  const nonSerious = major === 'H' ? '3S' : '3NT';
  const cues = [];
  for (let bid = nextBid(rebid); bid && bidIndex(bid) < bidIndex(`4${major}`); bid = nextBid(bid)) {
    const suit = major === 'H' && bid === '3NT' ? 'S' : bid.slice(1);
    if (bid === nonSerious || suit === major || suit === 'NT') continue;
    cues.push({ bid, kind: 'relay', label: `Serious control cue in ${name(suit)}`, responses: [
      { bid: `4${major}`, label: 'Mini splinter; stop in game', constraints: [hcp(11, 13)], nextNode: 'major-keycard', state: relayState(major) }, ...megaCues(bid),
    ] });
  }
  nodes.entry = { label: 'Reordered mini–mega splinter', help: 'The two splinter calls immediately below 3M are high/low shortages. Choose 3M, game, non-serious, or a serious cue.', actions: [
    { bid: `3${major}`, kind: 'relay', label: 'Try to stop below game opposite a mini', responses: [
      { bid: 'Pass', label: 'Mini splinter; play the partscore', constraints: [hcp(11, 13)] },
      { bid: `4${major}`, label: 'Mega splinter; raise to game', constraints: [hcp(17, 19)], nextNode: 'major-keycard', state: relayState(major) },
    ] },
    { bid: nonSerious, kind: 'relay', label: 'Non-serious slam try', responses: [
      { bid: `4${major}`, label: 'Mini splinter; stop in game', constraints: [hcp(11, 13)], nextNode: 'major-keycard', state: relayState(major) }, ...megaCues(nonSerious),
    ] }, ...cues,
  ] };
  return {
    id: `rebid-splinter-${open.toLowerCase()}-${major.toLowerCase()}-${shortage.toLowerCase()}`,
    name: `1${open}–${response}–${rebid} · mini–mega ${name(shortage)} shortage`, family: 'Reordered mini–mega splinters',
    source: 'Reordering R0002–R0021; main notes P1442–P1458', defaultTrump: major,
    playerSeat: 'South', partnerSeat: 'North', initialAuction: prefix([`1${open}`, response, rebid]), initialState: relayState(major, { shortageSuit: shortage, balanced: false }), startNode: 'entry', nodes,
    partnerConstraints: [strengths, shapeSet(n => n[major] === 4 && n[open] >= 5 && n[shortage] <= 1 && oneShortage(n, [open, major]))],
    playerConstraints: [hcp(5, 22), length(major, 4, 7)],
    assumptions: ['The reordering document replaces the older splinter bid positions: high and low splinters are the two calls immediately below 3M.',
      'Practice uses 11–13 mini and 17–19 mega hands, exactly four trumps, five-plus in the opened suit and one shortage.',
      'A mini passes the below-game attempt; a mega raises it to game. Over non-serious or a serious cue, mini signs off and mega uses the disclosed cheapest-control cue policy.',
      'This practice policy follows the allowed mega cue route, retaining responder as asker; it does not fabricate the alternate opener-asks-keycard role swap.'],
    limitations: ['Extreme-shape mini upgrades, exclusion keycard and the optional opener-takes-control keycard branch remain outside this exercise.'],
  };
}

export const REBID_PROFILES = [
  ...singleEntries.map(entry => singleProfile(entry)),
  ...singleEntries.filter(entry => entry[1] !== 'H').map(entry => singleProfile(entry, true)),
  ...reverseEntries.map(reverseProfile), ...splinterEntries.map(splinterProfile),
];
