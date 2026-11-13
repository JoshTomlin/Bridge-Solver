// First/second-seat uncontested opening practice. Source: P0631–P0691,
// P0885–P0924, P1311–P1429; revised July minor relays and reordered rebids.
// The sampler may stratify exercises; the bidding policy receives only its
// own cards and the public auction, never the sampling stratum or other hand.
import { DECK, PRACTICE_PROFILES, createPractice, practiceStartState, availableActions, applyBid,
  handFeatures, makeRng, matchesConstraints, bidIndex } from './core.js';
import { declarerFor } from './profile-utils.js';
import { entryContinuations } from './bid-reference.js';

const names = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' };
const other = major => major === 'H' ? 'S' : 'H';
const features = hand => handFeatures(hand, 'C');
const ntShapes=[];
for(let S=2;S<=5;S++)for(let H=2;H<=5;H++)for(let D=2;D<=5;D++){const C=13-S-H-D;if(C>=2&&C<=5&&['4333','4432','5332'].includes([S,H,D,C].sort((a,b)=>b-a).join('')))ntShapes.push(`${S}${H}${D}${C}`);}
const action = (bid, label, source) => ({ bid, label, source, kind: 'opening' });
export const freezeOpening = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeOpening); Object.freeze(value);
  }
  return value;
};
export const OPENING_FAMILIES = Object.freeze(['C', 'D', 'M', 'H', 'S', 'NT', 'all']);
export const openingBidFor = session => session.wholeAuction?.openingBid ?? '1C';
export const openingTitle = session => `${openingBidFor(session)} · Whole auction`;
export const isOpeningFamily = session => session.familyId?.startsWith('opening-');
export const SYSTEM_OPENING_NOTES = [
  'Whole auction: first/second-seat, uncontested. Both hands are fixed before the opening; your physical seat stays fixed when the asker changes.',
  '1D uses 9–19 openers with either a weak 5–8 diamond raise or a clear 14–19 response. It connects the two 1NT range entries, July minor rebids, support enquiries and reordered rebids. Borderline response values and routes outside the current tables pause for review.',
  '1M generates weak three-card raises, game-forcing four-card raises, or a supported 1H–1S route. It initially connects Jacoby 2NT and the reordered 1H–1S branches. Other documented responses are visible; their remaining continuations pause rather than being invented.',
  '2NT is 20–22 in 4333/4432/5332 shapes. Muppet, major transfers, minor Stayman and game choices are playable. Generated transfer hands avoid subjective super-accepts; quality is not graded when studying those alternatives.',
  'The automated partner uses a game-first practice policy after 2NT. Quantitative acceptance and advanced slam follow-ups remain outside this increment.',
];

export function chooseOpeningFamily(family, seed) {
  if (!OPENING_FAMILIES.includes(family)) throw new Error('Choose a supported opening family.');
  const rng = makeRng(`whole-family:${seed}`);
  if (family === 'all') family = ['C', 'D', 'M', 'NT'][Math.floor(rng() * 4)];
  return family === 'M' ? (rng() < 0.5 ? 'H' : 'S') : family;
}

function prefixProfile(auction) {
  const key = auction.map(call => call.bid).join(' ');
  return PRACTICE_PROFILES.find(profile => profile.initialAuction?.map(call => call.bid).join(' ') === key);
}

function physicalHands(session) {
  return { [session.playerSeat]: session.playerHand, [session.partnerSeat]: session.partnerHand };
}

function startRelay(session, profileId) {
  const base = practiceStartState({ profileId, seed: session.seed });
  const hands = physicalHands(session);
  if (!matchesConstraints(hands[base.partnerSeat], base.constraints, base.trump)) return openingBoundary(session);
  return freezeOpening({ ...session, ...base, auction: session.auction, opening: null,
    playerHand: hands[base.playerSeat], partnerHand: hands[base.partnerSeat],
    constraints: [...base.constraints,...(session.openingConstraintsBySeat?.[base.partnerSeat] ?? [])],
    practiceRole: session.wholeAuction.humanSeat === base.playerSeat ? 'asker' : 'teller',
    wholeAuction: session.wholeAuction, openingFacts: session.openingFacts, pendingAsk: null });
}

function joinJacoby(session) {
  // The human opener must answer the 2NT question themselves. The recall
  // controller keeps that question pending, so it is never answered twice.
  const question = session.auction.at(-1);
  const base = startRelay({ ...session, auction: session.auction.slice(0,-1) }, `major-${session.opening.major}`);
  if (base.coverageBoundary) return base;
  const ladder = availableActions(base).find(option => option.bid === '2NT');
  return base.practiceRole === 'asker' ? applyBid(base, '2NT')
    : freezeOpening({ ...base, pendingAsk: { ...ladder, label: question.meaning } });
}

