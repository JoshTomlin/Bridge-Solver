import test from 'node:test';
import assert from 'node:assert/strict';
import { createPractice, availableActions, applyBid, DECK, handFeatures, makeRng } from './core.js';
import { advanceAsker, applyPracticeBid } from './practice.js';
import { slamKnowledge } from './slam-policy.js';
import { savePracticeProgress, loadPracticeProgress } from './progress.js';

const baseHand = 'SA SK SJ ST S9 HA HJ H9 DJ D9 D8 C9 C8'.split(' ');
function ownHand(count = 3, queen = false, trump = 'S') {
  const hand = baseHand.map(card => card === 'SA' && count < 1 ? 'S8' : card === 'SK' && count < 2 ? 'S7'
    : card === 'HA' && count < 3 ? 'H8' : card === 'DJ' && count >= 4 ? 'DA' : card === 'C9' && count >= 5 ? 'CA'
    : card === 'SJ' && queen ? 'SQ' : card);
  return hand.map(card => `${card[0] === 'S' ? trump : card[0] === trump ? 'S' : card[0]}${card[1]}`);
}
function state({ own = 3, partner = [1], queen, ownQueen = false, trump = 'S', extra = [], phase = 'post-keycard', last = '4C' } = {}) {
  const base = createPractice({ profileId: ['H','S'].includes(trump) ? `major-${trump}` : trump === 'D' ? 'minor-d-s-c' : 'club-1s-1nt-baron', seed: 'slam-policy' });
  return { ...base, practiceRole: 'teller', pendingAsk: null, phase, playerHand: ownHand(own, ownQueen, trump), partnerHand: ['hidden'],
    constraints: [{ type: 'keycardOptions', trump, values: partner }, ...(queen === undefined ? [] : [{ type: 'trumpQueen', trump, value: queen }]), ...extra],
    auction: [{ seat: base.playerSeat, bid: '3S' }, { seat: base.partnerSeat, bid: last }] };
}

test('strict 4.5 threshold: four without the queen stops in game; four plus queen or five without it stops in slam', () => {
  for (const trump of ['S','H','D','C']) for (const [own, partner, queen, ownQueen, level] of [
    [1,1,false,false,0], [2,1,true,false,0], [3,1,false,false,0],
    [3,1,true,false,6], [3,1,false,true,6], [3,2,false,false,6],
  ]) {
    const session = state({ own, partner:[partner], queen, ownQueen, trump });
    const before = JSON.stringify(session);
    const next = advanceAsker(session);
    const game = ['C','D'].includes(trump) ? 5 : 4;
    assert.equal(next.pendingAsk.bid, `${level || game}${trump}`, `${trump}, ${own}+${partner}, queen ${queen}/${ownQueen}`);
    assert.equal(next.pendingAsk.kind, 'signoff');
    assert.deepEqual(next.pendingAsk.responseLadder, [{bid:'Pass',label:'Accept partner’s final contract'}]);
    assert.equal(JSON.stringify(session), before);
    assert.deepEqual(applyPracticeBid(next,'Pass').playerHand,session.playerHand);
  }
});

test('the queen is asked only when unknown, and side-suit grand tries require all five keycards plus it', () => {
  for (const [own, partner] of [[3,1],[3,2]]) {
    const session = state({ own, partner:[partner] });
    const queen = availableActions(session).find(a => a.askType === 'queen');
    assert.equal(advanceAsker(session).pendingAsk.bid, queen.bid);
  }
  assert.equal(advanceAsker(state({ own:2, partner:[1] })).pendingAsk.bid,'4S','Three keycards cannot reach slam even with the queen');
  const grand = state({ own:3, partner:[2], queen:true });
  const prompt = advanceAsker(grand);
  const action = availableActions(grand).find(a => a.bid === prompt.pendingAsk.bid);
  assert.equal(action.askType,'suit');
  assert.equal(action.grandTry,true);
  assert.match(prompt.pendingAsk.label,/Grand try/);
  assert.equal(slamKnowledge({hand:grand.playerHand,trump:'S',constraints:grand.constraints}).minimum,5.5);
  const ownedQueen = state({ own:3, partner:[2], queen:false, ownQueen:true });
  assert.equal(availableActions(ownedQueen).find(a => a.bid === advanceAsker(ownedQueen).pendingAsk.bid).askType,'suit');
});

test('0/3 ambiguity is resolved only from own cards and public bounds; uncertainty never authorizes a grand', () => {
  const ambiguous = state({ own:2, partner:[0,3], queen:true });
  assert.equal(advanceAsker(ambiguous).pendingAsk.bid,'4S');
  const known = { ...ambiguous, constraints:[...ambiguous.constraints,{type:'hcp',min:19,max:19}] };
  // With these own honours, a zero-keycard partner can hold at most 18 HCP.
  const knowledge = slamKnowledge({hand:known.playerHand,trump:'S',constraints:known.constraints});
  assert.equal(knowledge.minimum,5.5);
  assert.equal(availableActions(known).find(a => a.bid === advanceAsker(known).pendingAsk.bid).askType,'suit');
  const foreign = state({own:3,partner:[1],queen:false,extra:[{type:'keycardOptions',trump:'H',values:[5]}]});
  assert.equal(advanceAsker(foreign).pendingAsk.bid,'4S','A different trump agreement cannot inflate the total');
});

