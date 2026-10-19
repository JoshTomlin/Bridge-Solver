import assert from "node:assert/strict";
import fs from "node:fs/promises";

import createBridgeEngine from "./dist/engine/bridge_engine.js";
import { createPractice, availableActions, applyBid, sampleCompatible } from "./dist/relay/core.js";
import { createEvaluationDeals, fillOpponentHands } from "./dist/relay/evaluation.js";
import { createEvaluationHandler } from "./dist/relay/evaluation-worker.js";

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

  // Relay analysis must preserve the interactive session and declarer direction.
  const originalState = engine.state();
  const allRanks = "AKQJT98765432";
  const fullDeal = [
    `${allRanks}.-.-.-`, `-.${allRanks}.-.-`,
    `-.-.${allRanks}.-`, `-.-.-.${allRanks}`
  ];
  const table = parse(engine.ddTable(...fullDeal));
  assert.equal(table.tricks.S.North, 13);
  assert.equal(table.tricks.D.South, 13);
  assert.equal(table.tricks.NT.North, 0);
  assert.equal(table.tricks.NT.South, 0);
  assert.equal(engine.state(), originalState, "DD tables must not alter play state");
  assert.equal(JSON.parse(engine.ddTable(fullDeal[0], fullDeal[0], fullDeal[2], fullDeal[3])).ok, false);
  assert.equal(JSON.parse(engine.ddTable("A.-.-.-", ...fullDeal.slice(1))).ok, false);

  // Nontrivial DDS table searches need more than the default 64 KiB WASM stack.
  // The single-suit fixture above does not exercise that search path.
  const searchedTable = parse(engine.ddTable(
    "KT954.984.AQJT.J", "3.KT763.654.AT82",
    "AQJ2.AJ.732.K763", "876.Q52.K98.Q954"
  ));
  for (const strain of ["S", "H", "D", "C", "NT"]) {
    for (const seat of ["North", "East", "South", "West"]) {
      assert.ok(Number.isInteger(searchedTable.tricks[strain][seat]));
      assert.ok(searchedTable.tricks[strain][seat] >= 0 && searchedTable.tricks[strain][seat] <= 13);
    }
  }
  assert.equal(engine.state(), originalState, "A searched DD table must also preserve play state");

  // Exercise the shipped relay modules with the real solver, including the
  // Dappleton role reversal and the artificial 1D first bidder as declarer.
  for (const [profileId, playerSeat, declarer] of [
    ["minor-d-h-c", "South", "North"],
    ["dappleton-h-d-four-major", "North", "South"],
    ["rebid-single-d-h", "South", "North"],
  ]) {
    let practice = createPractice({ profileId, seed: "wasm-relay" });
    for (let ask = 0; ask < 2; ask += 1) {
      const action = availableActions(practice).find(candidate => candidate.kind === "relay");
      assert.ok(action, profileId);
      practice = applyBid(practice, action.bid);
    }
    practice = applyBid(practice, "6D");
    assert.equal(practice.contract.declarer, declarer);
    const context = {
      trump: practice.trump, playerSeat, partnerSeat: practice.partnerSeat,
      auction: practice.auction,
    };
    const samples = sampleCompatible(practice, { count: 1, maxAttempts: 200000 });
    assert.equal(samples.complete, true, profileId);
    const deals = createEvaluationDeals(practice.playerHand, samples.hands, "wasm-relay", context);
    const actualDeal = fillOpponentHands(practice.playerHand, practice.partnerHand, "wasm-relay-actual", context);
    assert.deepEqual(deals[0][playerSeat], practice.playerHand);
    assert.deepEqual(actualDeal[practice.partnerSeat], practice.partnerHand);
    const messages = [];
    const evaluate = createEvaluationHandler(async () => engine, message => messages.push(message));
    await evaluate({ data: { id: profileId, deals, context, contract: practice.contract, actualDeal } });
    assert.equal(messages.some(message => message.type === "error"), false, JSON.stringify(messages));
    const result = messages.find(message => message.type === "result")?.result;
    assert.ok(result, profileId);
    assert.equal(result.sampleCount, 1);
    assert.equal(result.contracts.find(contract => contract.level === 5 && contract.strain === "D").declarer, declarer);
    assert.equal(result.actual.contracts.find(contract => contract.level === 6 && contract.strain === "D").declarer, declarer);
    assert.equal(engine.state(), originalState, "Relay evaluation must preserve play state");
  }

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
  assert.ok(result.analysis.stats.leafDdsBatches > 0);
  assert.equal(result.analysis.sampledWorlds.length, 8);
  assert.ok(result.analysis.rootMoves.length > 1);
  assert.ok(result.analysis.rootMoves.every(
    (move) => Array.isArray(move.outcomes) && move.outcomes.length > 0
  ));

  const adaptive = parse(engine.analyze2(
    16, 4, 6, 1, 1,
    4, 4, 0.005, true,
    1, 13, "11565831", 2
  ));
  assert.equal(adaptive.analysis.engine, "alpha-mu2");
  assert.ok(adaptive.analysis.rootMoves.every(
    (move) => Number.isFinite(move.weightedScore)
  ));
  assert.ok(Array.isArray(adaptive.analysis.alphaMu2.activeWorldWeights));
  assert.ok(Array.isArray(adaptive.analysis.alphaMu2.challengeReservoirIndices));
  assert.ok(Number.isFinite(
    adaptive.analysis.alphaMu2.stats.policyFingerprintCollisions
  ));
  assert.ok(Number.isFinite(
    adaptive.analysis.alphaMu2.rounds[0].makeableWorldsChecked
  ));
  assert.ok(Number.isFinite(
    adaptive.analysis.alphaMu2.rounds[0].policyFailures
  ));
  assert.equal(typeof engine.defenderMove, "function");
  parse(engine.play(adaptive.analysis.bestMove));
  const defence = parse(engine.defenderMove("SHDC"));
  assert.ok(defence.card);
  assert.ok(defence.decision.reason);
  assert.ok(defence.decision.candidates.find(
    (candidate) => candidate.card === defence.card
  )?.ddOptimal);

  console.log(
    `WASM smoke passed: ${result.analysis.bestMove}, ` +
    `${result.analysis.uniqueWorlds} worlds, ` +
    `${result.analysis.searchMs.toFixed(1)} ms search`
  );
} finally {
  engine.delete();
}
