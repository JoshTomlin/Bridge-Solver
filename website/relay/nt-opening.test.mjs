import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingPractice,practiceView,applyPracticeBid,availablePracticeActions,practiceCalls} from './practice.js';
import {applyNtOpeningCall,ntOpeningPartnerBid} from './nt-opening.js';
import {handFeatures,matchesConstraints,makeRng} from './core.js';
import {savePracticeProgress,loadPracticeProgress} from './progress.js';
import {auctionCallDetails} from './auction-study.js';

const copy=x=>JSON.parse(JSON.stringify(x));
const north='SA SK S2 HA H3 DK D4 D2 CK CQ CJ C8 C7'; // 20, 3235, three club KC + Q
const south='SQ SJ S9 S8 HQ HT DA D8 CA CT C9 C6 C5'; // 13, 4225
function fixture(n=north,s=south,humanSeat='South') {
  const base=createTrainingPractice({auctionMode:true,openingFamily:'NT',humanSeat:'North',seed:'nt-deep-fixture'});
  const cards={North:n.split(' '),South:s.split(' ')};
  assert.equal(new Set([...cards.North,...cards.South]).size,26);
  assert.equal(cards.North.length,13);assert.equal(cards.South.length,13);
  return {...base,partnerHand:cards.North,playerHand:cards.South,wholeAuction:{...base.wholeAuction,humanSeat},practiceRole:humanSeat==='South'?'asker':'teller'};
}
function path(calls,n=north,s=south,humanSeat='South') {
  let session=fixture(n,s,humanSeat);
  for(const bid of calls.split(' '))session=applyNtOpeningCall(session,bid);
  return session;
}
function saved(session,history=[]) {
  const storage={getItem(){return this.value},setItem(k,v){this.value=v}};
  savePracticeProgress({session,history,preferences:{practiceMode:'auction',openingFamily:'NT'}},storage);
  const result=loadPracticeProgress(storage);
  assert.equal(result.error,undefined,`${session.auction.map(c=>c.bid).join(' ')}: ${result.error}`);
  assert.deepEqual(result.progress.session,copy(session));
  return result;
}
const bids=s=>s.auction.map(c=>c.bid);

test('minor Stayman 4NT is a real club keycard enquiry, followed by queen and specific-suit questions',()=>{
  let s=path('2NT 3S 4H');const initial=copy(s),history=[];
  history.push(s);s=applyPracticeBid(s,'4NT');
  assert.deepEqual(bids(s),['2NT','3S','4H','4NT','5C']);
  assert.equal(s.finished,false);assert.equal(s.opening.node,'nt-continue');assert.equal(s.trump,'C');
  assert.ok(s.constraints.some(c=>c.type==='keycardOptions'&&c.trump==='C'&&c.values.join()==='0,3'));
  const details=auctionCallDetails(s,history,3);
  assert.deepEqual(details.alternatives.map(a=>a.bid),['5C','5D','5H','5S']);
  history.push(s);s=applyPracticeBid(s,'5D');
  assert.equal(s.auction.at(-1).bid,'5S'); // Club queen present
  assert.ok(s.constraints.some(c=>c.type==='trumpQueen'&&c.value&&c.trump==='C'));
  // 5NT is the reserved grand try and 6C is trump: the shared suit ask is 6D.
  history.push(s);s=applyPracticeBid(s,'6D');
  assert.equal(s.auction.at(-1).bid,'6S'); // HA3 = third-round control
  assert.ok(s.constraints.some(c=>c.type==='suitResponse'&&c.suit==='H'&&c.category==='third'));
  saved(s,history);assert.deepEqual(s.playerHand,initial.playerHand);assert.deepEqual(s.partnerHand,initial.partnerHand);
  s=applyPracticeBid(s,'7NT');assert.equal(s.contract.bid,'7NT');assert.equal(s.contract.declarer,'North');
  assert.equal(s.undiscussedBid,undefined);saved(s,history);
});

test('the human opener answers keycards and queen without automation answering for them',()=>{
  let s=path('2NT 3S 4H 4NT',north,south,'North');const start=copy(s);
  assert.equal(s.opening.node,'nt-answer');saved(s);
  assert.throws(()=>applyPracticeBid(s,'5D'),/does not match your hand/);assert.deepEqual(copy(s),start);
  s=applyPracticeBid(s,'5C');assert.deepEqual(bids(s),['2NT','3S','4H','4NT','5C','5D']);
  assert.equal(s.opening.seat,'North');assert.equal(s.auction.filter(c=>c.bid==='4NT').length,1);
  saved(s,[start]);s=applyPracticeBid(s,'5S');assert.equal(s.auction.at(-1).bid,'6D');
  assert.deepEqual(practiceView(s).playerHand,north.split(' '));saved(s,[start]);
});

