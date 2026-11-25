// First full-auction slice, first/second-seat uncontested 1C. P0246–P0266,
// P0285/P0328–P0333 and P0445–P0520. The generator's subset is disclosed;
// the auction controller chooses a route from calls and the acting hand only.
import { DECK, PRACTICE_PROFILES, makeRng, handFeatures, matchesConstraints, constraintLabel, bidIndex, getPracticeProfile, createPractice, drawConstrainedPair } from './core.js';
import { clubSuitEntries, clubSuitEntryBid, clubSuitNodes, clubSuitActions, clubSuitPartnerBid, drawClubSuitDeal } from './club-suit-responses.js';
import { MINI_BOURKE, MINI_BOURKE_4414, BOURKE_LONG_CLUBS } from './club-profiles.js';
import { declarerFor, hcp, length, SUITS } from './profile-utils.js';
import { naturalOpeningNode, naturalOpeningActions, naturalOpeningPartnerBid } from './natural-opening.js';
import { createPassedPractice, passedActions, applyPassedCall, passedPartnerBid, validatePassedSession, PASSED_FAMILIES, passedSeatOpenings, mixedPassedFamily } from './passed-hand.js';
export { PASSED_NOTES } from './passed-hand.js';
import { WEAK_NT_COMPETITION, createWeakNotrumpCompetition, weakNotrumpCompetitionActions,
  applyWeakNotrumpCompetitionCall, weakNotrumpCompetitionPartner, validateWeakNotrumpCompetition } from './weak-notrump-competition.js';
import { chooseOpeningFamily, createSystemOpeningPractice, createSystemOpeningState, systemOpeningActions, firstSeatOpenings,
  systemOpeningPartnerBid, applySystemOpeningCall, validateSystemOpeningSession, openingBidFor, openingBidForFamily, startRelay, joinOpeningRelay } from './opening-system.js';
export { OPENING_FAMILIES, SYSTEM_OPENING_NOTES, openingBidFor, openingFamilyFor, openingTitle, humanIsOpener, isOpeningFamily } from './opening-system.js';

export const OPENING_RULES_VERSION = 1;
const names = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' };
const feature = cards => handFeatures(cards, 'C');
const other = major => major === 'H' ? 'S' : 'H';
const GAME_CHOICE_SOURCE = 'Partnership clarification, 18 November 2026';
const call = (bid, label, source) => ({ bid, label, source, kind: 'opening' });
const dappletonMinors = ['C', 'D'];
const hasBaron = (f, major, puppet) => f.hcp >= 12 && (puppet ? f.lengths[major] >= 5 : f.lengths[major] === 4)
  && dappletonMinors.some(suit => [4, 6].includes(f.lengths[suit]));
const hasMinorTransfer = (f, major, minor, puppet) => f.hcp >= 12 && f.lengths[major] === (puppet ? 5 : 4) && f.lengths[minor] === 5;
const dappletonInviteLengths = { H: [5, 6], S: [4, 5] };
const lowerDappletonRange = auction => auction[2]?.bid === '1H' || auction[2]?.bid === '1S';
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};

export const OPENING_NOTES = [
  'Uncontested 1C deals include major transfers, the artificial 1S response, positive diamonds, weak 1NT and natural weak jumps. The deal mix is for practice.',
  'Over the positive 2C, opener has five documented rebids. The shortage questions name the subsequent relays. Practice pauses where P0439/P0440/P0442 omit the reply steps.',
  'Over the positive 2C and opener’s 2D, pass with 10–13. For stronger hands, practice offers provisional natural stoppers, invitations and game choices.',
  'After a weak two-level suit jump, opener can pass or bid naturally to play. Only 2NT invites. The bot invites with 17+ and accepts with 6+ in these practice deals. Human invitation decisions are judgement calls.',
  'The artificial 1S response is (7)8+, usually without a four-card major. With unbalanced clubs and diamonds, 2NT shows 14–16 and 3D shows 9–13. Both lead to the minor-fit shortage enquiries.',
  'After 1C–1S, 2D shows 9–13 with fewer than four diamonds and non-solid clubs. Responder’s 2H starts Mini Bourke. A 3NT shape reply shows 4414, and 4C asks keycards in clubs.',
  'After 1C–1S the balanced opener usually rebids 1NT with 14/15 or 2C with 16–19. A marginal 16 can rebid 1NT. The bot uses 2C with 16. Over 1NT the bot stops with 8/9, preferring a five-card or longer minor with a shortage. Over 2C it requests 3NT with 2D.',
  'The bot generally declines the Dappleton 3NT quantitative invitation. Human acceptance is a judgement call.',
  'Your seat stays fixed. Choose your opening response, rebid and continuation before the existing shortage and keycard enquiries.',
  'After the 2C–2D puppet, 3NT or 3S shows five-plus in your major and offers 3NT/4M. The bot prefers 4M with three-card support; the human opener may choose either game. These bids do not promise slam interest.',
  'After a lower-range transfer acceptance, 2C–2D–2H invites. The bot invites with 8–10 and treats 14/15 as a minimum.',
  'With a game-going hand, the bot offers a choice of games when it has no suitable slam-try description. Hands with a qualifying minor can use Baron or a transfer.',
  'Direct 3H shows a solid six-plus major; the non-solid six-plus slam try uses the puppet. The 3D three-suiter and 3H description support natural game choices; their detailed shortage-enquiry continuations remain outside this increment.',
  'Supported alternatives determine the route. An unimplemented legal call is accepted as a contract choice with a labelled partner-Pass fallback and Undo.',
];

