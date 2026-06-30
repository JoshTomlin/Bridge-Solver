import { EngineClient } from "./engine-client.js";
import { clearRuns, deleteDeal, loadDeals, loadRuns, saveDeal, saveRun } from "./storage.js";

const byId = (id) => document.getElementById(id);
const elements = {
  enginePill: byId("engine-pill"),
  engineLabel: byId("engine-label"),
  name: byId("deal-name"),
  north: byId("north-hand"),
  east: byId("east-hand"),
  south: byId("south-hand"),
  west: byId("west-hand"),
  leader: byId("leader"),
  trump: byId("trump"),
  notes: byId("deal-notes"),
  restrictionStatus: byId("restriction-status"),
  savedDeals: byId("saved-deals"),
  dealCount: byId("deal-count"),
  legalCards: byId("legal-cards"),
  legalSummary: byId("legal-summary"),
  turnLabel: byId("turn-label"),
  currentTrick: byId("current-trick"),
  scoreNs: byId("score-ns"),
  scoreEw: byId("score-ew"),
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

let currentDeal = null;
let currentState = null;
let busy = false;
let engineReady = false;

const restrictionSuits = ["S", "H", "D", "C"];

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
  },
  onProgress(progress) {
    currentState = progress.state;
    renderTable();
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
    id: currentDeal?.id,
    name: elements.name.value.trim() || "Untitled deal",
    north: elements.north.value.trim(),
    east: elements.east.value.trim(),
    south: elements.south.value.trim(),
    west: elements.west.value.trim(),
    leader: elements.leader.value,
    trump: elements.trump.value,
    notes: elements.notes.value.trim(),
    restrictions: {
      east: collectSeatRestrictions("east"),
      west: collectSeatRestrictions("west")
    }
  };
}