export function finishOpening(session, accept = false) {
  const seat = session.auction.at(-1).seat === 'North' ? 'South' : 'North';
  const auction = accept ? [...session.auction, { seat, bid: 'Pass', meaning: 'Accept final contract' }] : session.auction;
  const last = auction.findLast(call => call.bid !== 'Pass');
  return freezeOpening({ ...session, auction, opening: null, pendingAsk: null, phase: 'finished', finished: true,
    ...(['C','D','H','S'].includes(last.bid.slice(1))?{major:last.bid.slice(1),trump:last.bid.slice(1)}:{}),
    contract: { bid: last.bid, level: Number(last.bid[0]), strain: last.bid.slice(1),
      declarer: declarerFor(auction, last.bid.slice(1), last.seat) } });
}

export function openingBoundary(session) {
  return freezeOpening({ ...session, phase: 'coverage-boundary', finished: true, coverageBoundary: true,
    undiscussedBid: session.auction.at(-1)?.bid,
    unsupportedReason: 'This continuation is not implemented yet. Your bid has not been graded as a system error. Undo to explore another route.' });
}

function diamondRebid(auction, f) {
  const response = auction[1].bid;
  if (response === '1NT') {
    if (f.hcp <= 11) return '2D';
    if (f.hcp <= 15) return '2C';
    if (f.lengths.H >= 4) return '2H';
    if (f.lengths.S >= 4) return '2S';
    if (f.lengths.C >= 4) return '3C';
    if (f.balanced) return '2NT';
    return f.lengths.H <= 1 ? '3D' : f.lengths.S <= 1 ? '3H' : '3S';
  }
  const major = response.slice(1), m = f.lengths[major];
  if (m >= 4) {
    if (f.hcp <= 10) return `2${major}`;
    const outside = [other(major), 'C'];
    const shortage = outside.find(suit => f.lengths[suit] <= 1);
    if (shortage && (f.hcp <= 13 || f.hcp >= 17)) {
      return major === 'H' ? (shortage === 'S' ? '3C' : '3D') : (shortage === 'H' ? '3D' : '3H');
    }
    return `3${major}`;
  }
  if (m === 3 && f.hcp <= 15) return f.hcp <= 10 ? `2${major}` : '1NT';
  if (m === 3 && f.lengths.D >= 6 && f.lengths[other(major)] <= 3 && f.lengths.C <= 3) return '2NT';
  if (major === 'H' && f.lengths.S >= 4) return '1S';
  if (f.lengths.C >= 4) return '2C';
  if (major === 'S' && f.lengths.H >= 4 && f.hcp >= 16) return '3C';
  if (f.lengths.D >= 6 && f.lengths.H <= 3 && f.lengths.S <= 3 && f.hcp >= 14) return major === 'H' ? '2S' : '2H';
  return '2D';
}

function majorResponse(major, f) {
  if (f.lengths[major] >= 4 && f.hcp >= 12) return '2NT';
  if (major === 'H' && f.lengths.S >= 4 && f.lengths.H <= 2
      && !(f.balanced && f.hcp >= 12) && !(f.lengths.S >= 6 && f.hcp <= 7)) return '1S';
  if (f.lengths[major] >= 3) return f.hcp <= 9 ? `2${major}` : '2C';
  if (f.hcp >= 12 && (f.balanced || f.lengths.C >= 5)) return '2C';
  if (f.lengths.D >= 5 && f.hcp >= 10) return '2D';
  if (major === 'S' && f.lengths.H >= 5 && f.hcp >= 10) return '2H';
  return '1NT';
}

function majorRebid(f) {
  if (f.lengths.S >= 4 && (f.hcp <= 13 || f.hcp >= 17)) {
    return f.lengths.D <= 1 ? '3D' : f.lengths.C <= 1 ? '3H' : '2S';
  }
  if (f.lengths.H >= 6 && f.lengths.S <= 2 && f.hcp >= 14) return '3C';
  if (f.balanced && f.hcp <= 17) return '1NT';
  if (f.lengths.C >= 4 || f.balanced) return '2C';
  if (f.lengths.D >= 4) return '2D';
  return '2H';
}

