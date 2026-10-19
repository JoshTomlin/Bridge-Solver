// Horton Two: Word P1060–P1292. Policy is separate from the source shape tables.
import { SUITS, hcp, length, nextBid, relayStep, lastBid, bidIndex } from './profile-utils.js';
import { shapeSet, oneShortage, fit, prefix, shortageResponses, name, game } from './source-utils.js';

export const HORTON_POLICY = Object.freeze({ minimumMaxHcp: 4, maxHcp: 8 });
const shownSecond = opening => ({ D: 'D', H: 'H', S: 'C' })[opening];
const hortonFit = (trump, extra = {}) => fit(trump, { keycardScheme: 'horton',
  relayPolicy: { skip3NT: true, skipMajorGame: false, skipBids: [game(trump)] }, ...extra });
const hortonKickback = trump => ({ S: '4NT', H: '5C', D: '4H', C: '4D' })[trump];

export function createHortonProfile(opening, policy = HORTON_POLICY) {
  if (!Number.isInteger(policy.minimumMaxHcp) || policy.minimumMaxHcp < 0 || policy.minimumMaxHcp >= policy.maxHcp || policy.maxHcp > 8) throw new Error('Invalid Horton practice range policy.');
  const second = shownSecond(opening);
  const hidden = SUITS.filter(s => !['S', second].includes(s));
  const shape = predicate => shapeSet(n => [4, 5].includes(n.S) && n[second] >= 4
    && (opening === 'H' || n.H <= 3)
    && (opening !== 'S' || n.D <= 3)
    && oneShortage(n, ['S', second]) && predicate(n));
  const types = [
    { bid: '3D', label: `Four spades, five-plus ${name(second)}`, fact: shape(n => n.S === 4 && n[second] >= 5) },
    { bid: '3H', label: `Five spades, four ${name(second)}`, fact: shape(n => n.S === 5 && n[second] === 4) },
    { bid: '3S', label: `Four spades, four ${name(second)}`, fact: shape(n => n.S === 4 && n[second] === 4) },
  ];
  const voidRows = [
    { bid: '3NT', label: 'Five-five or longer; no void', fact: shape(n => n.S === 5 && n[second] >= 5 && hidden.every(s => n[s] >= 1)) },
    ...hidden.map((suit, i) => ({ bid: i ? '4D' : '4C', label: `Five-five or longer; ${i ? 'low' : 'high'} void in ${name(suit)}`,
      fact: shape(n => n.S === 5 && n[second] >= 5 && n[suit] === 0 && n[hidden[1 - i]] >= 1), voidSuit: suit })),
  ];
  const state = extra => hortonFit('S', { hortonSecondSuit: second, threeNTToPlay: false, ...extra });
  const describe = (type, extra = []) => ({ bid: type.bid, label: type.label, constraints: [type.fact, ...extra],
    nextNode: 'choose-trump', state: state({ balanced: null, shortageSuit: null }) });
  const nodes = {
    entry: { label: 'Horton 2NT enquiry', help: `Practice minimum is 0–${policy.minimumMaxHcp} HCP. Above that, opener shows the source shape categories.`, actions: [{
      bid: '2NT', label: 'Ask minimum or shape', kind: 'relay', responses: [
        { bid: '3C', label: `Minimum (${policy.minimumMaxHcp} HCP or fewer under the practice policy)`, constraints: [hcp(0, policy.minimumMaxHcp)], nextNode: 'minimum', state: state() },
        ...types.map(type => describe(type, [hcp(policy.minimumMaxHcp + 1, policy.maxHcp)])),
        ...voidRows.map(type => ({ ...describe(type, [hcp(policy.minimumMaxHcp + 1, policy.maxHcp)]), nextNode: 'five-five',
          state: state({ balanced: false, shortageSuit: type.voidSuit ?? null, hortonFiveFive: true }) })),
      ],
    }] },
    minimum: { label: 'Minimum Horton opening', help: opening === 'D' ? '3D is to play; 3H is the specialised game-forcing further enquiry.' : '3D is the game-forcing further enquiry. It distinguishes the three basic patterns without a separate five-five reply.',
      signoffs: ['3S', `3${second}`], actions: [{
        bid: opening === 'D' ? '3H' : '3D', label: 'Continue with the minimum-hand enquiry', kind: 'relay', responses: opening === 'D' ? [
          { bid: '3S', label: 'Minimum, four spades', constraints: [length('S', 4)], nextNode: 'choose-trump', state: state() },
          { bid: '3NT', label: 'Minimum, five spades', constraints: [length('S', 5)], nextNode: 'choose-trump', state: state() },
        ] : [
          { bid: '3H', label: `Minimum, four spades and five-plus ${name(second)}`, constraints: [length('S', 4), length(second, 5, 9)], nextNode: 'choose-trump', state: state() },
          { bid: '3S', label: `Minimum, four spades and four ${name(second)}`, constraints: [length('S', 4), length(second, 4)], nextNode: 'choose-trump', state: state() },
          { bid: '3NT', label: 'Minimum, five spades; a five-five hand is included here', constraints: [length('S', 5)], nextNode: 'choose-trump', state: state() },
        ],
      }] },
    'choose-trump': session => {
      const after = lastBid(session);
      const first = relayStep(after);
      const following = relayStep(after, 2);
      const reserved = new Set(['4S', second === 'H' ? '4H' : null]);
      const shortageActions = [];
      if (!reserved.has(first)) shortageActions.push(shortageAction(first, 'S'));
      // 4D is Last Train in hearts after a 2H opening; it cannot be a heart shortage enquiry.
      if (!reserved.has(following) && !(opening === 'H' && following === '4D')) shortageActions.push(shortageAction(following, second));
      return { label: 'Choose trump and ask shortage', help: 'The next eligible step agrees spades; step+1 agrees the second suit. 3NT and game remain to play; Last Train is reserved.',
        actions: [...shortageActions, ...keycards(session, new Set(shortageActions.map(action => action.bid)))] };
    },
    'five-five': session => {
      const skip = ['4S', game(second)];
      const asks = [relayStep(lastBid(session), 1, { skip }), relayStep(lastBid(session), 2, { skip })];
      return { label: 'Five-five shape established', help: 'The next step asks keycards in spades; step+1 asks in the second suit. Games in either shown suit are omitted.',
        actions: ['S', second].map((trump, i) => ({ bid: asks[i], kind: 'keycard', trump, keycardMode: 'horton',
          label: `Ask 0/1/2 keycards in ${name(trump)}` })) };
    },
  };
  function shortageAction(bid, trump) {
    const responses = shortageResponses(['S', second], trump);
    for (const response of responses) response.state = { ...response.state, ...hortonFit(trump),
      shortageSuit: response.state.shortageSuit, balanced: response.state.balanced,
      keycardMode: response.state.shortageSuit ? 'horton-shortage' : 'horton', agreementOptions: [],
    };
    return { bid, kind: 'relay', label: `Agree ${name(trump)} and ask no/high/low shortage`, state: hortonFit(trump), responses };
  }
  function keycards(session, assigned) {
    return ['S', second].map(trump => ({ bid: hortonKickback(trump), kind: 'keycard', trump, keycardMode: 'horton', label: `Kickback in ${name(trump)} (0/1/2)` }))
      .filter(action => bidIndex(action.bid) > bidIndex(lastBid(session)) && !assigned.has(action.bid));
  }
  return {
    id: `horton-${opening.toLowerCase()}`, name: `2${opening}–2NT · Horton enquiry`, family: 'Horton Two enquiries',
    source: 'Word P1060–P1292', defaultTrump: 'S', playerSeat: 'South', partnerSeat: 'North', initialAuction: prefix([`2${opening}`]),
    initialState: state(), startNode: 'entry', nodes,
    signoffs: ['3NT', '4S', game(second)],
    partnerConstraints: [hcp(0, policy.maxHcp), { ...shape(() => true), label: `Four/five spades and four-plus ${name(second)}; disclosed Horton opening-priority and shortage restrictions` }],
    playerConstraints: [hcp(16, 24), length('S', 3, 6), length(second, 2, 6)],
    assumptions: [
      'First/second-seat, uncontested Horton opening: four/five spades and four-plus in the other shown suit; 2S shows clubs as the second suit.',
      'Horton opening priority is preserved: four hearts uses 2H. The 2S practice entry also excludes four diamonds, avoiding the source’s suit-quality choice between 2D and 2S.',
      `The source does not quantify “minimum”. The configurable practice policy currently uses 0–${policy.minimumMaxHcp} HCP minimum and ${policy.minimumMaxHcp + 1}–${policy.maxHcp} nonminimum; this is not a confirmed partnership rule.`,
      'Main replies are 3C minimum, 3D longer second suit, 3H longer spades, 3S four-four, then five-five no/high/low void. Minimum follow-up replies retain five-five possibilities without claiming exactly four in the second suit.',
      'Responder 3NT is always to play, including after 2S–2NT–3C–3D–3S. This follows the general rule over the contradictory printed 3NT-shortage-ask row at P1274.',
      'Shortage answers count ordinary steps. Later asks skip game in the agreed suit. Horton keycard answers are 0/1/2; the queen ask is offered after zero or one, and omitted after two.',
    ],
    limitations: ['The vulnerable nine-count and poor-six-spade exceptions are excluded. Basic shape hands with two shortages are excluded; the separate five-five void cases are included. Last Train and cue-bid responses are not invented; competition remains outside this exercise.'],
  };
}

export const HORTON_PROFILES = ['D', 'H', 'S'].map(opening => createHortonProfile(opening));
