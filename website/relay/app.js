import { revealPractice, handFeatures, SUITS, RANKS, getPracticeProfile, practiceNode } from './core.js';
import { availablePracticeActions, applyPracticeBid, practiceView } from './practice.js';
import { createEvaluationDeals, fillOpponentHands, defaultContracts } from './evaluation.js';
import { loadPracticeProgress, savePracticeProgress } from './progress.js';
import { AUCTION_FAMILIES, getAuctionFamily, auctionFamilyForProfile, selectFamilyProfile } from './families.js';

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
  render();
}

function render() {
  if (!session) return;
  const hints = byId('show-hints').checked;
  const view = practiceView(session);
  const teller = view.role === 'teller';
  const profile = getPracticeProfile(session.familyId);
  byId('practice-badge').textContent = bidLabel(auctionFamilyForProfile(session.familyId).name);
  const studying = Boolean(byId('profile').value);
  byId('practice-scope').textContent = studying ? 'Branch study' : 'Random branch';
  byId('new-deal').textContent = studying ? 'Next study hand' : 'New hand';
  byId('active-branch').textContent = `Current branch: ${bidLabel(profile.name)}`;
  byId('system-assumptions').innerHTML = [...(profile.assumptions ?? []), ...(profile.limitations ?? [])].map(text => `<li>${escapeHtml(bidLabel(text))}</li>`).join('');
  byId('role-help').textContent = teller
    ? 'As teller, answer partner’s relay questions from your fixed hand. The practice asker follows supported questions in source order, then takes the lowest available final contract. This is a recall exercise; its contract choice is not a bidding recommendation.'
    : 'As asker, choose the relay questions, interpret partner’s answers and judge the final contract. Use auction information before deciding, then review the revealed partnership.';
  byId('partner-seat').textContent = `${view.partnerSeat} · Partner · ${teller ? 'Asker' : 'Teller'}`;
  byId('player-seat').textContent = `${view.playerSeat} · You · ${teller ? 'Teller' : 'Asker'}`;
  byId('north-heading').textContent = `North · ${view.playerSeat === 'North' ? 'You' : 'Partner'}`;
  byId('south-heading').textContent = `South · ${view.playerSeat === 'South' ? 'You' : 'Partner'}`;
  const features = handFeatures(view.playerHand, session.major);
  byId('player-hand').innerHTML = handMarkup(view.playerHand);
  byId('player-hcp').textContent = `${features.hcp} HCP`;
  byId('partner-hand').innerHTML = session.revealed
    ? `<div class="hand-lines">${handMarkup(view.partnerHand)}</div><p>${handFeatures(view.partnerHand, session.major).hcp} HCP · Partner’s original hand</p>`
    : '<div class="card-backs" aria-label="Partner’s hand is hidden"><i></i><i></i><i></i><i></i><i></i></div><p>13 cards. One fixed hand.</p>';
  const cells = view.auction.filter((call) => ['North', 'South'].includes(call.seat));
  const rows = [];
  for (let index = 0; index < cells.length; index += 2) {
    rows.push(`<tr>${[cells[index], cells[index + 1]].map((call) => `<td>${call ? `<span class="bid">${escapeHtml(bidLabel(call.bid))}</span>${hints ? `<small>${escapeHtml(bidLabel(call.meaning))}</small>` : ''}` : session.finished ? '<span aria-label="Auction complete">—</span>' : '<span aria-label="Awaiting your bid">·</span>'}</td>`).join('')}</tr>`);
  }
  byId('auction').innerHTML = rows.join('');
  const actions = availablePracticeActions(session);
  const actionMarkup = (action) => `<button type="button" class="bid-button" data-bid="${escapeHtml(action.bid)}" ${busy ? 'disabled' : ''}><strong>${escapeHtml(bidLabel(action.bid))}</strong>${(hints && action.kind !== 'signoff') || action.bid === 'Pass' ? `<small>${escapeHtml(bidLabel(action.label))}</small>` : ''}</button>`;
  byId('relay-actions').innerHTML = actions.filter((a) => a.kind !== 'signoff').map(actionMarkup).join('');
  const ladders = teller && !session.finished && !session.revealed ? [session.pendingAsk].filter(Boolean) : actions.filter((action) => action.responseLadder);
  byId('response-steps').hidden = !hints || !ladders.length;
  byId('response-ladders').innerHTML = ladders.map((action) => `<p><strong>${escapeHtml(bidLabel(action.bid))} · ${escapeHtml(action.label)}</strong></p><dl>${action.responseLadder.map((answer) => `<dt>${escapeHtml(bidLabel(answer.bid))}</dt><dd>${escapeHtml(answer.label)}</dd>`).join('')}</dl>`).join('');
  const signoffs = actions.filter((a) => a.kind === 'signoff');
  byId('signoff-actions').innerHTML = signoffs.map(actionMarkup).join('');
  byId('signoff-section').hidden = !signoffs.length;
  const stopped = session.finished || session.revealed;
  const noFurtherAsk = !actions.some((action) => action.kind === 'relay' || action.kind === 'response');
  byId('phase-label').textContent = stopped ? 'Review' : noFurtherAsk ? 'Review the auction' : 'Your turn';
  byId('bid-form').hidden = stopped || !actions.length;
  byId('bid-input').disabled = busy;
  byId('submit-bid').disabled = busy;
  if (session.contract) {
    byId('action-title').textContent = `${bidLabel(`${session.contract.level}${session.contract.strain}`)} by ${session.contract.declarer}`;
    byId('action-help').textContent = teller
      ? 'Auction complete. Review the questions and your answers, undo an answer, or deal another hand.'
      : 'Auction complete. Assess your chosen contract using auction information, then compare with the revealed partnership over many opponent layouts.';
  } else if (stopped) {
    byId('action-title').textContent = 'Partner’s hand revealed';
    byId('action-help').textContent = session.unsupportedReason || 'Review what the auction showed. Undo or deal another hand to continue practising.';
  } else if (teller && session.pendingAsk) {
    byId('action-title').textContent = `Answer partner’s ${bidLabel(session.pendingAsk.bid)}`;
    byId('action-help').textContent = hints ? bidLabel(session.pendingAsk.label)
      : 'Choose the response that describes your hand. Turn on “Show meanings” to see the question and all response steps.';
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
  byId('knowledge-title').textContent = teller ? 'What you have told partner' : 'Auction knowledge';
  byId('knowledge').innerHTML = hints
    ? `<ul class="constraint-list">${session.constraints.map((constraint) => `<li>${escapeHtml(constraint.label)}</li>`).join('')}</ul>`
    : `<p>Meanings and constraints are hidden for recall practice.${teller ? '' : ' Sampling still uses every fact established by the auction.'}</p>`;
  byId('undo-bid').disabled = busy || !history.length;
  byId('reveal-hand').disabled = busy || session.revealed;
  byId('sample-hands').disabled = busy;
  byId('evaluate').disabled = busy || !ddsReady;
  byId('contract-tools').hidden = teller;
  byId('revealed-basis').disabled = !session.revealed;
  if (!session.revealed) byId('analysis-basis').value = 'auction';
  const revealedBasis = byId('analysis-basis').value === 'revealed';
  byId('analysis-help').textContent = revealedBasis
    ? 'Hold both revealed partnership hands fixed and test many random East/West layouts. This is a hindsight review, separate from what the auction told you.'
    : 'Compare a contract using hands consistent with the auction and your cards. Partner’s actual hand is excluded from this estimate, even after reveal.';
  byId('sample-hands').textContent = revealedBasis ? 'Sample opponent layouts' : 'Sample hands';
  const context = { trump: session.trump, playerSeat: session.playerSeat, partnerSeat: session.partnerSeat, auction: session.auction };
  const candidate = byId('assessed-contract').value || session.contract?.bid;
  const lastContract = session.auction.findLast(call => call.bid !== 'Pass').bid;
  const otherContracts = signoffs.map(action => action.bid === 'Pass' ? lastContract : action.bid);
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
    session = next.finished ? revealPractice(next) : next;
    if (session.contract) {
      const option = document.createElement('option');
      option.value = session.contract.bid;
      option.textContent = session.contract.bid;
      byId('assessed-contract').replaceChildren(option);
    }
    invalidateAnalysis();
    status(session.finished ? 'Auction complete.' : session.practiceRole === 'teller'
      ? 'Correct response. Partner’s next question is ready.' : 'Partner has answered from the original hand.');
    byId('bid-input').value = '';
    render();
    persistProgress();
  } catch (error) { byId('bid-feedback').textContent = error.message; }
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