export function systemOpeningPartnerBid({ system, node, major, auction, hand }) {
  const f = features(hand);
  if (node === 'open') return system;
  if (node === 'weak-raise') return 'Pass';
  if (system === '1D') {
    if (node === 'respond') {
      if (f.hcp<=9 && f.lengths.H<=3 && f.lengths.S<=3) return f.lengths.D>=3?'2D':'2C';
      if (Math.max(f.lengths.H, f.lengths.S) >= 5) return f.lengths.S > f.lengths.H ? '1S' : '1H';
      if (f.hcp >= 14 || Math.max(f.lengths.H, f.lengths.S) < 4) return '1NT';
      return f.lengths.H >= 4 ? '1H' : '1S';
    }
    return diamondRebid(auction, f);
  }
  if (system !== '2NT') return node === 'respond' ? majorResponse(system.slice(1), f) : majorRebid(f);
  if (node === 'respond') return f.lengths.S >= 5 || f.lengths.H >= 5
    ? (f.lengths.S > f.lengths.H ? '3H' : '3D') : Math.max(f.lengths.S, f.lengths.H) >= 4 ? '3C' : '3NT';
  if (node === 'muppet') return f.lengths.S === 5 ? '3S' : f.lengths.H === 5 ? '3NT'
    : Math.max(f.lengths.S, f.lengths.H) === 4 ? '3D' : '3H';
  if (node === 'four-major') return f.lengths.S >= 4 ? '3H' : f.lengths.H >= 4 ? '3S' : '3NT';
  if (node === 'fit-major') return f.lengths[major] >= 4 ? `4${major}` : '3NT';
  if (node === 'both-majors') return f.lengths.H >= 4 ? '4H' : '4S';
  if (node === 'no-major') return f.lengths.S === 5 && f.lengths.H === 4 ? '3NT' : '3S';
  if (node === 'puppet-nt') return '3NT';
  if (node === 'shown-five') return f.lengths[major] >= 3 ? `4${major}` : 'Pass';
  if (node === 'transfer') return f.lengths[major] >= 4 ? (major === 'H' ? '3S' : '4C') : `3${major}`;
  if (node === 'after-transfer') return `4${major}`;
  if (node === 'pick-game') return f.lengths[major] >= 3 ? `4${major}` : 'Pass';
  if (node === 'super-fit') return major === 'H' ? '4D' : '4H';
  if (node === 'retransfer') return `4${major}`;
  if (node === 'minor-stayman') return f.lengths.C === 5 ? '4H' : f.lengths.D === 5 ? '4S'
    : f.lengths.C === 4 ? '4C' : f.lengths.D === 4 ? '4D' : '3NT';
  if (node === 'shown-minor') return major ? `5${major}` : 'Pass';
  if (node === 'final') return 'Pass';
  throw new Error('No automated continuation for this opening node.');
}

function drawJoint(rng, accepts) {
  for (let attempt = 0; attempt < 500000; attempt++) {
    const cards = [...DECK];
    for (let i = 0; i < 26; i++) { const j = i + Math.floor(rng() * (52-i)); [cards[i],cards[j]] = [cards[j],cards[i]]; }
    const north = cards.slice(0,13), south = cards.slice(13,26);
    if (accepts(features(north),features(south))) return { North: north, South: south };
  }
  throw new Error('No deal found for this opening subset. Try another seed.');
}

export function createSystemOpeningPractice({ seed, humanSeat, openingBid }) {
  seed = String(seed);
  const rng = makeRng(`whole-system:${openingBid}:${seed}`);
  const drawnSeat = rng() < 0.5 ? 'North' : 'South';
  humanSeat ??= drawnSeat;
  if (!['North','South'].includes(humanSeat)) throw new Error('Choose North or South.');
  let hands;
  if (openingBid === '2NT') hands = drawJoint(rng, (n,s) => {
    const shape = Object.values(n.lengths).sort((a,b) => b-a).join('');
    if (n.hcp < 20 || n.hcp > 22 || !['4333','4432','5332'].includes(shape) || s.hcp < 6 || s.hcp > 10) return false;
    const transfer = Math.max(s.lengths.H,s.lengths.S) >= 5 ? (s.lengths.S > s.lengths.H ? 'S' : 'H') : null;
    return !transfer || n.lengths[transfer] <= 2;
  });
  else if (rng() < 0.2) hands = drawJoint(rng, (n,s) => {
    const major = openingBid.slice(1);
    if (n.hcp < 9 || n.hcp > 11 || n.balanced || s.hcp < 5 || s.hcp > 8) return false;
    if (openingBid === '1D') return n.lengths.D >= 6 && s.lengths.D >= 4 && Math.max(s.lengths.H,s.lengths.S) <= 3;
    return n.lengths[major] >= 5 && n.lengths[other(major)]<=3 && n.lengths.C<=4 && n.lengths.D<=4 && s.lengths[major] === 3 && s.lengths[other(major)] <= 3;
  });
  else {
    const major = openingBid.slice(1);
    const candidates = openingBid === '1D' ? PRACTICE_PROFILES.filter(p => p.initialAuction?.[0].bid === '1D')
      : openingBid === '1H' && rng() < 0.3 ? PRACTICE_PROFILES.filter(p => p.id === 'rebid-single-h-s' || p.id.startsWith('rebid-splinter-h-s-'))
      : [PRACTICE_PROFILES.find(p => p.id === `major-${major}`)];
    for (let attempt = 0; attempt < 320; attempt++) {
      const profile = candidates[Math.floor(rng()*candidates.length)];
      const deal = createPractice({ profileId: profile.id, seed: `${seed}:opening:${attempt}` });
      const pair = { [deal.playerSeat]: deal.playerHand, [deal.partnerSeat]: deal.partnerHand };
      const n = features(pair.North), s = features(pair.South);
      if (s.hcp < 14 || s.hcp > 19) continue;
      if (openingBid === '1D') {
        if (n.hcp > 19 || s.lengths.H >= 4 && s.lengths.S >= 4 && Math.max(s.lengths.H,s.lengths.S) >= 5) continue;
        const response = systemOpeningPartnerBid({ system: openingBid, node: 'respond', hand: pair.South, auction: [] });
        const auction = [{seat:'North',bid:'1D'},{seat:'South',bid:response}];
        const rebid = diamondRebid(auction,n);
        auction.push({seat:'North',bid:rebid});
        const target = prefixProfile(auction);
        if (!target || !matchesConstraints(pair.North, practiceStartState({profileId:target.id}).constraints, target.defaultTrump)) continue;
      } else if (majorResponse(major,s) !== '2NT') {
        if (openingBid !== '1H' || majorResponse(major,s) !== '1S') continue;
        const auction = [{seat:'North',bid:'1H'},{seat:'South',bid:'1S'},{seat:'North',bid:majorRebid(n)}];
        if (!prefixProfile(auction)) continue;
      }
      hands = pair; break;
    }
    if (!hands) throw new Error('No complete opening route found within this subset. Try another seed.');
  }
  const hcp=(min,max)=>({type:'hcp',min,max}), length=(suit,min,max)=>({type:'length',suit,min,max});
  const m=openingBid.slice(1);
  const southRestriction=openingBid==='2NT'?{type:'hcp',min:6,max:10,label:'Responder: 6–10 in this practice subset'}
    : {type:'anyOf',label:'Responder: weak raise or clear game force in this practice subset',options:openingBid==='1D'
      ?[[hcp(5,8),length('D',4,13),length('H',0,3),length('S',0,3)],[hcp(14,19)]]
      :[[hcp(5,8),length(m,3,3),length(other(m),0,3)],[hcp(14,19),length(m,4,13)],
        ...(m==='H'?[[hcp(14,19),length('S',4,13),length('H',0,2),{type:'balanced',value:false}]]:[])]};
  return freezeOpening({ familyId: `opening-${openingBid}`, systemId: 'outback-acol', seed,
    playerSeat: openingBid==='2NT'?'South':'North', partnerSeat: openingBid==='2NT'?'North':'South',
    playerHand: openingBid==='2NT'?hands.South:hands.North, partnerHand: openingBid==='2NT'?hands.North:hands.South,
    practiceRole: humanSeat === (openingBid==='2NT'?'South':'North') ? 'asker' : 'teller', major: openingBid === '2NT' ? 'C' : openingBid.slice(1),
    trump: openingBid === '2NT' ? 'C' : openingBid.slice(1),
    auction: [], constraints: openingBid==='2NT'?[]:[southRestriction], openingFacts: { North: [], South: [] }, openingConstraintsBySeat: { North: [], South: [southRestriction] },
    wholeAuction: { rulesVersion: 1, humanSeat, openingBid },
    opening: { system: openingBid, node: 'open', seat: 'North', major: openingBid === '2NT' ? null : openingBid.slice(1) },
    phase: 'opening', pendingAsk: null, revealed: false, finished: false, contract: null });
}

