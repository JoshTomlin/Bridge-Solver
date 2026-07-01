import assert from "node:assert/strict";
import fs from "node:fs/promises";

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
  "play-prefix",
  "history-prev",
  "history-next",
  "analysis-result"
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
assert.ok(app.includes("syncAnalysisToTimeline"), "playback must synchronize analysis decisions");

console.log(`UI smoke passed: ${ids.length} elements, modal editors, timeline, and world drill-down.`);
