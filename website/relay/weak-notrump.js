// First/second-seat 1NT, P0069–P0079 and P0205–P0226.
import { handFeatures } from './core.js';
import { nextBid } from './profile-utils.js';
import { SHAPES } from './source-utils.js';

const suits = ['C', 'D', 'H', 'S'];
const majors = ['H', 'S'];
const minors = ['C', 'D'];
const names = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
const otherMajor = suit => suit === 'H' ? 'S' : 'H';
const length = (suit, min, max = 13) => ({ type: 'length', suit, min, max });
const points = (min, max) => ({ type: 'hcp', min, max });
const shapeKind = lengths => Object.values(lengths).sort().join('');
const shapeFact = test => ({ type: 'shapes', values: SHAPES.filter(test).map(n => `${n.S}${n.H}${n.D}${n.C}`) });
const hasSecondFour = n => Object.values(n).filter(length => length >= 4).length > 1;
const weakRun = [points(0, 7), shapeFact(n => ['3334', '2344'].includes(shapeKind(n)))];
const alternatives = (...options) => ({ type: 'anyOf', options });
const game = suit => `${majors.includes(suit) ? 4 : 5}${suit}`;
const row = (bid, label, source, next = 'final', facts = [], extra = {}) => ({ bid, label, source, next, facts, ...extra });
const play = bid => row(bid, `Play ${bid}`, 'Natural signoff');
const pass = bid => row('Pass', `Play ${bid}`, 'Natural signoff', 'finish');
const games = () => ['3NT', '4H', '4S', '5C', '5D', '6NT'].map(play);

export const WEAK_NT_NOTES = [
  '1NT is the weak first/second-seat opening. Generated hands use 9–13 and common balanced or semi-balanced shapes. Rare 14-count and singleton-honour openings are outside this subset.',
  'The partner uses Stayman or a transfer to look for a major fit. For natural invitations it accepts with 12–13 and declines with 9–11. These are practice decisions.',
  'With four-plus trumps, the bot super-accepts on 9 or 13 HCP, or on 10 HCP with a five-plus-card suit and at most three controls. The agreement leaves minimum and maximum quality to judgement.',
];

export const weakNotrumpFacts = [alternatives(
  [points(9, 13), shapeFact(n => ['3334', '2344'].includes(shapeKind(n)) || minors.some(s => n[s] === 5) && ['2335', '2245'].includes(shapeKind(n)))],
  [points(9, 11), shapeFact(n => majors.some(s => n[s] === 5) && ['2335', '2245'].includes(shapeKind(n))
    || n.S !== 6 && n.S !== 7 && n.H !== 7 && ['2236', '2227'].includes(shapeKind(n)))],
)];

const baronReplies = {
  '2NT': n => shapeKind(n) === '3334' || shapeKind(n) === '2335' && majors.some(s => n[s] === 5),
  '3S': n => n.C >= 5 && !hasSecondFour(n),
  '3NT': n => n.D >= 5 && !hasSecondFour(n),
};
for (const suit of ['C', 'D', 'H']) {
  baronReplies[`3${suit}`] = n => ['2344', '2245'].includes(shapeKind(n)) && suits.find(s => n[s] >= 4) === suit;
}
const baronRows = ['2NT', '3C', '3D', '3H', '3S', '3NT'].map(bid => row(bid,
  ({ '2NT': '4333, or 5332 with a five-card major', '3C': 'Clubs, lower of two four-plus suits',
    '3D': 'Diamonds, lower of two four-plus suits', '3H': 'Hearts and spades', '3S': 'Five-plus clubs', '3NT': 'Five-plus diamonds' })[bid],
  'P0220', 'baron-continue', [shapeFact(baronReplies[bid])]));