function openingActionsTable(session) {
  const { system, node, major } = session.opening;
  const calls = rows => rows.map(([bid,label,source]) => action(bid,label,source));
  const games = [['3NT','Play 3NT'], ...(major ? [[`4${major}`,`Play 4${major}`]] : [])];
  if (node === 'open') return calls([[system, system === '2NT' ? '20–22 balanced' : system === '1D' ? 'Diamond opening' : `Five-plus ${names[major]}; 9+`, system === '2NT' ? 'P1312' : system === '1D' ? 'P0631–P0636' : 'P0886']]);
  if (node === 'final') return calls([['Pass','Accept final contract'],...games.filter(([bid]) => bidIndex(bid)>bidIndex(session.auction.findLast(call=>call.bid!=='Pass').bid))]);
  if (system !== '2NT') {
    if (node === 'respond') return system === '1D' ? (entryContinuations(session.auction) ?? []).map(row => action(row.bid,row.label,'P0638–P0647')) : calls([
      ...(major==='H' ? [['1S','Four-plus spades; source exclusions apply']] : []),
      ['1NT','5–9, or 10/11 with clubs; denies three-card support','P0889'],
      ['2C','Three-way: invitational-plus raise, balanced game force, or game-forcing clubs','P1479'],
      ['2D','Five-plus diamonds; 10+, denies three-card support','P0891'],
      ...(major==='S' ? [['2H','Five-plus hearts; 10+','P0894']] : []),
      [`2${major}`,'Three-plus support; 5–9','P0892'],['2NT','Four-plus support; game-forcing','P0895'],
      [`3${major}`,'Four-plus support; 8–12','P0899'], ['3NT','Five-plus/six-plus minors; 9–13','P0900'],
    ]);
    if (node === 'weak-raise') return calls([['Pass',`Play ${session.auction.at(-1).bid}`], ...games]);
    return (entryContinuations(session.auction) ?? []).map(row => action(row.bid,row.label,'July email / Reordering'));
  }
  switch (node) {
    case 'respond': return calls([
      ['Pass','Play 2NT'], ['3C','Muppet Stayman','P1315'], ['3D','Five-plus hearts; transfer','P1316'],
      ['3H','Five-plus spades; transfer','P1316'], ['3S','Minor-suit Stayman','P1317'], ['3NT','Play 3NT','P1318'],
      ['4C','Diamond slam try','P1319'], ['4D','Club slam try','P1319'], ['4H','Transfer to 4S','P1320'],
      ['4S','Play 4S','P1321'], ['4NT','Quantitative invitation','P1322'],
    ]);
    case 'muppet': return calls([['3D','One/both four-card majors','P1325'],['3H','No four/five-card major','P1326'],['3S','Five spades','P1327'],['3NT','Five hearts','P1328']]);
    case 'four-major': return calls([['3H','Four spades','P1330'],['3S','Four hearts','P1331'],['3NT','Play 3NT','P1332'],['4C','4/4 majors; slam interest','P1333'],['4D','4/4 majors; game choice','P1334']]);
    case 'fit-major': return calls([...(major === 'S' ? [['3S','Spade fit; continue below game','P1330']] : [['4C','Heart fit; club control','P1331'],['4D','Heart fit; diamond control','P1331']]),['3NT','No fit; play 3NT'],[`4${major}`,`Major fit; choose 4${major}`]]);
    case 'both-majors': return calls([['4H','Four hearts; play 4H'],['4S','Four spades; play 4S']]);
    case 'no-major': return calls([['3S','Puppet to 3NT; denies five spades/four hearts','P1336'],['3NT','Five spades/four hearts; game choice','P1337'],['4C','Five-plus clubs; slam try','P1338'],['4D','Five-plus diamonds; slam try','P1339'],['4NT','Quantitative invitation','P1342']]);
    case 'puppet-nt': return calls([['3NT','Puppet acceptance','P1343']]);
    case 'shown-five': return calls([['Pass',`Play ${session.auction.at(-1).bid}`],['3NT','Play 3NT'],[`4${major}`,`Play 4${major}`],['4C','Agree the shown major; club cue','P1354'],['4D','Agree the shown major; diamond cue','P1354']]);
    case 'transfer': return calls([
      [`3${major}`,`${names[major]} transfer acceptance; at most three-card support`,'P1364'],
      [major === 'H' ? '3S' : '4C',`Four/five ${names[major]}; super-accept`,'P1369'],
      ['3NT',`Three ${names[major]}; great for slam (judgement)`,'P1365'],
      [`4${major}`,`Four/five ${names[major]}; choose game`,'P1367'],
      ...(major === 'H' ? [['4C','Four/five hearts; club control'],['4D','Four/five hearts; diamond control']] : [['4D','Four/five spades; diamond control'],['4H','Four/five spades; heart control']]),
    ]);
    case 'after-transfer': return calls([['Pass',`Play 3${major}`],['3NT','Offer choice of 3NT or major game','P1373/P1386'],[`4${major}`,`Play 4${major}`],[major === 'H' ? '3S' : '4H',major === 'H' ? 'Five hearts/four spades' : 'Five-plus spades/hearts; game values','P1372/P1389'],['4C','Four-plus clubs; slam interest'],['4D','Four-plus diamonds; slam interest'],['4NT','Quantitative invitation']]);
    case 'pick-game': return calls([['Pass','Choose 3NT'],[`4${major}`,`Three-card fit; choose 4${major}`]]);
    case 'super-fit': return calls([[major === 'H' ? '4D' : '4H',`Re-transfer to ${names[major]}`,'P1370'],[`4${major}`,`Play 4${major}`],['4NT','Slam continuation; not yet implemented']]);
    case 'retransfer': return calls([[`4${major}`,`Accept re-transfer to ${names[major]}`,'P1370']]);
    case 'minor-stayman': return calls([['3NT','No four/five-card minor, or unsuitable hand','P1396'],['4C','Four clubs','P1397'],['4D','Four diamonds','P1398'],['4H','Five clubs','P1399'],['4S','Five diamonds','P1399']]);
    case 'shown-minor': return calls(major ? [[`5${major}`,`Play 5${major}`], [major === 'C' ? '4D' : '4H',`Keycards in ${names[major]}; later continuation`]] : [['Pass','Play 3NT'],['4C','Five-plus clubs; slam try'],['4D','Five-plus diamonds; slam try'],['4NT','Quantitative invitation']]);
    case 'final': return calls([['Pass','Accept final contract'],...games.filter(([bid]) => bidIndex(bid)>bidIndex(session.auction.findLast(call=>call.bid!=='Pass').bid))]);
    default: throw new Error('Unknown opening-practice node.');
  }
}

