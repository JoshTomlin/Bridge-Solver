import { revealPractice, handFeatures, SUITS, RANKS, getPracticeProfile, practiceNode } from './core.js';
import { availablePracticeActions, practiceCalls, applyPracticeBid, practiceView } from './practice.js';
import { createEvaluationDeals, fillOpponentHands, defaultContracts } from './evaluation.js';
import { loadPracticeProgress, savePracticeProgress } from './progress.js';
import { AUCTION_FAMILIES, getAuctionFamily, auctionFamilyForProfile, selectFamilyProfile } from './families.js';
import { AUCTION_SEATS, auctionRounds } from './table-ui.js';
import { attachBidPreview } from './bid-preview.js';

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
let committedStudyProfileId = '';
let selectedLevel = null;
let lastAuctionKey = '';
let auctionRowLimit = 4;
let bidPreview = null;

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
  byId('notice').textContent = error ? message : '';
  byId('notice').hidden = !error;
}

function sampleStatus(message, error = false) {
  byId('sample-status').textContent = message;
  byId('sample-status').classList.toggle('is-error', error);
}

function persistProgress() {
  if (!session) return;
  const saved = savePracticeProgress({ session, history, preferences: {
    showHints: byId('show-hints').checked,
    sampleCount: byId('sample-count').value,
    analysisBasis: byId('analysis-basis').value,
    assessedContract: byId('assessed-contract').value,
    bidInput: byId('bid-input').value,
    studyProfileId: byId('profile').value,
  } });
  byId('save-status').classList.toggle('is-error', !saved.ok);
  byId('save-status').textContent = saved.ok ? 'Progress saved in this browser.'
    : 'Progress could not be saved in this browser. Keep this tab open to retain your auction.';
}

function handMarkup(cards) {
  return SUITS.map((suit) => `<span class="suit-holding suit-${suit}"><span class="symbol" aria-label="${({ S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' })[suit]}">${symbols[suit]}</span>${RANKS.filter((rank) => cards.includes(suit + rank)).join('') || '—'}</span>`).join('');
}

function handRecord(cards) {
  return SUITS.map((suit) => RANKS.filter((rank) => cards.includes(suit + rank)).join('') || '-').join('.');
}

function setBusy(value) {
  busy = value;
  for (const id of ['practice-role', 'auction-family', 'profile', 'seed', 'new-deal', 'replay-deal', 'sample-count', 'analysis-basis', 'assessed-contract']) byId(id).disabled = busy;
  byId('stop-analysis').hidden = !busy;
  byId('stop-deal').hidden = !busy;
  render();
}

function auctionMarkup(rows) {
  return rows.map(row => `<tr>${row.map(call => `<td>${!call ? '' : call.kind === 'pending'
    ? '<span class="awaiting-bid" aria-label="Awaiting your bid">?</span>'
    : call.kind === 'opponent' ? '<span class="opponent-pass">Pass</span>'
    : `<button type="button" class="bid auction-call suit-${call.bid.match(/NT|[SHDC]/)?.[0] ?? 'NT'}" data-call-index="${call.index}" aria-label="${escapeHtml(bidLabel(call.bid))}, ${call.seat}. Show meaning">${escapeHtml(bidLabel(call.bid))}</button>`}</td>`).join('')}</tr>`).join('');
}

function renderAuction() {
  if (!session) return;
  const view = practiceView(session);
  const rounds = auctionRounds(view.auction, session.finished || session.revealed);
  byId('auction').innerHTML = auctionMarkup(rounds.slice(-auctionRowLimit));
  byId('auction-history').innerHTML = auctionMarkup(rounds);
  const earlier = Math.max(0, rounds.length - auctionRowLimit);
  byId('earlier-count').textContent = earlier ? `+${earlier}` : '';
  byId('earlier-count').hidden = !earlier;
  for (const seat of AUCTION_SEATS) {
    const heading = byId(`${seat.toLowerCase()}-heading`);
    heading.textContent = seat[0] + (seat === view.playerSeat ? ' · You' : '');
    heading.setAttribute('aria-label', `${seat}${seat === view.playerSeat ? ', you' : seat === view.partnerSeat ? ', partner' : ''}`);
    heading.classList.toggle('is-you', seat === view.playerSeat);
    heading.classList.toggle('is-dealer', seat === view.auction[0]?.seat);
  }
}

