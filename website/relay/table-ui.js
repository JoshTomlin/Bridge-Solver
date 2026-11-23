export const AUCTION_SEATS = ['North', 'East', 'South', 'West'];

// The practice engine records the partnership's calls. Insert the two
// opponents' automatic passes without changing the underlying auction.
export function auctionRounds(calls, finished = false, firstSeat = 'North') {
  const rounds = [];
  let row;
  let previous = 3;
  if ((calls.length || !finished) && ['East', 'West'].includes(firstSeat)) {
    row = Array(4).fill(null);
    previous = AUCTION_SEATS.indexOf(firstSeat);
    row[previous] = { kind: 'opponent', bid: 'Pass', seat: firstSeat };
    rounds.push(row);
  }
  if (!calls.length && !finished) {
    const column = (AUCTION_SEATS.indexOf(firstSeat) + (row ? 1 : 0)) % 4;
    if (!row || column === 0) { row = Array(4).fill(null); rounds.push(row); }
    row[column] = { kind: 'pending' };
    return rounds;
  }
  for (const [index, call] of calls.entries()) {
    const column = AUCTION_SEATS.indexOf(call.seat);
    if (column !== 0 && column !== 2) throw new Error('Expected a partnership call.');
    if (!row || column <= previous) { row = Array(4).fill(null); rounds.push(row); }
    row[column] = { ...call, index, kind: 'call' };
    row[column + 1] = { kind: 'opponent', bid: 'Pass', seat: AUCTION_SEATS[column + 1] };
    previous = column;
  }
  if (calls.length && !finished) {
    const column = previous === 0 ? 2 : 0;
    if (column === 0) { row = Array(4).fill(null); rounds.push(row); }
    row[column] = { kind: 'pending' };
  }
  return rounds;
}
