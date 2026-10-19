import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateTables, createEvaluationDeals, defaultContracts, evaluateTable,
  fillOpponentHands, handRecord, normalizeContract, resolveDeclarer, validateDeal, validateHand,
  wilsonInterval,
} from "./evaluation.js";
import { createEngineLoader, createEvaluationHandler } from "./evaluation-worker.js";

const deck = [..."SHDC"].flatMap((suit) => [..."AKQJT98765432"].map((rank) => suit + rank));
const south = deck.slice(0, 13);
const north = deck.slice(13, 26);

// Deliberately artificial tables test arithmetic/orchestration only. They are
// not solver output and are never shown by the application as DD estimates.
function fixtureTable(northMajor, southNT, major = "S") {
  return {
    ok: true,
    tricks: Object.fromEntries(["S", "H", "D", "C", "NT"].map((strain) => [strain, {
      North: strain === major ? northMajor : 0,
      South: strain === "NT" ? southNT : 0,
      East: 1,
      West: 2,
    }])),
  };
}

test("opponent filling preserves the two known hands and deals all 52 cards once", () => {
  const before = [south.slice(), north.slice()];
  for (let seed = 0; seed < 30; seed += 1) {
    const deal = fillOpponentHands(south, north, seed);
    assert.equal(validateDeal(deal), deal);
    assert.deepEqual(deal.South, south);
    assert.deepEqual(deal.North, north);
    assert.notEqual(deal.South, south);
    assert.notEqual(deal.North, north);
    assert.deepEqual(Object.values(deal).flat().sort(), [...deck].sort());
  }
  assert.deepEqual([south, north], before);
});

test("seed reproduces all splits; each sample advances the shared stream", () => {
  const samples = [north, north, north];
  const first = createEvaluationDeals(south, samples, "practice 42");
  assert.deepEqual(first, createEvaluationDeals(south, samples, "practice 42"));
  assert.notDeepEqual(first, createEvaluationDeals(south, samples, "practice 43"));
  assert.notDeepEqual(first[0].East, first[1].East);
});

test("invalid sizes, cards, duplicates, overlapping hands and RNG values are rejected", () => {
  assert.throws(() => validateHand(south.slice(1)), /13 cards/);
  assert.throws(() => validateHand(["S10", ...south.slice(1)]), /invalid card/);
  assert.throws(() => validateHand(["S2", ...south.slice(1)]), /repeats/);
  assert.throws(() => fillOpponentHands(south, south, 1), /shared card/);
  assert.throws(() => fillOpponentHands(south, north, () => 1), /Random generator/);
  const deal = fillOpponentHands(south, north, 1);
  assert.throws(() => validateDeal({ ...deal, West: deal.East }), /more than one hand/);
  assert.throws(() => validateDeal({ ...deal, East: null }), /13 cards/);
});

test("hand records use SHDC holding order and a dash for voids", () => {
  assert.equal(handRecord(south.slice().reverse()), "AKQJT98765432 - - -");
  assert.equal(handRecord(north), "- AKQJT98765432 - -");
});

test("major contracts declare North; NT contracts declare South", () => {
  for (const major of ["S", "H"]) {
    const contracts = defaultContracts(major);
    assert.deepEqual(contracts.map(({ level, strain, declarer }) => [level, strain, declarer]), [
      [4, major, "North"], [6, major, "North"], [7, major, "North"],
      [3, "NT", "South"], [6, "NT", "South"], [7, "NT", "South"],
    ]);
    const values = evaluateTable(fixtureTable(12, 9, major), contracts);
    assert.deepEqual(values.map(({ makes }) => makes), [true, true, false, true, false, false]);
  }
});

test("selected contract is normalized and deduplicated including declarer", () => {
  assert.equal(defaultContracts("S", "6S").length, 6);
  assert.equal(defaultContracts("S", "5S").length, 7);
  const otherDeclarer = defaultContracts("S", { level: 6, strain: "S", declarer: "South" });
  assert.equal(otherDeclarer.length, 7);
  assert.equal(otherDeclarer.at(-1).key, "6S-South");
  assert.deepEqual(normalizeContract(" 3nt ", "H"), { level: 3, strain: "NT", declarer: "South", key: "3NT-South" });
  assert.throws(() => defaultContracts("D"), /Major/);
  assert.throws(() => defaultContracts("S", "8S"), /Contract/);
  assert.throws(() => defaultContracts("S", "6H"), /explicit declarer/);
  assert.throws(() => defaultContracts("S", { level: 6, strain: "S", declarer: "Unknown" }), /explicit declarer/);
});

