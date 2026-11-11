// First full-auction slice, first/second-seat uncontested 1C. P0246–P0266,
// P0285/P0328–P0333 and P0445–P0520. The generator's subset is disclosed;
// the auction controller chooses a route from calls and the acting hand only.
import { DECK, makeRng, handFeatures, bidIndex, getPracticeProfile } from './core.js';
import { declarerFor } from './profile-utils.js';

export const OPENING_RULES_VERSION = 1;
const names = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' };
const feature = cards => handFeatures(cards, 'C');
const other = major => major === 'H' ? 'S' : 'H';
const call = (bid, label, source) => ({ bid, label, source, kind: 'opening' });
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};

export const OPENING_NOTES = [
  'First release: uncontested 1C with a balanced 14–19 opener, two/three cards in each major and no six-card minor.',
  'Responder has one four/five-card major: weak 3–6 hands, or 12–19 with a four/five-card minor. Borderline invitations and two-major hands come later.',
  'Your seat stays fixed. Choose your opening response, rebid and continuation before the existing shortage and keycard enquiries.',
  'Supported alternatives determine the route. A documented continuation outside this release pauses for review; it is not graded as a system error.',
];

export function createOpeningPractice({ seed, humanSeat } = {}) {
  seed = String(seed);
  const rng = makeRng(`whole-club:${seed}`);
  const randomSeat = rng() < 0.5 ? 'North' : 'South';
  humanSeat ??= randomSeat;
  if (!['North', 'South'].includes(humanSeat)) throw new Error('Choose North or South.');
  const major = rng() < 0.5 ? 'H' : 'S';
  const minor = rng() < 0.5 ? 'C' : 'D';
  const majorLength = rng() < 0.5 ? 4 : 5;
  const minorLength = majorLength === 5 && rng() < 0.5 ? 4 : 5;
  const weak = rng() < 0.3;
  for (let attempt = 0; attempt < 1000000; attempt++) {
    const deck = [...DECK];
    for (let i = 0; i < 26; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const playerHand = deck.slice(0, 13), partnerHand = deck.slice(13, 26);
    const north = feature(playerHand), south = feature(partnerHand);
    if (north.hcp < 14 || north.hcp > 19 || !north.balanced
        || ![2, 3].includes(north.lengths.H) || ![2, 3].includes(north.lengths.S)
        || north.lengths.C > 5 || north.lengths.D > 5) continue;
    if (south.lengths[major] !== majorLength || south.lengths[other(major)] > 3) continue;
    if (weak ? south.hcp < 3 || south.hcp > 6
      : south.hcp < 12 || south.hcp > 19 || south.lengths[minor] !== minorLength) continue;
    const session = { familyId: 'opening-club', systemId: 'outback-acol', seed,
      playerSeat: 'North', partnerSeat: 'South', practiceRole: humanSeat === 'North' ? 'asker' : 'teller',
      playerHand, partnerHand, major: 'C', trump: 'C', auction: [], constraints: [],
      openingFacts: { North: [], South: [] },
      wholeAuction: { rulesVersion: OPENING_RULES_VERSION, humanSeat },
      opening: { node: 'open', major: null, puppet: false },
      phase: 'opening', finished: false, revealed: false, contract: null, pendingAsk: null };
    return advanceOpeningPartner(freeze(session));
  }
  throw new Error('No opening-practice deal found within the generation limit. Try another hand.');
}

export function openingSeat(session) {
  return ['open', 'rebid', 'puppet', 'baron'].includes(session.opening.node) ? 'North' : 'South';
}

export function openingActions(session) {
  const major = session.opening.major;
  const transfer = major === 'H' ? '1D' : '1H';
  switch (session.opening.node) {
    case 'open': return [call('1C', 'Club opening', 'P0246')];
    case 'respond': return [
      call('1D', '4+ Hearts', 'P0251/P0261'), call('1H', '4+ Spades; fewer than 4 hearts', 'P0252/P0261'),
      call('1S', '8+; usually no four-card major', 'P0253'), call('1NT', '0–6; usually no good four-card major', 'P0254'),
      call('2C', '10+; single-suited 6+ Diamonds', 'P0255'), call('Pass', '0–4; 5+ Clubs', 'P0249'),
    ];
    case 'rebid': return [call(`1${major}`, `14–17 balanced; 2/3 ${names[major]}`, 'P0263/P0328'),
      call('1NT', `18/19 balanced; 2/3 ${names[major]}`, 'P0285/P0332')];
    case 'puppet': return [call('2D', 'Puppet acceptance', 'P0449/P0462')];
    case 'baron': return [call('2NT', '4+ Clubs', 'P0504'), call('3C', '4+ Diamonds; fewer than 4 clubs', 'P0505'),
      call('3D', 'No four-card minor', 'P0506')];
    case 'agree-minor': {
      const shown = session.auction.at(-1).bid === '2NT' ? 'C' : session.auction.at(-1).bid === '3C' ? 'D' : null;
      return [call('Pass', `Play ${session.auction.at(-1).bid}`, 'Partnership clarification: asker controls the contract'),
        ...(shown ? [call(`3${shown}`, `Agree ${names[shown]}`, 'P0509')] : []),
        call('3NT', 'Quantitative invitation', 'P0415/P0515')];
    }
    case 'continue': case 'after-puppet': {
      const afterPuppet = session.opening.puppet;
      const last = session.auction.at(-1).bid;
      return [
        ...(last === `1${major}` ? [call('Pass', `0–7; 5+ ${names[major]}; to play`, 'P0264/P0329'),
          call('1NT', `3–6; 4 ${names[major]}; to play`, 'P0266/P0330')] : []),
        ...(last === '1NT' || afterPuppet ? [call('Pass', afterPuppet ? '5+ Diamonds; to play' : 'Play 1NT', 'P0449/P0462')] : []),
        ...(!afterPuppet ? [call('2C', 'Puppet to 2D; weak exit, invitation or five-major route', 'P0449/P0462')] : []),
        call('2S', `Baron; ${afterPuppet ? '5+' : '4'} ${names[major]}, 4/6-card minor, slam interest`, 'P0452/P0465'),
        call('2NT', `Transfer to Clubs; ${afterPuppet ? '5+' : '4'} ${names[major]}, exactly 5 clubs, slam interest`, 'P0453/P0466'),
        call('3C', `Transfer to Diamonds; ${afterPuppet ? '5+' : '4'} ${names[major]}, exactly 5 diamonds, slam interest`, 'P0454/P0467'),
        call('3NT', 'Play 3NT', 'P0458/P0471'), call(`4${major}`, `Play 4${major}`, 'P0458/P0471'),
      ].filter(action => action.bid === 'Pass' || bidIndex(action.bid) > bidIndex(last));
    }
    default: throw new Error('Unknown opening-practice node.');
  }
}

function finish(session) {
  const last = session.auction.findLast(entry => entry.bid !== 'Pass');
  const contract = { bid: last.bid, level: Number(last.bid[0]), strain: last.bid.slice(1),
    declarer: declarerFor(session.auction, last.bid.slice(1), last.seat) };
  return freeze({ ...session, opening: null, phase: 'finished', finished: true, contract });
}

function boundary(session) {
  return freeze({ ...session, finished: true, phase: 'coverage-boundary', coverageBoundary: true,
    undiscussedBid: session.auction.at(-1).bid,
    unsupportedReason: 'This continuation is outside the first full-auction release. Undo to try another route. It has not been graded as an incorrect bid.' });
}

function bridge(session, minor, baron = false) {
  const major = session.opening.major;
  const profileId = baron ? `dappleton-${major.toLowerCase()}-baron-${minor.toLowerCase()}`
    : `dappleton-${major.toLowerCase()}-${minor.toLowerCase()}-${session.opening.puppet ? 'five-major' : 'four-major'}`;
  const profile = getPracticeProfile(profileId);
  return freeze({ ...session, familyId: profileId, opening: null, phase: 'family', nodeId: profile.startNode,
    major: minor, trump: minor, balanced: null, shortageSuit: null,
    relayPolicy: { skip3NT: true, skipMajorGame: false } });
}

/** Apply one call. Only the acting hand is read; partner's policy is separate. */
export function applyOpeningCall(session, bid) {
  const action = openingActions(session).find(action => action.bid === bid);
  if (!action) return boundary({ ...session, auction: [...session.auction,
    { seat: openingSeat(session), bid, meaning: 'Not implemented in full-auction practice' }] });
  const seat = openingSeat(session);
  const hand = seat === 'North' ? session.playerHand : session.partnerHand;
  const f = feature(hand), node = session.opening.node, major = session.opening.major;
  const next = { ...session, opening: { ...session.opening }, constraints: [...session.constraints],
    openingFacts: { North: [...session.openingFacts.North], South: [...session.openingFacts.South] },
    auction: [...session.auction, { seat, bid, meaning: action.label, source: action.source }] };
  const require = (condition, reason) => { if (!condition) throw new Error(reason); };
  const fact = text => { if (next.openingFacts[seat].at(-1) !== text) next.openingFacts[seat].push(text); };
  if (node === 'open') {
    require(f.balanced && f.hcp >= 14 && f.hcp <= 19, 'This 1C practice opening requires a balanced 14–19 hand.');
    fact('1C opening; balanced 14–19 in this practice subset.');
    next.opening.node = 'respond';
  } else if (node === 'respond') {
    if (['1D', '1H'].includes(bid)) {
      const suit = bid === '1D' ? 'H' : 'S';
      require(f.lengths[suit] >= 4, `This transfer shows at least four ${names[suit].toLowerCase()}.`);
      require(bid !== '1H' || f.lengths.H < 4, 'With both four-card majors, respond 1D to show hearts first.');
      next.opening.major = suit; next.opening.node = 'rebid';
      next.constraints.push({ type: 'length', suit, min: 4, label: `4+ ${names[suit]}` });
    } else if (bid === 'Pass') {
      require(f.hcp <= 4 && f.lengths.C >= 5, 'Passing 1C requires a very weak hand with five-plus clubs.');
      return finish(next);
    } else {
      if (bid === '1S') require(f.hcp >= 7, 'The 1S response needs invitational or better values, about 8+.');
      if (bid === '1NT') require(f.hcp <= 7, 'The 1NT response shows a weak hand, 0–6(7).');
      if (bid === '2C') require(f.hcp >= 10 && f.lengths.D >= 6, 'The 2C response shows 10+ and six-plus diamonds.');
      return boundary(next);
    }
  } else if (node === 'rebid') {
    require(bid === '1NT' ? f.hcp >= 18 && f.hcp <= 19 : f.hcp >= 14 && f.hcp <= 17,
      bid === '1NT' ? 'The 1NT rebid shows 18/19 balanced in this practice subset.' : 'Accepting at one of the major shows 14–17 balanced in this practice subset.');
    fact(action.label); next.opening.node = 'continue';
  } else if (node === 'puppet') {
    next.opening.puppet = true; next.opening.node = 'after-puppet';
  } else if (node === 'baron') {
    require(bid === '2NT' ? f.lengths.C >= 4 : bid === '3C' ? f.lengths.C < 4 && f.lengths.D >= 4
      : f.lengths.C < 4 && f.lengths.D < 4, 'This Baron response does not match your minor-suit lengths.');
    fact(action.label); next.opening.node = 'agree-minor';
  } else if (node === 'agree-minor') {
    if (bid === 'Pass') return finish(next);
    if (bid === '3NT') return boundary(next); // Quant acceptance needs agreed policy.
    const minor = bid.slice(1);
    require(f.lengths[minor] >= 4, `Agreeing ${names[minor]} requires four-plus cards in that suit.`);
    if (!session.opening.puppet) return boundary(next);
    next.constraints.push({ type: 'length', suit: major, min: 5, label: `5+ ${names[major]}` },
      { type: 'length', suit: minor, min: 4, label: `4+ ${names[minor]}` });
    return bridge(next, minor, true);
  } else {
    if (bid === 'Pass') {
      const last = session.auction.at(-1).bid;
      require(last === '1NT' ? f.hcp <= 7 : last === '2D' ? f.hcp <= 7 && f.lengths.D >= 5 : f.hcp <= 7 && f.lengths[major] >= 5,
        'This pass is a weak signoff and must fit the suit partner has bid.');
      return finish(next);
    }
    if (bid === '1NT') { require(f.hcp <= 7 && f.lengths[major] === 4, 'This signoff shows a weak hand with four cards in the major.'); return finish({ ...next, auction: [...next.auction, { seat: 'North', bid: 'Pass', meaning: 'Accept 1NT' }] }); }
    if (bid === '3NT' || bid === `4${major}`) return finish({ ...next, auction: [...next.auction, { seat: 'North', bid: 'Pass', meaning: 'Accept final contract' }] });
    if (bid === '2C') { next.opening.node = 'puppet'; return freeze(next); }
    const expected = session.opening.puppet ? 5 : 4;
    if (bid === '2S') {
      require(f.lengths[major] >= expected && (session.opening.puppet || f.lengths[major] === 4) && f.hcp >= 12
        && ['C', 'D'].some(s => [4, 6].includes(f.lengths[s])), 'Baron requires the shown major, a four/six-card minor and slam interest.');
      next.constraints.push({ type: 'length', suit: major, min: expected, label: `${expected}+ ${names[major]}` },
        { type: 'hcp', min: 12, label: 'Slam interest; 12+ in this practice subset' });
      next.opening.node = 'baron';
    } else {
      const minor = bid === '2NT' ? 'C' : 'D';
      require(f.hcp >= 12 && f.lengths[major] === expected && f.lengths[minor] === 5,
        `This transfer requires ${expected} ${names[major]}, exactly five ${names[minor]} and slam interest. With five in the major, use the 2C puppet first.`);
      next.constraints.push({ type: 'length', suit: major, equals: expected, label: `${expected} ${names[major]}` },
        { type: 'length', suit: minor, equals: 5, label: `5 ${names[minor]}` }, { type: 'hcp', min: 12, label: 'Slam interest; 12+ in this practice subset' });
      return bridge(next, minor);
    }
  }
  fact(action.label);
  return freeze(next);
}

/** Own cards and auction only. No completed deal, target profile or secret
 * recipe is passed to the bot's selection function. */
export function openingPartnerBid({ node, major, puppet, auction, hand }) {
  const f = feature(hand);
  if (node === 'open') return '1C';
  if (node === 'respond') return f.lengths.H >= 4 ? '1D' : f.lengths.S >= 4 ? '1H' : f.hcp >= 8 ? '1S' : '1NT';
  if (node === 'rebid') return f.hcp >= 18 ? '1NT' : `1${major}`;
  if (node === 'puppet') return '2D';
  if (node === 'baron') return f.lengths.C >= 4 ? '2NT' : f.lengths.D >= 4 ? '3C' : '3D';
  if (node === 'agree-minor') {
    const minor = auction.at(-1).bid === '2NT' ? 'C' : auction.at(-1).bid === '3C' ? 'D' : null;
    return minor && f.lengths[minor] >= 4 ? `3${minor}` : '3NT';
  }
  if (f.hcp <= 7) return auction.at(-1).bid === `1${major}` && f.lengths[major] === 4 ? '1NT'
    : auction.at(-1).bid === '2D' && f.lengths.D < 5 ? '3NT' : 'Pass';
  if (!puppet && f.lengths[major] >= 5) return '2C';
  if (f.lengths.C === 5) return '2NT';
  if (f.lengths.D === 5) return '3C';
  return '2S';
}

export function advanceOpeningPartner(session) {
  while (session.opening && !session.finished && openingSeat(session) !== session.wholeAuction.humanSeat) {
    const seat = openingSeat(session);
    const bid = openingPartnerBid({ ...session.opening, auction: session.auction,
      hand: seat === 'North' ? session.playerHand : session.partnerHand });
    session = applyOpeningCall(session, bid);
  }
  return session;
}

export function validateOpeningSession(session) {
  if (session.wholeAuction?.rulesVersion !== OPENING_RULES_VERSION
      || !['North', 'South'].includes(session.wholeAuction?.humanSeat)
      || session.practiceRole !== (session.wholeAuction.humanSeat === 'North' ? 'asker' : 'teller')
      || !session.openingFacts || !Array.isArray(session.openingFacts.North) || !Array.isArray(session.openingFacts.South)) {
    throw new Error('Saved full-auction rules or settings are incompatible.');
  }
  if (session.opening && !['open', 'respond', 'rebid', 'continue', 'puppet', 'after-puppet', 'baron', 'agree-minor'].includes(session.opening.node)) throw new Error('Saved opening node is invalid.');
  if (session.opening && session.opening.node !== 'open' && session.opening.node !== 'respond'
      && !['H', 'S'].includes(session.opening.major)) throw new Error('Saved transfer suit is invalid.');
  if (session.opening && !session.finished && openingSeat(session) !== session.wholeAuction.humanSeat) throw new Error('Saved opening turn is invalid.');
}