export function weakNotrumpRows({ node, major, auction }) {
  const last = auction.at(-1)?.bid;
  switch (node) {
    case 'open': return [row('1NT', '9–13 in this weak notrump practice subset', 'P0069–P0079', 'respond', weakNotrumpFacts)];
    case 'respond': return [
      pass(last), row('2C', 'Stayman, including weak and invitational hands', 'P0206', 'stayman'),
      ...majors.map((s, i) => row(i ? '2H' : '2D', `Transfer to ${names[s]}, usually five-plus`, 'P0213', 'transfer',
        [alternatives([length(s,5)], [...weakRun,length(s,2)])], { major:s })),
      row('2S', 'Baron, mild slam interest or better', 'P0220', 'baron'),
      row('2NT', 'Puppet to 3♣ for a weak minor-suit hand', 'P0222', 'minor-puppet',
        [alternatives([length('C',5)], [length('D',5)])]),
      ...suits.map(s => row(`3${s}`, `Natural ${names[s]}, slam interest`, 'P0223–P0224', 'fit-choice', [length(s,5)], {major:s})),
      play('3NT'), ...suits.map(s => play(`4${s}`)),
      row('4NT', 'At least five-five in the minors', 'P0226', 'minor-choice', [length('C',5),length('D',5)]),
    ];
    case 'stayman': return [
      row('2D','Neither four-card major','P0206','stayman-continue',[length('H',0,3),length('S',0,3)]),
      ...majors.map(s => row(`2${s}`, `Four-plus ${names[s]}`, 'P0206','stayman-continue',[length(s,4)],{major:s})),
    ];
    case 'stayman-continue': return [
      pass(last), row('2NT','Natural invitation','P0208','invite'),
      ...(last==='2D' ? [
        row('2H','Hearts to play, correctable to spades with 3–2 majors','P0207','correct-hearts'),
        play('2S'),
        ...majors.map(s => row(`3${s}`, `Smolen: four ${names[s]} and five in the other major, game force`,
          'P0211','smolen',[length(s,4,4),length(otherMajor(s),5,5)],{major:otherMajor(s)})),
      ] : [
        ...(last==='2H' ? [row('2S','Natural spade invitation','P0209','invite',[length('S',4)],{major:'S'})] : []),
        row(last==='2H'?'3S':'3H', `Slam interest in ${names[major]}`, 'P0212','slam-fit',[length(major,4)]),
      ]),
      ...minors.map(s => row(`3${s}`,`Five-plus ${names[s]}, four-card major, mild invitation`,'P0210','invite',
        [length(s,5),{type:'balanced',value:false},alternatives([length('H',4,4)],[length('S',4,4)])],{major:s})),
      ...games(),
    ];
    case 'correct-hearts': return [pass(last), row('2S','Correct to spades with three spades and two hearts','P0207','final',[length('S',3,3),length('H',2,2)])];
    case 'transfer': return [
      row(`2${major}`, `Accept the transfer to ${names[major]}`,'P0213','transfer-continue'),
      row('2NT', `Super-accept, 4+ ${names[major]}, bad minimum or big maximum`,'P0217–P0218','super-accept',[length(major,4)]),
    ];
    case 'transfer-continue': {
      const newSuits = suits.filter(s => s !== major);
      const levelFor = suit => major === 'H' && suit === 'S' ? 2 : 3;
      return [
        pass(last),
        row(`3${major}`,`Six-plus ${names[major]}, invitational`,'Natural continuation','invite',[length(major,6)]),
        ...newSuits.map(s => row(`${levelFor(s)}${s}`, major==='S'&&s==='H'?'Five-five majors, game force':`Natural ${names[s]}, game force`,
          'P0214/P0219','transfer-fit',[length(s,major==='S'&&s==='H'?5:4)],{second:s})),
        ...newSuits.filter(s => major !== 'S' || s !== 'H').map(s => row(`${levelFor(s)+1}${s}`,
          `Six-plus ${names[major]}, ${names[s]} shortage, mild slam interest`,'P0216','fit-choice',[length(major,6),length(s,0,1)])),
        ...(major==='H' ? [row('4NT','Quantitative slam invitation','P0215','slam-invite')]
          : [row('4H','Five spades, 5332, slam interest','P0215','spade-slam',
            [shapeFact(n => n.S === 5 && shapeKind(n) === '2335')])]),
        ...games(),
      ];
    }
    case 'spade-slam': return [play('4S'),play('4NT'),play('6S'),play('6NT')];
    case 'super-accept': return [
      row('3C','Ask minimum or maximum','P0218','super-detail'),
      row(major==='H'?'3D':'3H',`Re-transfer to ${names[major]}`,'P0218','retransfer'),
      row('3NT',`Ask opener to bid 4${major}`,'P0218','major-game'),
      play(`3${major}`), play(`4${major}`),
    ];
    case 'super-detail': return [
      row(`3${major}`,'Minimum super-accept','P0218','choose-contract'),
      row(major==='H'?'3S':'3NT','Maximum super-accept, non-serious','P0218','choose-contract'),
    ];
    case 'retransfer': return [play(`3${major}`)];
    case 'major-game': return [play(`4${major}`)];
    case 'minor-puppet': return [row('3C','Complete the minor puppet','P0222','minor-correct')];
    case 'minor-correct': return [row('Pass', 'Play clubs', 'P0222', 'finish', [length('C',5)]),
      row('3D','Correct to diamonds, to play','P0222','final',[length('D',5)])];
    case 'minor-choice': return [pass(last),play('5C'),play('5D'),play('6C'),play('6D')];
    case 'baron': return baronRows;
    case 'baron-continue': return [
      pass(last), ...games(),
      ...(['3C','3D','3H'].includes(last) ? [row(nextBid(last),'Ask for the higher suit','P0220','baron-second' )] : []),
      row('4NT','Quantitative invitation','P0226','slam-invite'),
    ];
    case 'baron-second': {
      const shown = auction.at(-2).bid[1];
      const asked = last.slice(1);
      return suits.filter(s=>suits.indexOf(s)>suits.indexOf(shown))
        .map(s=>row(s===asked?'3NT':`3${s}`,`Four-plus ${names[s]}, second suit`,'P0220','choose-contract',[length(s,4)]));
    }
    case 'slam-invite': return [pass(last),play('6NT')];
    case 'slam-fit': return [row('3NT','Non-serious slam interest','P0212','choose-contract'),play(game(major))];
    case 'invite': return [pass(last), ...games()];
    case 'smolen': case 'fit-choice': case 'transfer-fit': return games();
    case 'choose-contract': return [pass(last), ...games()];
    case 'final': return [pass(last)];
    default: return null;
  }
}

