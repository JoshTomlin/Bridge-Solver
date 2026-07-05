import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { completeDefenderLayout, fourthHandCompletion } from "./deal-utils.js";

const [html, app, worker, wasmBindings] = await Promise.all([
  fs.readFile(new URL("./index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("./app.js", import.meta.url), "utf8"),
  fs.readFile(new URL("./engine-worker.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../engine/src/wasm_bindings.cpp", import.meta.url), "utf8")
]);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML ids must be unique");

const staticLookups = [...app.matchAll(/byId\("([^"]+)"\)/g)].map((match) => match[1]);
for (const id of new Set(staticLookups)) {
  assert.ok(ids.includes(id), `app.js references missing element #${id}`);
}

for (const required of [
  "deal-dialog",
  "settings-dialog",
  "analysis-dialog",
  "analysis-inspector-body",
  "play-prefix",
  "card-palette",
  "target-tricks",
  "history-prev",
  "history-prev-card",
  "history-next-card",
  "history-next",
  "table-layout-select",
  "defender-hold-order",
  "analysis-result",
  "analyze-layouts",
  "layout-count",
  "alternative-layout-tabs",
  "alternative-compass",
  "alternative-card-palette",
  "delete-layout"
]) {
  assert.ok(ids.includes(required), `redesign requires #${required}`);
}

const runFull = worker.slice(
  worker.indexOf("async function runFull"),
  worker.indexOf("self.addEventListener")
);
assert.ok(!runFull.includes("engine.replay()"), "bot continuation must not replay the deal");
assert.ok(runFull.includes("frames.push"), "bot continuation must retain playback frames");
assert.ok(app.includes("data-world-index"), "analysis must expose sampled-world drill-down");
assert.ok(app.includes("is-regressed"), "suboptimal moves must identify worlds lost versus the best move");
assert.ok(app.includes("is-gained"), "suboptimal moves must identify worlds gained versus the best move");
assert.ok(app.includes("Why are there several plans?"),
  "the inspector must explain why multiple Pareto plans survive");
assert.ok(app.includes("strategyGains") && app.includes("strategyLosses"),
  "Pareto plans must list worlds gained and lost versus Plan 1");
assert.ok(app.includes("fullResultTricks") && app.includes("trickViewerMarkup"),
  "full analysis must be navigable as a trick-by-trick play review");
assert.ok(app.includes("policyResponseMarkup") && app.includes("possibleWorlds"),
  "the inspector must show retained responses to defender cards");
assert.ok(app.includes("groupPolicyResponses") && app.includes("policyConditionLabel"),
  "equivalent policy responses must be grouped into concise follow/discard instructions");
assert.ok(app.includes("left.branches.length - right.branches.length") &&
  app.includes("plays anything else"),
  "the broadest policy response must appear last as the catch-all");
assert.ok(app.includes("groupDiscards.length === discards.length") &&
  app.includes("discards or plays"),
  "an all-discard response must take precedence over the generic catch-all");
assert.ok(app.includes("trick-policy-table") && app.includes("worldHandRecordMarkup(hands.North)"),
  "the trick viewer must show the full four-hand position");
assert.ok(wasmBindings.includes("policy_json") && wasmBindings.includes('\\"policy\\":'),
  "WASM analysis JSON must serialize the selected trick policy");
assert.ok(worker.includes("result.analysis"),
  "full play must retain each serialized analysis and policy");
assert.ok(app.includes("tricksNeeded"), "world inspection must show the remaining target");
assert.ok(worker.includes("async function runLayouts"), "the worker must support repeated true-layout runs");
assert.ok(worker.includes("silentProgress"), "layout batches must suppress per-card progress updates");
assert.ok(app.includes("syncAnalysisToTimeline"), "playback must synchronize analysis decisions");
assert.ok(app.includes("timelineIndex - 4") && app.includes("timelineIndex + 4"),
  "persistent history controls must move one full trick");
assert.ok(app.includes("timelineIndex - 1") && app.includes("timelineIndex + 1"),
  "persistent history controls must also move one card");
assert.ok(
  html.indexOf('id="history-prev"') <
    html.indexOf('id="history-prev-card"') &&
  html.indexOf('id="history-prev-card"') <
    html.indexOf('id="history-next-card"') &&
  html.indexOf('id="history-next-card"') <
    html.indexOf('id="history-next"'),
  "play controls must remain ordered as << < > >>"
);
assert.ok(!ids.includes("history-live"), "full-trick navigation must not add a moving live button");
assert.ok(app.includes("activeTableLayoutIndex"),
  "one alternative true layout must be selectable without a batch run");
assert.ok(worker.includes("defenderHoldOrder"),
  "full play must pass the defender suit-preservation order to DDS");
assert.match(html, /id="world-count"[^>]*value="30"/,
  "the default analysis should sample 30 worlds");
assert.ok(
  html.indexOf('id="defender-hold-order"') < html.indexOf('id="settings-dialog"'),
  "defender discard preference belongs with defender knowledge, not search settings"
);
assert.ok(app.includes("data-trick-seat"), "played cards must retain compass positions");
assert.ok(app.includes("completedTrickForFrame"), "the completed trick must remain until the next lead");
assert.ok(!html.includes("id=\"legal-cards\""), "legal cards must be played directly from hands");
assert.ok(html.includes("class=\"deal-compass\""), "deal entry must use compass order");
assert.ok(app.includes("data-picker-card"), "deal entry must expose a duplicate-safe card picker");
assert.ok(app.includes("completion.ready"), "the fourth hand must complete automatically");
assert.ok(!ids.includes("complete-fourth-hand"), "automatic completion must not require a button");
assert.ok(html.includes("data-editor-holding"), "deal entry must preview cards on a bridge table");
assert.ok(app.includes("editorHandDiagramMarkup"), "deal editing must use compact hand diagrams");
assert.ok(html.includes("data-deal-editor-tab=\"alternatives\""), "alternative layouts must be a peer editor tab");
assert.ok(html.includes("data-alternative-holding"), "alternative layouts must show all four hand diagrams");
assert.ok(app.includes("data-alternative-card"), "alternative East/West cards must use a visual picker");
assert.ok(!ids.includes("layout-east") && !ids.includes("layout-west"),
  "alternative layouts must not fall back to SHDC text inputs");
assert.match(
  html,
  /<select id="leader">[\s\S]*?<option selected>West<\/option>/,
  "West should be the default opening leader"
);
assert.ok(html.includes("analysis-inspector-body"), "detailed decisions belong in the inspector");
assert.ok(html.includes("table-controls-left"), "table must expose compact edit controls");
assert.ok(html.includes("table-controls-right"), "table must expose compact playback controls");
assert.ok(!html.includes("Read the play"), "introductory marketing copy must stay out of the mobile workspace");
assert.ok(!html.includes("Imperfect-information"), "the deal must remain the page's primary focus");
assert.ok(!ids.includes("deal-notes"), "the compact deal editor must not include notes");
assert.ok(
  html.indexOf("id=\"target-tricks\"") < html.indexOf("id=\"settings-dialog\""),
  "target tricks belongs to the contract editor, not search settings"
);

const completion = fourthHandCompletion({
  North: "AJT9.AKQ.AKQ.432",
  East: "Q5.T65.T865.J985",
  South: "K876.432.432.AKQ",
  West: "-.-.-.-"
});
assert.equal(completion.ready, true);
assert.equal(completion.seat, "West");
assert.equal(completion.record, "432.J987.J97.T76");

const alternative = completeDefenderLayout(
  "Q5.T65.T865.J985",
  "432.J987.J97.T76",
  "Q432.T65.T8.J985",
  ""
);
assert.equal(alternative.east, "Q432.T65.T8.J985");
assert.equal(alternative.west, "5.J987.J9765.T76");
assert.throws(
  () => completeDefenderLayout(
    "Q5.T65.T865.J985",
    "432.J987.J97.T76",
    "A432.T65.T8.J985",
    "Q.J987.J9765.T76"
  ),
  /redistribute exactly/
);

console.log(`UI smoke passed: ${ids.length} elements, layout batches, timeline, and comparative world drill-down.`);
