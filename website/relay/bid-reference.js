// Public meanings for the auction before an exercise's first interactive bid.
// Main notes P0250–P0259, P0375–P0471, P0631–P0669, P1524–P1564;
// July email E1–E6; Reordering R0002–R0071. No cards or sampling facts belong here.
const tables = new Map();
const names = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
function table(prefix, rows) {
  tables.set(prefix, Object.freeze(rows.map(([bid, label]) => Object.freeze({ bid, label }))));
}
const openings = {
  '1C': '14+ balanced, or clubs (usually unbalanced)',
  '1D': 'Diamonds; usually a shortage, or specified six/seven-card no-shortage exceptions',
  '2NT': '20–22 balanced',
  '1H': 'Five-plus hearts', '1S': 'Five-plus spades',
  '2D': 'Horton: four/five spades and four-plus diamonds; weak',
  '2H': 'Horton: four/five spades and four-plus hearts; weak',
  '2S': 'Horton: four/five spades and four-plus clubs; weak',
};
table('1C', [
  ['1D', 'Four-plus hearts; preferred with 4/4 majors'], ['1H', 'Four-plus spades'],
  ['1S', '(7)8+; usually no four-card major'], ['1NT', '0–6(7); usually no good four-card major'],
  ['2C', '10+; six-plus diamonds, single-suited'],
  ...['D','H','S'].map(suit => [`2${suit}`, `Six/seven ${names[suit]}; 0–6(7)`]),
  ['3C', 'Six-plus clubs; 3–6(7)'],
  ...['D','H','S'].map(suit => [`3${suit}`, `Six/seven ${names[suit]}; 0–6(7)`]),
]);
table('1D', [
  ['1H', 'Four-plus hearts; not a game force with only four'], ['1S', 'Four-plus spades; not a game force with only four'],
  ['1NT', '10+ enquiry; no five-card major; game-forcing with a four-card major'],
  ['2C', 'Five-plus clubs; 5–9'], ['2D', 'Three/four-plus diamonds; 5–9'],
  ['2H', 'Six-plus hearts; 0–6(7)'], ['2S', 'Six-plus spades; 0–6(7)'],
  ['2NT', 'Four-plus diamonds; game-forcing'], ['3C', 'Six-plus clubs; invitational, no four-card major'],
  ['3D', 'Four/five-plus diamonds; 9–12, invitational'],
  ['3H', 'Six/seven hearts; 0–6(7)'], ['3S', 'Six/seven spades; 0–6(7)'],
  ['3NT', 'Five-plus spades and six-plus hearts; 8–12'],
]);
table('1H', [['1S', 'Four-plus spades'], ['2NT', 'Four-plus hearts; game-forcing raise']]);
table('1S', [['2NT', 'Four-plus spades; game-forcing raise']]);
for (const bid of ['2D','2H','2S']) table(bid, [['2NT', 'Horton range and shape enquiry']]);