export function systemOpeningActions(session) {
  const choices=openingActionsTable(session);
  const last=session.auction.findLast(call=>call.bid!=='Pass');
  if (session.opening.system==='2NT' && session.opening.seat==='South' && last?.seat==='North') {
    // The asking hand controls the contract, including artificial answers.
    if (!choices.some(call=>call.bid==='Pass')) choices.push(action('Pass',`Play ${last.bid}`));
    for (const level of [6,7]) for (const strain of ['C','D','H','S','NT']) {
      const bid=`${level}${strain}`;
      if (!choices.some(call=>call.bid===bid)) choices.push({...action(bid,`Play ${bid}`),kind:'opening-final'});
    }
  }
  return choices.filter(call=>call.bid==='Pass' || !last || bidIndex(call.bid)>bidIndex(last.bid));
}

function openingFactsForCall(session,bid) {
  const { system,node,major }=session.opening;
  const length=(suit,min,max)=>({type:'length',suit,...(min===undefined?{}:{min}),...(max===undefined?{}:{max})});
  const control=suit=>({type:'anyOf',options:[[{type:'card',suit,rank:'A'}],[{type:'card',suit,rank:'K'}],[length(suit,0,1)]]});
  const points=(min,max)=>({type:'hcp',min,...(max===undefined?{}:{max})});
  if (node==='open') return system==='2NT'?[points(20,22),{type:'balanced'},{type:'shapes',values:ntShapes}]:system==='1D'?[points(9,19),length('D',4)]:[points(9,19),length(major,5)];
  if (system==='1D' && node==='respond') {
    if (bid==='1H'||bid==='1S') return [points(5),length(bid.slice(1),4)];
    if (bid==='1NT') return [{type:'anyOf',options:[[points(10),length('H',0,3),length('S',0,3)],[points(14),length('H',0,4),length('S',0,4)]]}];
    if (bid==='2D') return [points(5,9),length('D',3)];
  }
  if (system!=='2NT' && node==='respond') {
    if (bid==='2NT') return [points(12),length(major,4)];
    if (bid===`2${major}`) return [points(5,9),length(major,3)];
    if (bid==='1S') return [length('S',4)];
  }
  if (system!=='2NT') return [];
  if (node==='respond' && ['3D','3H','4H'].includes(bid)) return [length(bid==='3D'?'H':'S',5)];
  if (node==='muppet') return bid==='3D'?[{type:'anyOf',options:[[length('H',4,4)],[length('S',4,4)]]},length('H',0,4),length('S',0,4)]
    :bid==='3H'?[length('H',0,3),length('S',0,3)]:[length(bid==='3S'?'S':'H',5,5)];
  if (node==='four-major' && (bid==='3H'||bid==='3S')) return [length(bid==='3H'?'S':'H',4)];
  if (node==='fit-major') return [length(major,bid==='3NT'?0:4,bid==='3NT'?3:5),...(['4C','4D'].includes(bid)?[control(bid.slice(1))]:[])];
  if (node==='no-major' && bid==='3NT') return [length('S',5,5),length('H',4,4)];
  if (node==='transfer') return [length(major,bid===`3${major}`?0:bid==='3NT'?3:4,bid===`3${major}`||bid==='3NT'?3:5),...(bid==='3NT'?[{type:'shapes',values:ntShapes.filter(shape=>shape.split('').sort().join('')!=='3334')}]:[]),...((major==='H'?['4C','4D']:['4D','4H']).includes(bid)?[control(bid.slice(1))]:[])];
  if (node==='pick-game' && bid!=='Pass') return [length(major,3)];
  if (node==='minor-stayman' && bid!=='3NT') { const suit=['4C','4H'].includes(bid)?'C':'D',size=['4H','4S'].includes(bid)?5:4; return [length(suit,size,size)]; }
  return [];
}

