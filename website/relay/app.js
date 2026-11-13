import { revealPractice, handFeatures, SUITS, RANKS, getPracticeProfile, practiceNode } from './core.js';
import { availablePracticeActions, practiceCalls, applyPracticeBid, practiceView } from './practice.js';
import { createEvaluationDeals, fillOpponentHands, defaultContracts } from './evaluation.js';
import { loadPracticeProgress, savePracticeProgress } from './progress.js';
import { AUCTION_FAMILIES, getAuctionFamily, auctionFamilyForProfile, selectFamilyProfile, selectMixedPractice } from './families.js';
import { AUCTION_SEATS, auctionRounds } from './table-ui.js';
import { auctionCallDetails } from './auction-study.js';
import { attachBidPreview } from './bid-preview.js';
import { shortBidDescription } from './bid-descriptions.js';
import { setupInstall } from './install.js';
import { OPENING_NOTES, SYSTEM_OPENING_NOTES, openingTitle, openingBidFor, isOpeningFamily } from './opening-practice.js';

const byId = (id) => document.getElementById(id);
const symbols = { S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' };
const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const bidLabel = (bid) => String(bid).replace(/([1-7])(NT|[SHDC])/g, (_, level, suit) => level + symbols[suit]);
const describeBid = (text, trump) => bidLabel(shortBidDescription(text, trump));
let session = null;
let history = [];
let samples = null;
let busy = false;
let ddsReady = false;
let job = 0;
let committedStudyProfileId = '';
let committedPracticeMode = 'focused';
let committedOpeningFamily = 'C';
let selectedLevel = null;
let lastAuctionKey = '';
let renderedAuctionKey = '';
let auctionPinned = true;
let bidPreview = null;
let saveFailed = false;
let studyContext = null;

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
    studyProfileId: committedStudyProfileId,
    practiceMode: committedPracticeMode,
    openingFamily: committedOpeningFamily,
  } });
  byId('save-status').classList.toggle('is-error', !saved.ok);
  byId('save-status').textContent = saved.ok ? 'Progress saved in this browser.'
    : 'Progress could not be saved in this browser. Keep this tab open to retain your auction.';
  saveFailed = !saved.ok;
  renderSaveBadge();
}

function renderSaveBadge() {
  const badge = byId('role-badge');
  const role = session.opening ? session.wholeAuction.humanSeat === 'North' ? 'Opener' : 'Responder' : session.practiceRole === 'teller' ? 'Teller' : 'Asker';
  const text = `${role}${committedPracticeMode === 'mixed' ? ' · Just bid' : committedPracticeMode === 'auction' ? ' · Whole auction' : ''}${saveFailed ? ' · Not saved' : ''}`;
  if (badge.textContent !== text) badge.textContent = text;
  badge.classList.toggle('is-error', saveFailed);
  badge.title = saveFailed ? 'Progress is not being saved. Open settings for details.' : '';
}

function handMarkup(cards) {
  return SUITS.map((suit) => `<span class="suit-holding suit-${suit}"><span class="symbol" aria-label="${({ S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' })[suit]}">${symbols[suit]}</span>${RANKS.filter((rank) => cards.includes(suit + rank)).join('') || '—'}</span>`).join('');
}

function handRecord(cards) {
  return SUITS.map((suit) => RANKS.filter((rank) => cards.includes(suit + rank)).join('') || '-').join('.');
}

function setBusy(value) {
  busy = value;
  for (const id of ['practice-mode', 'opening-family', 'practice-role', 'auction-family', 'profile', 'seed', 'new-deal', 'replay-deal', 'sample-count', 'analysis-basis', 'assessed-contract']) byId(id).disabled = busy;
  byId('stop-analysis').hidden = !busy;
  byId('stop-deal').hidden = !busy;
  render();
}

