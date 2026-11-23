// Ordinary major-opening continuations, main notes P0889–P0894,
// P0993–P1052 and P1478–P1522. Tables and constraints are public.
// Judgement acceptance is deliberately separate from truth-of-description.
import { handFeatures, matchesConstraints, bidIndex } from './core.js';
import { control, name } from './source-utils.js';
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
const force = (...args) => ({ ...r(...args), forcing: true });
const toPlay = bid => r(bid, `Play ${bid}`, 'Natural contract choice', [], 'final');
const pass = last => r('Pass', `Play ${last}`, 'Natural contract choice', [], 'finish');
const provisional = 'Provisional natural practice';
const clubReverseSuit = (suit, source) => force(`3${suit}`,
  `Natural ${name(suit)} or a control agreeing clubs`, source,
  [OR([L(suit, 3)], [L('C', 4), control(suit)])], 'major-club-followup');
const agreeForSlam = (bid, label, source, facts, trump) => ({ ...force(bid, label, source, facts, 'nt-cue'), trump });
const heartSpadeBalanced = OR([B], [shape('H',5,2,4,2)], [shape('H',5,2,2,4)],
  [P(12,13), shape('H',6,3,2,2)], [P(12,13), shape('H',6,2,2,3)], [P(12,13), shape('H',6,2,3,2)]);
export const MAJOR_NORTH_NODES = ['major-club-rebid','major-club-answer','major-club-followup','major-club-detail','major-diamond-rebid','major-diamond-answer','major-heart-rebid','major-heart-answer','major-invitation','major-describe',
  'heart-spade-range', 'heart-spade-shape', 'heart-spade-puppet', 'heart-spade-club-resolve', 'heart-spade-club-game-force'];
