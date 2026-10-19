import { availableActions, applyBid, revealPractice, handFeatures, SUITS, RANKS, PRACTICE_PROFILES, getPracticeProfile, practiceNode } from './core.js';
import { createEvaluationDeals, fillOpponentHands } from './evaluation.js';

const byId = (id) => document.getElementById(id);
const symbols = { S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' };
const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const bidLabel = (bid) => String(bid).replace(/([1-7])(NT|[SHDC])/g, (_, level, suit) => level + symbols[suit]);
let session = null;
let history = [];
let samples = null;
let busy = false;
let ddsReady = false;
let job = 0;

class WorkerClient {
  constructor(file) {
    this.worker = new Worker(new URL(file, import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.counter = 0;
    this.worker.addEventListener('message', ({ data }) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      if (data.type === 'progress') { pending.onProgress?.(data); return; }
      this.pending.delete(data.id);
      if (data.error || data.type === 'error') pending.reject(new Error(data.error || 'Worker failed'));
      else pending.resolve(data.result ?? data);
    });
    this.worker.addEventListener('error', (event) => {
      for (const pending of this.pending.values()) pending.reject(new Error(event.message || 'Could not load the worker'));
      this.pending.clear();
    });
  }
  request(payload, onProgress) {
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ ...payload, id });
    });
  }
  close() {
    this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(new Error('Stopped'));
    this.pending.clear();
  }
}

let sampler = new WorkerClient('./sampling-worker.js');
let evaluator = new WorkerClient('./evaluation-worker.js');

function status(message, error = false) {
  byId('status').textContent = message;
  byId('status').classList.toggle('is-error', error);
}

function sampleStatus(message, error = false) {
  byId('sample-status').textContent = message;
  byId('sample-status').classList.toggle('is-error', error);
}

function handMarkup(cards) {
  return SUITS.map((suit) => `<span class="suit-holding suit-${suit}"><span class="symbol" aria-label="${({ S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' })[suit]}">${symbols[suit]}</span>${RANKS.filter((rank) => cards.includes(suit + rank)).join('') || '—'}</span>`).join('');
}

function handRecord(cards) {
  return SUITS.map((suit) => RANKS.filter((rank) => cards.includes(suit + rank)).join('') || '-').join('.');
}

function setBusy(value) {
  busy = value;
  for (const id of ['profile', 'seed', 'new-deal', 'random-deal', 'sample-count']) byId(id).disabled = busy;
  byId('stop-analysis').hidden = !busy;
  render();
}