function auctionMarkup(rows, interactive = true) {
  return rows.map(row => `<tr>${row.map(call => `<td>${!call ? '' : call.kind === 'pending'
    ? `<span class="awaiting-bid" aria-label="${interactive ? 'Awaiting your bid' : 'Response to this question'}">?</span>`
    : call.kind === 'opponent' ? '<span class="opponent-pass">Pass</span>'
    : interactive ? `<button type="button" class="bid auction-call suit-${call.bid.match(/NT|[SHDC]/)?.[0] ?? 'NT'}" data-call-index="${call.index}" aria-label="${escapeHtml(bidLabel(call.bid))}, ${call.seat}. Show meaning and alternatives">${escapeHtml(bidLabel(call.bid))}</button>`
    : `<span class="bid suit-${call.bid.match(/NT|[SHDC]/)?.[0] ?? 'NT'}">${escapeHtml(bidLabel(call.bid))}</span>`}</td>`).join('')}</tr>`).join('');
}

function renderStudyContext() {
  const { rows, expanded } = studyContext;
  const earlier = Math.max(0, rows.length - 2);
  byId('alternatives-auction').innerHTML = auctionMarkup(expanded ? rows : rows.slice(-2), false);
  const button = byId('study-context-toggle');
  button.hidden = !earlier;
  button.textContent = expanded ? 'Show recent rounds' : `Show ${earlier} earlier rounds`;
  button.setAttribute('aria-expanded', String(expanded));
}

function renderAuction() {
  if (!session) return;
  const view = practiceView(session);
  const rounds = auctionRounds(view.auction, session.finished || session.revealed);
  const area = document.querySelector('.auction-area');
  const previousTop = area.scrollTop;
  const key = `${session.seed}:${JSON.stringify(rounds)}`;
  const changed = key !== renderedAuctionKey;
  byId('auction').innerHTML = auctionMarkup(rounds);
  byId('auction-history').innerHTML = auctionMarkup(rounds);
  renderedAuctionKey = key;
  for (const seat of AUCTION_SEATS) {
    const heading = byId(`${seat.toLowerCase()}-heading`);
    heading.textContent = seat[0] + (seat === view.playerSeat ? ' · You' : '');
    heading.setAttribute('aria-label', `${seat}${seat === view.playerSeat ? ', you' : seat === view.partnerSeat ? ', partner' : ''}`);
    heading.classList.toggle('is-you', seat === view.playerSeat);
    heading.classList.toggle('is-dealer', seat === view.auction[0]?.seat);
  }
  if (changed) auctionPinned = true;
  fitAuction();
  if (!auctionPinned) area.scrollTop = previousTop;
  if (changed) requestAnimationFrame(() => {
    // Bidding/review controls finish changing the panel height later in render.
    auctionPinned = true;
    fitAuction();
  });
}

