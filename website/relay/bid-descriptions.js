const singularSuit = suit => ({ clubs: 'Club', diamonds: 'Diamond', hearts: 'Heart', spades: 'Spade' })[suit.toLowerCase()];
const counts = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

// Display copy only: keep source meanings and saved auctions intact. In
// particular, never shorten away negatives, alternatives or hand restrictions.
export function shortBidDescription(value) {
  let text = String(value ?? '').trim();
  text = text
    .replace(/\b(?:Low|Middle|High) shortage:\s*(clubs|diamonds|hearts|spades)(?: singleton or void)?\b/gi,
      (_, suit) => `${singularSuit(suit)} shortage`)
    .replace(/\b(clubs|diamonds|hearts|spades) (?:shortage(?:: singleton or void)?|singleton or void)\b/gi,
      (_, suit) => `${singularSuit(suit)} shortage`)
    .replace(/\bBalanced: no singleton or void\b/gi, 'Balanced')
    .replace(/\s*\(rolling range\)/gi, '')
    .replace(/(\d)[–−](?=\d)/g, '$1-')
    .replace(/(\d+(?:-\d+|\+)?)\s+HC(?:P)?\b/g, '$1')
    .replace(/\bKxx or longer\b/g, 'Kxx+')
    .replace(/\bKing and queen\b/gi, 'KQ+')
    .replace(/\b(two|three|four|five|six|seven)\b/gi, word => counts[word.toLowerCase()])
    .replace(/\b(\d+)-plus\b/g, '$1+');

  const phrases = {
    'Start the major-suit relay': 'Major-suit relay',
    'Start the revised minor relay': 'Minor relay',
    'Continue asking shape': 'Shape ask',
    'Ask opener’s HCP range': 'Range ask',
    'Ask for the trump queen': 'Trump queen ask',
    'Ask keycards after the void answer': 'Keycards after void',
    'Accept partner’s final contract': 'Accept final contract',
    'Source-defined relay entry': 'Relay entry',
    'Undiscussed in this exercise. Bidding this call pauses the auction for review.': 'Undiscussed',
  };
  text = phrases[text] ?? text;
  text = text
    .replace(/^Ask about (clubs|diamonds|hearts|spades)$/i, (_, suit) => `${singularSuit(suit)} ask`)
    .replace(/^(?:Ask )?Shortage Keycard in (clubs|diamonds|hearts|spades)$/i, (_, suit) => `${singularSuit(suit)} SKC`)
    .replace(/^Ask keycards in (clubs|diamonds|hearts|spades)$/i, (_, suit) => `${singularSuit(suit)} keycards`)
    .replace(/^Kickback in (clubs|diamonds|hearts|spades)(.*)$/i, (_, suit, rest) => `${singularSuit(suit)} Kickback${rest}`)
    .replace(/^Ask shape, agreeing (clubs|diamonds|hearts|spades)$/i, (_, suit) => `${singularSuit(suit)} fit; shape ask`)
    .replace(/^Agree (clubs|diamonds|hearts|spades)(?: instead)? and ask shortage$/i, (_, suit) => `${singularSuit(suit)} fit; shortage ask`)
    .replace(/\b(\d+) or (\d+) keycards\b/g, '$1/$2 keycards')
    .replace(/keycards, no trump queen\b/g, 'keycards, no Q')
    .replace(/keycards and the trump queen\b/g, 'keycards + Q')
    .replace(/^Choose ([1-7](?:NT|[CDHS])) as the final contract$/, 'Play $1')
    .replace(/^Partner accepts your (?:selected )?final contract; opponents pass throughout$/, 'Accept final contract')
    .replace(/\b((?:Club|Diamond|Heart|Spade|No) shortage|Balanced);\s*(?=\d)/gi, '$1 ')
    .replace(/^(\d+(?:-\d+|\+)?),?\s+((?:club|diamond|heart|spade) shortage)$/i, '$2 $1');
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}