function cardMarkup(cards) {
  return SUITS.flatMap(suit => RANKS.filter(rank => cards.includes(suit + rank)).map(rank =>
    `<span class="playing-card suit-${suit}" data-card="${suit + rank}" aria-hidden="true"><span class="card-corner"><b>${rank}</b><i>${symbols[suit]}</i></span><span class="card-pip">${symbols[suit]}</span></span>`)).join('');
}

function renderBidding(actions) {
  bidPreview?.reset();
  const calls = practiceCalls(session);
  const key = `${session.seed}:${session.practiceRole}:${session.auction.length}:${session.revealed}:${session.pendingAsk?.bid}`;
  if (lastAuctionKey !== key) {
    const next = actions.find(action => ['relay', 'response'].includes(action.kind) && action.bid !== 'Pass')
      ?? actions.find(action => action.bid !== 'Pass');
    selectedLevel = next ? Number(next.bid[0]) : 1;
    lastAuctionKey = key;
  }
  byId('bid-levels').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const level = i + 1;
    const available = calls.some(action => action.bid[0] === String(level));
    return `<button type="button" class="level-button" data-level="${level}" aria-label="Level ${level}" aria-pressed="${level === selectedLevel}" ${busy || !available ? 'disabled' : ''}>${level}</button>`;
  }).join('');
  const strains = ['C', 'D', 'H', 'S', 'NT'];
  const button = action => {
    const pass = action.bid === 'Pass';
    const strain = pass ? '' : action.bid.slice(1);
    const column = pass ? 6 : strains.indexOf(strain) + 1;
    const name = pass ? 'Pass' : `${action.bid[0]} ${({ C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades', NT: 'notrump' })[strain]}`;
    return `<button type="button" class="bid-button ${pass ? 'pass-bid' : `suit-${strain}`} ${action.discussed ? '' : 'is-undiscussed'}" data-bid="${escapeHtml(action.bid)}" data-discussed="${action.discussed}" aria-label="${name}${action.discussed ? '' : ', undiscussed'}" style="grid-column:${column}" ${!pass && Number(action.bid[0]) !== selectedLevel ? 'hidden' : ''} ${busy ? 'disabled' : ''}><strong>${pass ? 'PASS' : escapeHtml(bidLabel(action.bid))}</strong></button>`;
  };
  byId('relay-actions').innerHTML = calls.filter(action => action.kind !== 'signoff').map(button).join('');
  byId('signoff-actions').innerHTML = calls.filter(action => action.kind === 'signoff').map(button).join('');
  byId('signoff-section').hidden = false;
  byId('unavailable-bids').innerHTML = [...strains, 'Pass'].filter(strain => !calls.some(action => action.bid === (strain === 'Pass' ? 'Pass' : `${selectedLevel}${strain}`)))
    .map(strain => `<button type="button" class="bid-button ${strain === 'Pass' ? 'pass-bid' : `suit-${strain}`}" style="grid-column:${strain === 'Pass' ? 6 : strains.indexOf(strain) + 1}" disabled aria-label="${strain === 'Pass' ? 'Pass unavailable' : `${selectedLevel}${strain} unavailable`}"><strong>${strain === 'Pass' ? 'PASS' : bidLabel(`${selectedLevel}${strain}`)}</strong></button>`).join('');
}

