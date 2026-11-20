// Source nodes retain their original seats. Rotate the complete displayed
// partnership so the human is always South, including opener/teller practice.
import { practiceView } from './practice.js';

export function tableSeat(session, seat) {
  if (practiceView(session).playerSeat !== 'North') return seat;
  return ({ North: 'South', South: 'North', East: 'West', West: 'East' })[seat] ?? seat;
}

export function tableView(session) {
  const view = practiceView(session);
  return { ...view, playerSeat: 'South', partnerSeat: 'North',
    ...(session.dealerSeat ? { dealerSeat: tableSeat(session, session.dealerSeat) } : {}),
    auction: view.auction.map(call => ({ ...call, seat: tableSeat(session, call.seat) })) };
}

export function tableContract(session, contract = session.contract) {
  return contract ? { ...contract, declarer: tableSeat(session, contract.declarer) } : null;
}

export function tableCallDetails(session, detail) {
  if (!detail || detail.displaySeats) return detail;
  const call = value => value && ({ ...value, seat: tableSeat(session, value.seat) });
  return { ...detail, displaySeats: true, call: call(detail.call), question: call(detail.question),
    ...(session.dealerSeat ? { dealerSeat: tableSeat(session, session.dealerSeat) } : {}),
    auction: detail.auction.map(call) };
}