test('a failed grand try signs off at six; positive public controls permit seven, never a hidden-hand lookup', () => {
  const failed = state({ own:3,partner:[2],queen:true,phase:'suit-ask',extra:[{type:'suitResponse',suit:'D',category:'none'}] });
  assert.equal(advanceAsker(failed).pendingAsk.bid,'6S');
  const kingLong = state({ own:3,partner:[2],queen:true,phase:'suit-ask',extra:[{type:'suitResponse',suit:'D',category:'kLong'}] });
  assert.equal(advanceAsker(kingLong).pendingAsk.bid,'6S','Kxx in two long hands does not provide the third round');
  const positive = state({ own:3,partner:[2],queen:true,phase:'unsupported',extra:[
    {type:'suitResponse',suit:'D',category:'third'},{type:'suitResponse',suit:'H',category:'kDoubleton'},
  ] });
  const prompt = advanceAsker(positive);
  assert.equal(prompt.pendingAsk.bid,'7S');
  assert.deepEqual(advanceAsker({...positive,partnerHand:DECK.slice(0,13)}).pendingAsk,prompt.pendingAsk);
});

test('void-first replies still ask the actual keycards, and a signoff never attempts to bid backwards', () => {
  const afterVoid = state({ phase:'void-keycard',own:1,partner:[0],queen:false });
  const prompt = advanceAsker({...afterVoid,shortageSuit:'C',constraints:[{type:'length',suit:'C',equals:0}]});
  assert.equal(availableActions({...afterVoid,shortageSuit:'C'}).find(a=>a.bid===prompt.pendingAsk.bid).askType,'keycard');
  for (const [last,expected] of [['4S',null],['4NT','5S'],['5S',null],['6NT',null]]) {
    const session = advanceAsker(state({own:3,partner:[1],queen:false,last}));
    if (expected) assert.equal(session.pendingAsk.bid,expected);
    else assert.equal(session.finished,true,'Passing the reached contract is the legal fallback');
  }
});

function partnerHand(own, keycards, queen) {
  const pool = DECK.filter(card => !own.includes(card)), rng = makeRng(`slam-fixture:${keycards}:${queen}`);
  for (let attempt=0;attempt<250000;attempt++) {
    const draw=[...pool];
    for(let i=0;i<13;i++){const j=i+Math.floor(rng()*(draw.length-i));[draw[i],draw[j]]=[draw[j],draw[i]];}
    const hand=draw.slice(0,13), f=handFeatures(hand,'S');
    if(f.keycards===keycards && f.trumpQueen===queen && f.balanced && f.lengths.S===5 && f.hcp>=12 && f.hcp<=19
      && Math.max(f.lengths.H,f.lengths.D,f.lengths.C)<=4) return hand;
  }
  throw new Error('No independently drawn slam fixture');
}

test('fixed-hand Jacoby auctions make the game/slam decision after keycard and, when necessary, queen replies', () => {
  for(const [count,queen,target] of [[1,false,'4S'],[1,true,'6S'],[2,false,'6S']]) {
    const own=ownHand(), partner=partnerHand(own,count,queen);
    let session={...createPractice({major:'S',seed:'real-slam-policy'}),playerHand:own,partnerHand:partner,practiceRole:'teller'};
    session=applyBid(applyBid(session,'2NT'),'3D');
    session=applyBid(session,availableActions(session).find(a=>a.askType==='keycard').bid);
    const original=[...session.partnerHand];
    session=advanceAsker(session);
    if(count===1) {
      assert.equal(availableActions({...session,pendingAsk:null}).find(a=>a.bid===session.pendingAsk.bid).askType,'queen');
      const answered=applyBid({...session,pendingAsk:null},session.pendingAsk.bid);
      session=applyPracticeBid(session,answered.auction.at(-1).bid);
    }
    assert.equal(session.pendingAsk.bid,target);
    session=applyPracticeBid(session,'Pass');
    assert.equal(session.contract.bid,target);
    assert.deepEqual(session.partnerHand,original);
  }
});

test('restoring an old grand prompt below the threshold replans it and its Undo frame with the original hand', () => {
  const own=ownHand(), partner=partnerHand(own,1,false);
  let session={...createPractice({major:'S',seed:'old-grand-prompt'}),playerHand:own,partnerHand:partner,practiceRole:'teller'};
  session=applyBid(applyBid(session,'2NT'),'3D');
  session=applyBid(session,availableActions(session).find(a=>a.askType==='keycard').bid);
  session=applyBid(session,availableActions(session).find(a=>a.askType==='queen').bid);
  const action=availableActions(session).find(a=>a.askType==='suit');
  const legacy={...session,pendingAsk:{bid:action.bid,label:'Ask about diamonds',kind:'relay',responseLadder:action.responseLadder}};
  const storage={setItem(key,value){this.value=value},getItem(){return this.value}};
  savePracticeProgress({session:legacy,history:[legacy]},storage);
  const restored=loadPracticeProgress(storage);
  assert.equal(restored.error,undefined);
  for(const frame of [restored.progress.session,...restored.progress.history]) {
    assert.equal(frame.pendingAsk.bid,'4S');
    assert.equal(frame.pendingAsk.kind,'signoff');
    assert.deepEqual(frame.auction,session.auction);
    assert.deepEqual(frame.playerHand,own);
    assert.deepEqual(frame.partnerHand,partner);
  }
});