function fitAuction() {
  const area = document.querySelector('.auction-area');
  const table = area.querySelector('table');
  const spacing = parseFloat(getComputedStyle(table).borderSpacing.split(' ').at(-1));
  const body = table.tBodies[0];
  const rowHeight = body.rows[0]?.getBoundingClientRect().height;
  if (!rowHeight) return;
  // Keep every row in the scroll panel. Only the counter needs a row estimate.
  const spare = area.clientHeight - table.getBoundingClientRect().height;
  const rows = Math.max(1, body.rows.length + Math.floor(spare / (rowHeight + spacing)));
  const earlier = Math.max(0, body.rows.length - rows);
  byId('earlier-count').textContent = earlier ? `+${earlier}` : '';
  byId('earlier-count').hidden = !earlier;
  if (auctionPinned) area.scrollTop = area.scrollHeight;
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
    const next = actions.find(action => ['relay', 'response', 'opening'].includes(action.kind) && action.bid !== 'Pass')
      ?? actions.find(action => action.bid !== 'Pass');
    const fallback = calls.find(call => call.bid !== 'Pass') ?? practiceView(session).auction.findLast(call => call.bid !== 'Pass');
    selectedLevel = Number((next ?? fallback)?.bid[0] ?? 1);
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
  const profile = session.wholeAuction ? { name: openingTitle(session), assumptions: openingBidFor(session)==='1C'?OPENING_NOTES:SYSTEM_OPENING_NOTES } : getPracticeProfile(session.familyId);
  const stopped = session.finished || session.revealed;
  const paused = stopped && !session.revealed && Boolean(session.undiscussedBid);
  const actions = availablePracticeActions(session);
  byId('practice-badge').textContent = session.wholeAuction ? bidLabel(openingTitle(session)) : bidLabel(auctionFamilyForProfile(session.familyId).name);
  renderSaveBadge();
  const mixed = byId('practice-mode').value !== 'focused';
  byId('family-settings').hidden = mixed;
  byId('opening-family-field').hidden = byId('practice-mode').value !== 'auction';
  byId('study-branch-field').hidden = mixed;
  byId('study-menu-title').textContent = mixed ? 'Current hand and replay' : 'Study a particular branch';
  for (const id of ['auction-family', 'practice-role', 'profile']) byId(id).disabled = busy || mixed;
  const studying = Boolean(committedStudyProfileId);
  byId('practice-scope').textContent = committedPracticeMode === 'auction' ? 'Bid from the opening · Random opener/responder · Coverage in System notes.'
    : committedPracticeMode === 'mixed' ? 'Random family, branch and role each hand.' : studying ? 'Branch study' : 'Random branch';
  byId('new-deal').setAttribute('aria-label', studying ? 'Next study hand' : 'New hand');
  byId('active-branch').textContent = `Current branch: ${bidLabel(profile.name)}`;
  byId('system-assumptions').innerHTML = [...(profile.assumptions ?? []), ...(profile.limitations ?? [])].map(text => `<li>${escapeHtml(bidLabel(text))}</li>`).join('');
  byId('role-help').textContent = session.opening ? 'Bid every call for your seat, starting from the opening. Partner uses their own hand and the auction. First-release coverage is listed in System notes.' : teller
    ? 'Describe your hand. Partner follows supported questions in source order, then takes the lowest supported final contract. This is recall practice, not an optimal bidding policy.'
    : 'Ask, interpret partner’s answers, then choose and assess your contract.';
  byId('partner-seat').textContent = `${view.partnerSeat} · Partner`;
  const roleName = session.opening ? view.playerSeat === 'North' ? 'Opener' : 'Responder' : teller ? 'Teller' : 'Asker';
  byId('player-seat').textContent = `${view.playerSeat} · You · ${roleName}`;
  byId('partner-info-title').textContent = `${view.partnerSeat} · Partner · ${session.opening ? view.partnerSeat === 'North' ? 'Opener' : 'Responder' : teller ? 'Asker' : 'Teller'}`;
  byId('player-info-title').textContent = `${view.playerSeat} · You · ${roleName}`;
  const features = handFeatures(view.playerHand, session.major);
  byId('player-hand').innerHTML = `<div class="sr-only">${handMarkup(view.playerHand)}</div>${cardMarkup(view.playerHand)}`;
  byId('player-detail').innerHTML = handMarkup(view.playerHand);
  byId('player-facts').textContent = `${features.hcp} HCP · ${SUITS.map(suit => view.playerHand.filter(card => card[0] === suit).length).join('–')} shape (♠ ♥ ♦ ♣)`;
  byId('player-hcp').textContent = `${features.hcp} HCP`;
  byId('partner-cards').innerHTML = session.revealed
    ? `<div class="sr-only">${handMarkup(view.partnerHand)}</div>${cardMarkup(view.partnerHand)}`
    : '<span class="sr-only">Partner’s 13 cards are face down.</span>' + '<span class="playing-card face-down-card" aria-hidden="true"></span>'.repeat(13);
  byId('partner-hcp').textContent = session.revealed ? `${handFeatures(view.partnerHand, session.major).hcp} HCP` : '';
  byId('partner-hand').innerHTML = session.revealed
    ? `<div class="hand-lines">${handMarkup(view.partnerHand)}</div><p>${handFeatures(view.partnerHand, session.major).hcp} HCP · Original hand</p>`
    : '<div class="card-backs" aria-label="Partner’s hand is hidden"><i></i><i></i><i></i><i></i><i></i></div><p>Partner’s hand is hidden.</p>';
  const facts = `<ul class="constraint-list">${session.constraints.map(constraint => `<li>${escapeHtml(bidLabel(constraint.label))}</li>`).join('')}</ul>`;
  byId('knowledge-title').textContent = teller ? 'Asking hand' : 'What the auction shows';
  byId('constraint-count').textContent = teller ? '' : `${session.constraints.length} facts`;
  const openingFacts = seat => `<ul class="constraint-list">${session.openingFacts[seat].map(text => `<li>${escapeHtml(describeBid(text))}</li>`).join('')}</ul>`;
  byId('knowledge').innerHTML = session.opening || session.wholeAuction && teller ? openingFacts(view.partnerSeat) : teller ? '<p>Partner asks the questions. Their cards stay hidden until review.</p>' : facts;
  byId('player-knowledge').innerHTML = session.opening ? openingFacts(view.playerSeat) : teller ? `<h3>What you have told partner</h3>${facts}` : '';
  renderAuction();
  renderBidding(actions);
  byId('bidding-controls').hidden = stopped;
  byId('review-actions').hidden = !stopped;
  byId('preview-tip').hidden = busy || stopped;
  byId('resume-bidding').hidden = !paused;
  byId('review-hand').hidden = paused;
  byId('review-next').classList.toggle('primary', !paused);
  byId('review-next').classList.toggle('secondary', paused);
  byId('phase-label').textContent = stopped ? 'Review' : 'Your turn';
  byId('action-title').textContent = session.undiscussedBid ? `${bidLabel(session.undiscussedBid)} · ${session.coverageBoundary ? 'Not implemented' : 'Undiscussed'}` : session.contract ? `${bidLabel(session.contract.bid)} · ${session.contract.declarer}`
    : stopped ? 'Hand revealed' : session.opening ? `${roleName} · Your call` : teller ? `Your response to ${bidLabel(session.pendingAsk?.bid ?? '')}` : 'Your call';
  byId('table-state').textContent = busy ? 'Working…' : session.undiscussedBid ? 'Undiscussed' : stopped ? 'Complete' : 'Your turn';
  byId('action-help').textContent = session.unsupportedReason || (session.opening ? 'Choose your call using your hand and the auction.' : teller ? describeBid(session.pendingAsk?.label ?? 'Auction complete.', session.trump ?? session.major)
    : practiceNode(session)?.help ?? 'Choose a relay question or a final contract.');
  byId('bid-meanings').innerHTML = actions.filter(action => action.kind !== 'signoff' || action.bid === 'Pass')
    .map(action => `<dt>${escapeHtml(bidLabel(action.bid))}</dt><dd>${escapeHtml(describeBid(action.label))}</dd>`).join('') || '<dt>Done</dt><dd>Review the auction or deal another hand.</dd>';
  const ladders = teller && !stopped ? [session.pendingAsk].filter(Boolean) : actions.filter(action => action.responseLadder);
  byId('response-steps').hidden = !hints || !ladders.length;
  byId('response-ladders').innerHTML = ladders.map(action => `<p><strong>${escapeHtml(bidLabel(action.bid))} · ${escapeHtml(describeBid(action.label, action.trump ?? session.trump ?? session.major))}</strong></p><dl>${action.responseLadder.map(answer => `<dt>${escapeHtml(bidLabel(answer.bid))}</dt><dd>${escapeHtml(describeBid(answer.label))}</dd>`).join('')}</dl>`).join('');
  byId('bid-form').hidden = stopped || !actions.length;
  byId('bid-input').disabled = busy;
  byId('submit-bid').disabled = busy;
  byId('type-bid-open').disabled = busy || stopped;
  byId('undo-bid').disabled = busy || !history.length;
  byId('reveal-hand').disabled = busy || session.revealed;
  byId('sample-hands').disabled = busy;
  byId('evaluate').disabled = busy || !ddsReady;
  byId('contract-tools').hidden = teller || Boolean(session.opening);
  byId('assessment-open').hidden = teller || Boolean(session.opening);
  byId('review-assess').hidden = teller || paused || Boolean(session.opening);
  for (const button of byId('review-actions').querySelectorAll('button')) button.disabled = busy;
  byId('resume-bidding').disabled = busy || !history.length;
  byId('revealed-basis').disabled = !session.revealed;
  if (!session.revealed) byId('analysis-basis').value = 'auction';
  const revealedBasis = byId('analysis-basis').value === 'revealed';
  byId('analysis-help').textContent = revealedBasis
    ? 'Both partnership hands stay fixed. Test many East/West layouts for a hindsight review.'
    : 'Use your cards and the auction. Partner’s actual hand is excluded from this estimate.';
  byId('sample-hands').textContent = revealedBasis ? 'Sample opponent layouts' : 'Sample hands';
  const context = { trump: session.trump, playerSeat: session.playerSeat, partnerSeat: session.partnerSeat, auction: session.auction };
  const candidate = byId('assessed-contract').value || session.contract?.bid;
  const lastContract = session.auction.findLast(call => call.bid !== 'Pass')?.bid;
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
  byId('practice-mode').value = committedPracticeMode;
  byId('opening-family').value = committedOpeningFamily;
  if (!isOpeningFamily(session)) byId('auction-family').value = auctionFamilyForProfile(session.familyId).id;
  byId('practice-role').value = session.practiceRole;
  populateStudyProfiles(committedStudyProfileId);
  byId('seed').value = session.seed;
}