function applyDeal(deal) {
  currentDeal = deal;
  elements.name.value = deal.name || "Untitled deal";
  elements.north.value = deal.north || "-.-.-.-";
  elements.east.value = deal.east || "-.-.-.-";
  elements.south.value = deal.south || "-.-.-.-";
  elements.west.value = deal.west || "-.-.-.-";
  elements.leader.value = deal.leader || "South";
  elements.trump.value = deal.trump || "NT";
  elements.notes.value = deal.notes || "";
  applySeatRestrictions("east", deal.restrictions?.east);
  applySeatRestrictions("west", deal.restrictions?.west);
  byId("defender-knowledge").open =
    Boolean(hasSeatRestrictions(deal.restrictions?.east) || hasSeatRestrictions(deal.restrictions?.west));
  elements.restrictionStatus.textContent = "Load to count";
  currentState = null;
  renderTable();
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

function parsePreviewHand(record) {
  const fields = record.trim().split(/[.\s]+/);
  if (fields.length !== 4) return { S: "?", H: "?", D: "?", C: "?" };
  return { S: fields[0], H: fields[1], D: fields[2], C: fields[3] };
}

function holdingMarkup(hand) {
  const suits = [
    ["S", "♠"],
    ["H", "♥"],
    ["D", "♦"],
    ["C", "♣"]
  ];
  return suits.map(([key, symbol]) => `
    <div class="suit-line ${key === "H" || key === "D" ? "red" : ""}">
      <span>${symbol}</span><strong>${escapeHtml(hand?.[key] || "-")}</strong>
    </div>`).join("");
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

function renderTable() {
  const state = currentState || previewState();
  for (const seat of ["North", "East", "South", "West"]) {
    document.querySelector(`[data-holding="${seat}"]`).innerHTML = holdingMarkup(state.hands[seat]);
    document.querySelector(`[data-seat="${seat}"]`).classList.toggle("is-turn", state.turn === seat);
  }
  elements.scoreNs.textContent = state.score.ns;
  elements.scoreEw.textContent = state.score.ew;
  elements.turnLabel.textContent = state.finished
    ? `Deal complete · ${state.score.ns}–${state.score.ew}`
    : state.turn ? `${state.turn} to play` : "Put this deal on the table";
  elements.currentTrick.innerHTML = state.trick.length
    ? state.trick.map((play) => `<span><small>${escapeHtml(play.seat[0])}</small>${escapeHtml(play.card)}</span>`).join("")
    : '<em>New trick</em>';
  elements.legalSummary.textContent = state.legalCards.length
    ? `${state.legalCards.length} choice${state.legalCards.length === 1 ? "" : "s"}`
    : state.finished ? "Deal complete" : "No active deal";
  elements.legalCards.innerHTML = state.legalCards.map((card) => {
    const red = card.startsWith("H") || card.startsWith("D");
    return `<button class="playing-card ${red ? "red" : ""}" data-card="${card}" type="button"><span>${card[1]}</span><small>${card[0]}</small></button>`;
  }).join("");
  updateActionState();
}

function renderSavedDeals() {
  const deals = loadDeals();
  elements.dealCount.textContent = deals.length;
  elements.savedDeals.innerHTML = deals.length ? deals.map((deal) => `
    <article class="saved-deal">
      <button class="saved-main" data-load-deal="${deal.id}" type="button">
        <strong>${escapeHtml(deal.name)}</strong>
        <span>${escapeHtml(deal.south)} · ${escapeHtml(deal.trump)}</span>
      </button>
      <button class="saved-delete" data-delete-deal="${deal.id}" type="button" aria-label="Delete ${escapeHtml(deal.name)}">×</button>
    </article>`).join("") : '<p class="muted-copy">Your saved deals will live here on this device.</p>';
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatMs(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Number(value || 0).toFixed(1)} ms`;
}

function analysisMarkup(analysis) {
  const maximum = Math.max(1, ...analysis.rootMoves.map((move) => move.winningWorlds));
  return `
    <div class="recommendation">
      <span>Recommended card</span>
      <strong>${escapeHtml(analysis.bestMove)}</strong>
      <p>${analysis.winningWorlds}/${elements.worlds.value} sampled worlds</p>
    </div>
    <div class="move-bars">
      ${analysis.rootMoves.map((move) => `
        <div class="move-row">
          <strong>${escapeHtml(move.card)}</strong>
          <div><span style="width:${(move.winningWorlds / maximum) * 100}%"></span></div>
          <small>${move.winningWorlds}</small>
        </div>`).join("")}
    </div>
    <dl class="stat-grid">
      <div><dt>Search</dt><dd>${formatMs(analysis.searchMs)}</dd></div>
      <div><dt>Sampling</dt><dd>${formatMs(analysis.samplingMs)}</dd></div>
      <div><dt>Completed M</dt><dd>${analysis.stats.completedDepth}</dd></div>
      <div><dt>Nodes</dt><dd>${formatNumber(analysis.stats.nodes)}</dd></div>
      <div><dt>DDS worlds</dt><dd>${formatNumber(analysis.stats.ddsWorlds)}</dd></div>
      <div><dt>Equals skipped</dt><dd>${formatNumber(analysis.stats.equivalentMoves)}</dd></div>
      <div><dt>TT hits</dt><dd>${formatNumber(analysis.stats.ttHits)}</dd></div>
      <div><dt>Cuts</dt><dd>${formatNumber(analysis.stats.earlyCuts + analysis.stats.rootCuts + analysis.stats.winCuts)}</dd></div>
    </dl>`;
}

function showAnalysis(analysis) {
  elements.resultEmpty.classList.add("is-hidden");
  elements.result.classList.remove("is-hidden");
  elements.result.innerHTML = analysisMarkup(analysis);
}

function aggregateFull(result) {
  const totals = result.analyses.reduce((sum, analysis) => {
    sum.searchMs += analysis.searchMs;
    sum.samplingMs += analysis.samplingMs;
    sum.nodes += analysis.stats.nodes;
    sum.ddsWorlds += analysis.stats.ddsWorlds;
    sum.equivalentMoves += analysis.stats.equivalentMoves;
    sum.ttHits += analysis.stats.ttHits;
    sum.maxDepth = Math.max(sum.maxDepth, analysis.stats.completedDepth);
    return sum;
  }, { searchMs: 0, samplingMs: 0, nodes: 0, ddsWorlds: 0, equivalentMoves: 0, ttHits: 0, maxDepth: 0 });
  return totals;
}

function showFullResult(result) {
  const totals = aggregateFull(result);
  elements.resultEmpty.classList.add("is-hidden");
  elements.result.classList.remove("is-hidden");
  elements.result.innerHTML = `
    <div class="recommendation full-result">
      <span>Full deal complete</span>
      <strong>${result.state.score.ns}<i>–</i>${result.state.score.ew}</strong>
      <p>${result.analyses.length} alpha-mu decisions · ${result.plays.length} cards</p>
    </div>
    <dl class="stat-grid">
      <div><dt>Total runtime</dt><dd>${formatMs(result.totalMs)}</dd></div>
      <div><dt>Search time</dt><dd>${formatMs(totals.searchMs)}</dd></div>
      <div><dt>Deepest M</dt><dd>${totals.maxDepth}</dd></div>
      <div><dt>Nodes</dt><dd>${formatNumber(totals.nodes)}</dd></div>
      <div><dt>DDS worlds</dt><dd>${formatNumber(totals.ddsWorlds)}</dd></div>
      <div><dt>Equals skipped</dt><dd>${formatNumber(totals.equivalentMoves)}</dd></div>
    </dl>`;
}

function runSummary(run) {
  const date = new Date(run.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const full = run.mode === "full";
  const headline = full
    ? `${run.result.state.score.ns}–${run.result.state.score.ew}`
    : run.result.analysis.bestMove;
  const detail = full
    ? `${run.result.analyses.length} decisions · ${formatMs(run.result.totalMs)}`
    : `${run.result.analysis.winningWorlds}/${run.settings.worlds} worlds · ${formatMs(run.result.analysis.searchMs)}`;
  return `
    <details class="run-card">
      <summary>
        <span class="run-mode">${full ? "Full deal" : "Decision"}</span>
        <strong>${escapeHtml(run.deal.name)}</strong>
        <b>${escapeHtml(headline)}</b>
        <small>${escapeHtml(detail)} · ${date}</small>
      </summary>
      <div class="run-detail">
        <p><strong>Settings:</strong> ${run.settings.worlds} worlds, max M=${run.settings.depth}, target ${run.settings.target}, ${run.settings.timeLimit}s.</p>
        ${full ? `<ol class="play-record">${run.result.plays.map((play) => `<li>${play.seat} ${play.card} <small>${play.source}</small></li>`).join("")}</ol>` : analysisMarkup(run.result.analysis)}
      </div>
    </details>`;
}

function renderRuns() {
  const runs = loadRuns();
  elements.runList.innerHTML = runs.length
    ? runs.map(runSummary).join("")
    : '<div class="empty-runs"><strong>No recorded runs yet.</strong><span>Analysis timing and search statistics will be saved automatically.</span></div>';
}

function updateActionState() {
  const hasSession = Boolean(currentState);
  elements.analyze.disabled = busy || !engineReady || !hasSession || currentState?.finished;
  elements.analyzeFull.disabled = busy || !engineReady || !hasSession;
  byId("load-deal").disabled = busy || !engineReady;
  byId("undo").disabled = busy || !hasSession;
  byId("replay").disabled = busy || !hasSession;
  elements.legalCards.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
}

function setBusy(value, full = false) {
  busy = value;
  elements.cancel.classList.toggle("is-hidden", !value);
  elements.progress.classList.toggle("is-hidden", !value || !full);
  elements.analyze.textContent = value && !full ? "Analyzing..." : "Analyze this decision";
  updateActionState();
}

async function putDealOnTable() {
  const deal = collectDeal();
  const response = await engine.createSession(deal);
  currentDeal = deal;
  currentState = response.state;
  elements.restrictionStatus.textContent = `${formatNumber(response.possibleDeals)} deal${response.possibleDeals === 1 ? "" : "s"}`;
  renderTable();
  toast("Deal loaded", "success");
}

async function analyzePosition() {
  setBusy(true);
  try {
    const settings = analysisSettings();
    const result = await engine.analyze(settings);
    currentState = result.state;
    elements.restrictionStatus.textContent = `${formatNumber(result.analysis.possibleDeals)} deal${result.analysis.possibleDeals === 1 ? "" : "s"}`;
    showAnalysis(result.analysis);
    saveRun({ mode: "decision", deal: collectDeal(), settings, result });
    renderRuns();
    toast(`Alpha-mu recommends ${result.analysis.bestMove}`, "success");
  } finally {
    setBusy(false);
  }
}

async function analyzeFullDeal() {
  setBusy(true, true);
  elements.progressBar.style.width = "0%";
  elements.progressValue.textContent = "0%";
  elements.progressLabel.textContent = "Starting full-deal analysis";
  try {
    const settings = analysisSettings();
    const result = await engine.runFull(settings);
    currentState = result.state;
    renderTable();
    showFullResult(result);
    saveRun({ mode: "full", deal: collectDeal(), settings, result });
    renderRuns();
    toast("Full-deal analysis saved", "success");
  } finally {
    setBusy(false);
  }
}

function safely(action) {
  return async (...args) => {
    try {
      await action(...args);
    } catch (error) {
      toast(error.message || String(error), "error");
      setBusy(false);
    }
  };
}

byId("load-deal").addEventListener("click", safely(putDealOnTable));
byId("save-deal").addEventListener("click", () => {
  currentDeal = saveDeal(collectDeal());
  renderSavedDeals();
  toast("Deal saved on this device", "success");
});
byId("new-deal").addEventListener("click", () => {
  applyDeal({ name: "Untitled deal", north: "-.-.-.-", east: "-.-.-.-", south: "-.-.-.-", west: "-.-.-.-", leader: "South", trump: "NT", notes: "", restrictions: {} });
});
elements.savedDeals.addEventListener("click", safely(async (event) => {
  const loadButton = event.target.closest("[data-load-deal]");
  const deleteButton = event.target.closest("[data-delete-deal]");
  if (loadButton) {
    const deal = loadDeals().find((candidate) => candidate.id === loadButton.dataset.loadDeal);
    if (deal) {
      applyDeal(deal);
      await putDealOnTable();
    }
  }
  if (deleteButton) {
    deleteDeal(deleteButton.dataset.deleteDeal);
    renderSavedDeals();
  }
}));
elements.legalCards.addEventListener("click", safely(async (event) => {
  const button = event.target.closest("[data-card]");
  if (!button) return;
  const result = await engine.play(button.dataset.card);
  currentState = result.state;
  renderTable();
}));
byId("undo").addEventListener("click", safely(async () => {
  const result = await engine.undo();
  currentState = result.state;
  renderTable();
}));
byId("replay").addEventListener("click", safely(async () => {
  const result = await engine.replay();
  currentState = result.state;
  renderTable();
}));
elements.analyze.addEventListener("click", safely(analyzePosition));
elements.analyzeFull.addEventListener("click", safely(analyzeFullDeal));
elements.cancel.addEventListener("click", safely(async () => {
  engine.cancel();
  setBusy(false);
  if (currentDeal) {
    const result = await engine.createSession(currentDeal);
    currentState = result.state;
    renderTable();
  }
  toast("Analysis stopped");
}));
byId("clear-runs").addEventListener("click", () => {
  clearRuns();
  renderRuns();
});
function invalidateSession() {
  currentState = null;
  elements.restrictionStatus.textContent = "Reload to apply";
  renderTable();
}

const restrictionFields = ["east", "west"].flatMap((seat) => [
  byId(`${seat}-required`),
  byId(`${seat}-forbidden`),
  ...restrictionSuits.flatMap((suit) => [
    byId(`${seat}-min-${suit.toLowerCase()}`),
    byId(`${seat}-max-${suit.toLowerCase()}`)
  ]),
  byId(`${seat}-min-hcp`),
  byId(`${seat}-max-hcp`)
]);
for (const input of [
  elements.north,
  elements.east,
  elements.south,
  elements.west,
  elements.leader,
  elements.trump,
  ...restrictionFields
]) {
  input.addEventListener("input", invalidateSession);
}

renderSavedDeals();
renderRuns();
renderTable();
