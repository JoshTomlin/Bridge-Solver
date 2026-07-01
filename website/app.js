import { EngineClient } from "./engine-client.js";
import { fourthHandCompletion } from "./deal-utils.js";
import { clearRuns, deleteDeal, loadDeals, loadRuns, saveDeal, saveRun } from "./storage.js";

const byId = (id) => document.getElementById(id);
const elements = {
  enginePill: byId("engine-pill"),
  engineLabel: byId("engine-label"),
  dealDialog: byId("deal-dialog"),
  settingsDialog: byId("settings-dialog"),
  currentDealName: byId("current-deal-name"),
  currentDealSummary: byId("current-deal-summary"),
  settingsSummary: byId("settings-summary"),
  name: byId("deal-name"),
  north: byId("north-hand"),
  east: byId("east-hand"),
  south: byId("south-hand"),
  west: byId("west-hand"),
  leader: byId("leader"),
  trump: byId("trump"),
  playPrefix: byId("play-prefix"),
  notes: byId("deal-notes"),
  restrictionStatus: byId("restriction-status"),
  savedDeals: byId("saved-deals"),
  dealCount: byId("deal-count"),
  tableStage: byId("table"),
  legalSummary: byId("legal-summary"),
  completeFourthHand: byId("complete-fourth-hand"),
  completeHandStatus: byId("complete-hand-status"),
  turnLabel: byId("turn-label"),
  currentTrick: byId("current-trick"),
  scoreNs: byId("score-ns"),
  scoreEw: byId("score-ew"),
  historyPrev: byId("history-prev"),
  historyNext: byId("history-next"),
  historyLive: byId("history-live"),
  historyPosition: byId("history-position"),
  worlds: byId("world-count"),
  depth: byId("max-depth"),
  target: byId("target-tricks"),
  timeLimit: byId("time-limit"),
  seed: byId("random-seed"),
  analyze: byId("analyze-position"),
  analyzeFull: byId("analyze-full"),
  cancel: byId("cancel-analysis"),
  progress: byId("progress-card"),
  progressLabel: byId("progress-label"),
  progressValue: byId("progress-value"),
  progressBar: byId("progress-bar"),
  resultEmpty: byId("result-empty"),
  result: byId("analysis-result"),
  runList: byId("run-list"),
  toastRegion: byId("toast-region")
};

const restrictionSuits = ["S", "H", "D", "C"];

let currentDeal = null;
let draftDealId = null;
let liveState = null;
let timelineFrames = [];
let timelineIndex = -1;
let reviewOnly = false;
let busy = false;
let engineReady = false;
let initialLoadStarted = false;
let activeAnalysis = null;
let activeAnalysisIsLive = false;
let activeMoveCard = null;
let activeStrategyIndex = 0;
let activeWorldIndex = null;
let activeFullResult = null;
let activeDecisionIndex = 0;

function defaultSeatRestrictions() {
  return {
    required: "",
    forbidden: "",
    minS: 0, maxS: 13,
    minH: 0, maxH: 13,
    minD: 0, maxD: 13,
    minC: 0, maxC: 13,
    minHcp: 0, maxHcp: 37
  };
}

function collectSeatRestrictions(prefix) {
  const result = {
    required: byId(`${prefix}-required`).value.trim().toUpperCase(),
    forbidden: byId(`${prefix}-forbidden`).value.trim().toUpperCase()
  };
  for (const suit of restrictionSuits) {
    result[`min${suit}`] = Number(byId(`${prefix}-min-${suit.toLowerCase()}`).value);
    result[`max${suit}`] = Number(byId(`${prefix}-max-${suit.toLowerCase()}`).value);
  }
  result.minHcp = Number(byId(`${prefix}-min-hcp`).value);
  result.maxHcp = Number(byId(`${prefix}-max-hcp`).value);
  return result;
}

function applySeatRestrictions(prefix, source = {}) {
  const restrictions = { ...defaultSeatRestrictions(), ...source };
  byId(`${prefix}-required`).value = restrictions.required;
  byId(`${prefix}-forbidden`).value = restrictions.forbidden;
  for (const suit of restrictionSuits) {
    byId(`${prefix}-min-${suit.toLowerCase()}`).value = restrictions[`min${suit}`];
    byId(`${prefix}-max-${suit.toLowerCase()}`).value = restrictions[`max${suit}`];
  }
  byId(`${prefix}-min-hcp`).value = restrictions.minHcp;
  byId(`${prefix}-max-hcp`).value = restrictions.maxHcp;
}

function hasSeatRestrictions(source = {}) {
  const value = { ...defaultSeatRestrictions(), ...source };
  return value.required || value.forbidden ||
    restrictionSuits.some((suit) => value[`min${suit}`] !== 0 || value[`max${suit}`] !== 13) ||
    value.minHcp !== 0 || value.maxHcp !== 37;
}