export function createOpeningPractice({ seed, humanSeat, openingFamily = 'C', openingSeatNumber, vulnerable } = {}) {
  seed = String(seed);
  const selected = chooseOpeningFamily(openingFamily, seed);
  if (selected === WEAK_NT_COMPETITION) return advanceOpeningPartner(createWeakNotrumpCompetition({ seed, humanSeat }));
  if (PASSED_FAMILIES.includes(selected)) {
    const rng = makeRng(`passed-settings:${seed}`);
    openingSeatNumber ??= openingFamily === 'all' && rng() < 0.5 ? 4 : 3;
    vulnerable ??= openingFamily === 'all' && rng() < 0.5;
    const passedFamily = openingFamily === 'all' ? mixedPassedFamily(seed, openingSeatNumber, vulnerable) : selected;
    return advanceOpeningPartner(createPassedPractice({ seed, humanSeat, openingFamily: passedFamily, openingSeatNumber, vulnerable }));
  }
  if (selected !== 'C') return advanceOpeningPartner(createSystemOpeningPractice({ seed, humanSeat, openingBid:openingBidForFamily(selected) }));
  const rng = makeRng(`whole-club:${seed}`);
  const randomSeat = rng() < 0.5 ? 'North' : 'South';
  humanSeat ??= randomSeat;
  if (!['North', 'South'].includes(humanSeat)) throw new Error('Choose North or South.');
  const { playerHand, partnerHand } = drawClubHands(seed, rng);
  return advanceOpeningPartner(createClubOpeningState({ seed, humanSeat, playerHand, partnerHand }));
}

function createClubOpeningState({ seed, humanSeat, playerHand, partnerHand }) {
  const session = { familyId: 'opening-club', systemId: 'outback-acol', seed,
    playerSeat: 'North', partnerSeat: 'South', practiceRole: humanSeat === 'North' ? 'asker' : 'teller',
    playerHand, partnerHand, major: 'C', trump: 'C', auction: [], constraints: [],
    openingFacts: { North: [], South: [] },
    wholeAuction: { rulesVersion: OPENING_RULES_VERSION, humanSeat },
    opening: { node: 'open', major: null, puppet: false },
    phase: 'opening', finished: false, revealed: false, contract: null, pendingAsk: null };
  return freeze(session);
}