const northPlayerContext = {
  trump: "D",
  playerSeat: "North",
  partnerSeat: "South",
  auction: [
    { seat: "North", bid: "1C", artificial: true },
    { seat: "South", bid: "1D", artificial: true },
    { seat: "North", bid: "1NT" },
    { seat: "South", bid: "2D" },
    { seat: "North", bid: "3D" },
    { seat: "South", bid: "3NT" },
  ],
};

test("North player context reverses known-hand seats without changing opponent splits", () => {
  const standard = fillOpponentHands(south, north, "seat swap");
  const reversed = fillOpponentHands(south, north, "seat swap", northPlayerContext);
  assert.equal(validateDeal(reversed), reversed);
  assert.deepEqual(reversed.North, south);
  assert.deepEqual(reversed.South, north);
  assert.notEqual(reversed.North, south);
  assert.notEqual(reversed.South, north);
  assert.deepEqual(reversed.East, standard.East);
  assert.deepEqual(reversed.West, standard.West);
  const oldDeals = createEvaluationDeals(south, [north, north], "sequence");
  const newDeals = createEvaluationDeals(south, [north, north], "sequence", northPlayerContext);
  assert.deepEqual(newDeals, createEvaluationDeals(south, [north, north], "sequence", northPlayerContext));
  for (let i = 0; i < newDeals.length; i += 1) {
    assert.deepEqual(newDeals[i], { ...oldDeals[i], North: oldDeals[i].South, South: oldDeals[i].North });
  }
});

test("minor contract sets use five-level game and the first bidder of each strain", () => {
  for (const trump of ["C", "D"]) {
    const context = { ...northPlayerContext, trump };
    const contracts = defaultContracts(context);
    assert.deepEqual(contracts.map(({ level, strain }) => [level, strain]), [
      [5, trump], [6, trump], [7, trump], [3, "NT"], [6, "NT"], [7, "NT"],
    ]);
    assert.equal(contracts[0].declarer, trump === "C" ? "North" : "South");
    assert.equal(contracts[3].declarer, "North");
  }
});

test("artificial first bids count; opponents and subsequent bidders do not determine declarer", () => {
  const context = { ...northPlayerContext, auction: [
    { seat: "East", bid: "1D" },
    { seat: "South", bid: "1H", artificial: true },
    { seat: "West", bid: "Pass" },
    { seat: "North", bid: "1S" },
    { seat: "South", bid: "2D", artificial: true },
    { seat: "North", bid: "2H" },
    { seat: "South", bid: "2NT", artificial: true },
    { seat: "North", bid: "3NT" },
    { seat: "South", bid: "Pass" },
  ] };
  assert.equal(resolveDeclarer("D", context), "South");
  assert.equal(resolveDeclarer("H", context), "South");
  assert.equal(resolveDeclarer("S", context), "North");
  assert.equal(resolveDeclarer("NT", context), "South");
  assert.equal(resolveDeclarer("C", context), "North", "Unbid strains default to the player");
  const emptySouth = { trump: "H", playerSeat: "South", partnerSeat: "North", auction: [] };
  assert.equal(resolveDeclarer("H", emptySouth), "South");
  assert.equal(resolveDeclarer("NT", emptySouth), "South");
});

test("auction context corrects stale selected-contract declarers and deduplicates consistently", () => {
  const stale = { level: 6, strain: "D", declarer: "North" };
  assert.deepEqual(normalizeContract(stale, northPlayerContext), {
    level: 6, strain: "D", declarer: "South", key: "6D-South",
  });
  assert.equal(defaultContracts(northPlayerContext, stale).length, 6);
  assert.equal(defaultContracts(northPlayerContext, "5H").at(-1).declarer, "North");
  const knownMajor = {
    trump: "S", playerSeat: "South", partnerSeat: "North",
    auction: [{ seat: "North", bid: "1S" }, { seat: "South", bid: "2NT" }],
  };
  assert.deepEqual(defaultContracts(knownMajor), defaultContracts("S"));
});

test("context validation rejects malformed seats, trumps and auction evidence", () => {
  assert.throws(() => fillOpponentHands(south, north, 1, { playerSeat: "North", partnerSeat: "North" }), /different North\/South/);
  assert.throws(() => createEvaluationDeals(south, [], 1, { playerSeat: "East" }), /different North\/South/);
  assert.throws(() => defaultContracts({ ...northPlayerContext, trump: "NT" }), /Context trump/);
  assert.throws(() => defaultContracts({ ...northPlayerContext, auction: {} }), /auction must be an array/);
  assert.throws(() => defaultContracts({ ...northPlayerContext, auction: [{ seat: "Unknown", bid: "1D" }] }), /valid seat and bid/);
  assert.throws(() => defaultContracts({ ...northPlayerContext, auction: [{ seat: "South", bid: "8D" }] }), /valid seat and bid/);
  assert.throws(() => resolveDeclarer("Unknown", northPlayerContext), /invalid strain/);
});