export function applySystemOpeningCall(session,bid) {
  const { system,node,major,seat } = session.opening;
  const option = systemOpeningActions(session).find(call => call.bid === bid);
  const next = { ...session, opening: { ...session.opening }, constraints: [...session.constraints],
    openingFacts: { North: [...session.openingFacts.North], South: [...session.openingFacts.South] },
    auction: [...session.auction,{ seat,bid,meaning:option?.label ?? 'Not implemented in whole-auction practice',source:option?.source,
      callAlternatives: systemOpeningActions(session).map(({bid,label}) => ({bid,label})) }] };
  if (!option) return openingBoundary(next);
  next.openingConstraintsBySeat = { North: [...(session.openingConstraintsBySeat?.North ?? [])], South: [...(session.openingConstraintsBySeat?.South ?? [])] };
  next.openingConstraintsBySeat[seat].push(...openingFactsForCall(session,bid).map(fact=>({...fact,label:option.label,source:option.source})));
  next.constraints=next.openingConstraintsBySeat[next.partnerSeat];
  const f = features(physicalHands(session)[seat]);
  const require = (condition,message) => { if (!condition) throw new Error(message); };
  const move = (node,extras={}) => {
    if (node==='final' && ['C','D','H','S'].includes(bid.slice(1))) {next.major=bid.slice(1);next.trump=next.major;}
    next.opening = { ...next.opening, node, seat: seat === 'North' ? 'South' : 'North',...extras };
    next.openingFacts[seat].push(option.label);
    return freezeOpening(next);
  };
  if (node === 'open') {
    if (system === '2NT') { next.balanced=true;next.shortageSuit=null; }
    if (system === '2NT') require(f.hcp>=20 && f.hcp<=22 && ntShapes.includes(['S','H','D','C'].map(suit=>f.lengths[suit]).join('')),'The 2NT opening shows 20–22 balanced in this subset.');
    else if (system === '1D') require(f.hcp>=9 && f.lengths.D>=4 && (!f.balanced || f.lengths.D>=6 && f.hcp>=12),'This diamond opening needs diamonds and an admitted unbalanced/long-diamond hand.');
    else require(f.hcp>=9 && f.lengths[major]>=5 && (!f.balanced || f.hcp>=12),'A major opening requires five-plus cards and opening values; weak balanced hands open 1NT.');
    return move('respond');
  }
  if (option.kind==='opening-final') return move('final',{major:bid.slice(1)==='NT'?major:bid.slice(1)});
  if (node === 'weak-raise' || node === 'final') return bid === 'Pass' ? finishOpening(next) : move('final');
  if (system === '1D' && node === 'respond') {
    if (bid === '1H' || bid === '1S') {
      const suit=bid.slice(1);
      require(f.lengths[suit]>=4 && f.hcp>=5,`A 1${suit} response needs four-plus ${names[suit]} and response values.`);
      require(!(f.hcp>=14 && f.lengths[suit]===4),'With only a four-card major and game-forcing values, use the 1NT enquiry.');
      return move('rebid',{major:suit});
    }
    if (bid === '1NT') { require(f.hcp>=10 && Math.max(f.lengths.H,f.lengths.S)<5 && (Math.max(f.lengths.H,f.lengths.S)<4 || f.hcp>=14),'The 1NT enquiry needs 10+, no five-card major, and game-forcing values with a four-card major.'); return move('rebid',{major:null}); }
    if (bid === '2D') { require(f.hcp>=5 && f.hcp<=9 && f.lengths.D>=3,'A simple diamond raise shows 5–9 and three/four-plus diamonds.'); return move('weak-raise',{major:'D'}); }
    if (bid === '2C') require(f.hcp>=5 && f.hcp<=9 && f.lengths.C>=5,'The 2C response shows 5–9 and five-plus clubs.');
    return openingBoundary(next);
  }
  if (system !== '2NT' && node === 'respond') {
    if (bid === '2NT') { require(f.hcp>=12 && f.lengths[major]>=4,'Jacoby 2NT needs four-plus support and game-forcing values (12+ in this subset).'); return joinJacoby(next); }
    if (bid === `2${major}`) { require(f.hcp>=5 && f.hcp<=9 && f.lengths[major]>=3,'A simple major raise shows 5–9 with three-plus support.'); return move('weak-raise'); }
    if (bid === '1S') {
      require(major==='H' && f.lengths.S>=4,'The 1S response promises four-plus spades.');
      if (f.lengths.H>=3) return openingBoundary(next);
      require(!(f.balanced && f.hcp>=12),'A game-forcing balanced hand uses the three-way 2C response.');
      return move('rebid');
    }
    if (bid === '1NT') require(f.lengths[major]<=2 && f.hcp>=5 && f.hcp<=11,'The 1NT response denies three-card support and shows 5–9, or the source club invitation.');
    if (bid === '2D') require(f.lengths.D>=5 && f.hcp>=10 && f.lengths[major]<=2,'The 2D response shows five-plus diamonds, 10+, without three-card major support.');
    return openingBoundary(next);
  }
  if (system !== '2NT') {
    const expected = system === '1D' ? diamondRebid(session.auction,f) : majorRebid(f);
    const target = prefixProfile(next.auction);
    require(bid===expected || target && matchesConstraints(physicalHands(session).North,practiceStartState({profileId:target.id}).constraints,target.defaultTrump),`This rebid does not match the shown shape/range. The source route for this hand is ${expected}.`);
    return target ? startRelay(next,target.id) : openingBoundary(next);
  }
  if (bid === 'Pass') return finishOpening(next);
  if (node === 'respond') {
    if (bid==='3C') return move('muppet');
    if (['3D','3H','4H'].includes(bid)) {
      const suit=bid==='3D'?'H':'S'; require(f.lengths[suit]>=5,`This transfer promises five-plus ${names[suit]}.`);
      return move(bid==='4H'?'retransfer':'transfer',{major:suit});
    }
    if (bid==='3S') return move('minor-stayman');
    if (bid==='3NT' || bid==='4S') return move('final',{major:bid==='4S'?'S':null});
    return openingBoundary(next);
  }
  if (node==='muppet') {
    const expected=systemOpeningPartnerBid({ ...session.opening,hand:physicalHands(session)[seat],auction:session.auction });
    require(bid===expected,'This Muppet answer does not match your four/five-card majors.');
    return move(bid==='3D'?'four-major':bid==='3H'?'no-major':'shown-five',{major:bid==='3S'?'S':bid==='3NT'?'H':null});
  }
  if (node==='four-major') {
    if (bid==='3H' || bid==='3S') { const suit=bid==='3H'?'S':'H'; require(f.lengths[suit]>=4,`This response shows four ${names[suit]}.`); return move('fit-major',{major:suit}); }
    if (bid==='4D') { require(f.lengths.H===4 && f.lengths.S===4,'The 4D game choice shows both four-card majors.'); return move('both-majors'); }
    if (bid==='3NT') return move('final');
    return openingBoundary(next);
  }
  if (node==='fit-major') {
    if (bid==='3NT') { require(f.lengths[major]<4,'With four-card support, show the major fit.'); return move('final'); }
    require(f.lengths[major]>=4,'Showing the major fit requires four-card support.');
    if (bid===`4${major}`) return move('final');
    if (['4C','4D'].includes(bid)) { const suit=bid.slice(1);require(physicalHands(session)[seat].some(card=>[suit+'A',suit+'K'].includes(card)),'This cue needs a control in the bid suit.'); }
    return move('shown-five'); // Below-game fit established; game choices remain available.
  }
  if (node==='both-majors') { require(f.lengths[bid.slice(1)]>=4,'Choose a major in which you hold four cards.'); return move('final',{major:bid.slice(1)}); }
  if (node==='no-major') {
    if (bid==='3S') { require(!(f.lengths.S===5 && f.lengths.H===4),'With five spades and four hearts, 3NT shows that game hand.'); return move('puppet-nt'); }
    if (bid==='3NT') { require(f.lengths.S===5 && f.lengths.H===4,'This artificial 3NT shows five spades and four hearts.'); return move('pick-game',{major:'S'}); }
    return openingBoundary(next);
  }
  if (node==='puppet-nt') return move('final');
  if (node==='shown-five') return bid==='3NT' || bid===`4${major}` ? move('final') : openingBoundary(next);
  if (node==='transfer') {
    if (bid===`3${major}`) { require(f.lengths[major]<=3,'Four/five-card support requires a super-accept.'); return move('after-transfer'); }
    if (bid==='3NT') { require(f.lengths[major]===3,'The 3NT super-accept shows exactly three-card support.'); require(Object.values(f.lengths).sort((a,b)=>b-a).join('')!=='4333','The three-card super-accept excludes 4333.'); return move('super-fit'); }
    require(f.lengths[major]>=4,'This super-accept requires four/five-card support.');
    if (bid===`4${major}`) return move('final');
    if ((major==='H'?['4C','4D']:['4D','4H']).includes(bid)) {
      const suit=bid.slice(1); require(physicalHands(session)[seat].includes(suit+'A') || physicalHands(session)[seat].includes(suit+'K'),'This cue needs a control in the bid suit.');
    }
    return move('super-fit');
  }
  if (node==='after-transfer') {
    if (bid==='3NT') return move('pick-game');
    if (bid===`4${major}`) return move('final');
    return openingBoundary(next);
  }
  if (node==='pick-game') { require(f.lengths[major]>=3,'Choosing major game after the notrump offer requires three-card support.'); return move('final'); }
  if (node==='super-fit') return bid===`4${major}` ? move('final') : bid===(major==='H'?'4D':'4H') ? move('retransfer') : openingBoundary(next);
  if (node==='retransfer') return move('final');
  if (node==='minor-stayman') {
    if (bid==='3NT') return move('shown-minor',{major:null});
    const suit=bid==='4C'||bid==='4H'?'C':'D', length=bid==='4H'||bid==='4S'?5:4;
    require(f.lengths[suit]===length,`This response shows ${length} ${names[suit]}.`);
    return move('shown-minor',{major:suit});
  }
  if (node==='shown-minor') return bid===`5${major}` ? move('final') : openingBoundary(next);
  if (node==='final') return move('final');
  return openingBoundary(next);
}