function drawClubHands(seed, rng) {
  const major = rng() < 0.5 ? 'H' : 'S';
  const minor = rng() < 0.5 ? 'C' : 'D';
  const majorLength = rng() < 0.5 ? 4 : 5;
  const minorLength = majorLength === 5 && rng() < 0.5 ? 4 : 5;
  const weak = rng() < 0.3;
  // Draw a response family independently of the seat and the old transfer
  // draw. Only the deal generator sees this choice.
  const responseDraw = makeRng(`whole-club-response:${seed}`)();
  if (responseDraw >= 11 / 12 && responseDraw < 23 / 24) {
    const drill = rng() < 0.25 ? MINI_BOURKE_4414 : MINI_BOURKE;
    const hands = drawClubRelayHands(getPracticeProfile(drill), seed);
    if (hands) return hands;
  }
  const relayProfiles = responseDraw >= 1 / 6 && responseDraw < 2 / 9 ? clubSpadeProfiles
    : responseDraw >= 3 / 4 && responseDraw < 5 / 6 ? transferProfiles
    : responseDraw >= 5 / 6 && responseDraw < 11 / 12 ? dappletonProfiles : null;
  if (relayProfiles) {
    const profile = relayProfiles[Math.floor(rng() * relayProfiles.length)];
    const hands = drawClubRelayHands(profile,seed);
    if (hands) return hands;
  }
  const noMajor = responseDraw < 1 / 3;
  if (responseDraw >= 1 / 3 && responseDraw < 7 / 12) {
    return drawClubSuitDeal(rng, responseDraw < 1 / 2);
  }
  if (responseDraw >= 7 / 12 && responseDraw < 2 / 3) {
    const responder = [hcp(0,6),length('H',0,3),length('S',0,3),length('C',0,5),length('D',0,5)];
    const opener = [hcp(14,19),{type:'balanced'},length('H',2,4),length('S',2,4)];
    return drawConstrainedPair({constraints:responder,trump:'C',major:'C'},opener,rng);
  }
  if (responseDraw >= 2 / 3 && responseDraw < 3 / 4) return drawClubSuitDeal(rng,false,3);
  if (responseDraw < 1 / 9) {
    const rebid = responseDraw < 1 / 18 ? '3d' : '2nt';
    const deal = createPractice({ profileId: `club-1s-${rebid}-minors`, seed });
    return { playerHand: deal.partnerHand, partnerHand: deal.playerHand };
  }
  if (responseDraw < 1 / 6) {
    const rebid = responseDraw < 5 / 36 ? '2h' : '2s';
    const deal = createPractice({ profileId: `club-1s-${rebid}-keycard`, seed });
    return { playerHand: deal.partnerHand, partnerHand: deal.playerHand };
  }
  for (let attempt = 0; attempt < 1000000; attempt++) {
    const deck = [...DECK];
    for (let i = 0; i < 26; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const northCards = deck.slice(0, 13), southCards = deck.slice(13, 26);
    const north = feature(northCards), south = feature(southCards);
    if (north.hcp < 14 || north.hcp > 19 || !north.balanced
        || ![2, 3].includes(north.lengths.H) || ![2, 3].includes(north.lengths.S)
        || north.lengths.C > 5 || north.lengths.D > 5) continue;
    if (noMajor) {
      if (south.hcp < 8 || south.hcp > 15 || south.lengths.H >= 4 || south.lengths.S >= 4 || south.lengths.D >= 6) continue;
    } else {
      if (south.lengths[major] !== majorLength || south.lengths[other(major)] > 3) continue;
      if (weak ? south.hcp < 3 || south.hcp > 6
        : south.hcp < 12 || south.hcp > 19 || south.lengths[minor] !== minorLength) continue;
    }
    return { playerHand: northCards, partnerHand: southCards };
  }
  throw new Error('No opening-practice deal found within the generation limit. Try another hand.');
}

// These relays already have complete response tables. Use their published
// opening-rebid constraints to route into them from the actual transfer.
const transferProfiles = PRACTICE_PROFILES.filter(profile => {
  const auction = profile.initialAuction;
  return auction?.length === 3 && auction[0].bid === '1C' && ['1D','1H'].includes(auction[1].bid);
});
const dappletonProfiles = PRACTICE_PROFILES.filter(profile => profile.family === 'Dappleton');
const clubSpadeProfiles = ['club-1s-1nt-baron','club-1s-2c-baron','club-1s-2c-2d'].map(getPracticeProfile);
const fitsOpener = (hand, profile) => matchesConstraints(hand, profile.partnerConstraints, profile.defaultTrump);
const fitsResponder = (hand, profile) => matchesConstraints(hand, profile.playerConstraints, profile.defaultTrump);
const transferChoices = response => transferProfiles.filter(profile => profile.initialAuction[1].bid === response);

function clubOpeningEligible(f) {
  const shape = SUITS.map(suit => f.lengths[suit]).join('');
  return f.balanced
    ? (f.hcp >= 14 && f.hcp <= 19 && Math.max(f.lengths.H,f.lengths.S) < 5) || (f.hcp >= 11 && f.hcp <= 13 && BOURKE_LONG_CLUBS.includes(shape))
    : f.hcp >= 9 && (f.lengths.C >= 5 || shape === '4414');
}

function clubResponse(hand) {
  const f = feature(hand);
  return clubSuitEntryBid(f) ?? (f.lengths.H >= 4 ? '1D' : f.lengths.S >= 4 ? '1H' : f.hcp >= 8 ? '1S' : '1NT');
}

function clubTransferRebid(hand, response, major) {
  const choices = transferChoices(response).filter(profile => fitsOpener(hand, profile));
  // The more descriptive reordered rebids take precedence over a basic
  // natural rebid if their practice shapes overlap.
  const profile = choices.find(profile => !profile.id.startsWith('minor-')) ?? choices[0];
  return profile?.initialAuction.at(-1).bid ?? (feature(hand).hcp >= 18 ? '1NT' : `1${major}`);
}

function clubSpadeRebid(hand) {
  const f = feature(hand);
  if (f.hcp <= 13 && f.lengths.D <= 3 && [...'AKQJT9'].every(rank => hand.includes(`C${rank}`))) return '3C';
  if (fitsOpener(hand, getPracticeProfile(MINI_BOURKE))) return '2D';
  if (f.balanced) return f.hcp >= 16 ? '2C' : '1NT';
  if (fitsOpener(hand,clubSpadeProfiles[0])) return '1NT';
  if (f.hcp >= 14 && f.hcp <= 16 && f.lengths.D >= 2 && f.lengths.D <= 3) {
    if (f.lengths.S <= 1) return '2H';
    if (f.lengths.H <= 1) return '2S';
  }
  if (f.hcp >= 16 && fitsOpener(hand,clubSpadeProfiles[2])) return '2C';
  return f.hcp >= 14 ? '2NT' : '3D';
}

function drawClubRelayHands(profile, seed) {
  const prefix = profile.initialAuction;
  const response = prefix[1].bid;
  const rebid = prefix[2].bid;
  const dappleton = dappletonProfiles.includes(profile);
  const major = response === '1D' ? 'H' : 'S';
  for (let attempt = 0; attempt < 48; attempt++) {
    const deal = createPractice({profileId:profile.id,seed:`${seed}:from-opening:${attempt}`});
    const {North:north,South:south} = {[deal.playerSeat]:deal.playerHand,[deal.partnerSeat]:deal.partnerHand};
    if (!clubOpeningEligible(feature(north)) || clubResponse(south) !== response) continue;
    if (response === '1S') {
      if (clubSpadeRebid(north) !== rebid) continue;
      if (profile === clubSpadeProfiles[2] && fitsResponder(south,clubSpadeProfiles[1])) continue;
    } else if (clubTransferRebid(north,response,major) !== rebid) continue;
    if (dappleton && prefix.length > 4 && feature(south).controls < 3) continue;
    return {playerHand:north,partnerHand:south};
  }
  return null;
}

export function openingSeat(session) {
  if (session.opening.system) return session.opening.seat;
  if (clubSuitNodes.includes(session.opening.node) || naturalOpeningNode(session.opening.node,session.auction)) return session.auction.at(-1).seat === 'North' ? 'South' : 'North';
  return ['open', 'rebid', 'puppet', 'baron', 'game-choice', 'request-3nt', 'described-game',
    'club-spade-rebid', 'club-spade-request', 'club-spade-contract', 'baron-quant', 'dappleton-invite'].includes(session.opening.node) ? 'North' : 'South';
}

export function selectOpening(session, bid) {
  const sampledBid = openingBidFor(session);
  if (session.opening.node !== 'open' || bid === sampledBid || bid === 'Pass') return session;
  const { seed, wholeAuction } = session;
  const { humanSeat } = wholeAuction;
  if (wholeAuction.passedHand) {
    const trump = /^1[CDHS]$/.test(bid) ? bid[1] : 'C';
    return freeze({ ...session, major: trump, trump, dealOpeningBid: sampledBid,
      wholeAuction: { ...wholeAuction, openingBid: bid }, opening: { ...session.opening, bid } });
  }
  const hands = { [session.playerSeat]: session.playerHand, [session.partnerSeat]: session.partnerHand };
  const selected = bid === '1C'
    ? createClubOpeningState({ seed, humanSeat, playerHand: hands.North, partnerHand: hands.South })
    : createSystemOpeningState({ seed, humanSeat, openingBid: bid, hands });
  return freeze({ ...selected, dealOpeningBid: sampledBid });
}

export function openingChoices(session) {
  if (session.opening.node !== 'open') return openingActions(session);
  const passedHand = session.wholeAuction.passedHand;
  const bids = passedHand ? [...passedSeatOpenings, 'Pass'] : firstSeatOpenings;
  return bids.map(bid => openingActions(selectOpening(session, bid)).find(action => action.bid === bid));
}

export function openingActions(session) {
  if (session.finished) return [];
  if (session.opening.system === WEAK_NT_COMPETITION) return weakNotrumpCompetitionActions({ ...session.opening, auction: session.auction });
  if (session.opening.system === 'passed') return passedActions(session);
  if (session.opening.system) return systemOpeningActions(session);
  const naturalNode = naturalOpeningNode(session.opening.node, session.auction);
  if (naturalNode) return naturalOpeningActions(naturalNode, session.auction);
  if (clubSuitNodes.includes(session.opening.node)) return clubSuitActions(session.opening.node, session.auction);
  const major = session.opening.major;
  const transfer = major === 'H' ? '1D' : '1H';
  switch (session.opening.node) {
    case 'open': return [call('1C', 'Club opening', 'P0246')];
    case 'respond': return [
      call('1D', '4+ Hearts', 'P0251/P0261'), call('1H', '4+ Spades; fewer than 4 hearts', 'P0252/P0261'),
      call('1S', '(7)8+; usually no four-card major', 'P0253/P0376–P0377'), call('1NT', '0–6(7); usually no good four-card major', 'P0254'),
      ...clubSuitEntries, call('Pass', '0–4; 5+ Clubs', 'P0249'),
    ];
    case 'rebid': return [call(`1${major}`, `14–17 balanced; 2/3 ${names[major]}`, 'P0263/P0328'),
      call('1NT', `18/19 balanced; 2/3 ${names[major]}`, 'P0285/P0332'),
      ...transferChoices(transfer).map(profile => call(profile.initialAuction[2].bid,profile.initialAuction[2].meaning,profile.source))]
      .sort((a,b) => bidIndex(a.bid)-bidIndex(b.bid));
    case 'club-spade-rebid': return [call('1NT', '14/15(16) balanced, or 14–16 with diamond shortage', 'P0381'),
      call('2C', '16–19(20) balanced or strong unbalanced clubs', 'P0382'),
      call('2D', '9–13, 0–3 diamonds, non-solid clubs', 'P0383'),
      call('2H', '14–16, spade shortage, two or three diamonds and five-plus clubs', 'P0384'),
      call('2S', '14–16, heart shortage, two or three diamonds and five-plus clubs', 'P0385'),
      call('2NT', '14–16, five-plus clubs and four-plus diamonds', 'P0386'),
      call('3C', '9–13, solid six-plus clubs', 'P0387'),
      call('3D', '9–13, five-plus clubs and four-plus diamonds', 'P0388')];
    case 'club-mini-bourke': return [
      call('2H', 'Mini Bourke, game-forcing shape relay', 'P0537/P0583'),
      ...['Pass', '2NT', '3C', '3D', '3NT', '5C', '5D'].map(bid => call(bid, 'Natural contract choice', 'Practice signoff')),
    ];
    case 'club-spade-solid': return ['Pass', '3NT', '5C', '6C'].map(bid => call(bid, 'To play', 'Natural contract choice'));
    case 'club-spade-continue':
      return session.auction.at(-1).bid === '1NT'
        ? [call('Pass', 'Play 1NT opposite the lower range', 'P0376'), call('2C', 'To play in clubs', 'P0393'),
          call('2D', 'To play in diamonds', 'P0393'), call('2S', 'Baron enquiry', 'P0408'), call('3NT', 'Play 3NT', 'P0401')]
        : [call('2D', 'Request 3NT or the strong unbalanced description', 'P0402/P0421'), call('2S', 'Baron enquiry', 'P0408'), call('3NT', 'Play 3NT', 'P0401–P0402')];
    case 'club-spade-request': return [call('3NT', 'Balanced hand; accept the request', 'P0421')];
    case 'club-spade-contract': return [call('Pass', 'Accept the selected contract', 'P0393/P0401'),
      ...(bidIndex(session.auction.at(-1).bid) < bidIndex('3NT') ? [call('3NT', 'Continue to game with an exceptional hand for the auction', 'P0393')] : [])];
    case 'puppet': return [call('2D', 'Puppet acceptance', 'P0449/P0462')];
    case 'dappleton-invite': {
      const support = (bid, label, source, min, max = min) => ({ ...call(bid, label, source), facts: [length(major, min, max)] });
      return [
        ...(major === 'H' ? [call('Pass', 'Minimum; play 2H', 'P0494')] : [
          support('2S', 'Minimum, three spades', 'P0498', 3), support('2NT', 'Minimum, two or three spades', 'P0499', 2, 3)]),
        support(`3${major}`, `Non-minimum, three ${names[major].toLowerCase()}`, major === 'H' ? 'P0495' : 'P0500', 3),
        support('3NT', `Non-minimum, two or three ${names[major].toLowerCase()}`, major === 'H' ? 'P0496' : 'P0501', 2, 3),
        support(`4${major}`, `Four-card support; play 4${major}`, 'Natural game choice', 4),
      ];
    }
    case 'dappleton-invite-choice': return [
      call('Pass', `Play ${session.auction.at(-1).bid}`, 'Natural contract choice'),
      ...(session.auction.at(-1).bid === '3NT' ? [] : [call('3NT', 'Play 3NT', 'Natural contract choice')]),
      call(`4${major}`, `Play 4${major}`, 'Natural contract choice'),
    ];
    case 'game-choice': return [call(session.auction.at(-1).bid === '3NT' ? 'Pass' : '3NT', 'Choose 3NT', GAME_CHOICE_SOURCE),
      call(`4${major}`, `Choose game in ${names[major]}`, GAME_CHOICE_SOURCE)];
    case 'request-3nt': return [call('3NT', 'Accept the transfer to 3NT', 'P0457/P0470')];
    case 'game-final': return [call('Pass', 'Accept opener’s game choice', GAME_CHOICE_SOURCE)];
    case 'described-game': return [call('3NT', 'Choose 3NT', 'P0522/P0524'), call(`4${major}`, `Choose game in ${names[major]}`, 'P0522/P0524'),
      ...(session.opening.description === 'three-suited' ? ['C','D'].map(s => call(`5${s}`, `Choose game in ${names[s]}`, 'P0522')) : [])];
    case 'baron': return [call('2NT', '4+ Clubs', 'P0504'), call('3C', '4+ Diamonds; fewer than 4 clubs', 'P0505'),
      call('3D', 'No four-card minor', 'P0506')];
    case 'baron-quant': return [call('Pass','Play 3NT','P0515'),call('6NT','Accept the quantitative invitation','P0515')];
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
        ...(afterPuppet && lowerDappletonRange(session.auction) ? [{ ...call('2H',
          major === 'S' ? 'Invitational, four or five spades' : 'Invitational, five or six hearts', 'P0492'),
          facts: [length(major, ...dappletonInviteLengths[major])] }] : []),
        call('2S', `Baron; ${afterPuppet ? '5+' : '4'} ${names[major]}, 4/6-card minor, slam interest`, 'P0452/P0465'),
        call('2NT', `Transfer to Clubs; ${afterPuppet ? '5+' : '4'} ${names[major]}, exactly 5 clubs, slam interest`, 'P0453/P0466'),
        call('3C', `Transfer to Diamonds; ${afterPuppet ? '5+' : '4'} ${names[major]}, exactly 5 diamonds, slam interest`, 'P0454/P0467'),
        call('3D', `Three-suited; ${names[other(major)]} shortage${afterPuppet ? `; five ${names[major]}` : ''}`, 'P0455/P0468'),
        call('3H', `${afterPuppet ? 'Non-solid' : 'Solid'} six-plus ${names[major]}${afterPuppet ? '; slam interest' : ''}`, afterPuppet ? 'P0449/P0462; P0456/P0469' : 'P0456/P0469'),
        call('3S', afterPuppet ? `5+ ${names[major]}; choice of 3NT or 4${major}, opener declares notrump` : 'Request opener to bid 3NT', afterPuppet ? GAME_CHOICE_SOURCE : 'P0457/P0470'),
        call('3NT', afterPuppet ? `5+ ${names[major]}; choice of 3NT or 4${major}` : 'Play 3NT', afterPuppet ? GAME_CHOICE_SOURCE : 'P0458/P0471'),
        call(`4${major}`, `Play 4${major}`, 'P0458/P0471'),
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
  if (session.opening.system === WEAK_NT_COMPETITION) return freeze(applyWeakNotrumpCompetitionCall(session, bid));
  if (session.opening.system === 'passed') {
    const next = applyPassedCall(session, bid);
    if (next.opening?.node === 'horton') return startRelay(next, `horton-${bid[1].toLowerCase()}`, 'South');
    if (next.opening?.node === 'preempt') {
      return freeze({ ...next, major: bid[1], trump: bid[1], opening: { system: bid, node: 'respond', seat: 'North' } });
    }
    return next;
  }
  if (session.opening.system) return applySystemOpeningCall(session, bid);
  const action = openingActions(session).find(action => action.bid === bid);
  if (!action) return boundary({ ...session, auction: [...session.auction,
    { seat: openingSeat(session), bid, meaning: 'Not implemented in full-auction practice' }] });
  const seat = openingSeat(session);
  const hand = seat === 'North' ? session.playerHand : session.partnerHand;
  const f = feature(hand), node = session.opening.node, major = session.opening.major;
  const next = { ...session, opening: { ...session.opening }, constraints: [...session.constraints],
    openingFacts: { North: [...session.openingFacts.North], South: [...session.openingFacts.South] },
    auction: [...session.auction, { seat, bid, meaning: action.label, source: action.source,
      callAlternatives: openingActions(session).map(({ bid, label }) => ({ bid, label })) }] };
  const require = (condition, reason) => { if (!condition) throw new Error(reason); };
  const fact = text => { if (next.openingFacts[seat].at(-1) !== text) next.openingFacts[seat].push(text); };
  if (action.facts?.length) {
    require(matchesConstraints(hand, action.facts, 'C'), `${bid} shows ${action.label}`);
    if (seat === next.partnerSeat) next.constraints.push(...action.facts.map(c => ({ ...c, label: constraintLabel(c), source: action.source })));
  }
  if (action.forcing) next.auction.at(-1).forcing = true;
  if (node === 'open') {
    require(clubOpeningEligible(f),
      '1C shows 14–19 balanced without a five-card major, or opening values with unbalanced clubs, 4414 or the long-club exception.');
    fact('1C opening: balanced or clubs.');
    next.opening.node = 'respond';
  } else if (node === 'respond') {
    if (bid === '1S') {
      require(f.hcp >= 7 && Math.max(f.lengths.H, f.lengths.S) <= 4,
        '1S shows (7)8+, usually without a four-card major. A four-card major must be poor.');
      require(clubSuitEntryBid(f) !== '2C',
        'With 10+ and a single-suited six-plus diamonds, respond 2C.');
      next.constraints.push({ type: 'hcp', min: 7, label: '(7)8+ for the artificial 1S response', source: action.source });
      next.auction.at(-1).forcing = true;
      next.opening.node = 'club-spade-rebid';
    } else if (['1D', '1H'].includes(bid)) {
      const suit = bid === '1D' ? 'H' : 'S';
      require(f.lengths[suit] >= 4, `This transfer shows at least four ${names[suit].toLowerCase()}.`);
      require(bid !== '1H' || f.lengths.H < 4, 'With both four-card majors, respond 1D to show hearts first.');
      next.opening.major = suit; next.opening.node = 'rebid';
      next.constraints.push({ type: 'length', suit, min: 4, label: `4+ ${names[suit]}` });
    } else if (clubSuitEntries.some(row => row.bid === bid)) {
      next.opening.node = bid === '2C' ? 'diamond-positive' : bid[0] === '3' ? 'weak-three' : 'weak-jump';
    } else if (bid === 'Pass') {
      require(f.hcp <= 4 && f.lengths.C >= 5, 'Passing 1C requires a very weak hand with five-plus clubs.');
      return finish(next);
    } else {
      if (bid !== '1NT') return boundary(next);
      require(f.hcp <= 7, 'The 1NT response shows a weak hand, 0–6(7).');
      next.constraints.push({type:'hcp',min:0,max:7,label:'Weak response, 0–6(7)',source:'P0254'});
      next.opening.node = 'ordinary-rebid';
    }
  } else if (naturalOpeningNode(node,session.auction)) {
    if (action.next === 'finish') return finish(next);
    next.opening.node = action.next;
  } else if (clubSuitNodes.includes(node)) {
    fact(action.label);
    if (bid === 'Pass') return finish(next);
    if (action.next) next.opening.node = action.next;
    else if (action.forcing) {
      const reason = `${bid} asks for shortage. ${action.source} does not specify the reply steps here. Undo to practise another continuation.`;
      return freeze({ ...next, finished: true, phase: 'coverage-boundary', coverageBoundary: true,
        sourceAmbiguity: true, undiscussedBid: bid, unsupportedReason: reason });
    }
    else if (node === 'diamond-positive') next.opening.node = 'diamond-preference';
    else if (node === 'weak-jump' && bid === '2NT') next.opening.node = 'weak-invite';
    else next.opening.node = 'natural-final';
  } else if (node === 'club-spade-rebid') {
    if (bid === '2D' || bid === '3C') {
      require(bid === '2D' ? fitsOpener(hand, getPracticeProfile(MINI_BOURKE)) : f.hcp >= 9 && f.hcp <= 13 && f.lengths.C >= 6,
        `This rebid shows ${action.label.toLowerCase()}.`);
      next.opening.node = bid === '2D' ? 'club-mini-bourke' : 'club-spade-solid';
      fact(action.label);
      return freeze(next);
    }
    if (bid === '2H' || bid === '2S') {
      const profile = getPracticeProfile(`club-1s-${bid.toLowerCase()}-keycard`);
      require(matchesConstraints(hand, profile.partnerConstraints, 'C'), `This rebid shows ${action.label} in the practice shapes.`);
      fact(action.label);
      return startRelay(next, profile.id);
    }
    if (bid === '2NT' || bid === '3D') {
      require(!f.balanced && f.lengths.C >= 5 && f.lengths.D >= 4 && (bid === '3D' ? f.hcp >= 9 && f.hcp <= 13 : f.hcp >= 14 && f.hcp <= 16),
        `This rebid shows ${action.label.toLowerCase()}.`);
      fact(action.label);
      return startRelay(next, `club-1s-${bid.toLowerCase()}-minors`);
    }
    const balancedRebid = f.balanced && (bid === '1NT' ? f.hcp >= 14 && f.hcp <= 16 : f.hcp >= 16 && f.hcp <= 19);
    const profiles = clubSpadeProfiles.filter(profile => profile.initialAuction[2].bid === bid);
    require(balancedRebid || profiles.some(profile => fitsOpener(hand,profile)),
      `This rebid shows ${action.label.toLowerCase()} in the practice shapes.`);
    next.opening.node = 'club-spade-continue';
  } else if (node === 'club-mini-bourke' || node === 'club-spade-solid') {
    if (bid === '2H') return joinOpeningRelay(next, MINI_BOURKE);
    if (bid === 'Pass') return finish(next);
    next.opening.node = 'club-spade-contract';
  } else if (node === 'club-spade-continue') {
    if (bid === 'Pass') return finish(next);
    const request = bid === '2D' && session.auction.at(-1).bid === '2C';
    if (bid === '2S') {
      const profile = clubSpadeProfiles[session.auction.at(-1).bid === '1NT' ? 0 : 1];
      require(fitsResponder(hand,profile), 'This Baron practice route uses six clubs, four diamonds and 12–20 HCP.');
      return joinOpeningRelay(next,profile.id);
    }
    if (request) {
      next.auction.at(-1).forcing = true;
      return joinOpeningRelay(next,clubSpadeProfiles[2].id);
    }
    next.opening.node = 'club-spade-contract';
  } else if (node === 'club-spade-request' || node === 'club-spade-contract') {
    if (bid === 'Pass') return finish(next);
    next.opening.node = 'game-final';
  } else if (node === 'rebid') {
    const profile = transferChoices(session.auction[1].bid).find(profile => profile.initialAuction[2].bid === bid);
    if (profile) {
      require(fitsOpener(hand,profile), `This rebid shows ${action.label.toLowerCase()} in the practice shapes.`);
      fact(action.label);
      return startRelay(next,profile.id);
    }
    require(bid === '1NT' ? f.hcp >= 18 && f.hcp <= 19 : f.hcp >= 14 && f.hcp <= 17,
      bid === '1NT' ? 'The 1NT rebid shows 18/19 balanced in this practice subset.' : 'Accepting at one of the major shows 14–17 balanced in this practice subset.');
    fact(action.label); next.opening.node = 'continue';
  } else if (node === 'puppet') {
    next.opening.puppet = true; next.opening.node = 'after-puppet';
  } else if (node === 'after-puppet' && bid === '2H') {
    next.opening.node = 'dappleton-invite';
  } else if (node === 'dappleton-invite') {
    if (bid === 'Pass') return finish(next);
    next.opening.node = bid === `4${major}` ? 'game-final' : 'dappleton-invite-choice';
  } else if (node === 'dappleton-invite-choice') {
    if (bid === 'Pass') return finish(next);
    next.opening.node = 'game-final';
  } else if (node === 'game-choice' || node === 'request-3nt' || node === 'described-game') {
    if (bid === 'Pass') return finish(next);
    next.opening.node = 'game-final';
  } else if (node === 'baron-quant') {
    if (bid === 'Pass') return finish(next);
    next.opening.node = 'game-final';
  } else if (node === 'game-final') {
    return finish(next);
  } else if (node === 'baron') {
    require(bid === '2NT' ? f.lengths.C >= 4 : bid === '3C' ? f.lengths.C < 4 && f.lengths.D >= 4
      : f.lengths.C < 4 && f.lengths.D < 4, 'This Baron response does not match your minor-suit lengths.');
    fact(action.label); next.opening.node = 'agree-minor';
  } else if (node === 'agree-minor') {
    if (bid === 'Pass') return finish(next);
    if (bid === '3NT') {
      next.opening.node = 'baron-quant';
      return freeze(next);
    }
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
    if (session.opening.puppet && ['3S','3NT'].includes(bid)) {
      require(f.lengths[major] >= 5, `This choice-of-games route shows five-plus ${names[major].toLowerCase()}.`);
      next.constraints.push({ type: 'length', suit: major, min: 5, label: `5+ ${names[major]}; choice of games`, source: GAME_CHOICE_SOURCE });
      next.opening.node = 'game-choice';
      fact(action.label);
      return freeze(next);
    }
    if (bid === '3S') { next.opening.node = 'request-3nt'; fact(action.label); return freeze(next); }
    if (bid === '3D' || bid === '3H') {
      if (bid === '3D') {
        const shapes = major === 'S' ? session.opening.puppet ? ['5044'] : ['4144','4054','4045']
          : session.opening.puppet ? ['0544'] : ['1444','0454','0445'];
        const shape = ['S','H','D','C'].map(s => f.lengths[s]).join('');
        require(shapes.includes(shape), `This three-suiter shows ${shapes.join(' or ')} (SHDC), short in the other major.`);
        next.constraints.push({type:'shapes',values:shapes,label:action.label,source:action.source});
        next.opening.description = 'three-suited';
      } else {
        require(f.lengths[major] >= 6, `This bid shows a ${session.opening.puppet ? 'non-solid' : 'solid'} six-plus ${names[major].toLowerCase()} suit; suit quality is your judgement.`);
        next.constraints.push({type:'length',suit:major,min:6,label:action.label,source:action.source});
        next.opening.description = session.opening.puppet ? 'long-major' : 'solid-major';
      }
      next.opening.node = 'described-game';
      fact(action.label);
      return freeze(next);
    }
    if (bid === '3NT' || bid === `4${major}`) return finish({ ...next, auction: [...next.auction, { seat: 'North', bid: 'Pass', meaning: 'Accept final contract' }] });
    if (bid === '2C') { next.opening.node = 'puppet'; return freeze(next); }
    const expected = session.opening.puppet ? 5 : 4;
    if (bid === '2S') {
      require(hasBaron(f, major, session.opening.puppet), 'Baron requires the shown major, a four/six-card minor and slam interest.');
      next.constraints.push({ type: 'length', suit: major, min: expected, label: `${expected}+ ${names[major]}` },
        { type: 'hcp', min: 12, label: 'Slam interest; 12+ in this practice subset' });
      next.opening.node = 'baron';
    } else {
      const minor = bid === '2NT' ? 'C' : 'D';
      require(hasMinorTransfer(f, major, minor, session.opening.puppet),
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
export function openingPartnerBid(context) {
  const { system, node, major, puppet, auction, hand, description } = context;
  if (system === WEAK_NT_COMPETITION) return weakNotrumpCompetitionPartner(context);
  if (system === 'passed') return passedPartnerBid(context);
  if (system) return systemOpeningPartnerBid(context);
  const f = feature(hand);
  if (node === 'open') return '1C';
  if (node === 'respond') return clubResponse(hand);
  const naturalNode = naturalOpeningNode(node,auction);
  if (naturalNode) return naturalOpeningPartnerBid(naturalNode,auction,hand);
  if (clubSuitNodes.includes(node)) return clubSuitPartnerBid(node, auction, hand, f);
  if (node === 'rebid') return clubTransferRebid(hand,major === 'H' ? '1D' : '1H',major);
  if (node === 'club-spade-rebid') return clubSpadeRebid(hand);
  if (node === 'club-mini-bourke') return f.hcp >= 14 ? '2H' : f.lengths.C >= 3 ? '3C' : f.lengths.D >= 5 ? 'Pass' : '2NT';
  if (node === 'club-spade-solid') return f.hcp >= 14 ? '3NT' : 'Pass';
  if (node === 'club-spade-continue') {
    if (fitsResponder(hand,clubSpadeProfiles[0])) return '2S';
    if (auction.at(-1).bid === '2C') return '2D';
    if (f.hcp >= 10) return '3NT';
    const minor = f.lengths.D > f.lengths.C ? 'D' : 'C';
    return !f.balanced && f.lengths[minor] >= 5 ? `2${minor}` : 'Pass';
  }
  if (node === 'club-spade-request') return '3NT';
  if (node === 'club-spade-contract') return 'Pass';
  if (node === 'puppet') return '2D';
  if (node === 'dappleton-invite') {
    if (f.lengths[major] === 4) return `4${major}`;
    if (f.hcp <= 15) return major === 'H' ? 'Pass' : f.lengths.S === 3 ? '2S' : '2NT';
    return f.lengths[major] === 3 ? `3${major}` : '3NT';
  }
  if (node === 'dappleton-invite-choice') {
    return auction.at(-1).bid === `3${major}` && f.hcp >= 9 && f.lengths[major] >= 5 ? `4${major}` : 'Pass';
  }
  if (node === 'game-choice') return f.lengths[major] >= 3 ? `4${major}` : auction.at(-1).bid === '3NT' ? 'Pass' : '3NT';
  if (node === 'request-3nt') return '3NT';
  if (node === 'game-final' || node === 'baron-quant') return 'Pass';
  if (node === 'described-game') return f.lengths[major] >= (description === 'three-suited' ? puppet ? 3 : 4 : 2) ? `4${major}` : '3NT';
  if (node === 'baron') return f.lengths.C >= 4 ? '2NT' : f.lengths.D >= 4 ? '3C' : '3D';
  if (node === 'agree-minor') {
    const minor = auction.at(-1).bid === '2NT' ? 'C' : auction.at(-1).bid === '3C' ? 'D' : null;
    return minor && f.lengths[minor] >= 4 ? `3${minor}` : '3NT';
  }
  const invites = lowerDappletonRange(auction) && f.hcp >= 8 && f.hcp <= 10 && dappletonInviteLengths[major].includes(f.lengths[major]);
  if (invites) return puppet ? '2H' : '2C';
  if (f.hcp <= 7) return auction.at(-1).bid === `1${major}` && f.lengths[major] === 4 ? '1NT'
    : auction.at(-1).bid === '2D' && f.lengths.D < 5 ? '3NT' : 'Pass';
  if (!puppet && f.lengths[major] >= 5) return '2C';
  if (puppet && f.lengths[major] === 5 && f.controls < 3) return '3NT';
  if (hasMinorTransfer(f, major, 'C', puppet)) return '2NT';
  if (hasMinorTransfer(f, major, 'D', puppet)) return '3C';
  if (puppet && hasBaron(f, major, puppet)) return '2S';
  if (puppet && f.lengths[major] >= 6 && f.hcp >= 13 && f.controls >= 3) return '3H';
  return '3NT';
}

export function advanceOpeningPartner(session) {
  while (session.opening && !session.finished && openingSeat(session) !== session.wholeAuction.humanSeat) {
    const seat = openingSeat(session);
    const bid = openingPartnerBid({ ...session.opening, auction: session.auction,
      hand: seat === session.playerSeat ? session.playerHand : session.partnerHand });
    session = applyOpeningCall(session, bid);
  }
  return session;
}

export function validateOpeningSession(session) {
  if (session.wholeAuction?.competition) return validateWeakNotrumpCompetition(session);
  if (session.wholeAuction?.passedHand) return validatePassedSession(session);
  if (session.wholeAuction?.openingBid && session.wholeAuction.openingBid !== '1C') return validateSystemOpeningSession(session);
  if (session.wholeAuction?.rulesVersion !== OPENING_RULES_VERSION
      || !['North', 'South'].includes(session.wholeAuction?.humanSeat)
      || session.practiceRole !== (session.wholeAuction.humanSeat === session.playerSeat ? 'asker' : 'teller')
      || !session.openingFacts || !Array.isArray(session.openingFacts.North) || !Array.isArray(session.openingFacts.South)) {
    throw new Error('Saved full-auction rules or settings are incompatible.');
  }
  if (session.opening && naturalOpeningNode(session.opening.node,session.auction)) {
    if (!session.finished && openingSeat(session) !== session.wholeAuction.humanSeat) throw new Error('Saved opening turn is invalid.');
    return;
  }
  if (session.opening && !['open', 'respond', 'rebid', 'continue', 'puppet', 'after-puppet', 'dappleton-invite', 'dappleton-invite-choice', 'baron', 'agree-minor',
    'game-choice', 'request-3nt', 'game-final', 'described-game', 'club-spade-rebid', 'club-spade-continue', 'club-spade-request', 'club-spade-contract', 'club-spade-solid', 'club-mini-bourke', 'baron-quant', ...clubSuitNodes].includes(session.opening.node)) throw new Error('Saved opening node is invalid.');
  if (session.opening && !['open','respond','game-final','club-mini-bourke',...clubSuitNodes].includes(session.opening.node) && !session.opening.node.startsWith('club-spade-')
      && !['H', 'S'].includes(session.opening.major)) throw new Error('Saved transfer suit is invalid.');
  if (session.opening && !session.finished && openingSeat(session) !== session.wholeAuction.humanSeat) throw new Error('Saved opening turn is invalid.');
}