test('literal delayed minor-Stayman Kickback positions retain distinct trump suits',()=>{
  const fixtures=[
    [north,south,'4H','4S','C','4NT'],
    ['SA SK S2 HA H3 DK DQ DJ D4 D2 CK C8 C7','SQ SJ S9 S8 HQ HT DA D8 CA CT C9 C6 C5','4S','5C','D','5D'],
    ['SA SK S2 HA H3 DA DQ D8 D2 CK CJ C8 C7','SQ SJ S9 HQ HT H9 DK DJ D9 D6 CA CT C2','4D','4H','C','4NT'],
    ['SA SK S2 HA H3 DA DQ D8 D2 CK CJ C8 C7','SQ SJ S9 HQ HT H9 DK DJ D9 D6 CA CT C2','4D','4S','D','4NT'],
  ];
  for(const [n,r,answer,ask,trump,reply]of fixtures) {
    let s=path(`2NT 3C 3H 3S 3NT 4C ${answer}`,n,r);
    s=applyPracticeBid(s,ask);
    assert.equal(s.auction.at(-1).bid,reply);assert.equal(s.trump,trump);
    assert.equal(s.finished,false);assert.equal(s.undiscussedBid,undefined);saved(s);
  }
});

test('opposite-minor slam tries let opener ask, with their own exceptional Kickback positions',()=>{
  for(const [transfer,ask,trump,reply]of [['4C','4D','D','5C'],['4D','4H','C','5C']]) {
    const responder=trump==='D'?'SQ SJ S9 S8 HQ HT DA DQ DJ DT D9 CA C6':south;
    let s=path(`2NT ${transfer}`,north,responder,'North');
    s=applyPracticeBid(s,ask);
    assert.equal(s.auction[3].bid,reply);assert.equal(s.opening.node,'nt-continue');assert.equal(s.trump,trump);
    assert.equal(s.opening.seat,'North');saved(s);
    assert.deepEqual(practiceView(s).playerHand,north.split(' '));
  }
});

test('transfer followed by a natural minor can ask keycards in either shown suit',()=>{
  const n='SA SK S2 HA HK H3 DK D4 D2 CA CJ C8 C7';
  const r='SQ SJ HQ HJ HT H9 H8 DA D8 CQ CT C9 C6';
  for(const [ask,trump,reply]of [['4D','C','4S'],['4S','H','5C']]) {
    let s=path('2NT 3D 3H 4C',n,r,'North');
    s=applyPracticeBid(s,ask);
    assert.equal(s.auction[5].bid,reply);assert.equal(s.trump,trump);saved(s);
  }
});

test('4NT after the opposite-minor diamond cue keeps its explicit keycard meaning ahead of generic notrump signoff',()=>{
  const r='SQ SJ S9 S8 HQ HT DA DQ DJ DT D9 CA C6';
  let s=path('2NT 4C 4H',north,r);
  assert.match(availablePracticeActions(s).find(a=>a.bid==='4NT').label,/Keycards in Diamonds/);
  s=applyPracticeBid(s,'4NT');assert.equal(s.finished,false);assert.equal(s.auction.at(-1).bid,'5C');
  assert.equal(s.trump,'D');saved(s);
});

test('4NT is quantitative, no-fit signoff, or keycard according to its complete prefix',()=>{
  let quantitative=path('2NT',north,south);quantitative=applyPracticeBid(quantitative,'4NT');
  assert.equal(quantitative.contract.bid,'4NT');assert.equal(quantitative.auction.at(-1).bid,'Pass');
  const n22='SA SK S2 HA HK H3 DK D4 D2 CA CJ C8 C7';
  const r='SQ SJ HQ HJ HT H9 H8 DA D8 CQ CT C9 C6';
  let accepted=path('2NT',n22,r);accepted=applyPracticeBid(accepted,'4NT');
  assert.equal(accepted.auction.at(-1).bid,'6NT');accepted=applyPracticeBid(accepted,'Pass');assert.equal(accepted.contract.bid,'6NT');
  const noFit=path('2NT 4C',north,south,'North');
  const signoff=applyPracticeBid(noFit,'4NT');assert.equal(signoff.contract.bid,'4NT');assert.equal(signoff.undiscussedBid,undefined);
  const kc=path('2NT 3S 4H',north,south);
  assert.match(availablePracticeActions(kc).find(a=>a.bid==='4NT').label,/Keycards in Clubs/);
});