export function weakNotrumpPartner({node, major, second, auction, hand}, choices) {
  const f = handFeatures(hand,'C');
  const n = f.lengths;
  const last = auction.at(-1)?.bid;
  const pick = (...bids) => bids.find(bid => choices.some(row=>row.bid===bid));
  switch (node) {
    case 'respond': {
      const longest = n.S>n.H?'S':'H';
      if (['3334','2344','2335'].includes(shapeKind(n)) && f.hcp>=12 && f.hcp<=14) return '2C';
      if (n[longest]>=5) return longest==='S'?'2H':'2D';
      if (f.hcp>=17 || Math.max(n.H,n.S)===4 || f.hcp>=12 && f.hcp<=14 || f.hcp<=7 && ['3334','2344'].includes(shapeKind(n))) return f.hcp>=17?'2S':'2C';
      if (f.hcp>=15) return '3NT';
      return Math.max(n.D,n.C)>=6?'2NT':'Pass';
    }
    case 'stayman': return pick('2H','2S','2D');
    case 'stayman-continue':
      if (f.hcp>=15) return last!=='2D'&&n[major]>=4?game(major):'3NT';
      if (f.hcp>=12) return '2NT';
      return last==='2D' ? pick(...(n.H>=4?['2H']:n.S>=4?['2S']:[]),'Pass') : 'Pass';
    case 'correct-hearts': return pick('2S','Pass');
    case 'transfer': {
      const badMinimum = f.hcp === 9 || (f.hcp === 10 && f.shape[0] >= 5 && f.controls <= 3);
      return badMinimum || f.hcp === 13 ? pick('2NT', `2${major}`) : `2${major}`;
    }
    case 'transfer-continue':
      return f.hcp>=15 ? n[major]>=6?game(major):'3NT' : f.hcp>=12&&n[major]>=6?`3${major}`:'Pass';
    case 'super-accept': return f.hcp>=13?game(major):`3${major}`;
    case 'super-detail': return f.hcp===13 ? major==='H'?'3S':'3NT' : `3${major}`;
    case 'retransfer': return `3${major}`;
    case 'major-game': return game(major);
    case 'minor-puppet': return '3C';
    case 'minor-correct': return n.D>n.C ? pick('3D','Pass') : 'Pass';
    case 'minor-choice': return n.C>=n.D?'5C':'5D';
    case 'baron': case 'baron-second': return choices[0]?.bid;
    case 'baron-continue': return f.hcp>=19 ? '4NT' : pick('3NT','Pass');
    case 'slam-invite': return f.hcp>=12 ? '6NT' : 'Pass';
    case 'invite':
      if (f.hcp<12) return 'Pass';
      if (last==='2NT' && auction[1].bid==='2C') return '3NT';
      return major && n[major] >= (majors.includes(major)?3:4) ? game(major) : '3NT';
    case 'slam-fit': return pick('3NT',game(major));
    case 'smolen': case 'fit-choice': case 'transfer-fit':
      if (second && n[second]>=4 && !majors.includes(second)) return game(second);
      return major && n[major]>=3 ? game(major) : '3NT';
    case 'choose-contract': return f.hcp>=15 ? pick('3NT',major?game(major):'3NT','Pass') : pick(major?game(major):'3NT','3NT','Pass');
    case 'spade-slam': return n.S >= 3 ? '4S' : '4NT';
    case 'final': return 'Pass';
    default: return undefined;
  }
}
