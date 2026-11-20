// 2♣ game force, P1299–P1309. P1829 gives a separate passed-hand 2NT structure.
import { handFeatures } from './core.js';
import { nextBid } from './profile-utils.js';
import { NT_SHAPES } from './nt-opening.js';

const suits = ['C', 'D', 'H', 'S'];
const names = { C:'clubs', D:'diamonds', H:'hearts', S:'spades' };
const transfers = { '2NT':'C', '3C':'D', '3D':'H', '3H':'S' };
const points = (min, max) => ({ type:'hcp', min, max });
const length = (suit, min) => ({ type:'length', suit, min });
const controlCount = equals => ({ type:'controls', equals });
const controls = (...counts) => ({ type:'anyOf', options:counts.map(count => [controlCount(count)]) });
const row = (bid,label,source,next='final',facts=[],extras={}) => ({ bid,label,source,next,facts,...extras });
const play = bid => row(bid,`Play ${bid}`,'Natural signoff');
const pass = bid => row('Pass',`Play ${bid}`,'Natural signoff','finish');
const game = suit => `${['H','S'].includes(suit) ? 4 : 5}${suit}`;
const games = () => ['3NT', ...suits.map(game), ...suits.map(s => `6${s}`), '6NT'].map(play);
const balanced = { type:'shapes', values:NT_SHAPES };
const controlReplies = [
  row('2D','0, 1 or 4 controls','P1302','strong-rebid',[controls(0,1,4)]),
  row('2H','2 or 5 controls','P1303','strong-rebid',[controls(2,5)]),
  row('2S','3 controls','P1304','strong-rebid',[controlCount(3)]),
];
const candidateSuit = f => suits.reduce((longest, suit) => f.lengths[suit] >= f.lengths[longest] ? suit : longest, 'C');
export const isBalancedStrongTwo = hand => {
  const f = handFeatures(hand, 'C');
  return f.hcp >= 23 && ['4333','4432','5332'].includes(f.shape.join(''));
};
export const STRONG_TWO_NOTES = [
  '2♣ is game forcing, 23+ balanced or a distributional game force. The generator includes both. A longer-suit opening is a judgement call.',
  'Control replies count two for an ace and one for a king. The long-suit transfers are ordered clubs, diamonds, hearts, spades. Responder never uses Keycard.',
  'After a control reply and a 2NT rebid, use Muppet, transfers and minor Stayman as over a 2NT opening. The trainer accepts quantitative 4NT with 25+; this is a practice threshold. In third or fourth seat, the separate Puppet agreement applies.',
];

export function strongTwoRows({node, major, auction}) {
  const last = auction.at(-1)?.bid;
  switch (node) {
    case 'open': return [row('2C','23+ balanced, or a distributional game force','P1300','respond')];
    case 'respond': return [
      ...controlReplies,
      ...Object.entries(transfers).map(([bid,suit]) => row(bid,`Transfer to six-plus ${names[suit]}, 0–2 controls`,'P1305; partnership confirmation','strong-transfer',
        [length(suit,6),controls(0,1,2)],{major:suit})),
      row('3NT','9+ HCP, 0/1 controls, 4333 or 4432','P1306','strong-game',
        [points(9),controls(0,1),{type:'shapes',values:NT_SHAPES.filter(shape=>!shape.includes('5'))}]),
    ];
    case 'strong-transfer': return [
      row(nextBid(last),`Accept ${names[major]}; ask exact controls`,'P1305','strong-controls',[length(major,2)]),
      ...suits.filter(s=>s!==major).flatMap(s=>[2,3,4].map(level=>row(`${level}${s}`,`Natural strong ${names[s]} suit`,'P1305',level===4&&['H','S'].includes(s)?'strong-game':'strong-fit',[length(s,5)],{major:s}))),
      play('3NT'),
    ];
    case 'strong-controls': return [0,1,2].map((count,i)=>row(nextBid(last,i+1),`${count} control${count===1?'':'s'}`,'P1305','strong-game',[controlCount(count)]));
    case 'strong-rebid': return [
      row('2NT','23+ balanced; use the 2NT opening continuations','P1300; partnership confirmation','respond',[points(23),balanced]),
      ...suits.flatMap(s=>[2,3,4].map(level=>row(`${level}${s}`,`Natural strong ${names[s]} suit`,'Natural continuation',level===4&&['H','S'].includes(s)?'strong-game':'strong-fit',[length(s,5)],{major:s}))),
      ...games(),
    ];
    case 'strong-fit': return [
      ...games(),
      ...(last&&last[0]<='3' ? [row(`3${major}`,`Fit for ${names[major]}`,'Natural fit description','strong-game',[length(major,3)])] : []),
    ];
    case 'strong-game': return [
      ...games(),
      ...(last==='3NT' || (major && last===game(major)) ? [pass(last)] : []),
    ];
    case 'final': return [pass(last)];
    default: return null;
  }
}

export function strongTwoPartner({node, major, auction, hand}, choices) {
  const f = handFeatures(hand, 'C');
  const longest = candidateSuit(f);
  const pick = (...bids) => bids.find(bid => choices.some(choice=>choice.bid===bid));
  switch (node) {
    case 'respond': {
      const strongSuit = f.lengths[longest]>=6 && ['A','K','Q'].filter(rank=>hand.includes(longest+rank)).length>=1;
      const transfer = Object.keys(transfers).find(bid=>transfers[bid]===longest);
      return pick('3NT', ...(strongSuit?[transfer]:[]), '2D','2H','2S',transfer);
    }
    case 'strong-rebid':
      return pick('2NT', ...[2,3,4].map(level=>`${level}${longest}`),'3NT',game(longest));
    case 'strong-transfer': {
      const accept = nextBid(auction.at(-1).bid);
      return pick(accept,...(f.lengths[longest]>=6?[2,3,4].map(level=>`${level}${longest}`):[]),'3NT',...choices.map(row=>row.bid));
    }
    case 'strong-controls': return choices[0]?.bid;
    case 'strong-fit': return pick(...(f.lengths[major]>=3?[`3${major}`,game(major)]:[]),'3NT',game(major));
    case 'strong-game':
      return pick('Pass',...(major?[game(major)]:[]),'3NT','6NT',...choices.map(row=>row.bid));
    case 'final': return 'Pass';
    default: return undefined;
  }
}

export function strongTwoEligible(hand) {
  if (isBalancedStrongTwo(hand)) return true;
  const f = handFeatures(hand,'C');
  // Honour quality and the choice to force to game are left to the bidder.
  return !f.balanced && Math.max(...Object.values(f.lengths)) >= 5;
}
