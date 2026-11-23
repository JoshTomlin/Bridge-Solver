import { humanIsOpener, openingTitle } from './opening-practice.js';
import { getPracticeProfile, handFeatures, SUITS, RANKS } from './core.js';
import { tableView, tableSeat, tableContract } from './seat-view.js';
import { auctionCallDetails } from './auction-study.js';
import { shortBidDescription } from './bid-descriptions.js';
import { auctionRounds, AUCTION_SEATS } from './table-ui.js';

export const HAND_HISTORY_KEY = 'bridge-lab.relay-hand-history.v1';
export const HAND_HISTORY_LIMIT = 100;
export const partnershipDealKey = (first, second) =>
  [first, second].map(hand => [...hand].sort().join('')).sort().join('/');
const VERSION = 1;
const seats = ['North', 'South'];
const validContractBid = bid => typeof bid === 'string' && /^[1-7](?:C|D|H|S|NT)$/.test(bid);
const validBid = bid => validContractBid(bid) || ['Pass', 'X', 'XX'].includes(bid);
const text = (value, limit = 2000) => typeof value === 'string' && value.length <= limit;
const bidLabel = bid => bid.replace(/([1-7])(NT|[SHDC])/g, (_, level, suit) => level + ({ S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' })[suit]);

// Store descriptions and response ladders with the hand, so later rule changes
// cannot reinterpret an old auction or make its review depend on a retired node.
export function createHandRecord(session, history, { id, createdAt = new Date().toISOString(), updatedAt = new Date().toISOString() }) {
  const view = tableView(session);
  const describe = call => call && ({ seat: tableSeat(session, call.seat), bid: call.bid, meaning: shortBidDescription(call.meaning ?? '') });
  return {
    id, createdAt, updatedAt,
    title: session.wholeAuction ? openingTitle(session) : getPracticeProfile(session.familyId).name,
    seed: session.seed,
    role: session.wholeAuction ? humanIsOpener(session) ? 'Opener' : 'Responder'
      : session.practiceRole === 'teller' ? 'Teller' : 'Asker',
    humanSeat: view.playerSeat,
    ...(session.wholeAuction?.competition ? { competitive: true } : {}),
    ...(view.dealerSeat ? { dealerSeat: view.dealerSeat } : {}),
    hands: { [tableSeat(session, session.playerSeat)]: [...session.playerHand], [tableSeat(session, session.partnerSeat)]: [...session.partnerHand] },
    revealed: session.revealed, finished: session.finished,
    undiscussed: Boolean(session.undiscussedBid),
    contract: tableContract(session),
    auction: view.auction.map((_, index) => {
      const detail = auctionCallDetails(session, history, index);
      return { ...describe(detail.call), study: {
        question: describe(detail.question), contextLength: detail.auction.length,
        alternatives: detail.alternatives.map(answer => ({ bid: answer.bid, label: shortBidDescription(answer.label) })),
        callAlternatives: detail.callAlternatives.map(answer => ({ bid: answer.bid, label: shortBidDescription(answer.label) })),
        playedBid: detail.playedBid,
      } };
    }),
  };
}

function validateRecord(record) {
  if (!record || !text(record.id, 100) || !record.id || !text(record.title, 300) || !text(record.seed, 1000)
      || !['Asker', 'Teller', 'Opener', 'Responder'].includes(record.role) || !seats.includes(record.humanSeat)
      || ![record.createdAt, record.updatedAt].every(date => text(date, 50) && Number.isFinite(Date.parse(date)))
      || ![record.revealed, record.finished, record.undiscussed].every(flag => typeof flag === 'boolean')) {
    throw new Error('Invalid hand record.');
  }
  for (const seat of seats) handFeatures(record.hands?.[seat], 'S');
  if (new Set([...record.hands.North, ...record.hands.South]).size !== 26) throw new Error('Invalid recorded hands.');
  const callSeats = record.competitive ? AUCTION_SEATS : seats;
  const validCall = call => call && callSeats.includes(call.seat) && validBid(call.bid) && text(call.meaning);
  if (!Array.isArray(record.auction) || record.auction.length > 100
      || !record.auction.every(call => validCall(call) && call.study
        && (call.study.question === null || validCall(call.study.question))
        && Number.isInteger(call.study.contextLength) && call.study.contextLength > 0 && call.study.contextLength <= record.auction.length
        && (call.study.playedBid === null || validBid(call.study.playedBid))
        && Array.isArray(call.study.alternatives) && call.study.alternatives.length <= 36
        && call.study.alternatives.every(answer => validBid(answer.bid) && text(answer.label)))) {
    throw new Error('Invalid recorded auction.');
  }
  if (record.contract && (!validContractBid(record.contract.bid) || !callSeats.includes(record.contract.declarer)
      || (record.competitive && !['', 'X', 'XX'].includes(record.contract.doubling)))) throw new Error('Invalid recorded contract.');
  return record;
}

export function loadHandHistory(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(HAND_HISTORY_KEY);
    if (raw === null) return { records: [] };
    const saved = JSON.parse(raw);
    if (saved?.version !== VERSION || !Array.isArray(saved.records)) throw new Error('Saved hand history could not be read.');
    const records = [];
    for (const record of saved.records.slice(0, HAND_HISTORY_LIMIT)) {
      try {
        validateRecord(record);
        let displayed = record;
        if (record.humanSeat === 'North') {
          const seat = value => ({ North: 'South', South: 'North', East: 'West', West: 'East' })[value] ?? value;
          const call = value => value && ({ ...value, seat: seat(value.seat) });
          displayed = { ...record, humanSeat: 'South', hands: { North: record.hands.South, South: record.hands.North },
            contract: record.contract && { ...record.contract, declarer: seat(record.contract.declarer) },
            auction: record.auction.map(value => ({ ...call(value), study: { ...value.study, question: call(value.study.question) } })),
          };
        }
        if (!records.some(previous => previous.id === record.id)) records.push(displayed);
      } catch { /* Keep other usable hands if one record was damaged. */ }
    }
    return { records, ...(records.length !== saved.records.length ? { warning: 'Some saved hands could not be read.' } : {}) };
  } catch (error) {
    return { records: [], error: error.message || String(error) };
  }
}

/** Upsert the same hand across bids, undo and reload; a new deal gets a new ID. */
export function updateHandHistory(records, record) {
  validateRecord(record);
  return [record, ...records.filter(previous => previous.id !== record.id)].slice(0, HAND_HISTORY_LIMIT);
}

export function saveHandHistory(records, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(HAND_HISTORY_KEY, JSON.stringify({ version: VERSION, records }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

export function recordedCallDetails(record, index) {
  const call = record.auction[index];
  return call ? { call, ...call.study, displaySeats: true, ...(record.dealerSeat ? { dealerSeat: record.dealerSeat } : {}), auction: record.auction.slice(0, call.study.contextLength) } : null;
}

export function recordedHandStatus(record) {
  if (record.undiscussed) return `Undiscussed${record.contract ? ` · ${bidLabel(record.contract.bid)} by ${record.contract.declarer}` : ''}`;
  if (record.contract) return `${bidLabel(record.contract.bid)}${record.contract.doubling ?? ''} by ${record.contract.declarer}`;
  return record.revealed ? 'Revealed' : record.finished ? 'Complete' : 'Unfinished';
}

export function canReviewBothHands(record, currentHandId) {
  return record.id !== currentHandId || record.revealed;
}

export function handRecordText(record, currentHandId) {
  const bothHands = canReviewBothHands(record, currentHandId);
  const lines = ['Bridge Lab · Relay', bidLabel(record.title),
    `${new Date(record.createdAt).toISOString()} · ${record.role} (${record.humanSeat})`,
    recordedHandStatus(record), '', 'Hands'];
  for (const seat of seats) {
    lines.push(`${seat}${seat === record.humanSeat ? ' (you)' : ' (partner)'}: ${bothHands || seat === record.humanSeat
      ? SUITS.map(suit => `${({ S: '♠', H: '♥', D: '♦', C: '♣' })[suit]} ${RANKS.filter(rank => record.hands[seat].includes(suit + rank)).join('') || '—'}`).join('  ')
      : 'Hidden while this hand is in progress'}`);
  }
  lines.push('', record.competitive ? 'Auction · Scripted opponents' : 'Auction · East and West pass', AUCTION_SEATS.join('\t'));
  for (const row of auctionRounds(record.auction, record.finished || record.revealed, record.dealerSeat ?? record.humanSeat, Boolean(record.competitive))) {
    lines.push(row.map(call => !call ? '—' : call.kind === 'pending' ? '?' : bidLabel(call.bid)).join('\t'));
  }
  lines.push('', 'Bid explanations');
  for (const call of record.auction) lines.push(`${call.seat} ${bidLabel(call.bid)}: ${call.meaning || 'No meaning recorded.'}`);
  lines.push('', `Hand seed: ${record.seed}`);
  return lines.join('\n');
}
