// First/second-seat 2NT continuations, P1311–P1429, also used after a strong 2C rebid.
// Options contain public facts only. A checker/bot receives the acting hand,
// never the other hand. Shared KC/queen/suit ladders retain their own facts.
import { handFeatures, matchesConstraints, bidIndex } from './core.js';
import { declarerFor } from './profile-utils.js';
import { keycardAction, postRangeActions, applyPostRangeBid } from './continuations.js';

const suits = ['S','H','D','C'];
const names = { S:'Spades', H:'Hearts', D:'Diamonds', C:'Clubs' };
const opponent = seat => seat === 'North' ? 'South' : 'North';
const game = suit => `${'CD'.includes(suit) ? 5 : 4}${suit}`;
const kickback = suit => ({C:'4D',D:'4H',H:'4S',S:'4NT'})[suit];
const length = (suit,min,max) => ({type:'length',suit,min,...(max===undefined?{}:{max})});
const points = (min,max) => ({type:'hcp',min,max});
const control = suit => ({type:'anyOf',options:[[{type:'card',suit,rank:'A'}],[{type:'card',suit,rank:'K'}],[length(suit,0,1)]]});
const row = (bid,label,next='final',facts=[],extra={}) => ({bid,label,kind:'opening',next,facts,source:'P1311–P1429',...extra});
const play = bid => row(bid,`Play ${bid}`);
const quant = () => row('4NT','Quantitative invitation','nt-quant',[],{source:'P1322/P1342/P1358/P1378/P1391/P1403'});
const cue = (bid,trump,extra={}) => row(bid,`${names[trump]} fit; ${names[bid.slice(1)].toLowerCase()} control`,'nt-cue',[control(bid.slice(1))],{updates:{major:trump,...extra}});
const agree = (bid,trump,label,facts=[],extra={}) => row(bid,label,'nt-cue',facts,{updates:{major:trump,...extra}});
const shape = hand => handFeatures(hand,'C');
const freeze = value => {
  if (value && typeof value==='object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const NT_SHAPES = [];
for(let S=2;S<=5;S++)for(let H=2;H<=5;H++)for(let D=2;D<=5;D++) {
  const C=13-S-H-D;
  if(C>=2 && ['4333','4432','5332'].includes([S,H,D,C].sort((a,b)=>b-a).join(''))) NT_SHAPES.push(`${S}${H}${D}${C}`);
}
Object.freeze(NT_SHAPES);

export const NT_NODES = ['open','respond','muppet','four-major','fit-major','both-majors','no-major','puppet-nt',
  'shown-five','transfer','after-transfer','pick-game','super-fit','retransfer','minor-stayman','shown-minor','final',
  'nt-both-slam','nt-after-puppet','nt-delayed-minors','nt-delayed-minor-choice','nt-muppet-no-fit','nt-find-minor',
  'nt-minor-invite','nt-transfer-minor','nt-major-shape','nt-55-game','nt-54-try','nt-54-force','nt-55-try','nt-55-force',
  'nt-minors-shortage','nt-minors-choice','nt-cue','nt-after-game','nt-quant','nt-answer','nt-continue'];
const northNodes = ['open','muppet','fit-major','both-majors','puppet-nt','transfer','pick-game','retransfer','minor-stayman',
  'nt-both-slam','nt-delayed-minors','nt-find-minor','nt-minor-invite','nt-transfer-minor','nt-major-shape','nt-55-game',
  'nt-54-try','nt-54-force','nt-55-try','nt-55-force','nt-minors-shortage','nt-quant'];
const variableNodes = ['final','nt-cue','nt-answer','nt-continue'];

export function usesTwoNotrump(system, auction) {
  return system === '2NT' || (system === '2C' && auction[0]?.bid === '2C'
    && ['2D', '2H', '2S'].includes(auction[1]?.bid) && auction[2]?.bid === '2NT');
}

function resumeTwoNotrump(ctx) {
  // Earlier saves had natural game choices at this exact rebid.
  return ctx.system === '2C' && ctx.node === 'strong-game' && ctx.auction.length === 3
    ? { ...ctx, node: 'respond' } : ctx;
}

function context(session) {
  return resumeTwoNotrump({...session.opening,auction:session.auction,publicConstraints:session.openingConstraintsBySeat ?? {North:[],South:[]}});
}
function relayState(ctx,trump=ctx.major) {
  return {familyId:'opening-2NT',phase:'keycard',trump,major:trump,balanced:null,shortageSuit:null,
    relayPolicy:{skip3NT:true,skipMajorGame:true},
    constraints:ctx.publicConstraints?.[opponent(ctx.seat)] ?? [],
    auction:ctx.auction,playerSeat:ctx.seat,partnerSeat:opponent(ctx.seat),...ctx.relayState};
}
function keycards(ctx,bid,trump=ctx.major) {
  const ask=keycardAction({...relayState(ctx,trump),trump,major:trump,phase:'keycard'},bid,trump,'normal');
  return ask && row(bid,ask.label,'nt-answer',[],{source:'Kickback; P1456/P1462',relayAction:ask,updates:{major:trump},responseLadder:ask.responseLadder});
}
function cueOptions(ctx) {
  const trump=ctx.major, rows=[keycards(ctx,ctx.kickbackBid ?? kickback(trump)),play(game(trump))];
  if ('CD'.includes(trump) && !rows.some(r=>r?.bid==='4NT')) rows.push(play('4NT'));
  if(ctx.retransfers && ctx.seat==='South' && 'HS'.includes(trump))
    rows.push(row(trump==='H'?'4D':'4H',`Re-transfer to ${names[trump]}`,'retransfer',[],{updates:{major:trump}}));
  for(const level of [4,5])for(const suit of ['C','D','H','S']) {
    const bid=`${level}${suit}`;
    if(suit!==trump && bidIndex(bid)<bidIndex(game(trump)) && !rows.some(r=>r?.bid===bid)) rows.push(cue(bid,trump,{kickbackBid:ctx.kickbackBid,retransfers:ctx.retransfers}));
  }
  return rows;
}
function minorInvite(ctx,minor,minimum,kind) {
  return row(`4${minor}`,`${minimum ? `${minimum}+ ${names[minor].toLowerCase()}; ` : ''}slam try`,'nt-minor-invite',minimum?[length(minor,minimum)]:[],
    {updates:{major:minor,minorMinimum:minimum||5,minorRoute:kind},source:'P1338/P1339/P1356/P1357/P1401'});
}
function ntTable(ctx) {
  const {node,major,seat,auction}=ctx;
  const last=auction.at(-1)?.bid;
  switch(node) {
    case 'open': return [row('2NT','20–22 balanced','respond',[points(20,22),{type:'shapes',values:NT_SHAPES},{type:'balanced'}],{source:'P1312'})];
    case 'respond': return [row('3C','Muppet Stayman','muppet',[],{source:'P1315'}),
      ...['H','S'].map(suit=>row(suit==='H'?'3D':'3H',`Five-plus ${names[suit].toLowerCase()}; transfer`,'transfer',[length(suit,5)],{updates:{major:suit},source:'P1316'})),
      row('3S','Minor-suit Stayman','minor-stayman',[],{source:'P1317'}),play('3NT'),
      row('4C','Diamond slam try','nt-minor-invite',[],{updates:{major:'D',minorMinimum:5,minorRoute:'opposite'},source:'P1319'}),
      row('4D','Club slam try','nt-minor-invite',[],{updates:{major:'C',minorMinimum:5,minorRoute:'opposite'},source:'P1319'}),
      row('4H','Transfer to 4S','retransfer',[length('S',5)],{updates:{major:'S'},source:'P1320'}),play('4S'),quant()];
    case 'muppet': return [row('3D','One/both four-card majors','four-major',[{type:'anyOf',options:[[length('H',4,4)],[length('S',4,4)]]},length('H',0,4),length('S',0,4)]),
      row('3H','No four/five-card major','no-major',[length('H',0,3),length('S',0,3)]),
      ...['S','H'].map(suit=>row(suit==='S'?'3S':'3NT',`Five ${names[suit].toLowerCase()}`,'shown-five',[length(suit,5,5)],{updates:{major:suit},source:'P1327/P1328'}))];
    case 'four-major': return [row('3H','Four spades','fit-major',[length('S',4,4)],{updates:{major:'S'},source:'P1330'}),
      row('3S','Four hearts','fit-major',[length('H',4,4)],{updates:{major:'H'},source:'P1331'}),play('3NT'),
      row('4C','4/4 majors; slam interest','nt-both-slam',[length('H',4,4),length('S',4,4)],{source:'P1333'}),
      row('4D','4/4 majors; game choice','both-majors',[length('H',4,4),length('S',4,4)],{source:'P1334'})];
    case 'fit-major': return [row('3NT','No fit; offer 3NT','nt-muppet-no-fit',[length(major,0,3)],{source:'P1355'}),
      ...(major==='S'?[agree('3S','S','Spade fit; decent for slam',[length('S',4)],{retransfers:true})]
        :['4C','4D'].map(bid=>({...cue(bid,'H',{retransfers:true}),facts:[length('H',4),control(bid.slice(1))]}))),
      row(game(major),`${names[major]} fit; poor for slam`,'nt-after-game',[length(major,4)],{updates:{major},source:'P1330/P1331'})];
    case 'both-majors': return ['H','S'].map(suit=>row(`4${suit}`,`Four ${names[suit].toLowerCase()}; play 4${suit}`,'nt-after-game',[length(suit,4)],{updates:{major:suit}}));
    case 'nt-both-slam': return [row('4D','Spade fit; no slam interest','super-fit',[length('S',4)],{updates:{major:'S'},source:'P1361'}),
      row('4H','Heart fit; no slam interest','nt-after-game',[length('H',4)],{updates:{major:'H'},source:'P1362'}),
      ...[['4S','H'],['4NT','S']].map(([bid,suit])=>({...keycards(ctx,bid,suit),facts:[length(suit,4)],source:'P1363'}))];
    case 'no-major': return [row('3S','Puppet to 3NT; denies five spades/four hearts','puppet-nt',[],{source:'P1336'}),
      row('3NT','Five spades/four hearts; game choice','pick-game',[length('S',5,5),length('H',4,4)],{updates:{major:'S'},source:'P1337'}),
      minorInvite(ctx,'C',5,'natural'),minorInvite(ctx,'D',5,'natural'),
      row('4H','Five spades/four hearts; non-forcing slam try','nt-54-try',[length('S',5,5),length('H',4,4)],{source:'P1340'}),
      row('4S','Five spades/four hearts; slam force','nt-54-force',[length('S',5,5),length('H',4,4)],{source:'P1341'}),quant()];
    case 'puppet-nt': return [row('3NT','Puppet acceptance','nt-after-puppet',[],{source:'P1343'})];
    case 'nt-after-puppet': return [row('4C','Minor-suit Stayman','nt-delayed-minors',[],{source:'P1345'}),
      ...[['4H','nt-55-try'],['4S','nt-55-force']].map(([bid,next])=>row(bid,`Five-plus/five-plus majors; ${bid==='4H'?'non-forcing slam try':'slam force'}`,next,[length('S',5),length('H',5)],{source:'P1346/P1347'}))];
    case 'nt-delayed-minors': return [row('4D','Four-plus in both minors','nt-delayed-minor-choice',[length('C',4),length('D',4)],{updates:{minorPair:true},source:'P1349'}),
      ...[['4H','C'],['4S','D']].map(([bid,suit])=>row(bid,`Five-plus ${names[suit].toLowerCase()}`,'nt-delayed-minor-choice',[length(suit,5)],{updates:{major:suit,minorPair:false},source:'P1350/P1351'})),
      row('4NT','3343 or 3334','final',[{type:'shapes',values:['3343','3334']}],{source:'P1352'})];
    case 'nt-delayed-minor-choice': return ctx.minorPair?[keycards(ctx,'4H','C'),keycards(ctx,'4S','D'),play('4NT'),play('5C'),play('5D')]
      :[keycards(ctx,major==='C'?'4S':'5C',major),play('4NT'),play(game(major))];
    case 'nt-muppet-no-fit': return [minorInvite(ctx,'C',5,'natural'),minorInvite(ctx,'D',5,'natural'),quant(),row('5NT','Bid a four-card minor','nt-find-minor',[],{source:'P1359'})];
    case 'nt-find-minor': return [row('6C','Four-plus clubs; play 6C','final',[length('C',4)]),row('6D','Four-plus diamonds; play 6D','final',[length('D',4)]),play('6NT')];
    case 'shown-five': return [play('3NT'),play(`4${major}`),...['4C','4D'].map(bid=>({...cue(bid,major),facts:[length(major,3),control(bid.slice(1))],source:'P1354'})),keycards(ctx,kickback(major),major)];
    case 'transfer': return [row(`3${major}`,`${names[major]} transfer acceptance; at most three-card support`,'after-transfer',[length(major,0,3)],{source:'P1364'}),
      row(major==='H'?'3S':'4C',`Four/five ${names[major]}; decent for slam`,'super-fit',[length(major,4,5)],{source:'P1369'}),
      row('3NT',`Three ${names[major]}; great for slam (judgement)`,'super-fit',[length(major,3,3),{type:'shapes',values:NT_SHAPES.filter(s=>s.split('').sort().join('')!=='3334')}],{source:'P1365'}),
      row(`4${major}`,`Four/five ${names[major]}; poor for slam`,'nt-after-game',[length(major,4,5)],{source:'P1367'}),
      ...(major==='H'?['4C','4D']:['4D','4H']).map(bid=>({...row(bid,`Four/five ${names[major]}; ${names[bid.slice(1)].toLowerCase()} control`,'super-fit',[length(major,4,5),control(bid.slice(1))]),source:'P1368'}))];
    case 'after-transfer': return [row('3NT','Offer choice of 3NT or major game','pick-game'),play(`4${major}`),
      major==='H'?row('3S','Five hearts/four spades','nt-major-shape',[length('H',5,5),length('S',4,4)],{source:'P1372'})
        :row('4H','Five-plus spades/hearts; game values','nt-55-game',[length('S',5),length('H',5)],{source:'P1389'}),
      ...['C','D'].map(minor=>row(`4${minor}`,`Four-plus ${names[minor].toLowerCase()}; slam interest`,'nt-transfer-minor',[length(minor,4)],{updates:{minor},source:major==='H'?'P1374/P1375':'P1387/P1388'})),
      ...(major==='H'?[keycards(ctx,'4S','H')]:[]),quant(),
      ...['C','D'].map(suit=>row(`5${suit}`,`${names[suit]} void; Exclusion (responses unconfirmed)`,'boundary',[],{source:'P1379/P1380/P1392/P1393'}))];
    case 'pick-game': return [row('Pass','Choose 3NT','finish'),row(`4${major}`,`Three-card fit; choose 4${major}`,'final',[length(major,3)])];
    case 'super-fit': return [row(major==='H'?'4D':'4H',`Re-transfer to ${names[major]}`,'retransfer',[],{source:'P1370'}),play(`4${major}`),
      ...cueOptions({...ctx,retransfers:true}).filter(r=>r && r.bid!==`4${major}` && r.next!=='retransfer')];
    case 'retransfer': return [row(`4${major}`,`Accept re-transfer to ${names[major]}`,'nt-after-game',[],{source:'P1370/P1427'})];
    case 'nt-after-game': return [keycards(ctx,kickback(major),major),
      ...('HS'.includes(major)?['C','D',...(major==='S'?['H']:[])].map(suit=>row(`5${suit}`,`${names[suit]} void; Exclusion (responses unconfirmed)`,'boundary',[],{source:'P1429'})):[])];
    case 'nt-major-shape': return [play('3NT'),
      agree('4C','H','Heart fit; decent for slam',[length('H',3)],{retransfers:true}),
      agree('4D','S','Spade fit; decent for slam',[length('S',4)],{retransfers:true}),
      row('4H','Heart fit; poor for slam','nt-after-game',[length('H',3)],{updates:{major:'H'}}),
      row('4S','Spade fit; poor for slam','nt-after-game',[length('S',4)],{updates:{major:'S'}})];
    case 'nt-55-game': return [row('Pass','Play 4H','finish'),row('4S','Choose spades','final',[length('S',3)])];
    case 'nt-54-try': return [row('4S','Three spades; play 4S','final',[length('S',3,3)]),play('4NT')];
    case 'nt-54-force': return [row('4NT','No spade fit','nt-minors-choice',[length('S',0,2)]),
      ...['5C','5D','5H'].map(bid=>({...cue(bid,'S'),facts:[length('S',3,3),control(bid.slice(1))]}))];
    case 'nt-55-try': return [play('4S'),keycards(ctx,'4NT','S')];
    case 'nt-55-force': return [keycards(ctx,'4NT','S')];
    case 'minor-stayman': return [row('3NT','No four/five-card minor, or unsuitable hand','shown-minor',[],{updates:{major:null},source:'P1396'}),
      ...[['4C','C',4],['4D','D',4],['4H','C',5],['4S','D',5]].map(([bid,suit,n])=>row(bid,`${n===4?'Four':'Five'} ${names[suit].toLowerCase()}`,'shown-minor',[length(suit,n,n)],{updates:{major:suit,minorReply:bid},source:'P1397–P1399'}))];
    case 'shown-minor': {
      if(!major)return [minorInvite(ctx,'C',5,'natural'),minorInvite(ctx,'D',5,'natural'),
        ...['H','S'].map(suit=>row(`4${suit}`,`Five-plus/five-plus minors; ${names[suit].toLowerCase()} shortage`,'nt-minors-shortage',[length('C',5),length('D',5),length(suit,0,1)],{source:'P1402'})),quant()];
      const five=['4H','4S'].includes(ctx.minorReply ?? last);
      return [keycards(ctx,five?'4NT':kickback(major),major),play(game(major)),
        ...(five?cueOptions({...ctx,kickbackBid:'4NT'}).filter(r=>r && !['nt-answer','final'].includes(r.next))
          :['H','S'].filter(s=>s!== (major==='D'?'H':null)).map(suit=>agree(`4${suit}`,major,`${names[suit]} shortage; ${names[major].toLowerCase()} agreed`,[length(suit,0,1)],{kickbackBid:kickback(major)}))),
        ...(!five&&major==='D'?[agree('4NT','D','Heart shortage; diamonds agreed',[length('H',0,1)])]:[])];
    }
    case 'nt-minor-invite': {
      const opposite=ctx.minorRoute==='opposite';
      const kc=opposite?(major==='D'?'4D':'4H'):kickback(major);
      return [{...keycards(ctx,kc,major),facts:[length(major,3)]},play('4NT'),row(game(major),`${names[major]} fit; poor for slam`,'final',[length(major,3)]),
        ...(opposite&&major==='D'?['4H','4S','5C']:opposite?['4S']:suits.map(s=>`4${s}`).filter(b=>b!==kc && b!==`4${major}`)).map(bid=>({...cue(bid,major,{kickbackBid:opposite&&major==='D'?'4NT':kc}),facts:[length(major,3),control(bid.slice(1))]}))];
    }
    case 'nt-transfer-minor': {
      const minor=ctx.minor,rows=[play(`4${major}`)];
      if(major==='H')rows.push(play('4NT'),keycards(ctx,'4S','H'));
      else rows.push(keycards(ctx,'4NT','S'));
      if(!(major==='H' && minor==='D'))rows.push(keycards(ctx,kickback(minor),minor));
      if(minor==='D')rows.push(cue('5C','D'));
      else if(major==='S')rows.push(cue('4H','C'));
      rows.push(play(game(minor)));
      return rows;
    }
    case 'nt-minors-shortage': return [row('4NT','Good for slam; both minors in view','nt-minors-choice',[],{source:'P1402'}),play('5C'),play('5D')];
    case 'nt-minors-choice': return [play('5C'),play('5D'),play('6C'),play('6D'),play('6NT')];
    case 'nt-cue': return cueOptions(ctx);
    case 'nt-quant': return [row('Pass','Decline quantitative invitation','finish'),play('6NT')];
    case 'nt-answer': return ctx.relayAction.responseLadder.map(answer=>row(answer.bid,answer.label,'nt-continue',[],{source:ctx.relayAction.askType==='keycard'?'P1456/P1462':'Shared queen/specific-suit responses'}));
    case 'nt-continue': return postRangeActions({...relayState(ctx),auction}).map(ask=>row(ask.bid,ask.label,'nt-answer',[],{relayAction:ask,responseLadder:ask.responseLadder}));
    case 'final': return [];
    default: throw new Error('Unknown 2NT continuation.');
  }
}

function legalRows(ctx) {
  const last=ctx.auction.findLast(call=>call.bid!=='Pass');
  const rows=ntTable(ctx).filter(Boolean);
  // Reserve an explicit source meaning before adding ordinary contract choices.
  if(!['open','nt-answer'].includes(ctx.node)) {
    if((ctx.seat==='South'||['nt-cue','nt-continue','final'].includes(ctx.node))&&!rows.some(r=>r.bid==='Pass'))
      rows.push(row('Pass',last?`Play ${last.bid}`:'Pass','finish'));
    if(ctx.node==='final' || ctx.seat==='South' || ['nt-cue','nt-continue'].includes(ctx.node)) {
      for(const level of [6,7])for(const strain of ['C','D','H','S','NT'])rows.push(play(`${level}${strain}`));
      if(ctx.major && ['nt-cue','nt-continue'].includes(ctx.node))rows.push(play(game(ctx.major)));
    }
  }
  const unique=new Map();
  for (const item of rows) {
    if (ctx.system === '2C') {
      // P1309 reserves keycard for opener, including after the notrump rebid.
      if (ctx.seat === 'South' && (item.relayAction || item.next === 'boundary')) continue;
      if (item.bid === 'Pass' && last && bidIndex(last.bid) < bidIndex(last.bid.endsWith('NT') ? '3NT' : game(last.bid.slice(1)))) continue;
    }
    if ((item.bid === 'Pass' || !last || bidIndex(item.bid) > bidIndex(last.bid)) && !unique.has(item.bid)) unique.set(item.bid,item);
  }
  return [...unique.values()];
}
export function ntOpeningActions(session) { return legalRows(context(session)); }

const relayFields = ['phase','major','trump','balanced','shortageSuit','relayPolicy','constraints','remainingAskSuits','queenAskAllowed','keycardScheme','agreementOptions'];
function resolveAnswer(ctx,hand) {
  const state={...ctx.relayState,auction:ctx.auction.slice(0,-1),partnerHand:hand,playerSeat:opponent(ctx.seat),partnerSeat:ctx.seat};
  const ask=ctx.relayAction;
  return applyPostRangeBid(state,ask.bid,['keycard','shortage-keycard'].includes(ask.askType)?ask:undefined);
}
export function applyNtOpeningCall(session,bid) {
  const ctx=context(session),option=legalRows(ctx).find(r=>r.bid===bid);
  if(!option)throw new Error('This call has no documented 2NT continuation.');
  const hand=ctx.seat===session.playerSeat?session.playerHand:session.partnerHand;
  const f=shape(hand);
  if(ctx.node==='transfer' && bid===`3${ctx.major}` && f.lengths[ctx.major]>3)throw new Error('Four/five-card support requires a super-accept.');
  if(ctx.node==='transfer' && bid==='3NT' && f.lengths[ctx.major]!==3)throw new Error('The 3NT super-accept shows exactly three-card support.');
  if(ctx.node==='transfer' && bid==='3NT' && f.shape.join('')==='4333')throw new Error('The three-card super-accept excludes 4333.');
  if(ctx.node==='no-major' && bid==='3S' && f.lengths.S===5 && f.lengths.H===4)throw new Error('With five spades/four hearts, use the direct 3NT game choice or the 4H/4S slam routes.');
  if(!matchesConstraints(hand,option.facts,ctx.major||'C'))throw new Error(`${option.label} does not match your hand.`);
  if(ctx.node==='muppet' && bid!==ntOpeningPartnerBid({...ctx,hand}))throw new Error('This Muppet answer does not match your four/five-card majors.');
  const next={...session,opening:{...session.opening,...option.updates,node:option.next,seat:opponent(ctx.seat)},
    openingFacts:{North:[...session.openingFacts.North],South:[...session.openingFacts.South]},
    openingConstraintsBySeat:{North:[...(session.openingConstraintsBySeat?.North??[])],South:[...(session.openingConstraintsBySeat?.South??[])]},
    auction:[...session.auction,{seat:ctx.seat,bid,meaning:option.label,source:option.source,
      callAlternatives:legalRows(ctx).map(({bid,label})=>({bid,label})),...(option.responseLadder?{responseLadder:option.responseLadder}: {})}]};
  next.openingFacts[ctx.seat].push(option.label);
  next.openingConstraintsBySeat[ctx.seat].push(...option.facts.map(fact=>({...fact,label:option.label,source:option.source})));
  if(option.relayAction) {
    const state=ctx.node==='nt-continue'?relayState(ctx):relayState({...ctx,relayState:null},option.updates?.major??ctx.major);
    next.opening.relayState=Object.fromEntries(relayFields.filter(k=>state[k]!==undefined).map(k=>[k,state[k]]));
    next.opening.relayAction=option.relayAction;
    next.opening.relayAsker=ctx.seat;
  }
  if(ctx.node==='nt-answer') {
    const result=resolveAnswer(ctx,hand),answer=result.auction.at(-1);
    if(bid!==answer.bid)throw new Error('That response does not match your hand. Try again, or review the response meanings.');
    const newFacts=result.constraints.slice(ctx.relayState.constraints.length);
    next.openingConstraintsBySeat[ctx.seat].push(...newFacts);
    next.opening.relayState=Object.fromEntries(relayFields.filter(k=>result[k]!==undefined).map(k=>[k,result[k]]));
    next.opening.major=result.trump;
    delete next.opening.relayAction;
  }
  if(next.opening.major) { next.major=next.opening.major; next.trump=next.major; }
  next.constraints=next.openingConstraintsBySeat[next.partnerSeat];
  next.opening.publicConstraints=next.openingConstraintsBySeat;
  if(option.next==='boundary')return freeze({...next,phase:'coverage-boundary',finished:true,coverageBoundary:true,undiscussedBid:bid,
    unsupportedReason:'The notes name Exclusion here but do not specify its reply ladder. Recorded for partnership clarification.'});
  if(option.next==='finish') {
    const last=next.auction.findLast(c=>c.bid!=='Pass');
    next.opening=null;next.phase='finished';next.finished=true;next.pendingAsk=null;
    next.contract={bid:last.bid,level:Number(last.bid[0]),strain:last.bid.slice(1),declarer:declarerFor(next.auction,last.bid.slice(1),last.seat)};
    if(names[next.contract.strain])next.major=next.trump=next.contract.strain;
  }
  return freeze(next);
}

/** Disclosed practice policy: 11+ responder explores a fit. Accept a quant
 * invitation with 22 over the opening or 25+ after the strong 2C rebid. */
export function ntOpeningPartnerBid(input) {
  const ctx = resumeTwoNotrump(input);
  const {node,major,hand}=ctx,f=shape(hand),n=f.lengths;
  const options=legalRows(ctx);
  const admissible=options.filter(r=>matchesConstraints(hand,r.facts,major||'C'));
  const has=bid=>admissible.some(r=>r.bid===bid);
  const choose=(...bids)=>bids.find(has);
  const slam=f.hcp>=11;
  const maximum = ctx.system === '2C' ? f.hcp >= 25 : f.hcp === 22;
  let bid;
  if(node==='open')bid='2NT';
  else if(node==='respond')bid=Math.max(n.S,n.H)>=5?(n.S>=5 && (n.S>n.H || n.H>=5)?'3H':'3D')
    :Math.max(n.S,n.H)>=4?'3C':slam&&(n.C>=4||n.D>=4)?'3S':'3NT';
  else if(node==='muppet')bid=n.S===5?'3S':n.H===5?'3NT':Math.max(n.S,n.H)===4?'3D':'3H';
  else if(node==='four-major')bid=n.S===4&&n.H===4&&slam?'4C':n.S===4?'3H':n.H===4?'3S':'3NT';
  else if(node==='fit-major')bid=n[major]>=4?`4${major}`:'3NT';
  else if(node==='both-majors')bid=n.H>=4?'4H':'4S';
  else if(node==='nt-both-slam')bid=n.H>=4?'4H':'4D';
  else if(node==='no-major')bid=n.S===5&&n.H===4?(slam?'4H':'3NT'):slam&&n.C>=5?'4C':slam&&n.D>=5?'4D':'3S';
  else if(node==='puppet-nt')bid='3NT';
  else if(node==='nt-after-puppet')bid=slam&&n.S>=5&&n.H>=5?'4H':slam&&Math.max(n.C,n.D)>=4?'4C':'Pass';
  else if(node==='shown-five')bid=n[major]>=3?(slam?choose(kickback(major),`4${major}`):`4${major}`):choose('3NT','Pass');
  else if(node==='transfer')bid=n[major]>=4?(major==='H'?'3S':'4C'):`3${major}`;
  else if(node==='after-transfer')bid=(slam?choose('4C','4D'):null)
    ??choose(major==='H'?'3S':'4H',n[major]>=6?`4${major}`:'3NT');
  else if(node==='pick-game')bid=n[major]>=3?`4${major}`:'Pass';
  else if(node==='super-fit')bid=slam?choose(kickback(major),major==='H'?'4D':'4H',game(major)):choose(major==='H'?'4D':'4H',game(major));
  else if(node==='retransfer')bid=`4${major}`;
  else if(node==='nt-after-game')bid=slam?choose(kickback(major),'Pass'):'Pass';
  else if(node==='minor-stayman')bid=n.C===5?'4H':n.D===5?'4S':n.C===4?'4C':n.D===4?'4D':'3NT';
  else if(node==='shown-minor')bid=major?(slam?choose(['4H','4S'].includes(ctx.minorReply??ctx.auction.at(-1).bid)?'4NT':kickback(major),game(major)):game(major))
    :slam&&n.C>=5?'4C':slam&&n.D>=5?'4D':'Pass';
  else if(node==='nt-delayed-minors')bid=n.C>=4&&n.D>=4?'4D':n.C>=5?'4H':n.D>=5?'4S':'4NT';
  else if(node==='nt-delayed-minor-choice') {
    const preferredMinor = n.C >= n.D ? 'C' : 'D';
    bid = ctx.minorPair ? choose(preferredMinor === 'C' ? '4H' : '4S', game(preferredMinor))
      : choose(major==='C'?'4S':'5C',game(major));
  }
  else if(node==='nt-muppet-no-fit')bid=slam&&n.C>=5?'4C':slam&&n.D>=5?'4D':'Pass';
  else if(node==='nt-find-minor')bid=choose('6C','6D','6NT');
  else if(node==='nt-minor-invite')bid=n[major]>=3?admissible.find(r=>r.relayAction)?.bid??game(major):'4NT';
  else if(node==='nt-transfer-minor')bid=n[ctx.minor]>=4?admissible.find(r=>r.relayAction?.trump===ctx.minor)?.bid??choose('5C',game(ctx.minor))
    :n[major]>=3?choose(kickback(major),`4${major}`):major==='S'?choose('4S'):choose('4NT','4H');
  else if(node==='nt-major-shape')bid=n.S>=4?'4S':n.H>=3?'4H':'3NT';
  else if(node==='nt-55-game')bid=n.S>n.H?choose('4S','Pass'):'Pass';
  else if(node==='nt-54-try')bid=n.S===3?'4S':'4NT';
  else if(node==='nt-54-force')bid=n.S===3?admissible.find(r=>r.next==='nt-cue')?.bid:'4NT';
  else if(node==='nt-55-try')bid='4S';
  else if(node==='nt-55-force')bid='4NT';
  else if(node==='nt-minors-shortage')bid=maximum?'4NT':n.C>=n.D?'5C':'5D';
  else if(node==='nt-minors-choice')bid=n.C>=n.D?'6C':'6D';
  else if(node==='nt-quant')bid=maximum?'6NT':'Pass';
  else if(node==='nt-answer')bid=resolveAnswer(ctx,hand).auction.at(-1).bid;
  else if(node==='nt-continue')bid=admissible.find(r=>r.relayAction)?.bid??choose(game(major),`6${major}`,`7${major}`,'6NT','7NT','Pass');
  else if(node==='nt-cue')bid=admissible.find(r=>r.relayAction)?.bid??choose(game(major),`6${major}`,'Pass');
  else if(node==='final')bid='Pass';
  if(!bid || !has(bid))throw new Error(`No compatible automatic 2NT continuation at ${node}: ${ctx.auction.map(c=>c.bid).join('–')}.`);
  return bid;
}

export function validateNtOpening(session) {
  if(!session.opening)return;
  const o=context(session);
  if(!NT_NODES.includes(o.node))throw new Error('Saved opening node is invalid.');
  if(!variableNodes.includes(o.node)&&o.seat!==(northNodes.includes(o.node)?'North':'South'))throw new Error('Saved opening seat is invalid.');
  if(o.major!==null && !Object.hasOwn(names,o.major))throw new Error('Saved opening suit is invalid.');
  if(['nt-answer','nt-continue'].includes(o.node)) {
    if(!['North','South'].includes(o.relayAsker)||o.seat!==(o.node==='nt-answer'?opponent(o.relayAsker):o.relayAsker)
      || !o.relayState || !Array.isArray(o.relayState.constraints)||!names[o.relayState.trump])throw new Error('Saved keycard continuation is invalid.');
    if(o.node==='nt-answer' && (!o.relayAction?.responseLadder?.length || o.relayAction.bid!==session.auction.at(-1)?.bid))throw new Error('Saved keycard question is invalid.');
  }
  ntOpeningActions(session);
  if(!session.finished && o.seat!==session.wholeAuction.humanSeat)throw new Error('Saved opening turn is invalid.');
}