function render() {
  if (!session) return;
  const hints = byId('show-hints').checked;
  const profile = getPracticeProfile(session.familyId);
  byId('practice-badge').textContent = bidLabel(profile.name);
  byId('system-assumptions').innerHTML = [...(profile.assumptions ?? []), ...(profile.limitations ?? [])].map(text => `<li>${escapeHtml(bidLabel(text))}</li>`).join('');
  byId('partner-seat').textContent = `${session.partnerSeat} · Your partner`;
  byId('player-seat').textContent = `${session.playerSeat} · Your hand`;
  byId('north-heading').textContent = `North · ${session.playerSeat === 'North' ? 'You' : 'Partner'}`;
  byId('south-heading').textContent = `South · ${session.playerSeat === 'South' ? 'You' : 'Partner'}`;
  const features = handFeatures(session.playerHand, session.major);
  byId('session-seed').textContent = session.seed;
  byId('player-hand').innerHTML = handMarkup(session.playerHand);
  byId('player-hcp').textContent = `${features.hcp} HCP`;
  byId('partner-hand').innerHTML = session.revealed
    ? `<div class="hand-lines">${handMarkup(session.partnerHand)}</div><p>${handFeatures(session.partnerHand, session.major).hcp} HCP · Partner’s original hand</p>`
    : '<div class="card-backs" aria-label="Partner’s hand is hidden"><i></i><i></i><i></i><i></i><i></i></div><p>13 cards. One fixed hand.</p>';
  const cells = session.auction.filter((call) => ['North', 'South'].includes(call.seat));
  const rows = [];
  for (let index = 0; index < cells.length; index += 2) {
    rows.push(`<tr>${[cells[index], cells[index + 1]].map((call) => `<td>${call ? `<span class="bid">${escapeHtml(bidLabel(call.bid))}</span>${hints ? `<small>${escapeHtml(bidLabel(call.meaning))}</small>` : ''}` : session.finished ? '<span aria-label="Auction complete">—</span>' : '<span aria-label="Awaiting your bid">·</span>'}</td>`).join('')}</tr>`);
  }
  byId('auction').innerHTML = rows.join('');
  const actions = availableActions(session);
  const actionMarkup = (action) => `<button type="button" class="bid-button" data-bid="${escapeHtml(action.bid)}" ${busy ? 'disabled' : ''}><strong>${escapeHtml(bidLabel(action.bid))}</strong>${(hints && action.kind === 'relay') || action.bid === 'Pass' ? `<small>${escapeHtml(bidLabel(action.label))}</small>` : ''}</button>`;
  byId('relay-actions').innerHTML = actions.filter((a) => a.kind === 'relay').map(actionMarkup).join('');
  const ladders = actions.filter((action) => action.responseLadder);
  byId('response-steps').hidden = !hints || !ladders.length;
  byId('response-ladders').innerHTML = ladders.map((action) => `<p><strong>${escapeHtml(bidLabel(action.bid))} · ${escapeHtml(action.label)}</strong></p><dl>${action.responseLadder.map((answer) => `<dt>${escapeHtml(bidLabel(answer.bid))}</dt><dd>${escapeHtml(answer.label)}</dd>`).join('')}</dl>`).join('');
  const signoffs = actions.filter((a) => a.kind === 'signoff');
  byId('signoff-actions').innerHTML = signoffs.map(actionMarkup).join('');
  byId('signoff-section').hidden = !signoffs.length;
  const stopped = session.finished || session.revealed;
  const noFurtherAsk = !actions.some((action) => action.kind === 'relay');
  byId('phase-label').textContent = stopped ? 'Review' : noFurtherAsk ? 'Review the auction' : 'Your turn';
  byId('bid-form').hidden = stopped || !actions.length;
  byId('bid-input').disabled = busy;
  byId('submit-bid').disabled = busy;
  if (session.contract) {
    byId('action-title').textContent = `${bidLabel(`${session.contract.level}${session.contract.strain}`)} by ${session.contract.declarer}`;
    byId('action-help').textContent = 'Auction complete. Review partner’s hand, then compare the contracts on compatible deals.';
  } else if (stopped) {
    byId('action-title').textContent = 'Partner’s hand revealed';
    byId('action-help').textContent = 'Review what the auction showed. Undo or deal another hand to continue practising.';
  } else if (noFurtherAsk) {
    byId('action-title').textContent = 'Choose your contract';
    byId('action-help').textContent = session.unsupportedReason || 'No further supported asks are available here. Choose a final contract or reveal partner and review the auction.';
  } else {
    const help = {
      family: [practiceNode(session)?.label ?? 'Continue the relay', practiceNode(session)?.help ?? 'Choose another ask or your final contract.'],
      raise: ['Begin the relay', 'Use 2NT to ask partner to describe their hand. A low-shortage answer also gives the strength range.'],
      range: ['Ask for partner’s range', 'The next relay asks strength. Opener’s answer counts every bid, including game in the major.'],
      shortage: ['Ask for partner’s range', 'The next relay asks strength.'],
      keycard: ['Ask about keycards', 'Continue with the next relay, or choose a final contract.'],
      'void-keycard': ['Partner has a void', 'The next relay asks keycards now that the void is known.'],
      'post-keycard': actions.some((action) => action.askType === 'queen')
        ? ['Queen or specific suit?', 'Ask about the trump queen, or choose a specific side-suit ask.']
        : ['Ask about a side suit', session.queenAskAllowed === false
          ? 'Horton’s two-keycard answer omits the queen ask. Choose a specific side-suit ask or your final contract.'
          : 'The trump queen is known. Choose a specific side-suit ask or your final contract.'],
      'suit-ask': ['Explore the remaining suit', 'You can ask an eligible unasked suit. Response steps omit holdings already ruled out by the auction.'],
    }[session.phase] || ['Continue the relay', 'Choose another supported ask or your final contract.'];
    byId('action-title').textContent = hints ? help[0] : 'Your next call';
    byId('action-help').textContent = hints ? help[1] : 'Enter your bid or choose a call below. Turn on “Show meanings” whenever you want a hint.';
  }
  byId('constraint-count').textContent = hints ? `${session.constraints.length} facts` : 'Hidden';
  byId('knowledge').innerHTML = hints
    ? `<ul class="constraint-list">${session.constraints.map((constraint) => `<li>${escapeHtml(constraint.label)}</li>`).join('')}</ul>`
    : '<p>Meanings and constraints are hidden for recall practice. Sampling still uses every fact established by the auction.</p>';
  byId('undo-bid').disabled = busy || !history.length;
  byId('reveal-hand').disabled = busy || session.revealed;
  byId('sample-hands').disabled = busy;
  byId('evaluate').disabled = busy || !ddsReady;
}

