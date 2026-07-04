import { EngineClient } from "./engine-client.js";
import { complementaryDefenderBounds, completeDefenderLayout, fourthHandCompletion, handRecordFromCards, parseHandRecord } from "./deal-utils.js";
import { clearRuns, deleteDeal, loadDeals, loadRuns, saveDeal, saveRun } from "./storage.js";

const byId = (id) => document.getElementById(id);
const elements = {
  enginePill: byId("engine-pill"),
  engineLabel: byId("engine-label"),
  dealDialog: byId("deal-dialog"),
  settingsDialog: byId("settings-dialog"),
  analysisDialog: byId("analysis-dialog"),
  analysisInspectorBody: byId("analysis-inspector-body"),
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
  restrictionStatus: byId("restriction-status"),
  layoutCount: byId("layout-count"),
  alternativeLayoutTabs: byId("alternative-layout-tabs"),
  alternativeCompass: byId("alternative-compass"),
  alternativeCardPalette: byId("alternative-card-palette"),
  alternativeSeatName: byId("alternative-seat-name"),
  alternativeSeatCount: byId("alternative-seat-count"),
  alternativeLayoutStatus: byId("alternative-layout-status"),
  deleteLayout: byId("delete-layout"),
  savedDeals: byId("saved-deals"),
  dealCount: byId("deal-count"),
  tableStage: byId("table"),
  legalSummary: byId("legal-summary"),
  dealCompass: byId("deal-compass"),
  cardPalette: byId("card-palette"),
  pickerSeatName: byId("picker-seat-name"),
  pickerSeatCount: byId("picker-seat-count"),
  completeHandStatus: byId("complete-hand-status"),
  turnLabel: byId("turn-label"),
  currentTrick: byId("current-trick"),
  scoreNs: byId("score-ns"),
  scoreLabel: byId("score-label"),
  scoreEw: byId("score-ew"),
  historyPrev: byId("history-prev"),
  historyNext: byId("history-next"),
  historyPosition: byId("history-position"),
  tableLayoutSelect: byId("table-layout-select"),
  worlds: byId("world-count"),
  depth: byId("max-depth"),
  target: byId("target-tricks"),
  timeLimit: byId("time-limit"),
  seed: byId("random-seed"),
  defenderHoldOrder: byId("defender-hold-order"),
  analyze: byId("analyze-position"),
  analyzeFull: byId("analyze-full"),
  analyzeLayouts: byId("analyze-layouts"),
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
let activeEditSeat = "North";
let activeAlternativeIndex = 0;
let activeAlternativeSeat = "East";
let retainedTrick = [];
let additionalLayouts = [];
let activeLayoutBatch = null;
let activeLayoutResultIndex = 0;
let activeTableLayoutIndex = 0;

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

function syncComplementaryBounds(sourcePrefix) {
  const targetPrefix = sourcePrefix === "east" ? "west" : "east";
  const complement = complementaryDefenderBounds(
    collectSeatRestrictions(sourcePrefix),
    elements.east.value,
    elements.west.value
  );
  const target = collectSeatRestrictions(targetPrefix);
  applySeatRestrictions(targetPrefix, { ...target, ...complement });
  elements.restrictionStatus.textContent = "Load to count";
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
    if (progress.batch) {
      elements.progressLabel.textContent = progress.label;
      elements.progressValue.textContent = `${progress.percent}%`;
      elements.progressBar.style.width = `${progress.percent}%`;
      return;
    }
    liveState = progress.state;
    retainTrickAfterPlay(progress.state, progress.play);
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
  const normalizedLayouts = additionalLayouts.map((layout, index) => ({
    ...layout,
    name: `Layout ${index + 2}`,
    ...completeDefenderLayout(
      elements.east.value,
      elements.west.value,
      layout.east,
      layout.west
    )
  }));
  return {
    id: draftDealId,
    name: elements.name.value.trim() || "Untitled deal",
    north: elements.north.value.trim(),
    east: elements.east.value.trim(),
    south: elements.south.value.trim(),
    west: elements.west.value.trim(),
    leader: elements.leader.value,
    trump: elements.trump.value,
    target: Number(elements.target.value),
    playPrefix: elements.playPrefix.value.trim().toUpperCase(),
    additionalLayouts: normalizedLayouts,
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
  elements.leader.value = deal.leader || "West";
  elements.trump.value = deal.trump || "NT";
  elements.target.value = deal.target || 13;
  elements.playPrefix.value = deal.playPrefix || "";
  additionalLayouts = (deal.additionalLayouts || []).map((layout, index) => ({
    ...layout,
    name: `Layout ${index + 2}`,
    id: layout.id || layoutIdentifier()
  }));
  activeAlternativeIndex = 0;
  activeTableLayoutIndex = 0;
  applySeatRestrictions("east", deal.restrictions?.east);
  applySeatRestrictions("west", deal.restrictions?.west);
  elements.restrictionStatus.textContent = "Load to count";
  renderDealEditor();
  renderAdditionalLayouts();
}

function analysisSettings() {
  const defenderHoldOrder = elements.defenderHoldOrder.value.trim().toUpperCase();
  if (!/^(?!.*(.).*\1)[SHDC]{4}$/.test(defenderHoldOrder)) {
    throw new Error("Defender hold order must contain S, H, D, and C once each");
  }
  return {
    worlds: Number(elements.worlds.value),
    depth: Number(elements.depth.value),
    target: Number(elements.target.value),
    timeLimit: Number(elements.timeLimit.value),
    seed: String(elements.seed.value || "0"),
    defenderHoldOrder
  };
}

function renderSettingsSummary() {
  const settings = analysisSettings();
  elements.settingsSummary.textContent =
    `${settings.worlds} worlds | M ${settings.depth} | ${settings.timeLimit}s`;
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

function layoutIdentifier() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function renderAdditionalLayouts() {
  elements.layoutCount.textContent = additionalLayouts.length + 1;
  elements.analyzeLayouts.classList.toggle("is-hidden", additionalLayouts.length === 0);
  elements.analyzeLayouts.textContent = `Test ${additionalLayouts.length + 1} layouts`;
  renderAlternativeEditor();
  updateActionState();
}

const suitDisplay = {
  S: { symbol: "&spades;", className: "spades", name: "spades" },
  H: { symbol: "&hearts;", className: "hearts", name: "hearts" },
  D: { symbol: "&diams;", className: "diamonds", name: "diamonds" },
  C: { symbol: "&clubs;", className: "clubs", name: "clubs" }
};

function editorHandDiagramMarkup(hand) {
  return `<div class="editor-hand-record">${Object.entries(suitDisplay).map(([suit, display]) => {
    const holding = hand?.[suit] && hand[suit] !== "-" ? hand[suit] : "&mdash;";
    return `<div class="editor-suit suit-${display.className}"><span>${display.symbol}</span><strong>${holding}</strong></div>`;
  }).join("")}</div>`;
}

function cardFaceMarkup(card) {
  const suit = suitDisplay[card[0]];
  return `<b>${escapeHtml(card[1])}</b><i>${suit.symbol}</i>`;
}

function holdingMarkup(hand, legalCards, interactive) {
  const legal = new Set(legalCards);
  return Object.entries(suitDisplay).map(([suit, display]) => {
    const holding = hand?.[suit] && hand[suit] !== "-" ? hand[suit] : "";
    const cards = [...holding].map((rank) => {
      const card = `${suit}${rank}`;
      if (interactive && legal.has(card)) {
        return `<button class="mini-card suit-${display.className}" data-card="${card}" type="button" aria-label="Play ${display.name} ${rank}" title="Play ${card}">${cardFaceMarkup(card)}</button>`;
      }
      return `<span class="mini-card suit-${display.className}">${cardFaceMarkup(card)}</span>`;
    }).join("");
    return `<div class="suit-line suit-${display.className} ${cards ? "" : "is-void"}" aria-label="${display.name}">
      <div class="suit-cards cards-${holding.length}">${cards || "<span class=\"void\">&nbsp;</span>"}</div>
    </div>`;
  }).join("");
}

function trickCardMarkup(play) {
  const suit = suitDisplay[play.card[0]];
  return `
    <span class="trick-card suit-${suit.className}" data-trick-seat="${escapeHtml(play.seat)}" title="${escapeHtml(play.seat)} played ${escapeHtml(play.card)}">
      ${cardFaceMarkup(play.card)}
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

function completedTrickForFrame(index) {
  const frame = timelineFrames[index];
  if (frame?.completedTrick?.length === 4) return frame.completedTrick;
  if (index < 4) return [];
  const previous = timelineFrames[index - 1];
  if (!frame || frame.state.trick.length ||
      frame.state.completedTricks <= (previous?.state.completedTricks ?? 0)) return [];

  const plays = timelineFrames.slice(index - 3, index + 1).map((candidate) => candidate.play);
  return plays.length === 4 && plays.every(Boolean) ? plays : [];
}

function retainTrickAfterPlay(state, play) {
  if (state.trick.length) {
    retainedTrick = state.trick;
  } else if (play && retainedTrick.length === 3) {
    retainedTrick = [...retainedTrick, play];
  } else if (!play || state.completedTricks === 0) {
    retainedTrick = [];
  }
}

function trickForDisplay(state, hasOverride) {
  if (state.trick.length) {
    retainedTrick = state.trick;
    return state.trick;
  }
  if (!hasOverride) {
    const completed = completedTrickForFrame(timelineIndex);
    retainedTrick = completed;
    return completed;
  }
  return retainedTrick.length === 4 ? retainedTrick : [];
}

function frameLabel(frame, index) {
  if (!frame?.play) return frame?.label || "Opening position";
  const live = index === timelineFrames.length - 1 && !reviewOnly ? " | live" : "";
  return `Card ${index}: ${frame.play.seat} ${frame.play.card}${live}`;
}

function renderDealSummary() {
  const deal = currentDeal || collectDeal();
  elements.currentDealName.textContent = deal.name || "Untitled deal";
  elements.currentDealSummary.textContent =
    `${deal.trump} | ${deal.target || elements.target.value} tricks`;
  const layouts = [
    { name: "Layout 1" },
    ...additionalLayouts.map((layout, index) => ({
      name: layout.name || `Layout ${index + 2}`
    }))
  ];
  activeTableLayoutIndex = Math.min(activeTableLayoutIndex, layouts.length - 1);
  elements.tableLayoutSelect.innerHTML = layouts.map((layout, index) =>
    `<option value="${index}">${escapeHtml(layout.name)}</option>`
  ).join("");
  elements.tableLayoutSelect.value = String(activeTableLayoutIndex);
  elements.tableLayoutSelect.classList.toggle("is-hidden", layouts.length < 2);
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
  elements.scoreLabel.textContent = state.score.ns === 1 ? " trick" : " tricks";
  elements.scoreEw.textContent = state.score.ew;
  elements.turnLabel.textContent = state.finished
    ? `Deal complete | ${state.score.ns}-${state.score.ew}`
    : state.turn ? `${state.turn} to play` : "Put this deal on the table";
  const displayedTrick = trickForDisplay(state, Boolean(override));
  elements.currentTrick.classList.toggle("is-retained", !state.trick.length && displayedTrick.length === 4);
  elements.currentTrick.innerHTML = displayedTrick.length
    ? displayedTrick.map(trickCardMarkup).join("")
    : "";

  elements.legalSummary.textContent = !interactive && timelineFrames.length
    ? "Reviewing history"
    : legalCards.length
      ? `${legalCards.length} clickable card${legalCards.length === 1 ? "" : "s"}`
      : state.finished ? "Deal complete" : "No active deal";

  const frame = currentFrame();
  elements.historyPosition.textContent = frameLabel(frame, timelineIndex);
  elements.historyPrev.disabled = busy || timelineIndex <= 0;
  elements.historyNext.disabled = busy || timelineIndex < 0 || timelineIndex >= timelineFrames.length - 1;
  renderDealSummary();
  updateActionState();
}

function resetTimeline(state) {
  liveState = state;
  retainedTrick = state.trick;
  timelineFrames = [{ state, play: null }];
  timelineIndex = 0;
  reviewOnly = false;
}

function appendTimelineFrame(state, play) {
  liveState = state;
  retainTrickAfterPlay(state, play);
  timelineFrames.push({
    state,
    play,
    completedTrick: !state.trick.length && retainedTrick.length === 4
      ? retainedTrick
      : null
  });
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

function isForcedAnalysis(analysis) {
  return Number(analysis?.stats?.forcedRootMoves || 0) > 0;
}

function preSamplingBound(analysis) {
  if (Number(analysis?.stats?.quickTrickRootCuts || 0) > 0) {
    return {
      summary: "Guaranteed cashing line | no world search needed",
      score: "Guaranteed in every layout",
      detail: "Public quick-trick proof",
      label: "Proven"
    };
  }
  if (Number(analysis?.stats?.targetImpossibleCuts || 0) > 0 &&
      !(analysis.sampledWorlds?.length)) {
    return {
      summary: "Target already impossible | no world search needed",
      score: "Target cannot be reached",
      detail: "Remaining-trick upper bound",
      label: "Bound"
    };
  }
  if (Number(analysis?.stats?.targetReachedCuts || 0) > 0 &&
      !(analysis.sampledWorlds?.length)) {
    return {
      summary: "Target already reached | no world search needed",
      score: "Target already secured",
      detail: "Current-score lower bound",
      label: "Bound"
    };
  }
  return null;
}

function worldHandRecordMarkup(hand) {
  return `<div class="world-hand-record">${Object.entries(suitDisplay).map(([suit, display]) => {
    const holding = hand?.[suit] && hand[suit] !== "-" ? hand[suit] : "&mdash;";
    return `<div class="world-suit suit-${display.className}"><span>${display.symbol}</span><strong>${holding}</strong></div>`;
  }).join("")}</div>`;
}

function worldLayoutMarkup(analysis, worldIndex, winningSet) {
  const world = (analysis.sampledWorlds || []).find((candidate) => candidate.index === worldIndex);
  if (!world) return "<p class=\"muted-copy\">Sampled layouts require the current WebAssembly build.</p>";
  const state = displayedState();
  const hands = {
    ...state.hands,
    East: parsePreviewHand(world.east.record),
    West: parsePreviewHand(world.west.record)
  };
  const trick = state.trick?.length ? state.trick : completedTrickForFrame(timelineIndex);
  const target = Number(analysis.targetTricks ?? elements.target.value);
  const tricksNeeded = Math.max(0, target - Number(state.score?.ns || 0));
  return `
    <section class="world-position">
      <div class="world-position-heading">
        <strong>World ${worldIndex + 1} | ${tricksNeeded} trick${tricksNeeded === 1 ? "" : "s"} needed</strong>
        <span class="status-chip ${winningSet.has(worldIndex) ? "best" : "lost"}">${winningSet.has(worldIndex) ? "Target made" : "Target failed"}</span>
      </div>
      <div class="world-table" aria-label="Complete position in sampled world ${worldIndex + 1}">
        <div class="world-seat north">${worldHandRecordMarkup(hands.North)}</div>
        <div class="world-seat west">${worldHandRecordMarkup(hands.West)}</div>
        <div class="world-trick">${trick.map(trickCardMarkup).join("")}</div>
        <div class="world-seat east">${worldHandRecordMarkup(hands.East)}</div>
        <div class="world-seat south">${worldHandRecordMarkup(hands.South)}</div>
      </div>
    </section>`;
}

function moveDetailMarkup(analysis, move) {
  const outcomes = move.outcomes || [];
  if (!outcomes.length) {
    return `<div class="move-detail"><p class="muted-copy">Detailed outcome vectors are unavailable in this saved result. Re-run it with the current engine build.</p></div>`;
  }
  activeStrategyIndex = Math.min(activeStrategyIndex, outcomes.length - 1);
  const outcome = outcomes[activeStrategyIndex];
  const winningSet = new Set(outcome);
  const bestMove = analysis.rootMoves.find((candidate) => candidate.card === analysis.bestMove);
  const bestOutcome = bestMove?.outcomes?.[bestOutcomeIndex(bestMove)] || [];
  const bestWinningSet = new Set(bestOutcome);
  const comparesWithBest = move.card !== analysis.bestMove;
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
      <div class="world-key">
        <span>Target made</span><span class="lost">Target failed</span>
        ${comparesWithBest ? "<span class=\"regressed\">Lost vs best</span><span class=\"gained\">Won vs best</span>" : ""}
      </div>
      <div class="world-grid" aria-label="Sampled world outcomes">
        ${Array.from({ length: worldCount }, (_, index) => {
          const selectedWins = winningSet.has(index);
          const bestWins = bestWinningSet.has(index);
          const comparison = comparesWithBest && !selectedWins && bestWins
            ? "is-regressed"
            : comparesWithBest && selectedWins && !bestWins ? "is-gained" : "";
          return `<button class="world-cell ${selectedWins ? "" : "is-lost"} ${comparison} ${activeWorldIndex === index ? "is-selected" : ""}" data-world-index="${index}" type="button" title="World ${index + 1}">${index + 1}</button>`;
        }).join("")}
      </div>
      ${worldLayoutMarkup(analysis, activeWorldIndex, winningSet)}
    </section>`;
}

function analysisMarkup(analysis) {
  const rootMoves = analysis.rootMoves || [];
  const forced = isForcedAnalysis(analysis);
  const bound = preSamplingBound(analysis);
  const noWorldSearch = forced || Boolean(bound);
  const bestScore = Math.max(0, ...rootMoves.map((move) => move.winningWorlds));
  const bestOptions = rootMoves.filter((move) => move.winningWorlds === bestScore).length;
  const selected = rootMoves.find((move) => move.card === activeMoveCard) ||
    rootMoves.find((move) => move.card === analysis.bestMove) || rootMoves[0];
  activeMoveCard = selected?.card || null;
  const worldCount = analysis.sampledWorlds?.length || Number(elements.worlds.value);
  const recommendationSummary = noWorldSearch
    ? bound?.summary || "Only legal card | no world search needed"
    : `${analysis.winningWorlds}/${worldCount} sampled worlds | ${bestOptions} best option${bestOptions === 1 ? "" : "s"}`;
  return `
    <div class="recommendation">
      <span>Recommended card</span>
      <strong>${escapeHtml(analysis.bestMove)}</strong>
      <p>${recommendationSummary}</p>
    </div>
    <div class="analysis-meta">
      <span>${noWorldSearch ? bound?.label || "Forced play" : `M reached ${analysis.stats.completedDepth}`}</span>
      <span>${formatMs(analysis.searchMs)} search</span>
      <span>${formatMs(analysis.samplingMs)} sampling</span>
      <span>${formatNumber(analysis.possibleDeals)} possible deals</span>
    </div>
    <div class="analysis-subhead"><h3>Root cards</h3><small>Open a card for world details</small></div>
    <div class="move-list">
      ${rootMoves.map((move) => {
        const status = moveStatus(move, analysis);
        const red = move.card?.startsWith("H") || move.card?.startsWith("D");
        const scoreLabel = noWorldSearch ? bound?.score || "Only legal card" : `${move.winningWorlds}/${worldCount} worlds`;
        const scoreDetail = noWorldSearch ? bound?.detail || "No sampling or DDS" : `${move.paretoVectors} Pareto strateg${move.paretoVectors === 1 ? "y" : "ies"}`;
        const scoreBar = noWorldSearch ? "" : `<span class="move-bar"><span style="width:${worldCount ? (move.winningWorlds / worldCount) * 100 : 0}%"></span></span>`;
        return `<button class="move-option ${move.card === activeMoveCard ? "is-selected" : ""}" data-analysis-move="${escapeHtml(move.card)}" type="button">
          <span class="move-card ${red ? "red" : ""}">${escapeHtml(move.card)}</span>
          <span class="move-score"><strong>${scoreLabel}</strong><small>${scoreDetail}</small>${scoreBar}</span>
          ${status ? `<span class="status-chip ${status.className}">${status.label}</span>` : `<b>-${bestScore - move.winningWorlds}</b>`}
        </button>`;
      }).join("")}
    </div>
    ${selected && !noWorldSearch ? moveDetailMarkup(analysis, selected) : ""}
    <dl class="stat-grid">
      <div><dt>Nodes</dt><dd>${formatNumber(analysis.stats.nodes)}</dd></div>
      <div><dt>DDS worlds</dt><dd>${formatNumber(analysis.stats.ddsWorlds)}</dd></div>
      <div><dt>TT hits</dt><dd>${formatNumber(analysis.stats.ttHits)}</dd></div>
      <div><dt>Equals skipped</dt><dd>${formatNumber(analysis.stats.equivalentMoves)}</dd></div>
      <div><dt>Forced nodes</dt><dd>${formatNumber((analysis.stats.forcedMoveNodes || 0) + (analysis.stats.forcedRootMoves || 0))}</dd></div>
      <div><dt>Useful removed</dt><dd>${formatNumber(analysis.stats.usefulWorldsRemoved)}</dd></div>
      <div><dt>Paper cuts</dt><dd>${formatNumber((analysis.stats.earlyCuts || 0) + (analysis.stats.deepAlphaCuts || 0) + (analysis.stats.worldCuts || 0) + (analysis.stats.winCuts || 0))}</dd></div>
      <div><dt>Target bounds</dt><dd>${formatNumber((analysis.stats.targetReachedCuts || 0) + (analysis.stats.targetImpossibleCuts || 0))}</dd></div>
      <div><dt>Quick tricks</dt><dd>${formatNumber(analysis.stats.quickTrickCuts || 0)}</dd></div>
    </dl>`;
}

function analysisDockMarkup(analysis) {
  const rootMoves = analysis.rootMoves || [];
  const forced = isForcedAnalysis(analysis);
  const bound = preSamplingBound(analysis);
  const bestScore = Math.max(0, ...rootMoves.map((move) => move.winningWorlds));
  const bestOptions = rootMoves.filter((move) => move.winningWorlds === bestScore).length;
  const worldCount = analysis.sampledWorlds?.length || Number(elements.worlds.value);
  const display = suitDisplay[analysis.bestMove?.[0]];
  const outcomeSummary = forced || bound
    ? bound?.score || "No world search needed"
    : `${analysis.winningWorlds}/${worldCount} worlds${bestOptions > 1 ? ` | ${bestOptions} tied` : ""}`;
  return `<button class="analysis-recommendation" data-open-inspector type="button">
    <span class="recommendation-card suit-${display?.className || "spades"}">${analysis.bestMove ? cardFaceMarkup(analysis.bestMove) : "-"}</span>
    <span class="recommendation-copy"><small>${bound?.label || (forced ? "Only legal card" : "Suggested play")}</small><strong>${escapeHtml(analysis.bestMove)}</strong><span>${outcomeSummary}</span></span>
    <span class="recommendation-stats"><b>${bound?.label || (forced ? "Forced" : `M${analysis.stats.completedDepth}`)}</b><small>${formatMs(analysis.searchMs)}</small></span>
    <span class="inspector-chevron" aria-hidden="true">&#8250;</span>
  </button>`;
}

function layoutBatchTabsMarkup() {
  if (!activeLayoutBatch) return "";
  const completed = activeLayoutBatch.results.filter((entry) => entry.result).length;
  return `<section class="layout-batch-results">
    <div class="layout-batch-heading"><strong>Test layouts</strong><span>${completed}/${activeLayoutBatch.results.length} completed | ${formatMs(activeLayoutBatch.totalMs)}</span></div>
    <div class="layout-batch-tabs">
      ${activeLayoutBatch.results.map((entry, index) => `
        <button class="layout-result-tab ${index === activeLayoutResultIndex ? "is-selected" : ""} ${entry.error ? "has-error" : ""}"
          data-layout-result="${index}" type="button" ${entry.error ? "disabled" : ""}
          title="${escapeHtml(entry.error || entry.layout.name)}">
          <strong>${escapeHtml(entry.layout.name)}</strong>
          <small>${entry.error ? "Failed" : `${entry.result.state.score.ns} tricks | ${formatMs(entry.result.totalMs)}`}</small>
        </button>`).join("")}
    </div>
  </section>`;
}

function renderAnalysisInspector() {
  if (activeFullResult) {
    const result = activeFullResult;
    const totals = aggregateFull(result);
    const analyses = result.analyses || [];
    activeDecisionIndex = Math.min(activeDecisionIndex, Math.max(0, analyses.length - 1));
    const selected = analyses[activeDecisionIndex];
    elements.analysisInspectorBody.innerHTML = `
      ${layoutBatchTabsMarkup()}
      <div class="recommendation full-result">
        <span>Bot continuation complete</span>
        <strong>${result.state.score.ns}-${result.state.score.ew}</strong>
        <p>${analyses.length} alpha-mu decisions | ${result.plays.length} cards | ${formatMs(result.totalMs)}</p>
      </div>
      <dl class="stat-grid">
        <div><dt>Search time</dt><dd>${formatMs(totals.searchMs)}</dd></div>
        <div><dt>Deepest M</dt><dd>${totals.maxDepth}</dd></div>
        <div><dt>Nodes</dt><dd>${formatNumber(totals.nodes)}</dd></div>
        <div><dt>DDS worlds</dt><dd>${formatNumber(totals.ddsWorlds)}</dd></div>
      </dl>
      ${analyses.length ? `
        <div class="analysis-subhead"><h3>Decisions</h3><small>Choose a play to inspect</small></div>
        <div class="decision-list">${analyses.map((analysis, index) => `<button class="decision-chip ${index === activeDecisionIndex ? "is-selected" : ""}" data-decision-index="${index}" type="button">${index + 1}. ${escapeHtml(analysis.bestMove)}</button>`).join("")}</div>
        ${analysisMarkup(selected)}` : "<p class=\"muted-copy\">No declarer decisions remained in this continuation.</p>"}`;
    return;
  }
  elements.analysisInspectorBody.innerHTML = activeAnalysis
    ? analysisMarkup(activeAnalysis)
    : "<p class=\"muted-copy\">Run an analysis to inspect its decision tree.</p>";
}

function showAnalysis(analysis, liveContext = false) {
  activeLayoutBatch = null;
  activeFullResult = null;
  activeAnalysis = analysis;
  activeAnalysisIsLive = liveContext;
  activeMoveCard = analysis.bestMove;
  activeStrategyIndex = bestOutcomeIndex(analysis.rootMoves?.find((move) => move.card === analysis.bestMove));
  activeWorldIndex = null;
  elements.resultEmpty.classList.add("is-hidden");
  elements.result.classList.remove("is-hidden");
  elements.result.innerHTML = analysisDockMarkup(analysis);
  renderAnalysisInspector();
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
  elements.result.innerHTML = `${layoutBatchTabsMarkup()}<button class="analysis-recommendation full-dock" data-open-inspector type="button">
    <span class="continuation-score">${result.state.score.ns}-${result.state.score.ew}</span>
    <span class="recommendation-copy"><small>Continuation complete</small><strong>${analyses.length} decisions</strong><span>${result.plays.length} cards played</span></span>
    <span class="recommendation-stats"><b>M${totals.maxDepth}</b><small>${formatMs(result.totalMs)}</small></span>
    <span class="inspector-chevron" aria-hidden="true">&#8250;</span>
  </button>`;
  renderAnalysisInspector();
}

function showFullResult(result, preserveBatch = false) {
  if (!preserveBatch) activeLayoutBatch = null;
  activeFullResult = result;
  activeDecisionIndex = 0;
  activeMoveCard = result.analyses?.[0]?.bestMove || null;
  activeStrategyIndex = 0;
  activeWorldIndex = null;
  elements.resultEmpty.classList.add("is-hidden");
  elements.result.classList.remove("is-hidden");
  renderFullResult();
}

function selectLayoutResult(index) {
  const entry = activeLayoutBatch?.results?.[index];
  if (!entry?.result) return;
  activeLayoutResultIndex = index;
  const result = entry.result;
  timelineFrames = [
    { state: result.startState, play: null, label: entry.layout.name },
    ...(result.frames || [])
  ];
  if (!timelineFrames[0].state) timelineFrames = [{ state: result.state, play: null, label: entry.layout.name }];
  timelineIndex = 0;
  liveState = result.state;
  reviewOnly = true;
  showFullResult(result, true);
  renderTable();
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
  elements.analyzeLayouts.disabled = busy || !engineReady || !hasSession || !live || liveState?.finished || additionalLayouts.length === 0;
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

function editorHandState() {
  const values = handFormValues();
  const parsed = {};
  for (const seat of ["North", "East", "South", "West"]) {
    try {
      parsed[seat] = parseHandRecord(values[seat]);
    } catch {
      parsed[seat] = { count: 0, cards: [] };
    }
  }
  return parsed;
}

function alternativeHandState() {
  const layout = activeAlternativeIndex === 0
    ? { east: elements.east.value, west: elements.west.value }
    : additionalLayouts[activeAlternativeIndex - 1];
  const values = {
    North: elements.north.value,
    East: layout?.east || "-.-.-.-",
    South: elements.south.value,
    West: layout?.west || "-.-.-.-"
  };
  const parsed = {};
  for (const seat of ["North", "East", "South", "West"]) {
    try {
      parsed[seat] = parseHandRecord(values[seat]);
    } catch {
      parsed[seat] = { count: 0, cards: [] };
    }
  }
  return { values, parsed };
}

function renderAlternativeEditor() {
  if (!elements.alternativeLayoutTabs) return;
  const layouts = [
    { id: "true-deal", name: "Layout 1" },
    ...additionalLayouts.map((layout, index) => ({
      id: layout.id,
      name: `Layout ${index + 2}`
    }))
  ];
  activeAlternativeIndex = Math.min(activeAlternativeIndex, layouts.length - 1);
  elements.alternativeLayoutTabs.innerHTML = layouts.map((layout, index) => `
    <button class="alternative-tab ${index === activeAlternativeIndex ? "is-selected" : ""}"
      data-alternative-index="${index}" type="button">
      ${escapeHtml(layout.name)}${index === 0 ? "<small>True deal</small>" : ""}
    </button>`).join("");

  const { values, parsed } = alternativeHandState();
  const owners = new Map();
  for (const seat of ["North", "East", "South", "West"]) {
    for (const card of parsed[seat].cards) owners.set(card, seat);
    document.querySelector(`[data-alternative-holding="${seat}"]`).innerHTML =
      editorHandDiagramMarkup(parsePreviewHand(values[seat]));
  }
  for (const seat of ["East", "West"]) {
    document.querySelector(`[data-alternative-summary="${seat}"]`).textContent =
      `${parsed[seat].count}/13`;
  }
  for (const button of elements.alternativeCompass.querySelectorAll("[data-alternative-seat]")) {
    const selected = button.dataset.alternativeSeat === activeAlternativeSeat;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }

  elements.alternativeSeatName.textContent = activeAlternativeSeat;
  elements.alternativeSeatCount.textContent =
    `${parsed[activeAlternativeSeat].count} / 13 cards`;
  elements.alternativeLayoutStatus.textContent = activeAlternativeIndex === 0
    ? "Layout 1 is the true deal"
    : `Editing Layout ${activeAlternativeIndex + 1}`;
  elements.deleteLayout.classList.toggle("is-hidden", activeAlternativeIndex === 0);

  const ranks = "AKQJT98765432";
  elements.alternativeCardPalette.innerHTML =
    Object.entries(suitDisplay).map(([suit, display]) => `
      <div class="palette-row suit-${display.className}">
        <span class="palette-suit">${display.symbol}</span>
        <div class="palette-cards">
          ${[...ranks].map((rank) => {
            const card = `${suit}${rank}`;
            const owner = owners.get(card);
            const selected = owner === activeAlternativeSeat;
            const unavailable = Boolean(owner && !selected);
            const title = selected
              ? `Remove ${card} from ${activeAlternativeSeat}`
              : unavailable ? `${card} is held by ${owner}` : `Add ${card} to ${activeAlternativeSeat}`;
            return `<button class="picker-card ${selected ? "is-selected" : ""} ${unavailable ? "is-unavailable" : ""}"
              data-alternative-card="${card}" type="button" title="${title}" ${unavailable ? "disabled" : ""}>
              ${cardFaceMarkup(card)}${owner ? `<small>${owner[0]}</small>` : ""}
            </button>`;
          }).join("")}
        </div>
      </div>`).join("");
}

function updateAlternativeHand(seat, cards) {
  const record = handRecordFromCards(cards);
  if (activeAlternativeIndex === 0) {
    elements[seat.toLowerCase()].value = record;
    renderDealEditor();
    return;
  }
  additionalLayouts[activeAlternativeIndex - 1][seat.toLowerCase()] = record;
  renderAlternativeEditor();
}

function updateFourthHandControl() {
  const completion = fourthHandCompletion(handFormValues());
  elements.completeHandStatus.textContent = completion.ready
    ? `${completion.seat} fills automatically`
    : completion.message;
  return completion;
}

function renderDealEditor() {
  const completion = fourthHandCompletion(handFormValues());
  if (completion.ready) {
    elements[completion.seat.toLowerCase()].value = completion.record;
    renderDealEditor();
    return;
  }
  const hands = editorHandState();
  const owners = new Map();
  for (const seat of ["North", "East", "South", "West"]) {
    for (const card of hands[seat].cards) owners.set(card, seat);
    const summary = document.querySelector(`[data-seat-summary="${seat}"]`);
    summary.textContent = `${hands[seat].count}/13`;
    document.querySelector(`[data-editor-holding="${seat}"]`).innerHTML =
      editorHandDiagramMarkup(parsePreviewHand(elements[seat.toLowerCase()].value));
  }

  for (const button of elements.dealCompass.querySelectorAll("[data-edit-seat]")) {
    const selected = button.dataset.editSeat === activeEditSeat;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }

  elements.pickerSeatName.textContent = activeEditSeat;
  elements.pickerSeatCount.textContent = `${hands[activeEditSeat].count} / 13 cards`;
  const ranks = "AKQJT98765432";
  elements.cardPalette.innerHTML = Object.entries(suitDisplay).map(([suit, display]) => `
    <div class="palette-row suit-${display.className}">
      <span class="palette-suit">${display.symbol}</span>
      <div class="palette-cards">
        ${[...ranks].map((rank) => {
          const card = `${suit}${rank}`;
          const owner = owners.get(card);
          const selected = owner === activeEditSeat;
          const unavailable = Boolean(owner && !selected);
          const title = selected
            ? `Remove ${card} from ${activeEditSeat}`
            : unavailable ? `${card} is held by ${owner}` : `Add ${card} to ${activeEditSeat}`;
          return `<button class="picker-card ${selected ? "is-selected" : ""} ${unavailable ? "is-unavailable" : ""}" data-picker-card="${card}" type="button" title="${title}" ${unavailable ? "disabled" : ""}>
            ${cardFaceMarkup(card)}${owner ? `<small>${owner[0]}</small>` : ""}
          </button>`;
        }).join("")}
      </div>
    </div>`).join("");
  updateFourthHandControl();
  renderAlternativeEditor();
}

function updateEditorHand(seat, cards) {
  elements[seat.toLowerCase()].value = handRecordFromCards(cards);
  if (!fillFourthHand(false)) renderDealEditor();
}

function fillFourthHand(showToast = true) {
  const completion = updateFourthHandControl();
  if (!completion.ready) {
    if (showToast) toast(completion.message, "error");
    return false;
  }
  elements[completion.seat.toLowerCase()].value = completion.record;
  renderDealEditor();
  if (showToast) toast(`${completion.seat} filled from the remaining deck`, "success");
  return true;
}

function setBusy(value, full = false) {
  busy = value;
  elements.cancel.classList.toggle("is-hidden", !value);
  elements.progress.classList.toggle("is-hidden", !value || !full);
  elements.analyze.textContent = value && !full ? "Analyzing..." : "Analyze";
  updateActionState();
}

async function putDealOnTable(quiet = false) {
  fillFourthHand(false);
  const deal = collectDeal();
  const selectedLayout = activeTableLayoutIndex === 0
    ? null
    : deal.additionalLayouts[activeTableLayoutIndex - 1];
  const sessionDeal = selectedLayout
    ? { ...deal, east: selectedLayout.east, west: selectedLayout.west }
    : deal;
  const response = await engine.createSession(sessionDeal);
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
  activeLayoutBatch = null;
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

function currentPlayedCards() {
  return timelineFrames
    .slice(1, timelineIndex + 1)
    .map((frame) => frame.play?.card)
    .filter(Boolean);
}

async function analyzeLayoutBatch() {
  setBusy(true, true);
  elements.progressBar.style.width = "0%";
  elements.progressValue.textContent = "0%";
  elements.progressLabel.textContent = "Preparing true layouts";
  try {
    const settings = analysisSettings();
    const baseDeal = currentDeal || collectDeal();
    const layouts = [
      {
        id: "base",
        name: "Base layout",
        east: baseDeal.east,
        west: baseDeal.west
      },
      ...additionalLayouts.map((layout) => ({ ...layout }))
    ];
    const batch = await engine.runLayouts({
      baseDeal,
      layouts,
      playCards: currentPlayedCards(),
      settings
    });
    const firstSuccessful = batch.results.findIndex((entry) => entry.result);
    if (firstSuccessful < 0) {
      throw new Error(batch.results[0]?.error || "Every layout test failed");
    }
    activeLayoutBatch = batch;
    selectLayoutResult(firstSuccessful);
    const failed = batch.results.length - batch.results.filter((entry) => entry.result).length;
    toast(
      failed ? `Layout tests complete; ${failed} failed` : `Tested ${batch.results.length} layouts`,
      failed ? "error" : "success"
    );
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

byId("edit-deal").addEventListener("click", () => {
  renderDealEditor();
  openDialog(elements.dealDialog);
});
byId("edit-settings").addEventListener("click", () => openDialog(elements.settingsDialog));
for (const button of document.querySelectorAll("[data-close-dialog]")) {
  button.addEventListener("click", () => byId(button.dataset.closeDialog).close());
}
for (const dialog of [elements.dealDialog, elements.settingsDialog, elements.analysisDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

byId("apply-settings").addEventListener("click", () => {
  renderSettingsSummary();
  elements.settingsDialog.close();
  toast("Analysis settings updated");
});

elements.dealDialog.addEventListener("click", (event) => {
  const selected = event.target.closest("[data-deal-editor-tab]");
  if (!selected) return;
  const tabName = selected.dataset.dealEditorTab;
  for (const tab of document.querySelectorAll("[data-deal-editor-tab]")) {
    const active = tab.dataset.dealEditorTab === tabName;
    tab.classList.toggle("is-selected", active);
    tab.setAttribute("aria-selected", String(active));
  }
  for (const panel of document.querySelectorAll("[data-deal-editor-panel]")) {
    panel.classList.toggle("is-hidden", panel.dataset.dealEditorPanel !== tabName);
  }
  if (tabName === "alternatives") renderAlternativeEditor();
});

elements.dealDialog.addEventListener("input", (event) => {
  const match = event.target.id?.match(
    /^(east|west)-(?:min|max)-(?:s|h|d|c|hcp)$/
  );
  if (match) syncComplementaryBounds(match[1]);
});

byId("add-layout").addEventListener("click", () => {
  try {
    const completed = completeDefenderLayout(
      elements.east.value,
      elements.west.value,
      elements.east.value,
      elements.west.value
    );
    additionalLayouts.push({
      id: layoutIdentifier(),
      name: `Layout ${additionalLayouts.length + 2}`,
      ...completed
    });
    activeAlternativeIndex = additionalLayouts.length;
    renderAdditionalLayouts();
  } catch (error) {
    toast(error.message || String(error), "error");
  }
});

elements.deleteLayout.addEventListener("click", () => {
  if (activeAlternativeIndex === 0) return;
  additionalLayouts.splice(activeAlternativeIndex - 1, 1);
  additionalLayouts.forEach((layout, index) => {
    layout.name = `Layout ${index + 2}`;
  });
  activeAlternativeIndex = Math.min(activeAlternativeIndex, additionalLayouts.length);
  renderAdditionalLayouts();
});

elements.alternativeLayoutTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-alternative-index]");
  if (!button) return;
  activeAlternativeIndex = Number(button.dataset.alternativeIndex);
  renderAlternativeEditor();
});

elements.alternativeCompass.addEventListener("click", (event) => {
  const button = event.target.closest("[data-alternative-seat]");
  if (!button) return;
  activeAlternativeSeat = button.dataset.alternativeSeat;
  renderAlternativeEditor();
});

elements.alternativeCardPalette.addEventListener("click", (event) => {
  const button = event.target.closest("[data-alternative-card]");
  if (!button || button.disabled) return;
  const card = button.dataset.alternativeCard;
  const hand = alternativeHandState().parsed[activeAlternativeSeat];
  const selected = hand.cards.includes(card);
  const targetCount = parseHandRecord(elements.north.value).count;
  if (!selected && hand.count >= targetCount) {
    toast(`${activeAlternativeSeat} already has ${targetCount} cards`, "error");
    return;
  }
  const cards = selected
    ? hand.cards.filter((held) => held !== card)
    : [...hand.cards, card];
  updateAlternativeHand(activeAlternativeSeat, cards);
});

byId("load-deal").addEventListener("click", safely(() => putDealOnTable(false)));
byId("save-deal").addEventListener("click", safely(async () => {
  const stored = saveDeal(collectDeal());
  populateDealForm(stored);
  renderSavedDeals();
  renderDealSummary();
  toast("Deal saved on this device", "success");
}));
byId("new-deal").addEventListener("click", () => {
  populateDealForm({
    name: "Untitled deal",
    north: "-.-.-.-",
    east: "-.-.-.-",
    south: "-.-.-.-",
    west: "-.-.-.-",
    leader: "West",
    trump: "NT",
    target: 13,
    playPrefix: "",
    additionalLayouts: [],
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

elements.dealCompass.addEventListener("click", (event) => {
  const seatButton = event.target.closest("[data-edit-seat]");
  if (!seatButton) return;
  activeEditSeat = seatButton.dataset.editSeat;
  renderDealEditor();
});
elements.cardPalette.addEventListener("click", (event) => {
  const cardButton = event.target.closest("[data-picker-card]");
  if (!cardButton || cardButton.disabled) return;
  const card = cardButton.dataset.pickerCard;
  const hand = editorHandState()[activeEditSeat];
  const selected = hand.cards.includes(card);
  if (!selected && hand.count >= 13) {
    toast(`${activeEditSeat} already has 13 cards`, "error");
    return;
  }
  const cards = selected
    ? hand.cards.filter((held) => held !== card)
    : [...hand.cards, card];
  updateEditorHand(activeEditSeat, cards);
});

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
  timelineIndex = Math.max(0, timelineIndex - 4);
  renderTable();
  syncAnalysisToTimeline();
});
elements.historyNext.addEventListener("click", () => {
  timelineIndex = Math.min(timelineFrames.length - 1, timelineIndex + 4);
  renderTable();
  syncAnalysisToTimeline();
});
elements.tableLayoutSelect.addEventListener("change", safely(async () => {
  activeTableLayoutIndex = Number(elements.tableLayoutSelect.value);
  await putDealOnTable(true);
  toast(`${elements.tableLayoutSelect.selectedOptions[0]?.textContent || "Layout"} loaded`, "success");
}));

elements.analyze.addEventListener("click", safely(analyzePosition));
elements.analyzeFull.addEventListener("click", safely(analyzeFullDeal));
elements.analyzeLayouts.addEventListener("click", safely(analyzeLayoutBatch));
elements.cancel.addEventListener("click", safely(async () => {
  engine.cancel();
  setBusy(false);
  if (currentDeal) await putDealOnTable(true);
  toast("Analysis stopped");
}));

elements.result.addEventListener("click", (event) => {
  const layoutResult = event.target.closest("[data-layout-result]");
  if (layoutResult) {
    selectLayoutResult(Number(layoutResult.dataset.layoutResult));
    return;
  }
  if (!event.target.closest("[data-open-inspector]")) return;
  renderAnalysisInspector();
  openDialog(elements.analysisDialog);
});

elements.analysisInspectorBody.addEventListener("click", (event) => {
  const layoutResult = event.target.closest("[data-layout-result]");
  if (layoutResult) {
    selectLayoutResult(Number(layoutResult.dataset.layoutResult));
    return;
  }
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
  else renderAnalysisInspector();
});

elements.runList.addEventListener("click", (event) => {
  const analysisButton = event.target.closest("[data-open-analysis-run]");
  const reviewButton = event.target.closest("[data-review-run]");
  if (!analysisButton && !reviewButton) return;
  const id = analysisButton?.dataset.openAnalysisRun || reviewButton?.dataset.reviewRun;
  const run = loadRuns().find((candidate) => candidate.id === id);
  if (!run) return;
  if (analysisButton) {
    currentDeal = run.deal;
    populateDealForm(run.deal);
    liveState = run.result.state || previewState();
    timelineFrames = [{ state: liveState, play: null, label: "Saved analysis position" }];
    timelineIndex = 0;
    reviewOnly = true;
    renderTable();
    showAnalysis(run.result.analysis, false);
    openDialog(elements.analysisDialog);
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
  if (event.target.matches("input, textarea, select") || elements.dealDialog.open || elements.settingsDialog.open || elements.analysisDialog.open) return;
  if (event.key === "ArrowLeft" && timelineIndex > 0) {
    timelineIndex = Math.max(0, timelineIndex - 4);
    renderTable();
    syncAnalysisToTimeline();
  }
  if (event.key === "ArrowRight" && timelineIndex < timelineFrames.length - 1) {
    timelineIndex = Math.min(timelineFrames.length - 1, timelineIndex + 4);
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
renderDealEditor();
renderAdditionalLayouts();
renderTable();
