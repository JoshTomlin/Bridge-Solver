// P1467–P1477, using the 1D opening universe in P0633/P0636.
import { hcp, length, nextBid, relayStep, lastBid } from './profile-utils.js';
import { shapeSet, prefix } from './source-utils.js';

const ranges = [[9,11], [12,14], [15,17], [18,19]];
const notrumpReserved = { skip3NT:true, skipMajorGame:false, skipBids:['5D'] };
const source = 'P1467–P1477';
const noShortage = { type:'balanced', value:true };
const shapes = shapeSet(n => {
  if (n.D < 4) return false;
  const shortages = ['S','H','C'].filter(suit => n[suit] < 2).length;
  if (!shortages) return n.D >= 6 && ['2236','2227'].includes(Object.values(n).sort().join(''));
  if (shortages > 1) return false;
  return n.D > 4 || Object.values(n).sort().join('') === '1444';
});
const lowRange = (index, bid) => {
  const [min, max] = ranges[index];
  return { bid, label:`Club shortage ${min}–${max}`, constraints:[length('C',0,1),hcp(min,max)],
    phase:'keycard', state:{nodeId:null, balanced:false, shortageSuit:'C'} };
};

const rangeNode = shortage => session => {
  const bid = relayStep(lastBid(session),1,{skip3NT:true});
  const indices = shortage ? [0,1,2,3] : [1,2,3];
  return {
    label:'Range enquiry', actions:[{
      bid, label:'Range enquiry', source, responses:indices.map((index, offset) => {
        const [min,max] = ranges[index];
        return { bid:nextBid(bid,offset+1), label:`${min}–${max}`, constraints:[hcp(min,max)],
          phase:'keycard', state:{nodeId:null,balanced:!shortage,shortageSuit:shortage} };
      }),
    }],
  };
};

export const DIAMOND_RAISE = {
  id:'diamond-2nt-raise', name:'1D–2NT · Diamond raise', family:'Diamond raises',
  defaultTrump:'D', playerSeat:'South', partnerSeat:'North', source,
  initialAuction:prefix(['1D']), startNode:'shape',
  initialState:{relayPolicy:notrumpReserved, threeNTToPlay:true},
  partnerConstraints:[shapes,{type:'anyOf', options:[[noShortage,hcp(12,19)],[{type:'balanced',value:false},hcp(9,19)]]}],
  playerConstraints:[length('D',5,9),hcp(12,19)],
  nodes:{
    shape:{label:'Game-forcing diamond raise', actions:[{
      bid:'2NT',label:'Five-plus diamonds, game forcing',source,
      responses:[
        {bid:'3C',label:'No shortage',constraints:[noShortage],nextNode:'balanced'},
        {bid:'3D',label:'Heart shortage',constraints:[length('H',0,1)],nextNode:'hearts'},
        {bid:'3H',label:'Spade shortage',constraints:[length('S',0,1)],nextNode:'spades'},
        ...['3S','3NT','4C','4D'].map((bid,index)=>lowRange(index,bid)),
      ],
    }]},
    balanced:rangeNode(null),
    hearts:rangeNode('H'),
    spades:rangeNode('S'),
  },
  assumptions:['Responder’s 3NT is to play. Relay asks skip 3NT and 5D. Answers count each bid.'],
  limitations:['Hands with two shortages are outside this practice subset.'],
};