const single = (suit, major) => `Six-plus ${names[suit]}; 14+; no second four-card suit, at most two ${names[major]}`;
const support = (suit, major) => `Six-plus ${names[suit]}, three ${names[major]}; ${suit === 'D' ? '16+' : '14+'}`;
const splinter = (major, short) => `Four ${names[major]}, ${names[short]} shortage; mini–mega splinter, about 11–13 or 17–19`;
const reverse = (suit, second, major, upgrade = true) => `Five-plus ${names[suit]}, four-plus ${names[second]}; 16+${upgrade ? `, or 14/15 with three ${names[major]}` : ''}`;
for (const [minor, major, response] of [['C','H','1D'], ['C','S','1H'], ['D','H','1H'], ['D','S','1S']]) {
  const m = names[major], other = major === 'H' ? 'S' : 'H';
  const rows = minor === 'C' ? [
    ...(major === 'H' ? [['1H', 'Balanced 14–17; accepts the heart transfer'], ['1S', 'Four-plus spades and clubs; unbalanced']]
      : [['1S', 'Balanced 14–17; accepts the spade transfer']]),
    ['1NT', 'Balanced 18/19; exceptional four-card-major hands follow the source escape rules'],
    ['2C', 'Clubs, 9–13; usually unbalanced, may have a second suit'], ['2D', single('C',major)],
    [major === 'H' ? '2H' : '2S', `Three/four ${m}, 9–10(11); or four ${m}, 14/15(16) balanced`],
    [major === 'H' ? '2S' : '2H', reverse('C','D',major)], ['2NT', support('C',major)],
    ...(major === 'S' ? [['3C', reverse('C','H',major)]] : []),
    [major === 'H' ? '3C' : '3D', splinter(major,other)], [major === 'H' ? '3D' : '3H', splinter(major,'D')],
  ] : [
    ...(major === 'H' ? [['1S', 'Four-plus spades and diamonds; denies three hearts unless 16+']] : []),
    ['1NT', `Three ${m}; 11–15`], ['2C', `Four-plus clubs and diamonds; unbalanced, denies three ${m} unless 16+`],
    ['2D', `Long diamonds, 9–14(15); denies three ${m}${major === 'H' ? ', four spades' : ''} and four clubs`],
    [`2${major}`, `Three/four ${m}; 9–10(11)`], [`2${other}`, single('D',major)], ['2NT', support('D',major)],
    ...(major === 'S' ? [['3C', reverse('D','H',major,false)]] : []),
    [major === 'H' ? '3C' : '3D', splinter(major,other)], [major === 'H' ? '3D' : '3H', splinter(major,'C')],
  ];
  table(`1${minor} ${response}`, rows);
}
table('1H 1S', [['3C', single('H','S')], ['3D', splinter('S','D')], ['3H', splinter('S','C')]]);
table('1C 1S', [
  ['1NT', '14/15(16) balanced, or 14–16 with diamond shortage'],
  ['2C', '16–19(20) balanced or strong unbalanced clubs'],
  ['2D', '9–13, non-solid clubs; zero–three diamonds'],
  ['2H', '14–16; spade shortage, two/three diamonds, five-plus clubs'],
  ['2S', '14–16; heart shortage, two/three diamonds, five-plus clubs'],
  ['2NT', '14–16; five-plus clubs and four-plus diamonds'], ['3C', '9–13; solid six-plus clubs'],
  ['3D', '9–13; five-plus clubs and four-plus diamonds'],
  ['3H', '14–16; six-plus clubs and five hearts'], ['3S', '14–16; six-plus clubs and five spades'],
  ['3NT', '17–19; six/seven clubs, no shortage'],
]);
const clubAfterOneNT = [
  ['2C', 'To play in clubs; opener may continue with a great hand'], ['2D', 'To play in diamonds; opener may continue with a great hand'],
  ['2H', 'Five-plus clubs and five-plus diamonds'], ['2S', 'Baron: minors 4/3, 4/4 or 6/4, or 5332 with a minor'],
  ['2NT', 'Five clubs and four diamonds'], ['3C', 'Five diamonds and four clubs'],
  ['3D', 'Six-plus clubs; heart shortage'], ['3H', 'Six-plus clubs; spade shortage'],
  ['3S', 'Six-plus clubs; diamond shortage'], ['3NT', 'To play'],
];
table('1C 1S 1NT', clubAfterOneNT);
table('1C 1S 2C', [['2D', 'Request 3NT or the strong unbalanced description'], ...clubAfterOneNT.filter(([bid]) => !['2C','2D'].includes(bid))]);
table('1D 1NT', [['2C', '12–15; diamond opening shapes'], ['2D', '9–11; diamond opening shapes']]);
for (const rebid of ['2C','2D']) table(`1D 1NT ${rebid}`, [['2H', 'Diamond fit; shape enquiry'], ['2S', 'Six-plus solid clubs; shortage enquiry'], ['3NT', 'To play']]);
for (const major of ['H','S']) {
  table(`1D 1${major} 1NT`, [['2C', 'Range enquiry; three-card major support already shown'], [`2${major}`, 'To play']]);
  for (const afterPuppet of [false,true]) {
    const prefix = `1C ${major === 'H' ? '1D' : '1H'} 1NT${afterPuppet ? ' 2C 2D' : ''}`;
    table(prefix, [
      ...(!afterPuppet ? [['2C', `Puppet to 2D; weak exit, invitation or five-plus ${names[major]}`],
        ['2D', major === 'H' ? 'Five-plus hearts; game force, possibly four spades or balanced' : 'Five-plus spades and four-plus hearts; game-forcing']] : []),
      ['2H', afterPuppet ? `Invitational; ${major === 'H' ? 'five/six hearts' : 'four/five spades'}`
        : major === 'H' ? '4/4 majors; game-forcing' : 'Five spades and four hearts; 7–9, invitational'],
      ['2S', `Baron; ${afterPuppet ? 'five' : 'four'} ${names[major]}, four/six-card minor, slam interest`],
      ['2NT', `Exactly five clubs, ${afterPuppet ? 'five-plus' : 'four'} ${names[major]}; slam interest`],
      ['3C', `Exactly five diamonds, ${afterPuppet ? 'five-plus' : 'four'} ${names[major]}; slam interest`],
      ['3D', `Three-suited; ${major === 'H' ? 'spade' : 'heart'} shortage`], ['3H', `Solid six-plus ${names[major]}`],
      ['3S', 'Request 3NT'], ['3NT', 'To play'],
    ]);
    if (!afterPuppet) table(`${prefix} 2C`, [['2D', 'Puppet acceptance; no extra strength or shape shown']]);
    table(`${prefix} 2S`, [['2NT', 'Four-plus clubs'], ['3C', 'Four-plus diamonds'], ['3D', 'No four-card minor']]);
    table(`${prefix} 2S 2NT`, [['3C', 'Agree clubs'], ['3D', 'Four/five diamonds'], ['3H', 'Six diamonds and four clubs'], ['3S', 'Six clubs and four diamonds']]);
    table(`${prefix} 2S 3C`, [['3D', 'Agree diamonds'], ['3H', 'Six clubs and four diamonds'], ['3S', 'Six diamonds and four clubs']]);
  }
}