const engine = new EngineClient({
  onStatus(status, message) {
    engineReady = status === "ready";
    elements.enginePill.className = `engine-pill is-${status}`;
    elements.engineLabel.textContent = message;
    updateActionState();
    if (engineReady && !initialLoadStarted) {
      initialLoadStarted = true;
      putDealOnTable(true).catch((error) => toast(error.message || String(error), "error"));
    }
  },
  onProgress(progress) {
    liveState = progress.state;
    renderTable(progress.state);
    elements.progressLabel.textContent = progress.label;
    elements.progressValue.textContent = `${progress.percent}%`;
    elements.progressBar.style.width = `${progress.percent}%`;
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message, tone = "info") {
  const item = document.createElement("div");
  item.className = `toast ${tone}`;
  item.textContent = message;
  elements.toastRegion.append(item);
  setTimeout(() => item.remove(), 4200);
}

function collectDeal() {
  return {
    id: draftDealId,
    name: elements.name.value.trim() || "Untitled deal",
    north: elements.north.value.trim(),
    east: elements.east.value.trim(),
    south: elements.south.value.trim(),
    west: elements.west.value.trim(),
    leader: elements.leader.value,
    trump: elements.trump.value,
    playPrefix: elements.playPrefix.value.trim().toUpperCase(),
    notes: elements.notes.value.trim(),
    restrictions: {
      east: collectSeatRestrictions("east"),
      west: collectSeatRestrictions("west")
    }
  };
}

function populateDealForm(deal) {
  draftDealId = deal.id || null;
  elements.name.value = deal.name || "Untitled deal";
  elements.north.value = deal.north || "-.-.-.-";
  elements.east.value = deal.east || "-.-.-.-";
  elements.south.value = deal.south || "-.-.-.-";
  elements.west.value = deal.west || "-.-.-.-";
  elements.leader.value = deal.leader || "South";
  elements.trump.value = deal.trump || "NT";
  elements.playPrefix.value = deal.playPrefix || "";
  elements.notes.value = deal.notes || "";
  applySeatRestrictions("east", deal.restrictions?.east);
  applySeatRestrictions("west", deal.restrictions?.west);
  byId("defender-knowledge").open = Boolean(
    hasSeatRestrictions(deal.restrictions?.east) ||
    hasSeatRestrictions(deal.restrictions?.west)
  );
  elements.restrictionStatus.textContent = "Load to count";
  updateFourthHandControl();
}

function analysisSettings() {
  return {
    worlds: Number(elements.worlds.value),
    depth: Number(elements.depth.value),
    target: Number(elements.target.value),
    timeLimit: Number(elements.timeLimit.value),
    seed: String(elements.seed.value || "0")
  };
}

function renderSettingsSummary() {
  const settings = analysisSettings();
  elements.settingsSummary.textContent =
    `${settings.worlds} worlds | M ${settings.depth} | target ${settings.target} | ${settings.timeLimit}s`;
}

function parsePlayPrefix(text) {
  if (!text.trim()) return [];
  const cards = text.toUpperCase().split(/[\s,;]+/).filter(Boolean);
  const invalid = cards.find((card) => !/^[SHDC](?:[2-9TJQKA])$/.test(card));
  if (invalid) throw new Error(`Invalid card '${invalid}' in the entered play`);
  return cards;
}

function parsePreviewHand(record) {
  const fields = record.trim().split(/[.\s]+/);
  if (fields.length !== 4) return { S: "?", H: "?", D: "?", C: "?" };
  return { S: fields[0], H: fields[1], D: fields[2], C: fields[3] };
}

const suitDisplay = {
  S: { symbol: "&spades;", className: "spades", name: "spades" },
  H: { symbol: "&hearts;", className: "hearts", name: "hearts" },
  D: { symbol: "&diams;", className: "diamonds", name: "diamonds" },
  C: { symbol: "&clubs;", className: "clubs", name: "clubs" }
};

function holdingMarkup(hand, legalCards, interactive) {
  const legal = new Set(legalCards);
  return Object.entries(suitDisplay).map(([suit, display]) => {
    const holding = hand?.[suit] && hand[suit] !== "-" ? hand[suit] : "";
    const cards = [...holding].map((rank) => {
      const card = `${suit}${rank}`;
      if (interactive && legal.has(card)) {
        return `<button class="hand-card is-legal" data-card="${card}" type="button" aria-label="Play ${display.name} ${rank}" title="Play ${card}">${rank}</button>`;
      }
      return `<span class="hand-card">${escapeHtml(rank)}</span>`;
    }).join("");
    return `
      <div class="suit-line suit-${display.className}">
        <span class="suit-symbol">${display.symbol}</span>
        <div class="suit-cards">${cards || "<span class=\"void\">-</span>"}</div>
      </div>`;
  }).join("");
}

function trickCardMarkup(play) {
  const suit = suitDisplay[play.card[0]];
  return `
    <span class="trick-card suit-${suit.className}" data-trick-seat="${escapeHtml(play.seat)}" title="${escapeHtml(play.seat)} played ${escapeHtml(play.card)}">
      <small>${escapeHtml(play.seat[0])}</small>
      <b>${escapeHtml(play.card[1])}${suit.symbol}</b>
    </span>`;
}

function previewState() {
  return {
    hands: {
      North: parsePreviewHand(elements.north.value),
      East: parsePreviewHand(elements.east.value),
      South: parsePreviewHand(elements.south.value),
      West: parsePreviewHand(elements.west.value)
    },
    score: { ns: 0, ew: 0 },
    turn: null,
    trick: [],
    legalCards: [],
    finished: false
  };
}

function currentFrame() {
  return timelineIndex >= 0 ? timelineFrames[timelineIndex] : null;
}

function isAtLivePosition() {
  return !reviewOnly && timelineFrames.length > 0 && timelineIndex === timelineFrames.length - 1;
}

function displayedState(override) {
  if (override) return override;
  return currentFrame()?.state || liveState || previewState();
}

function frameLabel(frame, index) {
  if (!frame?.play) return frame?.label || "Opening position";
  const live = index === timelineFrames.length - 1 && !reviewOnly ? " | live" : "";
  return `Card ${index}: ${frame.play.seat} ${frame.play.card}${live}`;
}

function renderDealSummary() {
  const deal = currentDeal || collectDeal();
  const status = liveState ? `${timelineFrames.length - 1} cards played` : "not loaded";
  elements.currentDealName.textContent = deal.name || "Untitled deal";
  elements.currentDealSummary.textContent = `${deal.leader} leads | ${deal.trump} | ${status}`;
}

function renderTable(override) {
  const state = displayedState(override);
  const interactive = isAtLivePosition() && !busy;
  const legalCards = state.legalCards || [];
  for (const seat of ["North", "East", "South", "West"]) {
    document.querySelector(`[data-holding="${seat}"]`).innerHTML =
      holdingMarkup(state.hands[seat], legalCards, interactive);
    document.querySelector(`[data-seat="${seat}"]`).classList.toggle("is-turn", state.turn === seat);
  }
  elements.scoreNs.textContent = state.score.ns;
  elements.scoreEw.textContent = state.score.ew;
  elements.turnLabel.textContent = state.finished
    ? `Deal complete | ${state.score.ns}-${state.score.ew}`
    : state.turn ? `${state.turn} to play` : "Put this deal on the table";
  elements.currentTrick.innerHTML = state.trick.length
    ? state.trick.map(trickCardMarkup).join("")
    : "<em>New trick</em>";

  elements.legalSummary.textContent = !interactive && timelineFrames.length
    ? "Reviewing history"
    : legalCards.length
      ? `${legalCards.length} clickable card${legalCards.length === 1 ? "" : "s"}`
      : state.finished ? "Deal complete" : "No active deal";

  const frame = currentFrame();
  elements.historyPosition.textContent = frameLabel(frame, timelineIndex);
  elements.historyPrev.disabled = busy || timelineIndex <= 0;
  elements.historyNext.disabled = busy || timelineIndex < 0 || timelineIndex >= timelineFrames.length - 1;
  elements.historyLive.classList.toggle("is-hidden", timelineIndex < 0 || timelineIndex === timelineFrames.length - 1);
  renderDealSummary();
  updateActionState();
}

function resetTimeline(state) {
  liveState = state;
  timelineFrames = [{ state, play: null }];
  timelineIndex = 0;
  reviewOnly = false;
}

function appendTimelineFrame(state, play) {
  liveState = state;
  timelineFrames.push({ state, play });
  timelineIndex = timelineFrames.length - 1;
}

function renderSavedDeals() {
  const deals = loadDeals();
  elements.dealCount.textContent = deals.length;
  elements.savedDeals.innerHTML = deals.length ? deals.map((deal) => `
    <article class="saved-deal">
      <button class="saved-main" data-load-deal="${deal.id}" type="button">
        <strong>${escapeHtml(deal.name)}</strong>
        <span>${escapeHtml(deal.south)} | ${escapeHtml(deal.trump)}</span>
      </button>
      <button class="saved-delete" data-delete-deal="${deal.id}" type="button" aria-label="Delete ${escapeHtml(deal.name)}">&times;</button>
    </article>`).join("") : "<p class=\"muted-copy\">Saved deals stay on this device.</p>";
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatMs(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Number(value || 0).toFixed(1)} ms`;
}

function bestOutcomeIndex(move) {
  const outcomes = move?.outcomes || [];
  let selected = 0;
  for (let index = 1; index < outcomes.length; index += 1) {
    if (outcomes[index].length > outcomes[selected].length) selected = index;
  }
  return selected;
}

function moveStatus(move, analysis) {
  const bestScore = Math.max(0, ...analysis.rootMoves.map((candidate) => candidate.winningWorlds));
  if (move.card === analysis.bestMove) return { label: "Chosen", className: "best" };
  if (move.winningWorlds === bestScore) return { label: "Tied best", className: "tie" };
  return null;
}

function worldLayoutMarkup(analysis, worldIndex, winningSet) {
  const world = (analysis.sampledWorlds || []).find((candidate) => candidate.index === worldIndex);
  if (!world) return "<p class=\"muted-copy\">Sampled layouts require the current WebAssembly build.</p>";
  return `
    <div class="world-layout">
      <div class="world-hand"><span>World ${worldIndex + 1} | East</span><strong>${escapeHtml(world.east.record)}</strong></div>
      <div class="world-hand"><span>${winningSet.has(worldIndex) ? "Makes target" : "Fails target"} | West</span><strong>${escapeHtml(world.west.record)}</strong></div>
    </div>`;
}

function moveDetailMarkup(analysis, move) {
  const outcomes = move.outcomes || [];
  if (!outcomes.length) {
    return `<div class="move-detail"><p class="muted-copy">Detailed outcome vectors are unavailable in this saved result. Re-run it with the current engine build.</p></div>`;
  }
  activeStrategyIndex = Math.min(activeStrategyIndex, outcomes.length - 1);
  const outcome = outcomes[activeStrategyIndex];
  const winningSet = new Set(outcome);
  const worldCount = analysis.sampledWorlds?.length || Number(elements.worlds.value);
  if (activeWorldIndex === null || activeWorldIndex >= worldCount) {
    activeWorldIndex = outcome[0] ?? 0;
  }
  const bestScore = Math.max(0, ...analysis.rootMoves.map((candidate) => candidate.winningWorlds));
  const tied = analysis.rootMoves.filter((candidate) => candidate.winningWorlds === bestScore);
  let explanation;
  if (move.card === analysis.bestMove && tied.length > 1) {
    explanation = `This card is one of ${tied.length} equally strong options. The deterministic card order selected it.`;
  } else if (move.winningWorlds === bestScore) {
    explanation = `This card is equally strong: it reaches the target in the same number of sampled worlds as ${analysis.bestMove}.`;
  } else {
    explanation = `This card loses ${bestScore - move.winningWorlds} more sampled world${bestScore - move.winningWorlds === 1 ? "" : "s"} than the best option.`;
  }
  return `
    <section class="move-detail">
      <div class="move-detail-heading">
        <div><h3>${escapeHtml(move.card)} at M=${analysis.stats.completedDepth}</h3><p>${escapeHtml(explanation)}</p></div>
        <b>${outcome.length}/${worldCount}</b>
      </div>
      ${outcomes.length > 1 ? `<div class="strategy-tabs">${outcomes.map((vector, index) => `
        <button class="strategy-tab ${index === activeStrategyIndex ? "is-selected" : ""}" data-strategy-index="${index}" type="button">Strategy ${index + 1} | ${vector.length}</button>`).join("")}</div>` : ""}
      <div class="world-key"><span>Target made</span><span class="lost">Target failed</span></div>
      <div class="world-grid" aria-label="Sampled world outcomes">
        ${Array.from({ length: worldCount }, (_, index) => `
          <button class="world-cell ${winningSet.has(index) ? "" : "is-lost"} ${activeWorldIndex === index ? "is-selected" : ""}" data-world-index="${index}" type="button" title="World ${index + 1}">${index + 1}</button>`).join("")}
      </div>
      ${worldLayoutMarkup(analysis, activeWorldIndex, winningSet)}
    </section>`;
}

function analysisMarkup(analysis) {
  const rootMoves = analysis.rootMoves || [];
  const bestScore = Math.max(0, ...rootMoves.map((move) => move.winningWorlds));
  const selected = rootMoves.find((move) => move.card === activeMoveCard) ||
    rootMoves.find((move) => move.card === analysis.bestMove) || rootMoves[0];
  activeMoveCard = selected?.card || null;
  const worldCount = analysis.sampledWorlds?.length || Number(elements.worlds.value);
  return `
    <div class="recommendation">
      <span>Recommended card</span>
      <strong>${escapeHtml(analysis.bestMove)}</strong>
      <p>${analysis.winningWorlds}/${worldCount} sampled worlds | ${rootMoves.filter((move) => move.winningWorlds === bestScore).length} best option${rootMoves.filter((move) => move.winningWorlds === bestScore).length === 1 ? "" : "s"}</p>
    </div>
    <div class="analysis-meta">
      <span>M reached ${analysis.stats.completedDepth}</span>
      <span>${formatMs(analysis.searchMs)} search</span>
      <span>${formatMs(analysis.samplingMs)} sampling</span>
      <span>${formatNumber(analysis.possibleDeals)} possible deals</span>
    </div>
    <div class="analysis-subhead"><h3>Root cards</h3><small>Open a card for world details</small></div>
    <div class="move-list">
      ${rootMoves.map((move) => {
        const status = moveStatus(move, analysis);
        const red = move.card?.startsWith("H") || move.card?.startsWith("D");
        return `<button class="move-option ${move.card === activeMoveCard ? "is-selected" : ""}" data-analysis-move="${escapeHtml(move.card)}" type="button">
          <span class="move-card ${red ? "red" : ""}">${escapeHtml(move.card)}</span>
          <span class="move-score"><strong>${move.winningWorlds}/${worldCount} worlds</strong><small>${move.paretoVectors} Pareto strateg${move.paretoVectors === 1 ? "y" : "ies"}</small><span class="move-bar"><span style="width:${worldCount ? (move.winningWorlds / worldCount) * 100 : 0}%"></span></span></span>
          ${status ? `<span class="status-chip ${status.className}">${status.label}</span>` : `<b>-${bestScore - move.winningWorlds}</b>`}
        </button>`;
      }).join("")}
    </div>
    ${selected ? moveDetailMarkup(analysis, selected) : ""}
    <dl class="stat-grid">
      <div><dt>Nodes</dt><dd>${formatNumber(analysis.stats.nodes)}</dd></div>
      <div><dt>DDS worlds</dt><dd>${formatNumber(analysis.stats.ddsWorlds)}</dd></div>
      <div><dt>TT hits</dt><dd>${formatNumber(analysis.stats.ttHits)}</dd></div>
      <div><dt>Equals skipped</dt><dd>${formatNumber(analysis.stats.equivalentMoves)}</dd></div>
      <div><dt>Useful removed</dt><dd>${formatNumber(analysis.stats.usefulWorldsRemoved)}</dd></div>
      <div><dt>Paper cuts</dt><dd>${formatNumber((analysis.stats.earlyCuts || 0) + (analysis.stats.deepAlphaCuts || 0) + (analysis.stats.worldCuts || 0) + (analysis.stats.winCuts || 0))}</dd></div>
    </dl>`;
}

function showAnalysis(analysis, liveContext = false) {
  activeFullResult = null;
  activeAnalysis = analysis;
  activeAnalysisIsLive = liveContext;
  activeMoveCard = analysis.bestMove;
  activeStrategyIndex = bestOutcomeIndex(analysis.rootMoves?.find((move) => move.card === analysis.bestMove));
  activeWorldIndex = null;
  elements.resultEmpty.classList.add("is-hidden");
  elements.result.classList.remove("is-hidden");
  elements.result.innerHTML = analysisMarkup(analysis);
}

function aggregateFull(result) {
  return (result.analyses || []).reduce((sum, analysis) => {
    sum.searchMs += analysis.searchMs || 0;
    sum.samplingMs += analysis.samplingMs || 0;
    sum.nodes += analysis.stats?.nodes || 0;
    sum.ddsWorlds += analysis.stats?.ddsWorlds || 0;
    sum.maxDepth = Math.max(sum.maxDepth, analysis.stats?.completedDepth || 0);
    return sum;
  }, { searchMs: 0, samplingMs: 0, nodes: 0, ddsWorlds: 0, maxDepth: 0 });
}

function renderFullResult() {
  const result = activeFullResult;
  if (!result) return;
  const totals = aggregateFull(result);
  const analyses = result.analyses || [];
  activeDecisionIndex = Math.min(activeDecisionIndex, Math.max(0, analyses.length - 1));
  const selected = analyses[activeDecisionIndex];
  activeAnalysis = selected || null;
  activeAnalysisIsLive = false;
  elements.result.innerHTML = `
    <div class="recommendation full-result">
      <span>Bot continuation complete</span>
      <strong>${result.state.score.ns}-${result.state.score.ew}</strong>
      <p>${analyses.length} alpha-mu decisions | ${result.plays.length} cards continued | ${formatMs(result.totalMs)}</p>
    </div>
    <dl class="stat-grid">
      <div><dt>Search time</dt><dd>${formatMs(totals.searchMs)}</dd></div>
      <div><dt>Deepest M</dt><dd>${totals.maxDepth}</dd></div>
      <div><dt>Nodes</dt><dd>${formatNumber(totals.nodes)}</dd></div>
      <div><dt>DDS worlds</dt><dd>${formatNumber(totals.ddsWorlds)}</dd></div>
    </dl>
    ${analyses.length ? `
      <div class="analysis-subhead"><h3>Decisions</h3><small>Select a decision to inspect it</small></div>
      <div class="decision-list">${analyses.map((analysis, index) => `<button class="decision-chip ${index === activeDecisionIndex ? "is-selected" : ""}" data-decision-index="${index}" type="button">${index + 1}. ${escapeHtml(analysis.turn)} ${escapeHtml(analysis.bestMove)}</button>`).join("")}</div>
      ${analysisMarkup(selected)}` : "<p class=\"muted-copy\">No declarer decisions remained in this continuation.</p>"}`;
}

function showFullResult(result) {
  activeFullResult = result;
  activeDecisionIndex = 0;
  activeMoveCard = result.analyses?.[0]?.bestMove || null;
  activeStrategyIndex = 0;
  activeWorldIndex = null;
  elements.resultEmpty.classList.add("is-hidden");
  elements.result.classList.remove("is-hidden");
  renderFullResult();
}

function runSummary(run) {
  const date = new Date(run.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const full = run.mode === "full";
  const headline = full ? `${run.result.state.score.ns}-${run.result.state.score.ew}` : run.result.analysis.bestMove;
  const detail = full
    ? `${run.result.analyses.length} decisions | ${formatMs(run.result.totalMs)}`
    : `${run.result.analysis.winningWorlds}/${run.settings.worlds} worlds | ${formatMs(run.result.analysis.searchMs)}`;
  return `
    <details class="run-card">
      <summary>
        <span class="run-mode">${full ? "Full deal" : "Decision"}</span>
        <strong>${escapeHtml(run.deal.name)}</strong>
        <b>${escapeHtml(headline)}</b>
        <small>${escapeHtml(detail)} | ${date}</small>
      </summary>
      <div class="run-detail">
        <p><strong>Settings:</strong> ${run.settings.worlds} worlds, max M=${run.settings.depth}, target ${run.settings.target}, ${run.settings.timeLimit}s.</p>
        <div class="run-actions">
          ${full ? `<button class="button secondary compact" data-review-run="${run.id}" type="button">Review on table</button>` : `<button class="button secondary compact" data-open-analysis-run="${run.id}" type="button">Open analysis</button>`}
        </div>
        ${full ? `<ol class="play-record">${run.result.plays.map((play) => `<li>${escapeHtml(play.seat)} ${escapeHtml(play.card)} <small>${escapeHtml(play.source)}</small></li>`).join("")}</ol>` : ""}
      </div>
    </details>`;
}

function renderRuns() {
  const runs = loadRuns();
  elements.runList.innerHTML = runs.length
    ? runs.map(runSummary).join("")
    : "<div class=\"empty-runs\"><strong>No recorded runs yet.</strong><span>Analysis timing, sampled worlds, and play records are saved automatically.</span></div>";
}

function updateActionState() {
  const hasSession = Boolean(liveState);
  const live = isAtLivePosition();
  const declarerTurn = liveState?.turn === "North" || liveState?.turn === "South";
  elements.analyze.disabled = busy || !engineReady || !hasSession || !live || !declarerTurn || liveState?.finished;
  elements.analyzeFull.disabled = busy || !engineReady || !hasSession || !live || liveState?.finished;
  byId("load-deal").disabled = busy || !engineReady;
  byId("undo").disabled = busy || !hasSession || !live || timelineFrames.length <= 1;
  byId("replay").disabled = busy || !currentDeal;
  byId("edit-deal").disabled = busy;
  byId("edit-settings").disabled = busy;
  elements.tableStage.querySelectorAll("[data-card]").forEach((button) => {
    button.disabled = busy || !live || reviewOnly;
  });
}

function handFormValues() {
  return {
    North: elements.north.value,
    East: elements.east.value,
    South: elements.south.value,
    West: elements.west.value
  };
}

function updateFourthHandControl() {
  const completion = fourthHandCompletion(handFormValues());
  elements.completeFourthHand.disabled = !completion.ready;
  elements.completeHandStatus.textContent = completion.message;
  return completion;
}

function fillFourthHand(showToast = true) {
  const completion = updateFourthHandControl();
  if (!completion.ready) {
    if (showToast) toast(completion.message, "error");
    return false;
  }
  elements[completion.seat.toLowerCase()].value = completion.record;
  updateFourthHandControl();
  if (showToast) toast(`${completion.seat} filled from the remaining deck`, "success");
  return true;
}

function setBusy(value, full = false) {
  busy = value;
  elements.cancel.classList.toggle("is-hidden", !value);
  elements.progress.classList.toggle("is-hidden", !value || !full);
  elements.analyze.textContent = value && !full ? "Analyzing..." : "Analyze this decision";
  updateActionState();
}

async function putDealOnTable(quiet = false) {
  fillFourthHand(false);
  const deal = collectDeal();
  const response = await engine.createSession(deal);
  resetTimeline(response.state);
  let state = response.state;
  for (const card of parsePlayPrefix(deal.playPrefix)) {
    const seat = state.turn;
    const played = await engine.play(card);
    state = played.state;
    appendTimelineFrame(state, { seat, card, source: "entered" });
  }
  currentDeal = deal;
  liveState = state;
  reviewOnly = false;
  activeAnalysis = null;
  activeAnalysisIsLive = false;
  activeFullResult = null;
  elements.result.classList.add("is-hidden");
  elements.resultEmpty.classList.remove("is-hidden");
  elements.restrictionStatus.textContent = `${formatNumber(response.possibleDeals)} deal${response.possibleDeals === 1 ? "" : "s"}`;
  renderTable();
  if (elements.dealDialog.open) elements.dealDialog.close();
  if (!quiet) toast("Deal loaded", "success");
}

async function analyzePosition() {
  setBusy(true);
  try {
    const settings = analysisSettings();
    const result = await engine.analyze(settings);
    liveState = result.state;
    elements.restrictionStatus.textContent = `${formatNumber(result.analysis.possibleDeals)} deal${result.analysis.possibleDeals === 1 ? "" : "s"}`;
    showAnalysis(result.analysis, true);
    saveRun({ mode: "decision", deal: currentDeal, settings, result });
    renderRuns();
    toast(`Alpha-mu recommends ${result.analysis.bestMove}`, "success");
  } finally {
    setBusy(false);
    renderTable();
  }
}

async function analyzeFullDeal() {
  setBusy(true, true);
  elements.progressBar.style.width = "0%";
  elements.progressValue.textContent = "0%";
  elements.progressLabel.textContent = "Continuing from the current card";
  const existingFrames = timelineFrames.slice(0, timelineIndex + 1);
  try {
    const settings = analysisSettings();
    const result = await engine.runFull({
      ...settings,
      priorAnalysis: activeAnalysisIsLive ? activeAnalysis : null
    });
    liveState = result.state;
    const continuationFrames = result.frames || result.plays.map((play) => ({ play, state: play.state })).filter((frame) => frame.state);
    timelineFrames = existingFrames.concat(continuationFrames);
    timelineIndex = timelineFrames.length - 1;
    reviewOnly = false;
    const completeResult = { ...result, timelineFrames };
    renderTable();
    showFullResult(completeResult);
    saveRun({ mode: "full", deal: currentDeal, settings, result: completeResult });
    renderRuns();
    toast("Bot continuation saved", "success");
  } finally {
    setBusy(false);
    renderTable();
  }
}

function safely(action) {
  return async (...args) => {
    try {
      await action(...args);
    } catch (error) {
      toast(error.message || String(error), "error");
      setBusy(false);
      renderTable();
    }
  };
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

byId("edit-deal").addEventListener("click", () => openDialog(elements.dealDialog));
byId("edit-settings").addEventListener("click", () => openDialog(elements.settingsDialog));
for (const button of document.querySelectorAll("[data-close-dialog]")) {
  button.addEventListener("click", () => byId(button.dataset.closeDialog).close());
}
for (const dialog of [elements.dealDialog, elements.settingsDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

byId("apply-settings").addEventListener("click", () => {
  renderSettingsSummary();
  elements.settingsDialog.close();
  toast("Analysis settings updated");
});

byId("load-deal").addEventListener("click", safely(() => putDealOnTable(false)));
byId("save-deal").addEventListener("click", () => {
  const stored = saveDeal(collectDeal());
  populateDealForm(stored);
  renderSavedDeals();
  renderDealSummary();
  toast("Deal saved on this device", "success");
});
byId("new-deal").addEventListener("click", () => {
  populateDealForm({
    name: "Untitled deal",
    north: "-.-.-.-",
    east: "-.-.-.-",
    south: "-.-.-.-",
    west: "-.-.-.-",
    leader: "South",
    trump: "NT",
    playPrefix: "",
    notes: "",
    restrictions: {}
  });
});

elements.savedDeals.addEventListener("click", safely(async (event) => {
  const loadButton = event.target.closest("[data-load-deal]");
  const deleteButton = event.target.closest("[data-delete-deal]");
  if (loadButton) {
    const deal = loadDeals().find((candidate) => candidate.id === loadButton.dataset.loadDeal);
    if (deal) {
      currentDeal = deal;
      populateDealForm(deal);
      await putDealOnTable(false);
    }
  }
  if (deleteButton) {
    deleteDeal(deleteButton.dataset.deleteDeal);
    renderSavedDeals();
  }
}));

elements.tableStage.addEventListener("click", safely(async (event) => {
  const button = event.target.closest("[data-card]");
  if (!button || button.disabled || !isAtLivePosition()) return;
  const seat = liveState.turn;
  const card = button.dataset.card;
  const result = await engine.play(card);
  appendTimelineFrame(result.state, { seat, card, source: "manual" });
  activeAnalysis = null;
  activeAnalysisIsLive = false;
  renderTable();
}));

elements.completeFourthHand.addEventListener("click", () => fillFourthHand(true));
for (const input of [elements.north, elements.east, elements.south, elements.west]) {
  input.addEventListener("input", updateFourthHandControl);
}

byId("undo").addEventListener("click", safely(async () => {
  if (!isAtLivePosition() || timelineFrames.length <= 1) return;
  const result = await engine.undo();
  if (result.changed !== false) timelineFrames.pop();
  liveState = result.state;
  timelineIndex = timelineFrames.length - 1;
  activeAnalysis = null;
  activeAnalysisIsLive = false;
  renderTable();
}));

byId("replay").addEventListener("click", safely(() => putDealOnTable(false)));
elements.historyPrev.addEventListener("click", () => {
  if (timelineIndex > 0) timelineIndex -= 1;
  renderTable();
  syncAnalysisToTimeline();
});
elements.historyNext.addEventListener("click", () => {
  if (timelineIndex < timelineFrames.length - 1) timelineIndex += 1;
  renderTable();
  syncAnalysisToTimeline();
});
elements.historyLive.addEventListener("click", () => {
  timelineIndex = timelineFrames.length - 1;
  renderTable();
});

elements.analyze.addEventListener("click", safely(analyzePosition));
elements.analyzeFull.addEventListener("click", safely(analyzeFullDeal));
elements.cancel.addEventListener("click", safely(async () => {
  engine.cancel();
  setBusy(false);
  if (currentDeal) await putDealOnTable(true);
  toast("Analysis stopped");
}));

elements.result.addEventListener("click", (event) => {
  const move = event.target.closest("[data-analysis-move]");
  const strategy = event.target.closest("[data-strategy-index]");
  const world = event.target.closest("[data-world-index]");
  const decision = event.target.closest("[data-decision-index]");
  if (decision && activeFullResult) {
    activeDecisionIndex = Number(decision.dataset.decisionIndex);
    activeMoveCard = activeFullResult.analyses[activeDecisionIndex].bestMove;
    activeStrategyIndex = bestOutcomeIndex(
      activeFullResult.analyses[activeDecisionIndex].rootMoves.find(
        (candidate) => candidate.card === activeMoveCard
      )
    );
    activeWorldIndex = null;
    const matchingFrame = timelineFrames.findIndex(
      (frame) => frame.play?.analysisIndex === activeDecisionIndex
    );
    if (matchingFrame >= 0) {
      timelineIndex = matchingFrame;
      renderTable();
    }
    renderFullResult();
    return;
  }
  if (move && activeAnalysis) {
    activeMoveCard = move.dataset.analysisMove;
    activeStrategyIndex = bestOutcomeIndex(activeAnalysis.rootMoves.find((candidate) => candidate.card === activeMoveCard));
    activeWorldIndex = null;
  } else if (strategy) {
    activeStrategyIndex = Number(strategy.dataset.strategyIndex);
    activeWorldIndex = null;
  } else if (world) {
    activeWorldIndex = Number(world.dataset.worldIndex);
  } else {
    return;
  }
  if (activeFullResult) renderFullResult();
  else elements.result.innerHTML = analysisMarkup(activeAnalysis);
});

elements.runList.addEventListener("click", (event) => {
  const analysisButton = event.target.closest("[data-open-analysis-run]");
  const reviewButton = event.target.closest("[data-review-run]");
  if (!analysisButton && !reviewButton) return;
  const id = analysisButton?.dataset.openAnalysisRun || reviewButton?.dataset.reviewRun;
  const run = loadRuns().find((candidate) => candidate.id === id);
  if (!run) return;
  if (analysisButton) {
    showAnalysis(run.result.analysis, false);
  } else {
    currentDeal = run.deal;
    populateDealForm(run.deal);
    liveState = run.result.state;
    timelineFrames = run.result.timelineFrames || [
      ...(run.result.startState ? [{ state: run.result.startState, play: null, label: "Bot continuation start" }] : []),
      ...(run.result.frames || [])
    ];
    if (!timelineFrames.length) timelineFrames = [{ state: run.result.state, play: null }];
    timelineIndex = 0;
    reviewOnly = true;
    renderTable();
    showFullResult(run.result);
  }
  byId("analysis").scrollIntoView({ behavior: "smooth", block: "start" });
});

byId("clear-runs").addEventListener("click", () => {
  clearRuns();
  renderRuns();
});

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select") || elements.dealDialog.open || elements.settingsDialog.open) return;
  if (event.key === "ArrowLeft" && timelineIndex > 0) {
    timelineIndex -= 1;
    renderTable();
    syncAnalysisToTimeline();
  }
  if (event.key === "ArrowRight" && timelineIndex < timelineFrames.length - 1) {
    timelineIndex += 1;
    renderTable();
    syncAnalysisToTimeline();
  }
});

function syncAnalysisToTimeline() {
  if (!activeFullResult) return;
  const analysisIndex = currentFrame()?.play?.analysisIndex;
  if (!Number.isInteger(analysisIndex) || analysisIndex < 0 ||
      analysisIndex >= activeFullResult.analyses.length ||
      analysisIndex === activeDecisionIndex) return;
  activeDecisionIndex = analysisIndex;
  activeMoveCard = activeFullResult.analyses[analysisIndex].bestMove;
  activeStrategyIndex = bestOutcomeIndex(
    activeFullResult.analyses[analysisIndex].rootMoves.find(
      (candidate) => candidate.card === activeMoveCard
    )
  );
  activeWorldIndex = null;
  renderFullResult();
}

renderSettingsSummary();
renderSavedDeals();
renderRuns();
updateFourthHandControl();
renderTable();
