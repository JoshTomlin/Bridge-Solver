// Revised 30 July email; see docs/relay-minor-email.md for literal source,
// inferred step maps and the explicitly restricted training universes below.
import { SUITS, SUIT_NAMES, nextBid, relayStep, lastBid, hcp, shapes, anyOf, length } from './profile-utils.js';

const SHAPES = [];
for (let s = 0; s <= 9; s += 1) for (let h = 0; h <= 9; h += 1) for (let d = 0; d <= 9; d += 1) {
  const c = 13 - s - h - d;
  if (c >= 0 && c <= 9) SHAPES.push(`${s}${h}${d}${c}`);
}
const size = (shape, suit) => Number(shape[SUITS.indexOf(suit)]);
const select = predicate => SHAPES.filter(shape => predicate(suit => size(shape, suit)));
const unique = values => [...new Set(values)];
const hasOneShortage = (n, longSuits) => SUITS.filter(suit => !longSuits.includes(suit) && n(suit) <= 1).length === 1;
const single = minor => select(n => n(minor) >= 6 && SUITS.filter(s => s !== minor).every(s => n(s) <= 3) && hasOneShortage(n, [minor]));
const two = (minor, second) => select(n => n(minor) >= 5 && n(second) === 4
  && SUITS.filter(s => s !== minor && s !== second).every(s => n(s) <= 3) && hasOneShortage(n, [minor, second]));
const balanced = minor => select(n => [6, 7].includes(n(minor)) && SUITS.filter(s => s !== minor).every(s => n(s) >= 2 && n(s) <= 3));
const shortageOf = values => SUITS.find(suit => values.every(shape => size(shape, suit) <= 1)) ?? null;
const minFor = (values, suit) => Math.min(...values.map(shape => size(shape, suit)));
const shapeFact = (values, label) => ({ ...shapes(...values), ...(label ? { label } : {}) });

function agreementOptions(config, values, second = null) {
  const result = [config.minor];
  if (second) result.push(second);
  if (config.responderSuit && minFor(values, config.responderSuit) >= 2) result.push(config.responderSuit);
  for (const suit of SUITS) if (suit !== config.minor && suit !== second && minFor(values, suit) >= 4) result.push(suit);
  // The other minor is an alternative for responder's surprise six-card suit;
  // the chosen trump remains first in the engine, even after an earlier switch.
  result.push(config.minor === 'D' ? 'C' : 'D');
  return unique(result);
}

function terminalResponse(config, row, bid) {
  const shortage = row.shortageSuit ?? shortageOf(row.values);
  return {
    ...(bid ? { bid } : {}), label: row.label, constraints: [shapeFact(row.values, row.label), ...(row.extra || [])],
    phase: 'keycard',
    state: {
      shortageSuit: shortage, balanced: shortage === null,
      agreementOptions: agreementOptions(config, row.values, row.second),
      weakExitAllowed: false,
    },
  };
}

function orderedShortages(minor, values) {
  const [high, middle, low] = SUITS.filter(suit => suit !== minor);
  return [middle, high, low].map(suit => ({
    id: `short-${suit}`, label: `${SUIT_NAMES[suit]} shortage`,
    shortageSuit: suit, values: values.filter(shape => size(shape, suit) <= 1),
  })).filter(row => row.values.length);
}

function twoSuitRows(minor, second, values) {
  const [high, low] = SUITS.filter(suit => suit !== minor && suit !== second);
  return [high, low].map(suit => ({
    id: `short-${suit}`, label: `${SUIT_NAMES[suit]} shortage; ${SUIT_NAMES[second].toLowerCase()} as second suit`,
    shortageSuit: suit, second, values: values.filter(shape => size(shape, suit) <= 1),
  })).filter(row => row.values.length);
}

function shapeNode(config, rows, second = null) {
  return session => {
    const options = unique([session.trump || config.minor, ...(second ? [second] : [])]);
    return {
      label: 'Describe the remaining shape',
      help: 'The next step continues in the agreed minor. The next available alternative agrees the shown second suit. 3NT is to play.',
      actions: options.map((trump, index) => {
        const bid = relayStep(lastBid(session), index + 1);
        return { bid, label: `Ask shape, agreeing ${SUIT_NAMES[trump].toLowerCase()}`, kind: 'relay',
          state: { trump, major: trump },
          responses: rows.map(row => terminalResponse(config, row)),
        };
      }),
    };
  };
}