async function dealHand({ replay = false } = {}) {
  if (busy) return;
  const mode = byId('practice-mode').value;
  const currentJob = ++job;
  setBusy(true);
  status('Dealing a fixed partner hand and a matching practice hand…');
  try {
    const seed = replay ? byId('seed').value.trim() || session?.seed || randomSeed() : randomSeed();
    let selection;
    if (mode === 'auction') {
      selection = { auctionMode: true, openingFamily: replay ? committedOpeningFamily : byId('opening-family').value, ...(replay && session?.wholeAuction ? { humanSeat: session.wholeAuction.humanSeat } : {}) };
    } else if (mode === 'mixed') {
      selection = replay && session ? { profileId: session.familyId, role: session.practiceRole } : selectMixedPractice(seed);
    } else {
      const familyId = byId('auction-family').value;
      const replayProfile = replay && session && auctionFamilyForProfile(session.familyId).id === familyId ? session.familyId : '';
      selection = { profileId: selectFamilyProfile({ familyId, profileId: byId('profile').value || replayProfile, seed }).id,
        role: byId('practice-role').value };
    }
    const next = await sampler.request({ command: 'deal', payload: { ...selection, seed } });
    if (currentJob !== job) return;
    session = next;
    committedPracticeMode = mode;
    if (mode === 'auction') committedOpeningFamily = selection.openingFamily;
    committedStudyProfileId = mode !== 'focused' ? '' : byId('profile').value;
    history = [];
    restoreDealControls();
    byId('bid-input').value = '';
    byId('assessed-contract').replaceChildren();
    invalidateAnalysis();
    status(session.opening ? 'Bid from the opening. Your seat stays fixed throughout the auction.' : session.practiceRole === 'teller' ? 'Partner has asked a question. Choose the response that describes your hand.'
      : 'Practice auction ready. Your partner’s hand will stay fixed throughout the auction.');
    return true;
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
    session = next.finished && (!next.undiscussedBid || next.contract) ? revealPractice(next) : next;
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
  byId('evaluate').disabled = true;
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
  // Engine readiness affects assessment only. Replacing the bidding box here
  // can swallow a level tap that began while the worker was loading.
  byId('evaluate').disabled = busy || !ddsReady;
}

document.addEventListener('click', event => {
  const opener = event.target.closest('[data-open]');
  if (opener) {
    const dialog = byId(opener.dataset.open);
    if (dialog.id === 'typed-dialog') byId('settings-dialog').close();
    if (!dialog.open) dialog.showModal();
    if (dialog.id === 'typed-dialog') byId('bid-input').focus();
    return;
  }
  if (event.target.closest('[data-close]')) event.target.closest('dialog').close();
  const callButton = event.target.closest('[data-call-index]');
  if (callButton && session) {
    const detail = auctionCallDetails(session, history, Number(callButton.dataset.callIndex));
    const { call } = detail;
    byId('bid-meaning-title').textContent = `${bidLabel(call.bid)} · ${call.seat}`;
    byId('bid-meaning-text').textContent = describeBid(call.meaning || 'No further meaning is recorded for this call.');
    byId('bid-meaning-dialog').querySelector('.bid-alternatives').hidden = Boolean(detail.isOpening || detail.auction?.length === 1 && !detail.question);
    const choices = detail.callAlternatives ?? [];
    byId('call-alternatives-section').hidden = !choices.length;
    byId('call-alternatives').innerHTML = choices.map(option => `<dt class="${option.bid === call.bid ? 'is-played' : ''}">${escapeHtml(bidLabel(option.bid))}</dt><dd class="${option.bid === call.bid ? 'is-played' : ''}">${escapeHtml(describeBid(option.label))}${option.bid === call.bid ? '<span class="played-label">Played</span>' : ''}</dd>`).join('');
    byId('alternatives-question').textContent = detail.question ? `Responses to ${bidLabel(detail.question.bid)} · ${describeBid(detail.question.meaning)}` : '';
    studyContext = { rows: auctionRounds(detail.auction, !detail.question), expanded: false };
    renderStudyContext();
    byId('bid-alternatives').innerHTML = detail.alternatives.map(answer => `<dt class="${answer.bid === detail.playedBid ? 'is-played' : ''}">${escapeHtml(bidLabel(answer.bid))}</dt><dd class="${answer.bid === detail.playedBid ? 'is-played' : ''}">${escapeHtml(describeBid(answer.label))}${answer.bid === detail.playedBid ? '<span class="played-label">Played</span>' : ''}</dd>`).join('');
    byId('alternatives-empty').hidden = detail.alternatives.length > 0 || choices.length > 0;
    byId('alternatives-empty').textContent = call.meaning?.includes('Undiscussed')
      ? 'This call is undiscussed in this exercise.'
      : 'No response alternatives are recorded for this call.';
    byId('bid-meaning-dialog').querySelector('.sheet-body').scrollTop = 0;
    byId('bid-meaning-dialog').showModal();
  }
});
byId('study-context-toggle').addEventListener('click', () => {
  if (!studyContext) return;
  studyContext.expanded = !studyContext.expanded;
  renderStudyContext();
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
document.querySelector('.auction-area').addEventListener('scroll', event => {
  const area = event.currentTarget;
  auctionPinned = area.scrollHeight - area.clientHeight - area.scrollTop < 8;
}, { passive: true });
new ResizeObserver(fitAuction).observe(document.querySelector('.auction-area'));

byId('auction-family').innerHTML = AUCTION_FAMILIES.map(family => `<option value="${escapeHtml(family.id)}">${escapeHtml(bidLabel(family.name))}</option>`).join('');
populateStudyProfiles();
byId('practice-mode').addEventListener('change', async () => {
  const dealt = await dealHand();
  if (dealt && committedPracticeMode !== 'focused') byId('settings-dialog').close();
});
byId('opening-family').addEventListener('change', () => dealHand());
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
  label: describeBid,
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
byId('resume-bidding').addEventListener('click', () => byId('undo-bid').click());
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
    committedPracticeMode = preferences.practiceMode;
    committedOpeningFamily = preferences.openingFamily ?? 'C';
    byId('practice-mode').value = committedPracticeMode;
  byId('opening-family').value = committedOpeningFamily;
    byId('practice-role').value = session.practiceRole;
    if (!isOpeningFamily(session)) byId('auction-family').value = auctionFamilyForProfile(session.familyId).id;
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
setupInstall();