test("minor aggregation uses the chosen declarer's DD column and the five-level target", () => {
  const tables = [fixtureTable(13, 13, "D"), fixtureTable(13, 13, "D")];
  tables[0].tricks.D.South = 11;
  tables[1].tricks.D.South = 10;
  tables[0].tricks.NT.North = 9;
  tables[1].tricks.NT.North = 8;
  const result = aggregateTables(tables, northPlayerContext);
  assert.equal(result.sampleCount, 2);
  assert.deepEqual(result.contracts.map(({ makes }) => makes), [1, 0, 0, 1, 0, 0]);
  assert.equal(result.contracts[0].key, "5D-South");
  assert.equal(result.contracts[0].makeFraction, 0.5);
  assert.deepEqual(result.contracts[0].interval, wilsonInterval(1, 2));
  assert.equal(result.contracts[3].key, "3NT-North");
});

test("aggregation compares every contract on the same tables", () => {
  const result = aggregateTables([fixtureTable(13, 12), fixtureTable(12, 9), fixtureTable(9, 13)], "S");
  assert.equal(result.sampleCount, 3);
  assert.equal(result.confidence, 0.95);
  assert.equal(result.intervalMethod, "Wilson");
  assert.deepEqual(result.contracts.map(({ makes }) => makes), [2, 2, 1, 3, 2, 1]);
  for (const row of result.contracts) {
    assert.equal(row.total, 3);
    assert.equal(row.makeFraction, row.makes / 3);
    assert.deepEqual(row.interval, wilsonInterval(row.makes, 3));
  }
});

test("Wilson 95% interval matches reference values and handles boundary counts", () => {
  const interval = wilsonInterval(50, 100);
  assert.ok(Math.abs(interval.low - 0.4038315303659957) < 1e-12);
  assert.ok(Math.abs(interval.high - 0.5961684696340044) < 1e-12);
  assert.equal(wilsonInterval(0, 100).low, 0);
  assert.ok(Math.abs(wilsonInterval(0, 100).high - 0.03699349820698568) < 1e-12);
  assert.equal(wilsonInterval(100, 100).high, 1);
  assert.deepEqual(wilsonInterval(1, 1), { low: 0.20654931437723745, high: 1 });
  for (const pair of [[0, 0], [-1, 2], [3, 2], [0.5, 2]]) {
    assert.throws(() => wilsonInterval(...pair), /integer counts/);
  }
});

test("missing, invalid and solver-error tables fail without estimates", () => {
  assert.throws(() => aggregateTables([], "S"), /At least one/);
  assert.throws(() => aggregateTables([{}], "S"), /Invalid double-dummy/);
  assert.throws(() => aggregateTables([fixtureTable(14, 9)], "S"), /Invalid double-dummy/);
  assert.throws(() => aggregateTables([{ ok: false, error: "DDS failed" }], "S"), /DDS failed/);
});

test("worker solves one table per sample and reports actual deal separately", async () => {
  const outputs = [];
  const calls = [];
  const tables = [fixtureTable(13, 9), fixtureTable(9, 12), fixtureTable(12, 13)];
  const handler = createEvaluationHandler(async () => ({
    ddTable(...records) { calls.push(records); return JSON.stringify(tables[calls.length - 1]); },
  }), (message) => outputs.push(message));
  const deals = createEvaluationDeals(south, [north, north], 42);
  const actualDeal = fillOpponentHands(south, north, "actual");
  await handler({ data: { id: "job", deals, major: "S", actualDeal } });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], ["North", "East", "South", "West"].map((seat) => handRecord(deals[0][seat])));
  assert.deepEqual(outputs.slice(0, 2), [
    { id: "job", type: "progress", completed: 1, total: 2 },
    { id: "job", type: "progress", completed: 2, total: 2 },
  ]);
  assert.equal(outputs[2].type, "result");
  assert.equal(outputs[2].result.sampleCount, 2);
  assert.equal(outputs[2].result.contracts[0].makes, 1);
  assert.equal(outputs[2].result.actual.label, "Actual deal (double-dummy)");
  assert.equal(outputs[2].result.actual.contracts[1].tricks, 12);
  assert.equal(outputs[2].result.actual.contracts[1].makes, true);
  assert.equal(outputs[2].result.actual.contracts[1].makeFraction, undefined);
});