export function validateSystemOpeningSession(session) {
  const whole=session.wholeAuction;
  if (whole.rulesVersion!==1 || !['North','South'].includes(whole.humanSeat)
      || !['1D','1H','1S','2NT'].includes(whole.openingBid)
      || session.practiceRole!==(whole.humanSeat===session.playerSeat?'asker':'teller')
      || !session.openingFacts || !Array.isArray(session.openingFacts.North) || !Array.isArray(session.openingFacts.South)) throw new Error('Saved opening rules or settings are incompatible.');
  if (session.opening) {
    const { system,node,seat }=session.opening;
    if (system!==whole.openingBid || !['North','South'].includes(seat) || typeof node!=='string') throw new Error('Saved opening node is invalid.');
    const nodes=system==='2NT'?['open','respond','muppet','four-major','fit-major','both-majors','no-major','puppet-nt','shown-five','transfer','after-transfer','pick-game','super-fit','retransfer','minor-stayman','shown-minor','final']:['open','respond','rebid','weak-raise','final'];
    if (!nodes.includes(node)) throw new Error('Saved opening node is invalid.');
    const northNodes=['open','rebid','weak-raise','muppet','fit-major','both-majors','puppet-nt','transfer','pick-game','retransfer','minor-stayman'];
    if (node!=='final' && seat!==(northNodes.includes(node)?'North':'South')) throw new Error('Saved opening seat is invalid.');
    if (session.opening.major!==null && !Object.hasOwn(names,session.opening.major)) throw new Error('Saved opening suit is invalid.');
    systemOpeningActions(session);
    if (!session.finished && seat!==whole.humanSeat) throw new Error('Saved opening turn is invalid.');
  }
}