function invalidateAnalysis() {
  samples = null;
  byId('sample-results').replaceChildren();
  byId('evaluation-results').replaceChildren();
  sampleStatus('Each sample gets one random East/West split. All contracts use the same deals.');
  byId('bid-feedback').textContent = '';
}

async function dealHand() {
  if (busy) return;
  const currentJob = ++job;
  setBusy(true);
  status('Dealing a fixed partner hand and a matching practice hand…');
  try {
    const next = await sampler.request({ command: 'deal', payload: { profileId: byId('profile').value, seed: byId('seed').value.trim() || 'relay-1' } });
    if (currentJob !== job) return;
    session = next;
    history = [];
    invalidateAnalysis();
    status('Practice auction ready. Your partner’s hand will stay fixed throughout the auction.');
  } catch (error) { if (currentJob === job) status(error.message, true); }
  finally { if (currentJob === job) setBusy(false); }
}

function chooseBid(bid) {
  if (busy || !session) return;
  try {
    const next = applyBid(session, bid);
    history.push(session);
    session = next.finished ? revealPractice(next) : next;
    invalidateAnalysis();
    status(session.finished ? 'Auction complete.' : 'Partner has answered from the original hand.');
    byId('bid-input').value = '';
    render();
  } catch (error) { byId('bid-feedback').textContent = error.message; }
}

function showSamples(result) {
  const features = result.hands.map((hand) => handFeatures(hand, session.major));
  const range = features.length ? `${Math.min(...features.map((f) => f.hcp))}–${Math.max(...features.map((f) => f.hcp))} HCP` : 'No matching hands';
  sampleStatus(`${result.hands.length.toLocaleString()} compatible hands · ${result.attempts.toLocaleString()} candidate hands checked · ${range}.${result.complete ? '' : ' The attempt limit was reached; this is a partial sample.'}`);
  byId('sample-results').innerHTML = result.hands.length ? `<details class="sample-details"><summary>Inspect ${Math.min(5, result.hands.length)} sampled hands</summary><p>SHDC order; these are possible hands, not a reveal of partner’s actual cards. Hands are sampled independently with replacement.</p><div class="sample-preview">${result.hands.slice(0, 5).map((hand) => `<code>${escapeHtml(handRecord(hand))}</code>`).join('')}</div></details>` : '';
}

async function collectSamples() {
  const count = Number(byId('sample-count').value);
  sampleStatus(`Sampling ${count.toLocaleString()} compatible partner hands…`);
  return sampler.request({ command: 'sample', payload: { session, options: { count, seed: `${session.seed}:samples:${session.auction.map((call) => call.bid).join('-')}`, maxAttempts: 500000 } } });
}

function showEvaluation(result) {
  const percent = (n) => `${(n * 100).toFixed(1)}%`;
  const rows = result.contracts.map((contract) => {
    const selected = session.contract && contract.level === session.contract.level && contract.strain === session.contract.strain;
    const actual = result.actual?.contracts.find((row) => row.key === contract.key);
    return `<tr class="${selected ? 'is-selected' : ''}"><td><strong>${escapeHtml(bidLabel(`${contract.level}${contract.strain}`))}</strong>${selected ? ' · chosen' : ''}</td><td>${escapeHtml(contract.declarer)}</td><td>${percent(contract.makeFraction)}<span class="rate-bar" aria-hidden="true"><i style="width:${contract.makeFraction * 100}%"></i></span></td><td>${contract.makes}/${contract.total}</td><td>${percent(contract.interval.low)}–${percent(contract.interval.high)}</td>${result.actual ? `<td>${actual ? `${actual.tricks} tricks` : '—'}</td>` : ''}</tr>`;
  }).join('');
  byId('evaluation-results').innerHTML = `<div class="results-wrap"><table class="results-table"><thead><tr><th>Contract</th><th>Declarer</th><th>DD make</th><th>Made / deals</th><th>95% interval</th>${result.actual ? '<th>Practice deal</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>${result.actual ? '<p class="method-note">Practice deal = the original partner hand with one reproducible random opponent layout. Its trick count is separate from the compatible-hand sample.</p>' : ''}`;
}

