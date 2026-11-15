// Ordinary major-opening continuations, main notes P0889–P0894,
// P0993–P1052 and P1478–P1522. Tables and constraints are public.
// Judgement acceptance is deliberately separate from truth-of-description.
import { handFeatures, matchesConstraints, bidIndex } from './core.js';
const other = m => m === 'H' ? 'S' : 'H';
const L = (suit,min,max=13) => ({type:'length',suit,min,max});
const P = (min,max=37) => ({type:'hcp',min,max});
const balancedShapes=[];
for(let S=2;S<=5;S++)for(let H=2;H<=5;H++)for(let D=2;D<=5;D++){const C=13-S-H-D;if(['3334','2344','2335'].includes([S,H,D,C].sort().join(''))) balancedShapes.push(`${S}${H}${D}${C}`);}
const B = {type:'shapes',values:balancedShapes};
export const isMajorBalanced=f=>balancedShapes.includes(['S','H','D','C'].map(s=>f.lengths[s]).join(''));
const U = {type:'balanced',value:false};
const OR = (...options) => ({type:'anyOf',options});
const shape = (m,n,o,c,d) => ({type:'shapes',values:[m==='H'?`${o}${n}${d}${c}`:`${n}${o}${d}${c}`]});
const r = (bid,label,source,facts=[],next='major-choice') => ({bid,label,source,facts,next,kind:'opening'});
export const MAJOR_NORTH_NODES = ['major-club-rebid','major-club-answer','major-diamond-rebid','major-diamond-answer','major-heart-rebid','major-heart-answer','major-invitation','major-describe'];
export const MAJOR_SOUTH_NODES = ['major-club-resolve','major-club-enquiry','major-diamond-enquiry','major-diamond-continue','major-heart-enquiry','major-heart-continue','major-choice'];
export const MAJOR_NODES = [...MAJOR_NORTH_NODES,...MAJOR_SOUTH_NODES];

export function majorResponseFacts(m,bid) {
  if(bid==='1NT') return [L(m,0,2),OR([P(5,9)],[P(10,11),L('C',4,5)])];
  if(bid==='2C') return [OR([P(10),L(m,3,3)], [P(12),B,L(m,2,2)], [P(12),L('C',5)],
    [P(10,11),B,L(m,2,2)], [P(10,11),shape(m,4,3,3,3)])];
  if(bid==='2D') return [P(10),L('D',5),OR([L(m,0,2)],[L(m,3,3),L('D',6)])];
  if(m==='S' && bid==='2H') return [P(10),L('H',5)];
  return [];
}

