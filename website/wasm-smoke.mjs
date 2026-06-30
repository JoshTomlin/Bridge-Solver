import assert from "node:assert/strict";
import fs from "node:fs/promises";

import createBridgeEngine from "./dist/engine/bridge_engine.js";

function parse(serialized) {
  const result = JSON.parse(serialized);
  assert.equal(result.ok, true, result.error || "Engine request failed");
  return result;
}

const wasmBinary = await fs.readFile(
  new URL("./dist/engine/bridge_engine.wasm", import.meta.url)
);
const module = await createBridgeEngine({ wasmBinary });
const engine = new module.BridgeEngine();

try {
  const session = parse(engine.createSession(
    "AJT9.AKQ.AKQ.432",
    "Q5.T65.T865.J985",
    "K876.432.432.AKQ",
    "432.J987.J97.T76",
    "South",
    "NT"
  ));
  assert.equal(session.state.legalCards.length, 13);

  const restricted = parse(engine.setRestrictions(
    { required: "SQ", minS: 2, maxS: 2 },
    { minS: 3, maxS: 3 }
  ));
  assert.ok(restricted.possibleDeals > 0);
  assert.ok(restricted.possibleDeals < session.possibleDeals);

  const result = parse(engine.analyze(8, 1, 13, "11565831", 1));
  assert.equal(result.analysis.uniqueWorlds, 8);
  assert.ok(result.analysis.bestMove);
  assert.ok(result.analysis.stats.ddsWorlds > 0);

  console.log(
    `WASM smoke passed: ${result.analysis.bestMove}, ` +
    `${result.analysis.uniqueWorlds} worlds, ` +
    `${result.analysis.searchMs.toFixed(1)} ms search`
  );
} finally {
  engine.delete();
}