// Strong 2NT opening (P1311–P1429), separate from the Horton enquiry.
table('2NT', [['Pass','Play 2NT'],['3C','Muppet Stayman'],['3D','Five-plus hearts; transfer'],['3H','Five-plus spades; transfer'],['3S','Minor-suit Stayman'],['3NT','To play'],['4C','Diamond slam try'],['4D','Club slam try'],['4H','Transfer to 4S'],['4S','To play'],['4NT','Quantitative invitation']]);
table('2NT 3C', [['3D','One/both four-card majors'],['3H','No four/five-card major'],['3S','Five spades'],['3NT','Five hearts']]);
table('2NT 3C 3D', [['3H','Four spades'],['3S','Four hearts'],['3NT','To play'],['4C','4/4 majors; slam interest'],['4D','4/4 majors; game choice']]);
table('2NT 3C 3H', [['3S','Puppet to 3NT; denies five spades/four hearts'],['3NT','Five spades/four hearts; game choice'],['4C','Five-plus clubs; slam try'],['4D','Five-plus diamonds; slam try'],['4H','Five spades/four hearts; non-forcing slam try'],['4S','Five spades/four hearts; slam force'],['4NT','Quantitative invitation']]);
table('2NT 3D', [['3H','Transfer acceptance; at most three hearts'],['3S','Four/five hearts; decent/good for slam'],['3NT','Three hearts; great for slam'],['4C','Four/five hearts; club control'],['4D','Four/five hearts; diamond control'],['4H','Four/five hearts; game choice']]);
table('2NT 3H', [['3S','Transfer acceptance; at most three spades'],['3NT','Three spades; great for slam'],['4C','Four/five spades; decent/good for slam'],['4D','Four/five spades; diamond control'],['4H','Four/five spades; heart control'],['4S','Four/five spades; game choice']]);
table('2NT 3S', [['3NT','No four/five-card minor, or unsuitable hand'],['4C','Four clubs'],['4D','Four diamonds'],['4H','Five clubs'],['4S','Five diamonds']]);
table('2NT 4H', [['4S','Accept the transfer to spades']]);

function key(auction) {
  if (!auction.length || auction.some((call,index) => call.seat !== (index % 2 ? 'South' : 'North'))) return null;
  return auction.map(call => call.bid).join(' ');
}
export function entryContinuations(auction) { return tables.get(key(auction)) ?? null; }
export function entryMeaning(auction) {
  if (!key(auction)) return null;
  if (auction.length === 1) return openings[auction[0].bid] ?? null;
  return entryContinuations(auction.slice(0,-1))?.find(row => row.bid === auction.at(-1).bid)?.label ?? null;
}
// Old saved prefixes can be repaired for display without mutating the save.
export function describeEntryAuction(auction) {
  return auction.map((call,index) => {
    const generic = !call.meaning || /relay entry|source entry|^Response showing |^(Club|Diamond|clubs|diamonds) opening$/i.test(call.meaning);
    const meaning = generic && entryMeaning(auction.slice(0,index+1));
    return meaning ? { ...call, meaning } : call;
  });
}