test("worker prefers explicit context over legacy major for sampled and actual deals", async () => {
  const outputs = [];
  const records = [];
  const table = fixtureTable(13, 13, "D");
  table.tricks.D.South = 11;
  table.tricks.NT.North = 9;
  const handler = createEvaluationHandler(async () => ({
    ddTable(...hands) { records.push(hands); return JSON.stringify(table); },
  }), (message) => outputs.push(message));
  const deals = createEvaluationDeals(south, [north], "minor evaluation", northPlayerContext);
  await handler({ data: {
    id: "minor-job", deals, major: "S", context: northPlayerContext,
    contract: { level: 6, strain: "D", declarer: "North" }, actualDeal: deals[0],
  } });
  const final = outputs.at(-1);
  assert.equal(final.type, "result", final.error);
  assert.equal(records.length, 2);
  assert.equal(records[0][0], handRecord(south), "The user hand is sent to DDS as North");
  assert.equal(records[0][2], handRecord(north), "The sampled hand is sent to DDS as South");
  assert.equal(final.result.contracts.length, 6);
  assert.equal(final.result.contracts[0].key, "5D-South");
  assert.equal(final.result.contracts[0].makes, 1);
  assert.equal(final.result.contracts[1].makes, 0);
  assert.equal(final.result.contracts[3].key, "3NT-North");
  assert.equal(final.result.actual.contracts[0].tricks, 11);
  assert.equal(final.result.actual.contracts[3].tricks, 9);
});

test("worker handles probes and missing engine without unhandled errors", async () => {
  const outputs = [];
  let loads = 0;
  const ready = createEvaluationHandler(async () => { loads += 1; return {}; }, (message) => outputs.push(message));
  await ready({ data: { id: 1, type: "probe" } });
  assert.equal(loads, 1);
  assert.deepEqual(outputs.pop(), { id: 1, type: "ready" });
  const missing = createEvaluationHandler(async () => { throw new Error("Build engine first"); }, (message) => outputs.push(message));
  await missing({ data: { id: 2, type: "probe" } });
  assert.deepEqual(outputs.pop(), { id: 2, type: "error", error: "Build engine first" });
  await missing({ data: { id: 3, deals: [fillOpponentHands(south, north, 1)], major: "S" } });
  assert.deepEqual(outputs.pop(), { id: 3, type: "error", error: "Build engine first" });
});

test("actual loader handles missing modules and stale engine builds; loads only once", async () => {
  const outputs = [];
  const missingLoader = createEngineLoader(async () => { throw new Error("module missing"); });
  const missingHandler = createEvaluationHandler(missingLoader, (message) => outputs.push(message));
  await missingHandler({ data: { id: 1, type: "probe" } });
  assert.equal(outputs.at(-1).type, "error");
  assert.match(outputs.at(-1).error, /unavailable.*build-wasm\.ps1/);
  let deleted = false;
  const staleLoader = createEngineLoader(async () => ({ default: async () => ({ BridgeEngine: class {
    delete() { deleted = true; }
  } }) }));
  await assert.rejects(staleLoader(), /rebuilt engine with ddTable/);
  assert.equal(deleted, true);
  let imports = 0;
  let locatedFile;
  const goodLoader = createEngineLoader(async () => {
    imports += 1;
    return { default: async ({ locateFile }) => {
      locatedFile = locateFile("bridge_engine.wasm");
      return { BridgeEngine: class { ddTable() {} } };
    } };
  });
  const engine = await goodLoader();
  assert.equal(await goodLoader(), engine);
  assert.equal(imports, 1);
  assert.match(locatedFile, /\/engine\/bridge_engine\.wasm$/);
});

test("worker validates all deals before starting DDS and omits unrequested actual deal", async () => {
  const outputs = [];
  let loads = 0;
  const handler = createEvaluationHandler(async () => {
    loads += 1;
    return { ddTable: () => JSON.stringify(fixtureTable(12, 12)) };
  }, (message) => outputs.push(message));
  const valid = fillOpponentHands(south, north, 4);
  await handler({ data: { id: 1, deals: [valid, {}], major: "S" } });
  assert.equal(loads, 0);
  assert.equal(outputs.at(-1).type, "error");
  await handler({ data: { id: 2, deals: [valid], major: "S" } });
  assert.equal(loads, 1);
  assert.equal(outputs.at(-1).type, "result");
  assert.equal(outputs.at(-1).result.actual, undefined);
});

test("worker rejects bad DDS responses without a partial probability result", async () => {
  for (const response of ['{"ok":false,"error":"DDS failure"}', "not json", '{"ok":true,"tricks":{}}']) {
    const outputs = [];
    const handler = createEvaluationHandler(async () => ({ ddTable: () => response }), (message) => outputs.push(message));
    await handler({ data: { id: 1, deals: [fillOpponentHands(south, north, 0)], major: "S" } });
    assert.equal(outputs.at(-1).type, "error");
    assert.equal(outputs.some(({ type }) => type === "result"), false);
  }
});