export function ordinaryMajorRows({system,node,auction}) {
  const m=system.slice(1),om=other(m),last=auction.at(-1)?.bid;
  const games = () => [r('3NT','Play 3NT','Natural game choice',[],'final'),
    ...['H','S'].map(s=>r(`4${s}`,`Play 4${s}`,'Natural game choice',[],'final')),
    ...['C','D'].map(s=>r(`5${s}`,`Play 5${s}`,'Natural game choice',[],'final'))];
  switch(node) {
    case 'major-club-rebid': return [
      r('2D','Accept limit raise; limited hand','P1484',[],'major-club-resolve'),
      r(`2${m}`,'Decline limit raise','P1493',[],'major-club-resolve'),
      r(`2${om}`,`Four-plus ${om==='H'?'hearts':'spades'}; accept limit raise`,'P1500',[L(om,4)],'major-club-resolve'),
      r('2NT','18/19 balanced or reverse with diamonds','P1509',[OR([P(18,19),B],[P(16),L('D',4)])],'major-club-enquiry'),
      r('3C','Four-plus clubs; reverse strength','P1511',[P(16),L('C',4)],'major-club-resolve'),
      r('3D',`Strong six-plus ${m==='H'?'hearts':'spades'}; non-solid suit`,'P1519',[P(14),L(m,6),...['C','D',om].map(s=>L(s,0,3))],'major-club-resolve'),
      r(`3${m}`,'Strong six-plus major; solid suit','P1521',[P(14),L(m,6),...['C','D',om].map(s=>L(s,0,3))],'major-club-resolve'),
      r('3NT','15–17 balanced','P1522',[P(15,17),B],'major-club-resolve'),
    ];
    case 'major-club-enquiry': return [r('3C','Resolve balanced or diamonds','P1510',[],'major-club-answer'),...games()];
    case 'major-club-answer': return [
      r('3D','18/19 balanced','P1510',[P(18,19),B]),
      r('3H','Diamonds; no shortage','P1510',[P(16),L('D',4),...['C','D','H','S'].map(s=>L(s,2))]),
      r('3S',`Diamonds; ${om==='H'?'heart':'spade'} shortage`,'P1510',[P(16),L('D',4),L(om,0,1)]),
      r('3NT','Diamonds; club shortage','P1510',[P(16),L('D',4),L('C',0,1)]),
    ];
    case 'major-club-resolve': {
      const limited=last==='2D',declined=last===`2${m}`,second=last===`2${om}`;
      if(!limited&&!declined&&!second) return [
        ...(last==='3NT'?[r('Pass','Play 3NT','P1522',[],'finish')]:[]),...games(),
        ...(last==='3C'?[r('4D','Keycards in clubs','P1517',[],'boundary')]:[])];
      return [
        ...(declined?[r('Pass',`Play 2${m}; limit raise declined`,'P1493',[],'finish')]:[]),
        ...(limited || second && m==='S'?[r(`2${m}`,'Poor/average limit raise; non-forcing','P1485/P1501',[L(m,3)],'major-invitation')]:[]),
        ...(limited?[r(`2${om}`,'Three-card raise; 15+','P1486',[P(15),L(m,3,3)],'major-describe')]:[]),
        r('2NT','Balanced game force; doubleton major, fewer than five diamonds','P1487/P1494/P1502',[P(12),B,L(m,2,2),L('D',0,4)],'major-describe'),
        r('3C','Game force with clubs','P1488/P1495/P1503',[P(12),L('C',5)],'major-describe'),
        r('3D','Five diamonds; doubleton major, balanced game force','P1489/P1496/P1504',[P(12),B,L(m,2,2),L('D',5,5)],'major-describe'),
        r(`3${m}`,limited?'Three-card raise; 11–14, great controls':'Three-card raise; game force','P1490/P1497/P1505',[L(m,3,3),P(limited?11:15,limited?14:37)],'major-describe'),
        ...(second?[r(`3${om}`,'Agree the second major','P1506',[L(om,4)],'major-describe')]:[]),...games(),
      ];
    }
    case 'major-diamond-rebid': return [
      r(`2${m}`,'9–13; fewer than three diamonds','P1024',[P(9,13),L('D',0,2)],'major-diamond-continue'),
      r('2NT','14+ balanced or specified semi-balanced shapes','P1025/P1046',[P(14),OR([B,L('D',2,3)],[P(14,15),shape(m,6,2,3,2)],[P(14,15),shape(m,6,3,2,2)],[P(14,15),shape(m,6,2,2,3)],[shape(m,5,2,4,2)])],'major-diamond-enquiry'),
      r('3C','Four-plus clubs; 14+','P1026',[P(14),L('C',4)]),
      r('3D','Three/four diamonds; 9–13','P1027',[P(9,13),L('D',3,4)],'major-diamond-continue'),
      r(`3${m}`,'Six-plus major; 14+, excluding 14/15 with 6322','P1028',[P(14),L(m,6)]),
      r(`3${om}`,'Diamond support; 14+, four balanced or three-plus unbalanced','P1029',[P(14),OR([L('D',4),shape(m,5,2,2,4)],[L('D',3),U])]),
      r('3NT','Play 3NT','P1030',[],'final'),
    ];
    case 'major-diamond-enquiry': return [r('3C','Resolve shape and diamond support','P1047',[],'major-diamond-answer'),...games()];
    case 'major-diamond-answer': return [
      r('3D','Three diamonds; 14+ balanced','P1048',[P(14),B,L('D',3,3)]),
      r(`3${om}`,'Five major, four clubs, two diamonds; 14+','P1049',[P(14),shape(m,5,2,4,2)]),
      r(`3${m}`,'Six major, 6322; 14/15','P1050',[P(14,15),OR([shape(m,6,2,3,2)],[shape(m,6,3,2,2)],[shape(m,6,2,2,3)])]),
      r('3NT','Two diamonds; 14–17 balanced','P1051',[P(14,17),B,L('D',2,2)]),
      r('4NT','Two diamonds; 18/19 balanced','P1052',[P(18,19),B,L('D',2,2)]),
    ];
    case 'major-diamond-continue': return [
      r('Pass',`Play ${last}`,'Asker chooses the contract',[],'finish'),
      ...(last!== '3D' ? [r('2NT','Natural invitation','P1033/P1040',[],'major-invitation')]:[]),
      ...(m==='H'&&last==='2H'?[r('2S','Four-plus spades; game force','P1032',[P(12),L('S',4)],'major-describe')]:[]),
      r('3C','Four-plus clubs; game force','P1034/P1041',[P(12),L('C',4)],'major-describe'),
      r('3D','Six-plus diamonds; game force','P1035/P1042',[P(12),L('D',6)],'major-describe'),
      r(`3${m}`,'Six diamonds, three-card major support; game force','P1036/P1043',[P(12),L('D',6),L(m,3,3)],'major-describe'),...games()];
    case 'major-heart-rebid': return [
      r('2S','9–13; zero–two hearts','P0996',[P(9,13),L('H',0,2)],'major-heart-continue'),
      r('2NT','Game force; balanced, semi-balanced or heart support','P0997',[P(14),OR([B,L('H',2)],[L('H',3,4)],[P(14,16),L('S',6,6),L('H',2,2),L('C',2,3),L('D',2,3)])],'major-heart-enquiry'),
      ...['C','D'].map(s=>r(`3${s}`,`Four-plus ${s==='C'?'clubs':'diamonds'}; 14+`,'P0998',[P(14),L(s,4)])),
      r('3H','Three hearts; 9–12','P0999',[P(9,12),L('H',3,3)],'major-heart-continue'),
      r('3S','Six-plus spades; 14–16, unbalanced, zero–two hearts','P1000',[P(14,16),U,L('S',6),L('H',0,2)]),
      r('3NT','Six-plus spades; 17–19','P1001',[P(17,19),L('S',6)]),
      ...['C','D'].map(s=>r(`4${s}`,`Four hearts; ${s==='C'?'club':'diamond'} shortage, 11–13`,'P1002',[P(11,13),L('H',4,4),L(s,0,1)])),
      r('4H','Three hearts; 13–15 balanced or 12–14 unbalanced','P1003',[L('H',3,3),OR([B,P(13,15)],[U,P(12,14)])],'final'),
      r('4S','Seven-plus spades; 12–14','P1004',[P(12,14),L('S',7)],'final')];
    case 'major-heart-enquiry': return [r('3C','Resolve shape and heart support','P1007',[],'major-heart-answer'),
      r('3D','Five-plus diamonds','P1013',[L('D',5)],'major-describe'),
      r('3H','Six-plus hearts; sets trumps','P1014',[L('H',6)],'major-describe'),
      r('3S','Six hearts, three spades','P1015',[L('H',6),L('S',3,3)],'major-describe'),...games()];
    case 'major-heart-answer': return [
      r('3H','Three/four hearts; too strong for immediate game','P1008',[P(14),L('H',3,4)]),
      r('3S','Six spades, two hearts, 6322; 14–16','P1009',[P(14,16),L('S',6,6),L('H',2,2),L('C',2,3),L('D',2,3)]),
      r('3NT','Two hearts; 14–17 balanced','P1010',[P(14,17),B,L('H',2,2)]),
      ...['C','D'].map(s=>r(`4${s}`,`Four hearts; ${s==='C'?'club':'diamond'} shortage, 14+`,'P1011',[P(14),L('H',4,4),L(s,0,1)])),
      r('4NT','Two hearts; 18/19 balanced','P1012',[P(18,19),B,L('H',2,2)])];
    case 'major-heart-continue': return [r('Pass',`Play ${last}`,'Asker chooses the contract',[],'finish'),
      ...(last==='2S'?[r('3S','Three spades, six hearts; forcing','P0996',[L('S',3,3),L('H',6)],'major-describe')]:[]),...games()];
    case 'major-invitation': return [r('Pass',`Play ${last}`,'Invitation judgement',[],'finish'),...games()];
    case 'major-describe': return games(); // Natural game choices; later descriptive/cue auctions remain separate.
    case 'major-choice': return [r('Pass',`Play ${last}`,'Asker chooses the contract',[],'finish'),...games()];
    default: return null;
  }
}