function expandedProfile(config) {
  // Ordinary 11-counts describe shape; the practice cutoff for the subjective
  // poor-opening screen must not exclude them from the initial bidding range.
  const normalMin = 11;
  const maxHcp = config.maxHcp;
  const rows = config.rows;
  const normalOptions = rows.map(row => [shapeFact(row.values), hcp(row.minHcp || normalMin, row.maxHcp || maxHcp)]);
  const weakShapes = unique(rows.filter(row => !row.minHcp && !row.balanced)
    .flatMap(row => row.values).filter(shape => size(shape, config.responderSuit) <= 2));
  const nodes = {};
  function responseFor(row, bid, weak = false) {
    const values = weak ? row.values.filter(value => weakShapes.includes(value)) : row.values;
    const definition = { ...row, values, extra: [hcp(weak ? 9 : row.minHcp || normalMin, weak ? 10 : row.maxHcp || maxHcp)] };
    if (row.second && !row.complete) {
      return { ...(bid ? { bid } : {}), label: row.label, constraints: [shapeFact(values, row.label), ...definition.extra],
        nextNode: `shape-${row.id}`, state: { shownSecondSuit: row.second, weakExitAllowed: false } };
    }
    return terminalResponse(config, definition, bid);
  }
  const firstResponses = [{ bid: nextBid(config.ask), label: 'Very poor opening, 9–10 HCP in this training profile',
    constraints: [hcp(9, 10)], nextNode: 'weak-shape', state: { weakExitAllowed: true } }];
  for (const [index, row] of rows.entries()) firstResponses.push(responseFor(row, row.bid || nextBid(config.ask, index + 2)));
  nodes.entry = { label: 'Ask about the opening hand', help: 'First distinguish the very poor opening; otherwise opener describes the source-defined shape stack.',
    actions: [{ bid: config.ask, label: 'Start the revised minor relay', kind: 'relay', responses: firstResponses }] };
  nodes['weak-shape'] = session => ({
    label: 'Partner has a very poor opening', help: 'The next step continues the shape relay. Other bids are to play.',
    actions: [{ bid: relayStep(lastBid(session)), label: 'Continue asking shape', kind: 'relay', state: { weakExitAllowed: false },
      responses: rows.filter(row => !row.minHcp && !row.balanced && row.values.some(value => weakShapes.includes(value)))
        .map(row => responseFor(row, undefined, true)),
    }],
  });
  for (const row of rows) {
    if (row.second && !row.complete) nodes[`shape-${row.id}`] = shapeNode(config, twoSuitRows(config.minor, row.second, row.values), row.second);
  }
  return {
    id: config.id, name: config.name, family: 'Revised minor relays', source: '30 July email E3–E6',
    defaultTrump: config.minor, playerSeat: 'South', partnerSeat: 'North',
    initialAuction: config.prefix.map((bid, index) => ({ seat: index % 2 ? 'South' : 'North', bid,
      meaning: index === 1 ? `Response showing ${SUIT_NAMES[config.responderSuit].toLowerCase()}` : 'Source entry to the revised minor relay' })),
    partnerConstraints: [{ ...anyOf([shapeFact(weakShapes), hcp(9, 10)], ...normalOptions),
      label: `Opener: 9–${maxHcp} HCP in the listed shape families; named support shapes retain their source strength limits`,
    }],
    playerConstraints: [hcp(12, 22), length(config.responderSuit, 4, 6)],
    startNode: 'entry', nodes,
    assumptions: [
      'The July email replaces the older Bourke and fourth-suit relay descriptions. Unopposed first/second-seat practice.',
      `Opener is restricted to the disclosed shape set and 9–${maxHcp} HCP, retaining the stated limits on named support and balanced shapes. Responder has 12–22 HCP and four to six cards in the shown major.`,
      'Ordinary practice shapes have either six or more cards in the opening minor with no four-card side suit, or five or more minor cards and exactly four in the second suit. The other suits have at most three cards and exactly one shortage; separately named 5/5, three-suited and support shapes are added explicitly.',
      'The initial poor-hand screen applies to these expanded entries. After its first-step answer, the next relay asks shape and other bids are to play.',
      'The practice screen treats 9–10 HCP as very poor and lets ordinary 11-counts describe shape. The source’s exceptionally poor 11-count is a judgment call, not an exclusion from the opening range.',
      'Responder 3NT is always to play. Opener response steps count 3NT. Once shape is complete, the next relay is Shortage Keycard, as confirmed by the partnership.',
      'Where the email gives a stack rather than printed bids, response bids are assigned consecutively in that order. After the poor-hand screen, categories impossible in that known range are omitted.',
    ],
    limitations: [
      'Expanded-entry 6/5 hands are excluded: the email appends them without full bid/response tables. The available shape universe is disclosed to compatible-hand sampling.',
      'The rare support shapes are included only where explicitly named, not extrapolated to unlisted void variants. Suit quality and opening preferences are not modeled.',
      ...(config.limitations || []),
    ],
  };
}

