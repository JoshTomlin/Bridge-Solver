import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { completeDefenderLayout, fourthHandCompletion } from "./deal-utils.js";

const [html, app, worker] = await Promise.all([
  fs.readFile(new URL("./index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("./app.js", import.meta.url), "utf8"),
  fs.readFile(new URL("./engine-worker.js", import.meta.url), "utf8")
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
  "history-next",
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
assert.ok(app.includes("tricksNeeded"), "world inspection must show the remaining target");
assert.ok(worker.includes("async function runLayouts"), "the worker must support repeated true-layout runs");
assert.ok(worker.includes("silentProgress"), "layout batches must suppress per-card progress updates");
assert.ok(app.includes("syncAnalysisToTimeline"), "playback must synchronize analysis decisions");
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