export function ordinaryMajorOptions(context) {
  const rows=ordinaryMajorRows(context);
  const last=context.auction.findLast(c=>c.bid!=='Pass');
  return rows?.filter(r=>r.bid==='Pass'||!last||bidIndex(r.bid)>bidIndex(last.bid));
}

export function ordinaryMajorCheck(context,bid,hand) {
  const row=ordinaryMajorOptions(context)?.find(r=>r.bid===bid);
  if(!row) return null;
  if(!matchesConstraints(hand,row.facts,context.system.slice(1))) throw new Error(`This bid shows ${row.label.toLowerCase()}.`);
  const f=handFeatures(hand,'C'),m=context.system.slice(1);
  if(context.node==='major-diamond-rebid'&&bid===`3${m}`&&f.hcp<=15&&Object.values(f.lengths).sort().join('')==='2236')
    throw new Error('With 14/15 and 6322, use 2NT to describe the hand.');
  // Solid suit / great controls are judgement descriptions; do not invent thresholds.
  return row;
}

export function ordinaryMajorPartnerBid(context,hand) {
  const {node,system,auction}=context,m=system.slice(1),om=other(m),f=handFeatures(hand,'C'),last=auction.at(-1).bid;
  const rows=ordinaryMajorOptions(context);
  const truthful=bid=>rows.some(r=>r.bid===bid&&matchesConstraints(hand,r.facts,m));
  const first=bids=>bids.find(truthful);
  if(node==='major-club-rebid') return first([
    ...(isMajorBalanced(f)&&f.hcp>=15?[f.hcp>=18?'2NT':'3NT']:[]),
    ...(f.hcp>=16&&f.lengths.D>=4?['2NT']:[]),...(f.hcp>=16&&f.lengths.C>=4?['3C']:[]),
    ...(f.hcp>=14&&f.lengths[m]>=6?['A','K','Q','J','T','9'].every(rank=>hand.includes(m+rank))?[`3${m}`]:['3D']:[]),
    ...(f.hcp>=14&&f.lengths[om]>=4?[`2${om}`]:[]),f.hcp<=11?`2${m}`:'2D']);
  if(node.endsWith('-answer')) return rows.find(r=>matchesConstraints(hand,r.facts,m))?.bid;
  if(node.endsWith('-enquiry')) return '3C';
  if(node==='major-club-resolve') {
    if(last==='3NT') return f.lengths[m]>=3?`4${m}`:'Pass';
    if(last===`2${m}`&&f.hcp<=11) return 'Pass';
    if(last==='2D'&&f.lengths[m]===3&&f.hcp<=11) return `2${m}`;
    if(last===`2${om}`&&f.lengths[m]===3&&f.hcp<=11) return `4${m}`;
    if(f.lengths[m]>=3) return `4${m}`;
    return first([...(isMajorBalanced(f)?[f.lengths.D===5?'3D':'2NT']:[]),'3C','3NT']);
  }
  if(node==='major-diamond-rebid') {
    if(f.hcp<=13) return first(['3D',`2${m}`]);
    return first(['2NT',...(f.lengths.D>=3?[`3${om}`]:[]),`3${m}`,'3C','3NT']);
  }
  if(node==='major-heart-rebid') return first([
    ...(f.lengths.H===3?['4H','3H']:[]),...(f.hcp<=13?['2S','4C','4D','4S']:[]),
    ...(isMajorBalanced(f)||Object.values(f.lengths).sort().join('')==='2236'||f.lengths.H>=3?['2NT']:[]),
    '3NT','3S','3C','3D']);
  if(node==='major-invitation') return f.hcp<=11?'Pass':last==='2NT'?'3NT':`4${m}`;
  if(node==='major-describe') {
    const response=auction[1].bid;
    if(last===`3${m}`||response==='2C'&&last===`2${om}`) return `4${m}`;
    if(last==='3H'&&response==='2H') return '4H';
    if(last==='2S'&&f.lengths.S>=4) return '4S';
    if(last==='3C'&&f.lengths.C>=4) return '5C';
    if(last==='3D'&&f.lengths.D>=3) return '5D';
    return '3NT';
  }
  if(node==='major-diamond-continue') return f.hcp<=11?'Pass':first([...(f.lengths.D>=6?['3D']:[]),'3NT']);
  if(node==='major-heart-continue') return f.hcp<=11?'Pass':last==='3H'?'4H':'3NT';
  if(node==='major-choice') {
    const response=auction[1].bid;
    if(last==='3NT'||last==='4NT') return 'Pass';
    if(response==='2H' && ['3H','4C','4D'].includes(last)) return '4H';
    if(response==='2D' && (last==='3D'||last===`3${om}`&&auction.length===3)) return '5D';
    if(f.lengths[m]>=2&&last===`3${m}`) return `4${m}`;
    return first(['3NT',`4${m}`,'5D']);
  }
  throw new Error('No ordinary major-opening policy for this node.');
}