export const MAJOR_SOUTH_NODES = ['major-club-resolve','major-club-enquiry','major-club-choice','major-game-try','major-diamond-enquiry','major-diamond-continue','major-heart-enquiry','major-heart-continue','major-choice',
  'heart-spade-after-nt', 'heart-spade-after-range', 'heart-spade-after-club', 'heart-spade-after-suit', 'heart-spade-after-puppet'];
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
    case 'weak-raise':
      if (system !== '1H' && system !== '1S') return null;
      return [
        pass(last),
        ...[m === 'H' ? '2S' : '3H', '3C', '3D'].map(bid => force(bid, `Game try in ${name(bid[1])}, three-plus`,
          provisional, [L(bid[1], 3)], 'major-game-try')),
        force('2NT', 'Natural game invitation', provisional, [B], 'major-game-try'),
        r(`3${m}`, 'General game invitation', provisional, [], 'major-game-try'),
        ...games(),
      ];
    case 'major-game-try': return [
      last === `3${m}` ? pass(last) : toPlay(`3${m}`),
      toPlay(`4${m}`),
      ...(last === '2NT' ? [r('3NT', 'Accept in notrump', provisional, [B], 'final')] : []),
    ];
    case 'rebid':
      if (system !== '1H' || last !== '1S') return null;
      return [
        r('1NT', '12–17 balanced, including 12/13 with 6322', 'P0910', [P(12,17), heartSpadeBalanced], 'heart-spade-after-nt'),
        force('2C', 'Four-plus clubs unbalanced, or 18/19 balanced', 'P0911/P0956', [OR([U,L('C',4)], [P(18,19),B])], 'heart-spade-after-club'),
        force('2D', 'Four-plus diamonds, unbalanced', 'P0912', [L('D',4),U], 'heart-spade-after-suit'),
        r('2H', 'Six-plus hearts, 9–13, at most two spades', 'P0913', [P(9,13),L('H',6),L('S',0,2)], 'heart-spade-after-suit'),
        r('2S', 'Three/four spades, 9–13, except 12/13 balanced with three', 'P0914', [P(9,13),OR([L('S',4,4)],[L('S',3,3),U],[L('S',3,3),P(9,11)])], 'heart-spade-after-suit'),
        r('2NT', 'Six-plus hearts, three spades, (13)14+', 'P0915', [P(13),L('H',6),L('S',3,3)], 'heart-spade-after-suit'),
        r('3C', 'Six-plus hearts, 14+, no second four-card suit, at most two spades', 'R0024', [P(14),L('H',6),L('S',0,2),L('C',0,3),L('D',0,3)], 'relay-handover'),
        ...[['3D','D'],['3H','C']].map(([bid,suit]) => r(bid, `Four spades; ${suit === 'D' ? 'diamond' : 'club'} shortage, mini–mega`, 'R0020–R0021', [L('S',4,4),L(suit,0,1)], 'relay-handover')),
        r('3S', 'Four spades, five hearts; 14–16, 4522 or singleton A/K', 'P0919', [P(14,16),L('S',4,4),L('H',5,5)], 'heart-spade-after-suit'),
        r('4H', 'Seven-plus hearts; to play', 'P0922', [L('H',7)], 'final'),
        r('4S', 'Four spades, five hearts; 17–19, 4522 or singleton A/K', 'P0923', [P(17,19),L('S',4,4),L('H',5,5)], 'final'),
      ];
    case 'heart-spade-after-nt': return [
      pass(last), force('2C', 'Range enquiry', 'P0928', [], 'heart-spade-range'),
      r('2D', 'Five-plus diamonds, 5–8', 'P0932', [L('D',5),P(5,8)], 'final'),
      r('2H', 'Six spades, three hearts, 5–7', 'P0933', [L('S',6,6),L('H',3,3),P(5,7)], 'final'),
      r('2S', 'Five spades, 5/6', 'P0934', [L('S',5,5),P(5,6)], 'final'),
      force('2NT', 'Puppet to 3♣; five-plus clubs, 5–8', 'P0935', [L('C',5),P(5,8)], 'heart-spade-puppet'),
      ...['C','D'].map(suit => force(`3${suit}`, `Five-plus spades and ${suit === 'C' ? 'clubs' : 'diamonds'}, 10–14`, 'P0936', [L('S',5),L(suit,5),P(10,14)], 'major-describe')),
      force('3H', 'Six spades, three hearts, 8–11', 'P0937', [L('S',6,6),L('H',3,3),P(8,11)], 'major-describe'),
      r('3S', 'Six-plus spades, 9–11', 'P0938', [L('S',6),P(9,11)], 'major-invitation'), ...games(),
    ];
    case 'heart-spade-range': return [
      r('2D', '14/15', 'P0929', [P(14,15)], 'heart-spade-after-range'),
      r('2H', '12/13', 'P0930', [P(12,13)], 'heart-spade-after-range'),
      r('2S', '16/17', 'P0931', [P(16,17)], 'heart-spade-after-range'),
    ];
    case 'heart-spade-after-range': return [
      pass(last), toPlay('2H'), toPlay('2S'),
      force('2NT', 'Game-forcing shape enquiry', 'P0944', [], 'heart-spade-shape'),
      ...games(),
    ];
    case 'heart-spade-shape': return [
      r('3C', 'Five hearts, four clubs, 2524', 'P0945', [shape('H',5,2,4,2)]),
      r('3D', 'Five hearts, four diamonds, 2542', 'P0945', [shape('H',5,2,2,4)]),
      r('3H', 'Six hearts, 6322, 12/13', 'P0946', [L('H',6,6),P(12,13)]),
      r('3S', 'Three spades, five hearts, 3532 or 3523', 'P0947', [OR([shape('H',5,3,2,3)],[shape('H',5,3,3,2)])]),
      r('3NT', 'Two spades, five hearts, 2533', 'P0948', [shape('H',5,2,3,3)]),
    ];
    case 'heart-spade-puppet': return [r('3C', 'Complete the club puppet', 'P0935', [], 'heart-spade-after-puppet')];
    case 'heart-spade-after-puppet': return [pass(last)];
    case 'heart-spade-after-club': return [
      r('Pass', 'Subminimum with long clubs; to play', 'P0956', [P(5,6),L('C',5)], 'finish'),
      force('2D', 'Artificial catch-all, usually below 12/13', 'P0958', [], 'heart-spade-club-resolve'),
      force('2H', 'Five-plus spades, 13+, game-forcing', 'P0965', [L('S',5),P(13)], 'heart-spade-club-game-force'),
      r('2S', 'Six-plus spades, (7)8–12', 'P0972', [L('S',6),P(7,12)], 'major-invitation'),
      r('2NT', 'Natural invitation, 12–14 opposite clubs', 'P0977', [P(12,14)], 'major-invitation'),
      r('3C', 'Four-plus clubs, 9–12, invitational', 'P0979', [L('C',4),P(9,12)], 'major-invitation'),
      force('3H', 'Six spades, three hearts, 9–11, game-forcing', 'P0981', [L('S',6,6),L('H',3,3),P(9,11)], 'major-describe'),
      force('3S', 'Six-plus spades, slam interest', 'P0982/P0984', [L('S',6)], 'major-describe'), ...games(),
    ];
    case 'heart-spade-club-resolve': return [
      r('2H', 'Natural clubs; minimum preference for hearts', 'P0959', [L('C',4),U], 'heart-spade-after-suit'),
      r('2S', 'Three spades, five hearts, four clubs, one diamond, 14/15', 'P0960', [shape('H',5,3,4,1),P(14,15)], 'heart-spade-after-suit'),
      r('2NT', '18/19 balanced', 'P0961', [P(18,19),B], 'heart-spade-after-suit'),
      force('3C', 'Five-plus hearts and clubs, 16+', 'P0962', [L('C',5),P(16)], 'heart-spade-after-suit'),
      force('3H', 'Six hearts, four clubs, 17+, game-forcing', 'P0963', [L('H',6,6),L('C',4,4),P(17)], 'heart-spade-after-suit'),
      force('3S', 'Three spades, five hearts, four clubs, one diamond, 16+', 'P0964', [shape('H',5,3,4,1),P(16)], 'heart-spade-after-suit'),
    ];
    case 'heart-spade-club-game-force': return [
      r('2S', 'Three spades, five hearts, four clubs, one diamond, 14/15', 'P0966', [shape('H',5,3,4,1),P(14,15)]),
      r('2NT', 'Natural, below 18/19', 'P0967', [P(9,17)]),
      r('3C', 'Five-plus hearts and clubs, 14+', 'P0968', [L('C',5),P(14)]),
      r('3D', 'Void spade, five hearts, four of each minor', 'P0969', [shape('H',5,0,4,4)]),
      r('3S', 'Three spades and 18/19 balanced, or 3514 with 16+', 'P0970', [OR([L('S',3,3),P(18,19),B],[shape('H',5,3,4,1),P(16)])]),
      r('3NT', 'Two spades, 18/19 balanced', 'P0971', [L('S',2,2),P(18,19),B]),
    ];
    case 'heart-spade-after-suit': return [
      ...(!auction.at(-1).forcing && ['2H','2S','2NT','3S'].includes(last) ? [pass(last)] : []),
      ...(last==='2H' && auction[2].bid==='2C' ? [toPlay('3C')] : []),
      ...(last==='2NT' ? [toPlay('3H'), toPlay('3S')] : []),
      ...(last==='2D' ? [toPlay('2H'),
        r('2S', 'Five-plus spades; natural preference', 'Natural continuation', [L('S',5)], 'final'),
        force('3S', 'Six-plus spades; forcing', 'P1736–P1737', [L('S',6)], 'major-describe')] : []),
      ...games(),
    ];
    case 'major-club-rebid': return [
      r('2D','Accept limit raise; limited hand','P1484',[],'major-club-resolve'),
      r(`2${m}`,'Decline limit raise','P1493',[],'major-club-resolve'),
      r(`2${om}`,`Four-plus ${om==='H'?'hearts':'spades'}; accept limit raise`,'P1500',[L(om,4)],'major-club-resolve'),
      r('2NT','18/19 balanced or reverse with diamonds','P1509',[OR([P(18,19),B],[P(16),L('D',4)])],'major-club-enquiry'),
      force('3C','Four-plus clubs; reverse strength','P1511',[P(16),L('C',4)],'major-club-resolve'),
      r('3D',`Strong six-plus ${m==='H'?'hearts':'spades'}; non-solid suit`,'P1519',[P(14),L(m,6),...['C','D',om].map(s=>L(s,0,3))],'major-club-resolve'),
      r(`3${m}`,'Strong six-plus major; solid suit','P1521',[P(14),L(m,6),...['C','D',om].map(s=>L(s,0,3))],'major-club-resolve'),
      r('3NT','15–17 balanced','P1522',[P(15,17),B],'major-club-resolve'),
    ];
    case 'major-club-enquiry': return [force('3C','Resolve balanced or diamonds','P1510',[],'major-club-answer'),...games()];
    case 'major-club-answer': return [
      r('3D','18/19 balanced','P1510',[P(18,19),B]),
      r('3H','Diamonds; no shortage','P1510',[P(16),L('D',4),...['C','D','H','S'].map(s=>L(s,2))]),
      r('3S',`Diamonds; ${om==='H'?'heart':'spade'} shortage`,'P1510',[P(16),L('D',4),L(om,0,1)]),
      r('3NT','Diamonds; club shortage','P1510',[P(16),L('D',4),L('C',0,1)]),
    ];
    case 'major-club-resolve': {
      const limited=last==='2D',declined=last===`2${m}`,second=last===`2${om}`;
      if (last === '3C') return [
        clubReverseSuit('D', 'P1512'),
        clubReverseSuit(om, 'P1513'),
        agreeForSlam(`3${m}`, 'Good three-card raise or better; agrees trumps', 'P1514', [L(m,3,3)], m),
        agreeForSlam('4C', 'Three-card major support and four-plus clubs', 'P1516', [L(m,3,3),L('C',4)], 'C'),
        { ...force('4D', 'Kickback in clubs', 'P1517', [L('C',4)], 'nt-answer'), trump: 'C' },
        r(`4${m}`, 'Poor or average limit raise; to play', 'P1518', [L(m,3)], 'final'),
        ...games().filter(row => row.bid !== `4${m}`),
      ];
      if(!limited&&!declined&&!second) return [
        ...(last==='3D'?[force(`3${m}`, 'Three-card raise or balanced game force with a doubleton in the major',
          'P1520', [OR([L(m,3,3)], [P(12),B,L(m,2,2)])], 'major-describe')]:[]),
        ...(last==='3NT'?[r('Pass','Play 3NT','P1522',[],'finish')]:[]),...games()];
      return [
        ...(declined?[r('Pass',`Play 2${m}; limit raise declined`,'P1493',[],'finish')]:[]),
        ...(limited || second && m==='S'?[r(`2${m}`,'Poor/average limit raise; non-forcing','P1485/P1501',[L(m,3)],'major-invitation')]:[]),
        ...(limited?[force(`2${om}`,'Exactly three-card support; 15+, game-forcing','P1486',[P(15),L(m,3,3)],'major-club-detail')]:[]),
        r('2NT','Balanced game force; doubleton major, fewer than five diamonds','P1487/P1494/P1502',[P(12),B,L(m,2,2),L('D',0,4)],'major-describe'),
        r('3C','Game force with clubs','P1488/P1495/P1503',[P(12),L('C',5)],'major-describe'),
        r('3D','Five diamonds; doubleton major, balanced game force','P1489/P1496/P1504',[P(12),B,L(m,2,2),L('D',5,5)],'major-describe'),
        r(`3${m}`,limited?'Three-card raise; 11–14, great controls':'Three-card raise; game force','P1490/P1497/P1505',[L(m,3,3),P(limited?11:declined?15:12,limited?14:37)],'major-describe'),
        ...(second?[r(`3${om}`,'Agree the second major','P1506',[L(om,4)],'major-describe')]:[]),...games(),
      ];
    }
    case 'major-club-detail': return [
      force('2NT', 'Balanced shape', provisional, [B], 'major-club-choice'),
      ...['C', 'D', om].map(suit => force(`3${suit}`, `Four-plus ${name(suit)}`, provisional, [L(suit,4)], 'major-club-choice')),
      agreeForSlam(`3${m}`, `Six-plus ${name(m)}; agrees trumps`, provisional, [L(m,6)], m),
      ...games(),
    ];
    case 'major-club-followup': return [
      force(`3${m}`, `Six-plus ${name(m)}`, provisional, [L(m,6)], 'major-club-choice'),
      agreeForSlam('4C', 'Agree clubs for slam investigation', provisional, [], 'C'),
      ...(last === '3D' ? [agreeForSlam('4D', 'Four-plus diamonds; agrees diamonds', provisional, [L('D',4)], 'D')] : []),
      ...games(),
    ];
    case 'major-club-choice': return [
      agreeForSlam(`3${m}`, 'Three-card support; agrees trumps', provisional, [L(m,3)], m),
      ...games(),
    ];
    case 'major-diamond-rebid': return [
      r(`2${m}`,'9–13; fewer than three diamonds','P1024',[P(9,13),L('D',0,2)],'major-diamond-continue'),
      ...(m==='H'?[force('2S','Natural reverse; four-plus spades, 14+','P1021 (inferred)',[P(14),L('S',4)],'major-diamond-continue')]:[]),
      r('2NT','14+ balanced or specified semi-balanced shapes','P1025/P1046',[P(14),OR([B,L('D',2,3)],[P(14,15),shape(m,6,2,3,2)],[P(14,15),shape(m,6,3,2,2)],[P(14,15),shape(m,6,2,2,3)],[shape(m,5,2,4,2)])],'major-diamond-enquiry'),
      force('3C','Four-plus clubs; 14+','P1026',[P(14),L('C',4)]),
      r('3D','Three/four diamonds; 9–13','P1027',[P(9,13),L('D',3,4)],'major-diamond-continue'),
      r(`3${m}`,'Six-plus major; 14+, excluding 14/15 with 6322','P1028',[P(14),L(m,6)]),
      r(`3${om}`,'Diamond support; 14+, four balanced or three-plus unbalanced','P1029',[P(14),OR([L('D',4),shape(m,5,2,2,4)],[L('D',3),U])]),
      r('3NT','Play 3NT','P1030',[],'final'),
    ];
    case 'major-diamond-enquiry': return [force('3C','Resolve shape and diamond support','P1047',[],'major-diamond-answer'),...games()];
    case 'major-diamond-answer': return [
      r('3D','Three diamonds; 14+ balanced','P1048',[P(14),B,L('D',3,3)]),
      r(`3${om}`,'Five major, four clubs, two diamonds; 14+','P1049',[P(14),shape(m,5,2,4,2)]),
      r(`3${m}`,'Six major, 6322; 14/15','P1050',[P(14,15),OR([shape(m,6,2,3,2)],[shape(m,6,3,2,2)],[shape(m,6,2,2,3)])]),
      r('3NT','Two diamonds; 14–17 balanced','P1051',[P(14,17),B,L('D',2,2)]),
      r('4NT','Two diamonds; 18/19 balanced','P1052',[P(18,19),B,L('D',2,2)]),
    ];
    case 'major-diamond-continue': return m==='H' && last==='2S' ? games() : [
      r('Pass',`Play ${last}`,'Asker chooses the contract',[],'finish'),
      ...(last!== '3D' ? [r('2NT','Natural invitation','P1033/P1040',[],'major-invitation')]:[]),
      ...(m==='H'&&last==='2H'?[force('2S','Four-plus spades; game force','P1032',[P(12),L('S',4)],'major-describe')]:[]),
      force('3C','Four-plus clubs; game force','P1034/P1041',[P(12),L('C',4)],'major-describe'),
      force('3D','Six-plus diamonds; game force','P1035/P1042',[P(12),L('D',6)],'major-describe'),
      force(`3${m}`,'Six diamonds, three-card major support; game force','P1036/P1043',[P(12),L('D',6),L(m,3,3)],'major-describe'),...games()];
    case 'major-heart-rebid': return [
      r('2S','9–13; zero–two hearts','P0996',[P(9,13),L('H',0,2)],'major-heart-continue'),
      force('2NT','Game force; balanced, semi-balanced or heart support','P0997',[P(14),OR([B,L('H',2)],[L('H',3,4)],[P(14,16),L('S',6,6),L('H',2,2),L('C',2,3),L('D',2,3)])],'major-heart-enquiry'),
      ...['C','D'].map(s=>force(`3${s}`,`Four-plus ${s==='C'?'clubs':'diamonds'}; 14+`,'P0998',[P(14),L(s,4)])),
      r('3H','Three hearts; 9–12','P0999',[P(9,12),L('H',3,3)],'major-heart-continue'),
      r('3S','Six-plus spades; 14–16, unbalanced, zero–two hearts','P1000',[P(14,16),U,L('S',6),L('H',0,2)]),
      r('3NT','Six-plus spades; 17–19','P1001',[P(17,19),L('S',6)]),
      ...['C','D'].map(s=>r(`4${s}`,`Four hearts; ${s==='C'?'club':'diamond'} shortage, 11–13`,'P1002',[P(11,13),L('H',4,4),L(s,0,1)])),
      r('4H','Three hearts; 13–15 balanced or 12–14 unbalanced','P1003',[L('H',3,3),OR([B,P(13,15)],[U,P(12,14)])],'final'),
      r('4S','Seven-plus spades; 12–14','P1004',[P(12,14),L('S',7)],'final')];
    case 'major-heart-enquiry': return [force('3C','Resolve shape and heart support','P1007',[],'major-heart-answer'),
      force('3D','Five-plus diamonds','P1013',[L('D',5)],'major-describe'),
      force('3H','Six-plus hearts; sets trumps','P1014',[L('H',6)],'major-describe'),
      force('3S','Six hearts, three spades','P1015',[L('H',6),L('S',3,3)],'major-describe'),...games()];
    case 'major-heart-answer': return [
      r('3H','Three/four hearts; too strong for immediate game','P1008',[P(14),L('H',3,4)]),
      r('3S','Six spades, two hearts, 6322; 14–16','P1009',[P(14,16),L('S',6,6),L('H',2,2),L('C',2,3),L('D',2,3)]),
      r('3NT','Two hearts; 14–17 balanced','P1010',[P(14,17),B,L('H',2,2)]),
      ...['C','D'].map(s=>r(`4${s}`,`Four hearts; ${s==='C'?'club':'diamond'} shortage, 14+`,'P1011',[P(14),L('H',4,4),L(s,0,1)])),
      r('4NT','Two hearts; 18/19 balanced','P1012',[P(18,19),B,L('H',2,2)])];
    case 'major-heart-continue': return [pass(last),
      ...(last==='2S' ? [
        r('2NT', 'Natural invitation', 'Natural continuation', [], 'major-invitation'),
        ...['C','D'].map(suit => force(`3${suit}`, `Four-plus ${suit === 'C' ? 'clubs' : 'diamonds'} alongside hearts; forcing one round`, 'Natural continuation', [L(suit,4)], 'major-describe')),
        r('3H', 'Six-plus hearts; natural invitation', 'Natural continuation', [L('H',6)], 'major-invitation'),
        force('3S', 'Three spades, six hearts; forcing', 'P0996', [L('S',3,3),L('H',6)], 'major-describe'),
      ] : []), ...games()];
    case 'major-invitation': return [r('Pass',`Play ${last}`,'Invitation judgement',[],'finish'),...games()];
    case 'major-describe': {
      if (system !== '1S' || auction[1].bid !== '2H' || auction[2].bid !== '2S' || !['3C','3D'].includes(last)) return games();
      const minor = last[1];
      return [
        r('3H', 'Heart preference with a doubleton', 'Natural continuation', [L('H',2,2)]),
        r('3S', 'Six-plus spades; natural preference', 'Natural continuation', [L('S',6)]),
        r(`4${minor}`, 'Four-plus support for the minor', 'Natural continuation', [L(minor,4)]),
        ...games(),
      ];
    }
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
  if (context.node === 'rebid' && ['3S','4S'].includes(bid)) {
    const noShortage = f.lengths.C === 2 && f.lengths.D === 2;
    const singletonHonor = ['C','D'].some(suit => f.lengths[suit] === 1 && (hand.includes(`${suit}A`) || hand.includes(`${suit}K`)));
    if (!noShortage && !singletonHonor) throw new Error('This spade raise needs 4522 or a singleton ace or king.');
  }
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
  if (node === 'weak-raise') {
    if (f.hcp >= 19) return `4${m}`;
    if (f.hcp < 15) return 'Pass';
    return first(['3C', '3D', m === 'H' ? '2S' : '3H', '2NT', `3${m}`]);
  }
  if (node === 'major-game-try') {
    const side = last[1];
    const usefulSideValue = side !== m && last !== '2NT' && ['A','K','Q'].some(rank => hand.includes(side + rank));
    if (f.hcp >= 8 || f.hcp >= 7 && (usefulSideValue || f.lengths[m] >= 4)) return `4${m}`;
    return last === `3${m}` ? 'Pass' : `3${m}`;
  }
  if (node === 'rebid' && system === '1H') {
    const spadeRaise = f.lengths.C === 2 && f.lengths.D === 2 || ['C','D'].some(suit =>
      f.lengths[suit] === 1 && (hand.includes(`${suit}A`) || hand.includes(`${suit}K`)));
    const splinters = f.hcp >= 11 && (f.hcp <= 13 || f.hcp >= 17) ? ['3D','3H'] : [];
    return first([...splinters, ...(spadeRaise ? ['3S','4S'] : []), '2NT','3C','2S','1NT','2C','2D','2H','4H']);
  }
  if (node === 'heart-spade-after-nt') {
    if (f.hcp >= 9) return first(['3H','3C','3D','3S','2C']);
    return first(['2H','2S','2D','2NT','Pass']);
  }
  if (node === 'heart-spade-range' || node === 'heart-spade-shape') return rows.find(row => truthful(row.bid))?.bid;
  if (node === 'heart-spade-after-range') {
    const minimum = last === '2H' ? 12 : last === '2D' ? 14 : 16;
    if (minimum + f.hcp < 25) return first([...(f.lengths.H >= 3 ? ['2H'] : []), ...(f.lengths.S >= 5 ? ['2S'] : []), 'Pass']);
    return '2NT';
  }
  if (node === 'heart-spade-puppet') return '3C';
  if (node === 'heart-spade-after-puppet') return 'Pass';
  if (node === 'heart-spade-after-club') return first(['Pass','3H','2H','3C','2S','2D']);
  if (node === 'heart-spade-club-resolve') return first(['2S','2NT','3H','3S','3C','2H']);
  if (node === 'heart-spade-club-game-force') return first(['3D','3S','3NT','2S','3C','2NT']);
  if (node === 'heart-spade-after-suit') {
    const hearts = f.lengths.H >= (['2H','2NT','3H'].includes(last) ? 2 : 3);
    const spades = f.lengths.S >= (last === '2S' ? 5 : 4);
    if (f.hcp >= 13) return first([...(hearts ? ['4H'] : []), ...(spades && ['2S','2NT','3S'].includes(last) ? ['4S'] : []), '3NT','4H','4S']);
    return first([...(hearts ? ['2H','3H'] : []), ...(spades ? ['2S','3S'] : []), 'Pass','3C','3NT','4H','4S']);
  }
  if(node==='major-club-rebid') return first([
    ...(isMajorBalanced(f)&&f.hcp>=15?[f.hcp>=18?'2NT':'3NT']:[]),
    ...(f.hcp>=16&&f.lengths.D>=4?['2NT']:[]),...(f.hcp>=16&&f.lengths.C>=4?['3C']:[]),
    ...(f.hcp>=14&&f.lengths[m]>=6?['A','K','Q','J','T','9'].every(rank=>hand.includes(m+rank))?[`3${m}`]:['3D']:[]),
    ...(f.hcp>=14&&f.lengths[om]>=4?[`2${om}`]:[]),f.hcp<=11?`2${m}`:'2D']);
  if(node.endsWith('-answer')) return rows.find(r=>matchesConstraints(hand,r.facts,m))?.bid;
  if(node.endsWith('-enquiry')) return '3C';
  if(node==='major-club-resolve') {
    if (last === '3C') return first([...(f.lengths[m] === 3 && f.hcp >= 12 ? ['4C', `3${m}`] : []),
      `4${m}`, '3D', `3${om}`, '3NT']);
    if(last==='3D' && truthful(`3${m}`)) return `3${m}`;
    if(last==='3NT') return f.lengths[m]>=3?`4${m}`:'Pass';
    if(last==='2D' && truthful(`2${om}`)) return `2${om}`;
    if(last===`2${m}`&&f.hcp<=11) return 'Pass';
    if(last==='2D'&&f.lengths[m]===3&&f.hcp<=11) return `2${m}`;
    if(last===`2${om}`&&f.lengths[m]===3&&f.hcp<=11) return `4${m}`;
    if(f.lengths[m]>=3) return `4${m}`;
    return first([...(isMajorBalanced(f)?[f.lengths.D===5?'3D':'2NT']:[]),'3C','3NT']);
  }
  if (node === 'major-club-detail') return first([`3${m}`, '2NT', '3C', '3D', `3${om}`, `4${m}`]);
  if (node === 'major-club-followup') return first([`3${m}`, '4D', ...(f.lengths.C >= 5 ? ['4C'] : []), '3NT']);
  if (node === 'major-club-choice') return first([`3${m}`, ...(f.lengths[m] >= 3 ? [`4${m}`] : []), '3NT']);
  if(node==='major-diamond-rebid') {
    if(f.hcp<=13) return first(['3D',`2${m}`]);
    return first(['2NT',...(f.lengths.D>=3?[`3${om}`]:[]),...(m==='H'?['2S']:[]),`3${m}`,'3C','3NT']);
  }
  if(node==='major-heart-rebid') return first([
    ...(f.lengths.H===3?['4H','3H']:[]),...(f.hcp<=13?['2S','4C','4D','4S']:[]),
    ...(isMajorBalanced(f)||Object.values(f.lengths).sort().join('')==='2236'||f.lengths.H>=3?['2NT']:[]),
    '3NT','3S','3C','3D']);
  if(node==='major-invitation') {
    if (f.hcp <= 11) return 'Pass';
    if (last === '2NT') return '3NT';
    if (auction.length === 2) {
      const strain = last[1];
      if (strain === m) return `4${m}`;
      if (strain === 'H') return f.lengths.H >= 2 ? '4H' : '3NT';
      return f.lengths[strain] >= 3 ? `5${strain}` : '3NT';
    }
    if (last === '3H' && auction[1].bid === '2H') return f.lengths.H >= 2 ? '4H' : '3NT';
    return last === '3C' ? '3NT' : `4${last === '2S' || last === '3S' ? 'S' : m}`;
  }
  if(node==='major-describe') {
    const response=auction[1].bid;
    if (system === '1S' && response === '2H' && auction[2].bid === '2S') {
      if (last === '3S') return '4S';
      return first([`4${last[1]}`, '3H', '3S', '3NT']);
    }
    if(last===`3${m}`||response==='2C'&&last===`2${om}`) return `4${m}`;
    if(last==='3H'&&response==='2H') return '4H';
    if(last==='2S'&&f.lengths.S>=4) return '4S';
    if(last==='3C'&&f.lengths.C>=4) return '5C';
    if(last==='3D'&&f.lengths.D>=3) return '5D';
    return '3NT';
  }
  if(node==='major-diamond-continue') {
    if(m==='H' && last==='2S') return f.lengths.S>=4?'4S':'3NT';
    return f.hcp<=11?'Pass':first([...(f.lengths.D>=6?['3D']:[]),'3NT']);
  }
  if(node==='major-heart-continue') {
    if (last === '3H') return f.hcp <= 11 ? 'Pass' : '4H';
    return first([...(f.hcp >= 12 ? ['3S','3D','3C'] : []), ...(f.lengths.H >= 6 ? ['3H'] : []),
      f.hcp >= 12 ? '3NT' : 'Pass']);
  }
  if(node==='major-choice') {
    const response=auction[1].bid;
    if(last==='3NT'||last==='4NT') return 'Pass';
    if (system === '1S' && response === '2H' && auction[2].bid === '2S') {
      if (last === '3H' && f.lengths.H >= 6 && f.hcp >= 13) return '4H';
      if (last === '3S' && f.lengths.S >= 2 && f.hcp >= 13) return '4S';
      if (['4C','4D'].includes(last) && f.hcp >= 14) return `5${last[1]}`;
      return 'Pass';
    }
    if(response==='2H' && ['3H','4C','4D'].includes(last)) return '4H';
    if(response==='1S') {
      if(last==='3S' && f.lengths.S>=5) return '4S';
      if(last==='3H' && f.lengths.H>=2) return '4H';
    }
    if(response==='2D' && (last==='3D'||last===`3${om}`&&auction.length===3)) return '5D';
    if(f.lengths[m]>=2&&last===`3${m}`) return `4${m}`;
    return first(['3NT',`4${m}`,'5D']);
  }
  throw new Error('No ordinary major-opening policy for this node.');
}