test('Muppet five-heart 4D retains its documented cue meaning; re-transfer preserves actual first-strain declarer',()=>{
  const n='SA SK S2 HA HK HQ HJ H2 DQ D4 CJ C8 C7';
  const r='SQ SJ ST S9 HT H9 H8 DA D8 D6 CQ CT C2';
  const muppet=path('2NT 3C 3NT',n,r);
  assert.match(availablePracticeActions(muppet).find(a=>a.bid==='4D').label,/diamond.*control/);
  let s=path('2NT 3D 3S', 'SA SK S2 HA HK HQ H3 DK D4 D2 CJ C8 C7', 'SQ SJ S9 HJ HT H9 H8 H5 DA D8 D6 CQ C2');
  s=applyPracticeBid(s,'4D');assert.equal(s.auction.at(-1).bid,'4H');assert.equal(s.finished,false);
  assert.match(availablePracticeActions(s).find(a=>a.bid==='4S').label,/Keycards in Hearts/);
  s=applyPracticeBid(s,'Pass');assert.equal(s.contract.declarer,'North');
});


test('the responder chooses 3NT without a fit for the five spades shown by Muppet',()=>{
  const n='SA SK SQ SJ S2 HA H3 DK D4 D2 CQ CJ C8';
  const r='S9 S8 HK HT H9 H8 DA D8 D6 CK CT C9 C6';
  let s=path('2NT 3C',n,r,'North');
  s=applyPracticeBid(s,'3S');
  assert.deepEqual(bids(s),['2NT','3C','3S','3NT']);
  assert.equal(s.finished,false);saved(s);
  s=applyPracticeBid(s,'Pass');
  assert.equal(s.contract.bid,'3NT');assert.equal(s.contract.declarer,'North');
});

test('public continuation choices and robot policies never depend on the concealed hand',()=>{
  const s=path('2NT 3S 4H 4NT',north,south,'North');
  const hidden={...s,playerHand:['hidden'],partnerHand:['hidden']};
  assert.deepEqual(availablePracticeActions(hidden),availablePracticeActions(s));assert.deepEqual(practiceCalls(hidden),practiceCalls(s));
  const input={...s.opening,auction:s.auction,hand:north.split(' ')};
  assert.equal(ntOpeningPartnerBid({...input,partnerHand:['hidden'],targetProfile:'wrong'}),'5C');
  const corrupt={...s,opening:{...s.opening,relayAsker:'North'}};
  const storage={getItem(){return this.value},setItem(k,v){this.value=v}};
  savePracticeProgress({session:corrupt,history:[],preferences:{}},storage);
  assert.match(loadPracticeProgress(storage).error,/keycard continuation/);
});

test('generated 2NT hands explore deep continuations in both seats and retain every public fact and save',()=>{
  const visited=new Set();
  for(const humanSeat of ['North','South'])for(let i=0;i<100;i++) {
    let s=createTrainingPractice({auctionMode:true,openingFamily:'NT',humanSeat,seed:`deep-nt-${i}`});
    const original=copy(practiceView(s)),history=[],rng=makeRng(`choice:${i}`);
    for(let turn=0;!s.finished&&turn<40;turn++) {
      visited.add(s.opening.node);saved(s,history);
      assert.deepEqual(practiceView(s).playerHand,original.playerHand);assert.deepEqual(practiceView(s).partnerHand,original.partnerHand);
      const actions=availablePracticeActions(s).filter(r=>r.next!=='boundary'&&matchesConstraints(practiceView(s).playerHand,r.facts??[],s.trump));
      const alternatives=actions.filter(r=>!['final','finish'].includes(r.next));
      let bid=ntOpeningPartnerBid({...s.opening,auction:s.auction,hand:practiceView(s).playerHand});
      // Human experiments use only their cards; rejected source/shape choices
      // leave the exact pre-call snapshot intact and fall back to the own-hand policy.
      if(alternatives.length && turn<8 && i%3===0) {
        const choice=alternatives[Math.floor(rng()*alternatives.length)];
        const before=copy(s);
        try {const next=applyPracticeBid(s,choice.bid);history.push(s);s=next;continue;}
        catch(error){assert.match(error.message,/does not match|five spades\/four hearts/);assert.deepEqual(copy(s),before);}
      }
      history.push(s);s=applyPracticeBid(s,bid);
      assert.equal(s.undiscussedBid,undefined,`${i}: ${bids(s)}`);
    }
    assert.equal(s.finished,true,`${humanSeat}/${i}: ${bids(s)}`);saved(s,history);
    assert.ok(handFeatures(original.playerHand,'C').hcp>=6);
  }
  for(const node of ['nt-answer','nt-continue','shown-minor','nt-minor-invite','nt-transfer-minor','nt-after-game'])assert.ok(visited.has(node),node);
});