function render() {
  if (!session) return;
  const hints = byId('show-hints').checked;
  const view = practiceView(session);
  const teller = view.role === 'teller';
  const profile = getPracticeProfile(session.familyId);
  const stopped = session.finished || session.revealed;
  const actions = availablePracticeActions(session);
  byId('practice-badge').textContent = bidLabel(auctionFamilyForProfile(session.familyId).name);
  byId('role-badge').textContent = teller ? 'Teller' : 'Asker';
  const studying = Boolean(byId('profile').value);
  byId('practice-scope').textContent = studying ? 'Branch study' : 'Random branch';
  byId('new-deal').setAttribute('aria-label', studying ? 'Next study hand' : 'New hand');
  byId('active-branch').textContent = `Current branch: ${bidLabel(profile.name)}`;
  byId('system-assumptions').innerHTML = [...(profile.assumptions ?? []), ...(profile.limitations ?? [])].map(text => `<li>${escapeHtml(bidLabel(text))}</li>`).join('');
  byId('role-help').textContent = teller
    ? 'Describe your hand. Partner follows supported questions in source order, then takes the lowest supported final contract. This is recall practice, not an optimal bidding policy.'
    : 'Ask, interpret partner’s answers, then choose and assess your contract.';
  byId('partner-seat').textContent = `${view.partnerSeat} · Partner`;
  byId('player-seat').textContent = `${view.playerSeat} · You · ${teller ? 'Teller' : 'Asker'}`;
  byId('partner-info-title').textContent = `${view.partnerSeat} · Partner · ${teller ? 'Asker' : 'Teller'}`;
  byId('player-info-title').textContent = `${view.playerSeat} · You · ${teller ? 'Teller' : 'Asker'}`;
  const features = handFeatures(view.playerHand, session.major);
  byId('player-hand').innerHTML = `<div class="sr-only">${handMarkup(view.playerHand)}</div>${cardMarkup(view.playerHand)}`;
  byId('player-detail').innerHTML = handMarkup(view.playerHand);
  byId('player-facts').textContent = `${features.hcp} HCP · ${SUITS.map(suit => view.playerHand.filter(card => card[0] === suit).length).join('–')} shape (♠ ♥ ♦ ♣)`;
  byId('player-hcp').textContent = `${features.hcp} HCP`;
  byId('partner-hand').innerHTML = session.revealed
    ? `<div class="hand-lines">${handMarkup(view.partnerHand)}</div><p>${handFeatures(view.partnerHand, session.major).hcp} HCP · Original hand</p>`
    : '<div class="card-backs" aria-label="Partner’s hand is hidden"><i></i><i></i><i></i><i></i><i></i></div><p>Partner’s hand is hidden.</p>';
  const facts = `<ul class="constraint-list">${session.constraints.map(constraint => `<li>${escapeHtml(bidLabel(constraint.label))}</li>`).join('')}</ul>`;
  byId('knowledge-title').textContent = teller ? 'Asking hand' : 'What the auction shows';
  byId('constraint-count').textContent = teller ? '' : `${session.constraints.length} facts`;
  byId('knowledge').innerHTML = teller ? '<p>Partner asks the questions. Their cards stay hidden until review.</p>' : facts;
  byId('player-knowledge').innerHTML = teller ? `<h3>What you have told partner</h3>${facts}` : '';
  renderAuction();
  renderBidding(actions);
  byId('bidding-controls').hidden = stopped;
  byId('review-actions').hidden = !stopped;
  byId('phase-label').textContent = stopped ? 'Review' : 'Your turn';
  byId('action-title').textContent = session.undiscussedBid ? `${bidLabel(session.undiscussedBid)} · Undiscussed` : session.contract ? `${bidLabel(session.contract.bid)} · ${session.contract.declarer}`
    : stopped ? 'Hand revealed' : teller ? `Your response to ${bidLabel(session.pendingAsk?.bid ?? '')}` : 'Your call';
  byId('table-state').textContent = busy ? 'Working…' : session.undiscussedBid ? 'Undiscussed' : stopped ? 'Complete' : 'Your turn';
  byId('action-help').textContent = session.unsupportedReason || (teller ? bidLabel(session.pendingAsk?.label ?? 'Auction complete.')
    : practiceNode(session)?.help ?? 'Choose a relay question or a final contract.');
  byId('bid-meanings').innerHTML = actions.filter(action => action.kind !== 'signoff' || action.bid === 'Pass')
    .map(action => `<dt>${escapeHtml(bidLabel(action.bid))}</dt><dd>${escapeHtml(bidLabel(action.label))}</dd>`).join('') || '<dt>Done</dt><dd>Review the auction or deal another hand.</dd>';
  const ladders = teller && !stopped ? [session.pendingAsk].filter(Boolean) : actions.filter(action => action.responseLadder);
  byId('response-steps').hidden = !hints || !ladders.length;
  byId('response-ladders').innerHTML = ladders.map(action => `<p><strong>${escapeHtml(bidLabel(action.bid))} · ${escapeHtml(bidLabel(action.label))}</strong></p><dl>${action.responseLadder.map(answer => `<dt>${escapeHtml(bidLabel(answer.bid))}</dt><dd>${escapeHtml(answer.label)}</dd>`).join('')}</dl>`).join('');
  byId('bid-form').hidden = stopped || !actions.length;
  byId('bid-input').disabled = busy;
  byId('submit-bid').disabled = busy;
  byId('type-bid-open').disabled = busy || stopped;
  byId('undo-bid').disabled = busy || !history.length;
  byId('reveal-hand').disabled = busy || session.revealed;
  byId('sample-hands').disabled = busy;
  byId('evaluate').disabled = busy || !ddsReady;
  byId('contract-tools').hidden = teller;
  byId('assessment-open').hidden = teller;
  byId('review-assess').hidden = teller;
  for (const button of byId('review-actions').querySelectorAll('button')) button.disabled = busy;
  byId('revealed-basis').disabled = !session.revealed;
  if (!session.revealed) byId('analysis-basis').value = 'auction';
  const revealedBasis = byId('analysis-basis').value === 'revealed';
  byId('analysis-help').textContent = revealedBasis
    ? 'Both partnership hands stay fixed. Test many East/West layouts for a hindsight review.'
    : 'Use your cards and the auction. Partner’s actual hand is excluded from this estimate.';
  byId('sample-hands').textContent = revealedBasis ? 'Sample opponent layouts' : 'Sample hands';
  const context = { trump: session.trump, playerSeat: session.playerSeat, partnerSeat: session.partnerSeat, auction: session.auction };
  const candidate = byId('assessed-contract').value || session.contract?.bid;
  const lastContract = session.auction.findLast(call => call.bid !== 'Pass').bid;
  const otherContracts = actions.filter(action => action.kind === 'signoff').map(action => action.bid === 'Pass' ? lastContract : action.bid);
  if (session.contract) otherContracts.push(session.contract);
  const contracts = defaultContracts(context, candidate || undefined, otherContracts);
  byId('assessed-contract').innerHTML = contracts.map(contract => {
    const bid = `${contract.level}${contract.strain}`;
    return `<option value="${bid}">${escapeHtml(bidLabel(bid))}${session.contract?.bid === bid ? ' · chosen' : ''}</option>`;
  }).join('');
  if (candidate) byId('assessed-contract').value = candidate;
}