function makeExpanded() {
  const profiles = [];
  // 1D–1H–2C: the shown club suit has four cards except the separately
  // stacked 5/5 types. Three hearts belongs only to the named 16+ exception.
  const dhc = two('D', 'C').filter(shape => size(shape, 'H') <= 2);
  const dhRows = twoSuitRows('D', 'C', dhc).map((row, index) => ({ ...row, id: `ordinary-${index}`, complete: true, bid: index ? '3D' : '3C' }));
  dhRows.push(
    { id: '55-high', label: '5/5 minors, spade shortage', values: ['1255'], shortageSuit: 'S', second: 'C', complete: true, bid: '3H' },
    { id: '55-low', label: '5/5 minors, heart shortage', values: ['2155', '3055'], shortageSuit: 'H', second: 'C', complete: true, bid: '3S' },
    { id: 'support', label: '1354, 16+ HCP and three hearts', values: ['1354'], minHcp: 16, shortageSuit: 'S', second: 'C', complete: true, bid: '3NT' },
  );
  profiles.push(expandedProfile({ id: 'minor-d-h-c', name: '1D–1H–2C · July relay', minor: 'D', responderSuit: 'H', prefix: ['1D', '1H', '2C'], ask: '2S', maxHcp: 22, rows: dhRows }));

  const dsc = two('D', 'C').filter(shape => size(shape, 'S') <= 2);
  const dsRows = twoSuitRows('D', 'C', dsc).map((row, index) => ({ ...row, id: `ordinary-${index}`, complete: true, bid: index ? '3C' : '2NT' }));
  dsRows.push(
    { id: 'three', label: 'Three-suited 1444 or 0454', values: ['1444', '0454'], shortageSuit: 'S', second: 'C', complete: true, bid: '3D' },
    { id: '55-high', label: '5/5 minors, spade shortage', values: ['0355', '1255'], shortageSuit: 'S', second: 'C', complete: true, bid: '3H' },
    { id: '55-low', label: '5/5 minors, heart shortage', values: ['2155'], shortageSuit: 'H', second: 'C', complete: true, bid: '3S' },
    { id: 'support', label: '3154, 16+ HCP and three spades', values: ['3154'], minHcp: 16, shortageSuit: 'H', second: 'C', complete: true, bid: '3NT' },
  );
  profiles.push(expandedProfile({ id: 'minor-d-s-c', name: '1D–1S–2C · July relay', minor: 'D', responderSuit: 'S', prefix: ['1D', '1S', '2C'], ask: '2H', maxHcp: 22, rows: dsRows }));

  const dhd = single('D').filter(shape => size(shape, 'H') <= 2);
  profiles.push(expandedProfile({ id: 'minor-d-h-d', name: '1D–1H–2D · July relay', minor: 'D', responderSuit: 'H', prefix: ['1D', '1H', '2D'], ask: '2S', maxHcp: 14, rows: orderedShortages('D', dhd),
    limitations: ['Balanced long-diamond hands are excluded here because the email does not print their revised entry-specific continuation.'] }));

  const dsd = single('D').filter(shape => size(shape, 'S') <= 2);
  profiles.push(expandedProfile({ id: 'minor-d-s-d', name: '1D–1S–2D · July relay', minor: 'D', responderSuit: 'S', prefix: ['1D', '1S', '2D'], ask: '2H', maxHcp: 14,
    rows: [{ id: 'hearts', label: 'Hearts as a second suit', second: 'H', values: two('D', 'H').filter(shape => size(shape, 'S') <= 2) }, ...orderedShortages('D', dsd)],
    limitations: ['Balanced long-diamond hands are excluded here because the email does not print their revised entry-specific continuation.'] }));

  const dhs = two('D', 'S').filter(shape => size(shape, 'H') <= 2);
  profiles.push(expandedProfile({ id: 'minor-d-h-s', name: '1D–1H–1S · July relay', minor: 'D', responderSuit: 'H', prefix: ['1D', '1H', '1S'], ask: '2C', maxHcp: 22,
    rows: [
      ...twoSuitRows('D', 'S', dhs).map((row, index) => ({ ...row, id: `ordinary-${index}`, complete: true })),
      { id: 'three', label: 'Three-suited 4144 or 4054', values: ['4144', '4054'], shortageSuit: 'H', second: 'S', complete: true },
      { id: 'support', label: '4351, 16+ HCP and three hearts', values: ['4351'], minHcp: 16, shortageSuit: 'C', second: 'S', complete: true },
    ] }));

  const chs = two('C', 'S').filter(shape => size(shape, 'H') <= 2);
  profiles.push(expandedProfile({ id: 'minor-c-h-s', name: '1C–1D–1S · July relay', minor: 'C', responderSuit: 'H', prefix: ['1C', '1D', '1S'], ask: '2D', maxHcp: 22,
    rows: [
      ...twoSuitRows('C', 'S', chs).map((row, index) => ({ ...row, id: `ordinary-${index}`, complete: true })),
      { id: 'support', label: '4315, 12+ HCP and three hearts', values: ['4315'], minHcp: 12, shortageSuit: 'D', second: 'S', complete: true },
    ] }));

  const clubSingle = single('C');
  profiles.push(expandedProfile({ id: 'minor-c-h-c', name: '1C–1D–2C · July relay', minor: 'C', responderSuit: 'H', prefix: ['1C', '1D', '2C'], ask: '2D', maxHcp: 13,
    rows: [
      { id: 'diamonds', label: 'Diamonds as a second suit', second: 'D', values: two('C', 'D') },
      ...orderedShortages('C', clubSingle),
      { id: 'balanced', label: 'Rare 12–13 HCP, six clubs and (322) outside', values: balanced('C').filter(shape => size(shape, 'C') === 6), balanced: true, minHcp: 12, maxHcp: 13, bid: '3NT' },
    ] }));

  profiles.push(expandedProfile({ id: 'minor-c-s-c', name: '1C–1H–2C · July relay', minor: 'C', responderSuit: 'S', prefix: ['1C', '1H', '2C'], ask: '2D', maxHcp: 13,
    rows: [
      { id: 'diamonds', label: 'Diamonds as a second suit', second: 'D', values: two('C', 'D') },
      { id: 'hearts', label: 'Hearts as a second suit', second: 'H', values: two('C', 'H') },
      ...orderedShortages('C', clubSingle),
    ], limitations: ['Rare balanced club hands are excluded in this entry; the email prints the 3NT exception only for the heart-transfer entry.'] }));
  return profiles;
}