async function analyze(withDds) {
  if (busy || !session) return;
  const currentJob = ++job;
  setBusy(true);
  byId('evaluation-results').replaceChildren();
  try {
    if (!samples) {
      const result = await collectSamples();
      if (currentJob !== job) return;
      samples = result;
    }
    showSamples(samples);
    if (withDds && samples.hands.length) {
      const context = { trump: session.trump, playerSeat: session.playerSeat, partnerSeat: session.partnerSeat, auction: session.auction };
      const deals = createEvaluationDeals(session.playerHand, samples.hands, `${session.seed}:opponents`, context);
      const actualDeal = session.revealed ? fillOpponentHands(session.playerHand, session.partnerHand, `${session.seed}:actual`, context) : undefined;
      const result = await evaluator.request({ deals, context, contract: session.contract, actualDeal }, (progress) => sampleStatus(`Double-dummy evaluation · ${progress.completed} / ${progress.total} deals`));
      if (currentJob !== job) return;
      showSamples(samples);
      showEvaluation(result);
    }
  } catch (error) { if (currentJob === job) sampleStatus(error.message, true); }
  finally { if (currentJob === job) setBusy(false); }
}

async function probeDds() {
  const activeEvaluator = evaluator;
  ddsReady = false;
  byId('dds-status').textContent = 'DDS: checking…';
  byId('dds-status').classList.remove('is-ready');
  render();
  try {
    await activeEvaluator.request({ type: 'probe' });
    if (activeEvaluator !== evaluator) return;
    ddsReady = true;
    byId('dds-status').textContent = 'DDS ready';
    byId('dds-status').classList.add('is-ready');
    byId('evaluate').title = '';
  } catch (error) {
    if (activeEvaluator !== evaluator) return;
    byId('dds-status').textContent = 'DDS unavailable in this build';
    byId('dds-status').title = error.message;
    byId('evaluate').title = 'Double-dummy evaluation needs a build with the DDS engine.';
  }
  render();
}

const profileGroups = [...new Set(PRACTICE_PROFILES.map(profile => profile.family ?? 'Other relays'))];
byId('profile').innerHTML = profileGroups.map(group => `<optgroup label="${escapeHtml(group)}">${PRACTICE_PROFILES.filter(profile => (profile.family ?? 'Other relays') === group).map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(bidLabel(profile.name))}</option>`).join('')}</optgroup>`).join('');
byId('profile').addEventListener('change', dealHand);
byId('deal-form').addEventListener('submit', (event) => { event.preventDefault(); dealHand(); });
byId('random-deal').addEventListener('click', () => {
  byId('seed').value = `relay-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
  dealHand();
});
byId('show-hints').addEventListener('change', render);
byId('bid-form').addEventListener('submit', (event) => {
  event.preventDefault();
  let bid = byId('bid-input').value.trim().toUpperCase().replace(/\s+/g, '').replace(/[♠♥♦♣]/g, (symbol) => ({ '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' })[symbol]);
  if (/^[1-7]N$/.test(bid)) bid += 'T';
  if (bid === 'P' || bid === 'PASS') bid = 'Pass';
  if (!bid) { byId('bid-feedback').textContent = 'Enter a bid, for example 4D or 5NT.'; return; }
  chooseBid(bid);
});
for (const id of ['relay-actions', 'signoff-actions']) byId(id).addEventListener('click', (event) => {
  const button = event.target.closest('[data-bid]');
  if (button) chooseBid(button.dataset.bid);
});
byId('reveal-hand').addEventListener('click', () => {
  history.push(session);
  session = revealPractice(session);
  byId('evaluation-results').replaceChildren();
  status('Partner’s original hand is revealed. Auction constraints are unchanged.');
  render();
});
byId('undo-bid').addEventListener('click', () => {
  session = history.pop();
  invalidateAnalysis();
  status('Previous auction state restored with the same partner hand.');
  render();
});
byId('sample-hands').addEventListener('click', () => analyze(false));
byId('evaluate').addEventListener('click', () => analyze(true));
byId('sample-count').addEventListener('change', invalidateAnalysis);
byId('stop-analysis').addEventListener('click', () => {
  ++job;
  sampler.close();
  evaluator.close();
  sampler = new WorkerClient('./sampling-worker.js');
  evaluator = new WorkerClient('./evaluation-worker.js');
  ddsReady = false;
  setBusy(false);
  status('Stopped. Your practice hand is unchanged.');
  sampleStatus('Analysis stopped. Completed samples, if any, are retained.');
  probeDds();
});

probeDds();
dealHand();