function invalidateAnalysis() {
  samples = null;
  byId('sample-results').replaceChildren();
  byId('evaluation-results').replaceChildren();
  sampleStatus('Each sample gets one random East/West split. All contracts use the same deals.');
  byId('bid-feedback').textContent = '';
  byId('typed-feedback').textContent = '';
}

function populateStudyProfiles(selectedProfileId = '') {
  const family = getAuctionFamily(byId('auction-family').value);
  const profiles = family.profileIds.map(getPracticeProfile);
  const groups = new Map();
  for (const profile of profiles) {
    if (!groups.has(profile.family)) groups.set(profile.family, []);
    groups.get(profile.family).push(profile);
  }
  byId('profile').innerHTML = '<option value="">Random branch · Whole family</option>'
    + [...groups].map(([group, profiles]) => `<optgroup label="${escapeHtml(group)}">${profiles.map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(bidLabel(profile.name))}</option>`).join('')}</optgroup>`).join('');
  if (family.profileIds.includes(selectedProfileId)) byId('profile').value = selectedProfileId;
}

function randomSeed() {
  return `relay-${crypto.randomUUID?.() ?? [...crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(36)).join('-')}`;
}

function restoreDealControls() {
  if (!session) return;
  byId('auction-family').value = auctionFamilyForProfile(session.familyId).id;
  byId('practice-role').value = session.practiceRole;
  populateStudyProfiles(committedStudyProfileId);
  byId('seed').value = session.seed;
}

async function dealHand({ replay = false } = {}) {
  if (busy) return;
  const currentJob = ++job;
  setBusy(true);
  status('Dealing a fixed partner hand and a matching practice hand…');
  try {
    const seed = replay ? byId('seed').value.trim() || session?.seed || randomSeed() : randomSeed();
    const familyId = byId('auction-family').value;
    const replayProfile = replay && session && auctionFamilyForProfile(session.familyId).id === familyId ? session.familyId : '';
    const profile = selectFamilyProfile({ familyId, profileId: byId('profile').value || replayProfile, seed });
    const next = await sampler.request({ command: 'deal', payload: { role: byId('practice-role').value, profileId: profile.id, seed } });
    if (currentJob !== job) return;
    session = next;
    committedStudyProfileId = byId('profile').value;
    history = [];
    byId('seed').value = session.seed;
    byId('bid-input').value = '';
    byId('assessed-contract').replaceChildren();
    invalidateAnalysis();
    status(session.practiceRole === 'teller' ? 'Partner has asked a question. Choose the response that describes your hand.'
      : 'Practice auction ready. Your partner’s hand will stay fixed throughout the auction.');
  } catch (error) {
    if (currentJob === job) {
      restoreDealControls();
      status(error.message, true);
    }
  }
  finally { if (currentJob === job) { setBusy(false); persistProgress(); } }
}

function chooseBid(bid) {
  if (busy || !session) return;
  try {
    const next = applyPracticeBid(session, bid);
    history.push(session);
    session = next.finished && !next.undiscussedBid ? revealPractice(next) : next;
    if (session.contract) {
      const option = document.createElement('option');
      option.value = session.contract.bid;
      option.textContent = session.contract.bid;
      byId('assessed-contract').replaceChildren(option);
    }
    invalidateAnalysis();
    status(session.undiscussedBid ? session.unsupportedReason : session.finished ? 'Auction complete.' : session.practiceRole === 'teller'
      ? 'Correct response. Partner’s next question is ready.' : 'Partner has answered from the original hand.');
    byId('bid-input').value = '';
    render();
    persistProgress();
    byId('typed-dialog').close();
  } catch (error) {
    byId('bid-feedback').textContent = error.message;
    byId('typed-feedback').textContent = error.message;
  }
}

function showSamples(result) {
  if (result.basis === 'revealed') {
    sampleStatus(`${result.hands.length.toLocaleString()} random opponent layouts · Both revealed partnership hands are fixed. This is a hindsight review.`);
    byId('sample-results').replaceChildren();
    return;
  }
  const features = result.hands.map((hand) => handFeatures(hand, session.major));
  const range = features.length ? `${Math.min(...features.map((f) => f.hcp))}–${Math.max(...features.map((f) => f.hcp))} HCP` : 'No matching hands';
  sampleStatus(`${result.hands.length.toLocaleString()} compatible hands · ${result.attempts.toLocaleString()} candidate hands checked · ${range}.${result.complete ? '' : ' The attempt limit was reached; this is a partial sample.'}`);
  byId('sample-results').innerHTML = result.hands.length ? `<details class="sample-details"><summary>Inspect ${Math.min(5, result.hands.length)} sampled hands</summary><p>SHDC order; these are possible hands, not a reveal of partner’s actual cards. Hands are sampled independently with replacement.</p><div class="sample-preview">${result.hands.slice(0, 5).map((hand) => `<code>${escapeHtml(handRecord(hand))}</code>`).join('')}</div></details>` : '';
}

async function collectSamples() {
  const count = Number(byId('sample-count').value);
  if (byId('analysis-basis').value === 'revealed') {
    if (!session.revealed) throw new Error('Reveal partner before using the actual partnership hands.');
    return { hands: Array.from({ length: count }, () => session.partnerHand), basis: 'revealed', complete: true, attempts: 0 };
  }
  sampleStatus(`Sampling ${count.toLocaleString()} compatible partner hands…`);
  return sampler.request({ command: 'sample', payload: { session, options: { count, seed: `${session.seed}:samples:${session.auction.map((call) => call.bid).join('-')}`, maxAttempts: 500000 } } });
}

function showEvaluation(result) {
  const percent = (n) => `${(n * 100).toFixed(1)}%`;
  const assessed = result.assessment?.contract;
  const assessedRow = result.contracts.find(contract => contract.key === assessed?.key);
  const assessment = assessedRow ? `<div class="contract-assessment"><h3>${escapeHtml(bidLabel(`${assessed.level}${assessed.strain}`))} needs ${assessed.level + 6} tricks</h3><p>${samples.basis === 'revealed' ? 'With the revealed partnership' : 'Using auction information'}, this contract makes double-dummy on <strong>${percent(assessedRow.makeFraction)}</strong> of the sampled deals (${assessedRow.makes}/${assessedRow.total}; 95% interval ${percent(assessedRow.interval.low)}–${percent(assessedRow.interval.high)}).${session.contract?.bid === `${assessed.level}${assessed.strain}` ? ' This is your chosen final contract.' : ' This is the contract you are assessing.'}</p></div>` : '';
  const rows = result.contracts.map((contract) => {
    const selected = session.contract && contract.level === session.contract.level && contract.strain === session.contract.strain;
    const isAssessed = contract.key === assessed?.key;
    const actual = result.actual?.contracts.find((row) => row.key === contract.key);
    return `<tr class="${selected || isAssessed ? 'is-selected' : ''}"><td><strong>${escapeHtml(bidLabel(`${contract.level}${contract.strain}`))}</strong>${selected ? ' · chosen' : ''}${isAssessed ? ' · assessed' : ''}</td><td>${escapeHtml(contract.declarer)}</td><td>${percent(contract.makeFraction)}<span class="rate-bar" aria-hidden="true"><i style="width:${contract.makeFraction * 100}%"></i></span></td><td>${contract.makes}/${contract.total}</td><td>${percent(contract.interval.low)}–${percent(contract.interval.high)}</td><td>${contract.averageTricks.toFixed(1)}</td>${result.actual ? `<td>${actual ? `${actual.tricks} tricks` : '—'}</td>` : ''}</tr>`;
  }).join('');
  const pairs = assessed ? `<details class="paired-results"><summary>Compare paired outcomes against ${escapeHtml(bidLabel(`${assessed.level}${assessed.strain}`))}</summary><p>Each row uses the same deals. “Only alternative makes” shows layouts where the assessed contract fails but that alternative succeeds. These are make/fail comparisons; they do not compare duplicate scores or grade the bidding decision.</p><div class="results-wrap"><table class="results-table"><thead><tr><th>Alternative</th><th>Both make</th><th>Only assessed makes</th><th>Only alternative makes</th><th>Neither makes</th></tr></thead><tbody>${result.assessment.comparisons.map(row => `<tr><td>${escapeHtml(bidLabel(`${row.level}${row.strain}`))}</td>${[row.bothMake, row.assessedOnly, row.alternativeOnly, row.neitherMakes].map(count => `<td>${percent(count / row.total)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>` : '';
  byId('evaluation-results').innerHTML = `${assessment}<div class="results-wrap"><table class="results-table"><thead><tr><th>Contract</th><th>Declarer</th><th>DD make</th><th>Made / deals</th><th>95% interval</th><th>Mean tricks</th>${result.actual ? '<th>Practice deal</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>${pairs}${result.actual ? '<p class="method-note">Practice deal = the original partner hand with one reproducible random opponent layout. For a broader hindsight check, select “Revealed partnership” to test many opponent layouts.</p>' : ''}`;
}

async function analyze(withDds) {
  if (busy || !session || session.practiceRole === 'teller') return;
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
      const actualDeal = session.revealed && samples.basis !== 'revealed' ? fillOpponentHands(session.playerHand, session.partnerHand, `${session.seed}:actual`, context) : undefined;
      const contract = byId('assessed-contract').value;
      const otherContracts = session.contract ? [session.contract] : [];
      const result = await evaluator.request({ deals, context, contract, otherContracts, actualDeal }, (progress) => sampleStatus(`Double-dummy evaluation · ${progress.completed} / ${progress.total} deals`));
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

document.addEventListener('click', event => {
  const opener = event.target.closest('[data-open]');
  if (opener) {
    const dialog = byId(opener.dataset.open);
    if (!dialog.open) dialog.showModal();
    if (dialog.id === 'typed-dialog') byId('bid-input').focus();
    return;
  }
  if (event.target.closest('[data-close]')) event.target.closest('dialog').close();
  const callButton = event.target.closest('[data-call-index]');
  if (callButton && session) {
    const call = practiceView(session).auction[Number(callButton.dataset.callIndex)];
    byId('bid-meaning-title').textContent = `${bidLabel(call.bid)} · ${call.seat}`;
    byId('bid-meaning-text').textContent = bidLabel(call.meaning || 'No further meaning is recorded for this call.');
    byId('bid-meaning-dialog').showModal();
  }
});
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
}
byId('bid-levels').addEventListener('click', event => {
  const button = event.target.closest('[data-level]');
  if (button && !button.disabled && session) {
    selectedLevel = Number(button.dataset.level);
    renderBidding(availablePracticeActions(session));
    byId('bid-levels').querySelector(`[data-level="${selectedLevel}"]`).focus({ preventScroll: true });
  }
});
byId('stop-deal').addEventListener('click', () => byId('stop-analysis').click());
new ResizeObserver(() => {
  const table = document.querySelector('.practice-table');
  const available = table.clientHeight - table.firstElementChild.offsetHeight - table.lastElementChild.offsetHeight;
  const compact = matchMedia('(max-height: 680px)').matches;
  const rows = Math.max(1, Math.min(6, Math.floor((available - (compact ? 27 : 41)) / (compact ? 34 : 49))));
  if (rows !== auctionRowLimit) { auctionRowLimit = rows; renderAuction(); }
}).observe(document.querySelector('.practice-table'));

byId('auction-family').innerHTML = AUCTION_FAMILIES.map(family => `<option value="${escapeHtml(family.id)}">${escapeHtml(bidLabel(family.name))}</option>`).join('');
populateStudyProfiles();
byId('auction-family').addEventListener('change', () => { populateStudyProfiles(); dealHand(); });
byId('profile').addEventListener('change', () => dealHand());
byId('practice-role').addEventListener('change', () => dealHand());
byId('deal-form').addEventListener('submit', (event) => { event.preventDefault(); dealHand(); });
byId('replay-deal').addEventListener('click', () => dealHand({ replay: true }));
byId('seed').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); dealHand({ replay: true }); }
});
byId('show-hints').addEventListener('change', () => { render(); persistProgress(); });
byId('bid-input').addEventListener('input', persistProgress);
byId('bid-form').addEventListener('submit', (event) => {
  event.preventDefault();
  let bid = byId('bid-input').value.trim().toUpperCase().replace(/\s+/g, '').replace(/[♠♥♦♣]/g, (symbol) => ({ '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' })[symbol]);
  if (/^[1-7]N$/.test(bid)) bid += 'T';
  if (bid === 'P' || bid === 'PASS') bid = 'Pass';
  if (!bid) {
    const message = 'Enter a bid, for example 4D or 5NT.';
    byId('bid-feedback').textContent = message;
    byId('typed-feedback').textContent = message;
    return;
  }
  chooseBid(bid);
});
bidPreview = attachBidPreview(byId('bid-options'), byId('bid-preview'), {
  getCall: bid => session && !busy ? practiceCalls(session).find(call => call.bid === bid) : null,
  label: bidLabel,
  commit: chooseBid,
});
byId('reveal-hand').addEventListener('click', () => {
  history.push(session);
  session = revealPractice(session);
  byId('evaluation-results').replaceChildren();
  status('Partner’s original hand is revealed. Auction constraints are unchanged.');
  render();
  persistProgress();
});
byId('undo-bid').addEventListener('click', () => {
  session = history.pop();
  invalidateAnalysis();
  status('Previous auction state restored with the same partner hand.');
  render();
  persistProgress();
});
byId('sample-hands').addEventListener('click', () => analyze(false));
byId('evaluate').addEventListener('click', () => analyze(true));
byId('sample-count').addEventListener('change', () => { invalidateAnalysis(); persistProgress(); });
byId('analysis-basis').addEventListener('change', () => { invalidateAnalysis(); render(); persistProgress(); });
byId('assessed-contract').addEventListener('change', () => { byId('evaluation-results').replaceChildren(); persistProgress(); });
byId('stop-analysis').addEventListener('click', () => {
  ++job;
  sampler.close();
  evaluator.close();
  sampler = new WorkerClient('./sampling-worker.js');
  evaluator = new WorkerClient('./evaluation-worker.js');
  ddsReady = false;
  restoreDealControls();
  setBusy(false);
  status('Stopped. Your practice hand is unchanged.');
  sampleStatus('Analysis stopped. Completed samples, if any, are retained.');
  probeDds();
});

async function startPractice() {
  const saved = loadPracticeProgress();
  if (saved.progress) {
    ({ session, history } = saved.progress);
    const preferences = saved.progress.preferences;
    committedStudyProfileId = preferences.studyProfileId;
    byId('practice-role').value = session.practiceRole;
    byId('auction-family').value = auctionFamilyForProfile(session.familyId).id;
    populateStudyProfiles(preferences.studyProfileId);
    byId('study-menu').open = Boolean(preferences.studyProfileId);
    byId('seed').value = session.seed;
    byId('show-hints').checked = preferences.showHints;
    byId('sample-count').value = preferences.sampleCount;
    byId('analysis-basis').value = preferences.analysisBasis;
    byId('bid-input').value = preferences.bidInput;
    if (preferences.assessedContract) {
      const option = document.createElement('option');
      option.value = preferences.assessedContract;
      option.textContent = preferences.assessedContract;
      byId('assessed-contract').replaceChildren(option);
    }
    render();
    status('Restored your saved bidding progress. Continue where you left off.');
    byId('save-status').textContent = 'Progress restored from this browser.';
  } else {
    await dealHand();
    if (saved.error && session) status('Saved progress could not be restored. A new practice hand is ready.', true);
  }
}

startPractice();
probeDds();