function baseProfile(low, high, rebid) {
  const config = { minor: 'D', responderSuit: null };
  const hOrdinary = two('D', 'H');
  const sOrdinary = two('D', 'S');
  const cOrdinary = two('D', 'C');
  const clubsFive = ['0355', '1255', '2155', '3055'];
  const hRows = [
    ...twoSuitRows('D', 'H', hOrdinary),
    { id: 'three-high', label: '1444 or 0454, spade shortage', values: ['1444', '0454'], shortageSuit: 'S', second: 'H' },
    { id: 'three-low', label: '4441 or 4450, club shortage', values: ['4441', '4450'], shortageSuit: 'C', second: 'H' },
  ];
  const sRows = [
    ...twoSuitRows('D', 'S', sOrdinary),
    { id: 'three-high', label: '4144 or 4054, heart shortage', values: ['4144', '4054'], shortageSuit: 'H', second: 'S' },
  ];
  const cRows = [
    ...twoSuitRows('D', 'C', cOrdinary).map(row => ({ ...row, label: `${row.label}; four clubs` })),
    ...twoSuitRows('D', 'C', clubsFive).map(row => ({ ...row, label: `${row.label}; five clubs` })),
  ];
  const singles = orderedShortages('D', single('D'));
  const noShortage = high >= 12 ? balanced('D') : [];
  const families = [
    { bid: '2S', label: 'Hearts as a second suit', values: hRows.flatMap(row => row.values), nextNode: 'hearts', second: 'H' },
    { bid: '2NT', label: 'Spades as a second suit', values: sRows.flatMap(row => row.values), nextNode: 'spades', second: 'S' },
    { bid: '3C', label: 'Four or five clubs as a second suit', values: cRows.flatMap(row => row.values), nextNode: 'clubs', second: 'C' },
  ];
  const universe = unique([...families.flatMap(row => row.values), ...singles.flatMap(row => row.values), ...noShortage]);
  const baseTerminal = row => {
    const result = terminalResponse(config, row, row.bid);
    // After the 2H entry, clubs may be agreed only when opener has described
    // clubs or a non-club shortage (E2).
    if (result.state.shortageSuit === 'C') result.state.agreementOptions = result.state.agreementOptions.filter(suit => suit !== 'C');
    return result;
  };
  function baseShapeNode(rows, second) {
    return session => ({
      label: 'Clarify opener’s shape', help: 'Default relay agrees diamonds; the next alternative agrees opener’s second suit. Responder 3NT is to play.',
      actions: unique([session.trump || 'D', second]).map((trump, index) => ({
        bid: relayStep(lastBid(session), index + 1), label: `Ask shape, agreeing ${SUIT_NAMES[trump].toLowerCase()}`, kind: 'relay', state: { trump, major: trump },
        responses: rows.map(row => baseTerminal(row)),
      })),
    });
  }
  const responses = families.map(row => ({ bid: row.bid, label: row.label, constraints: [shapeFact(row.values, row.label)], nextNode: row.nextNode,
    state: { shownSecondSuit: row.second, weakExitAllowed: false } }));
  responses.push(...singles.map((row, index) => baseTerminal({ ...row, bid: ['3D', '3H', '3S'][index] })));
  if (noShortage.length) responses.push(baseTerminal({ bid: '3NT', label: 'Rare balanced long diamonds, 12–13 HCP', values: noShortage, extra: [hcp(12, 13)] }));
  const partnerOptions = [[shapeFact(universe.filter(value => !noShortage.includes(value))), hcp(low, high)]];
  if (noShortage.length) partnerOptions.push([shapeFact(noShortage), hcp(12, 13)]);
  const nodes = {
    entry: { label: 'Begin the diamond shape relay', help: 'Opener has already described strength. 2H asks shape without another poor-hand screen.',
      actions: [{ bid: '2H', label: 'Ask shape; diamonds provisionally agreed', kind: 'relay', responses }] },
    hearts: baseShapeNode(hRows, 'H'), spades: baseShapeNode(sRows, 'S'), clubs: baseShapeNode(cRows, 'C'),
  };
  return {
    id: `minor-d-nt-${rebid.toLowerCase()}`, name: `1D–1NT–${rebid} · ${low}–${high}`, family: 'Revised minor relays',
    source: '30 July email E1–E2; retained Word P0699–P0706, P0775–P0795; confirmed 2C/2D ranges',
    defaultTrump: 'D', playerSeat: 'South', partnerSeat: 'North',
    initialAuction: [
      { seat: 'North', bid: '1D', meaning: 'Diamond opening' },
      { seat: 'South', bid: '1NT', meaning: 'Enquiry; game-forcing values in this practice profile' },
      { seat: 'North', bid: rebid, meaning: `${low}–${high} HCP` },
    ],
    initialState: { rangeKnown: true, trump: 'D', major: 'D', relayPolicy: { skip3NT: true, skipMajorGame: false } },
    partnerConstraints: [{ ...anyOf(...partnerOptions),
      label: `Opener: ${low}–${high} HCP in the listed diamond shape families${noShortage.length ? '; no-shortage hands are 12–13 HCP' : '; a shortage is required'}`,
    }],
    playerConstraints: [hcp(14, 22), length('S', 0, 4), length('H', 0, 4), length('D', 2, 6)],
    startNode: 'entry', nodes,
    assumptions: [
      `The partnership confirmed ${rebid} as ${low}–${high} HCP. This fixed prefix makes the already-known range explicit; there is no redundant poor-hand screen.`,
      'The email replaces the older minor relay method. Hearts, spades and clubs are shown in order, then middle/high/low shortage; three-suiters are resolved inside their second-suit branch.',
      'Responder 3NT is always to play. Shape answers count every legal bid. Once shape is complete, proceed directly to Shortage Keycard.',
      'Practice responder has 14–22 HCP, no five-card major and at least two diamonds. Balanced diamond openers are restricted to the email’s explicit 12–13 HCP exception.',
      'Ordinary practice shapes have either six or more diamonds with no four-card side suit, or five or more diamonds and exactly four in the second suit. The other suits have at most three cards and exactly one shortage; the listed 5/5 and three-suited shapes are added separately.',
    ],
    limitations: [
      '6/5 types and the alternate 2S solid-club entry are outside this initial shape universe; their complete continuation tables are not inferred from the condensed email.',
      'Strong reversing entries are separate from these fixed 2C/2D prefixes. Opening suit quality and singleton-honor preferences are not modeled.',
    ],
  };
}

export const MINOR_PROFILES = [baseProfile(9, 11, '2D'), baseProfile(12, 15, '2C'), ...makeExpanded()];
