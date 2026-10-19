import { aggregateTables, defaultContracts, evaluateTable, handRecord, validateDeal } from "./evaluation.js";

export function createEngineLoader(importEngine = () => import("../engine/bridge_engine.js")) {
  let enginePromise;
  return async () => {
    if (!enginePromise) {
      enginePromise = (async () => {
        let engine;
        try {
          const { default: createBridgeEngine } = await importEngine();
          const module = await createBridgeEngine({
            locateFile: (file) => new URL(`../engine/${file}`, import.meta.url).href,
          });
          engine = new module.BridgeEngine();
        } catch (error) {
          throw new Error("Double-dummy analysis is unavailable: the WebAssembly engine could not load. Build it with build-wasm.ps1.", { cause: error });
        }
        if (typeof engine.ddTable !== "function") {
          engine.delete?.();
          throw new Error("Double-dummy analysis requires a rebuilt engine with ddTable support. Run build-wasm.ps1.");
        }
        return engine;
      })();
    }
    return enginePromise;
  };
}

const loadEngine = createEngineLoader();

function solveTable(engine, deal) {
  validateDeal(deal);
  const raw = engine.ddTable(...["North", "East", "South", "West"].map((seat) => handRecord(deal[seat])));
  const result = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!result?.ok) throw new Error(result?.error || "Double-dummy solver returned an invalid result.");
  return result;
}

// Injecting the engine and messenger lets tests verify orchestration without
// substituting artificial trick values into the application itself.
export function createEvaluationHandler(getEngine, postMessage) {
  let busy = false;
  return async ({ data }) => {
    const id = data?.id;
    if (busy) {
      postMessage({ id, type: "error", error: "An evaluation is already running in this worker." });
      return;
    }
    busy = true;
    try {
      if (data?.type === "probe") {
        await getEngine();
        postMessage({ id, type: "ready" });
        return;
      }
      const { deals, major, context, contract, actualDeal } = data ?? {};
      const evaluationContext = context ?? major;
      if (!Array.isArray(deals) || deals.length === 0) throw new Error("Provide at least one complete sampled deal.");
      const contracts = defaultContracts(evaluationContext, contract);
      deals.forEach(validateDeal);
      if (actualDeal != null) validateDeal(actualDeal);
      const engine = await getEngine();
      const tables = [];
      for (const deal of deals) {
        const table = solveTable(engine, deal);
        evaluateTable(table, contracts);
        tables.push(table);
        postMessage({ id, type: "progress", completed: tables.length, total: deals.length });
      }
      const result = aggregateTables(tables, evaluationContext, contract);
      if (actualDeal != null) {
        result.actual = {
          label: "Actual deal (double-dummy)",
          contracts: evaluateTable(solveTable(engine, actualDeal), contracts),
        };
      }
      postMessage({ id, type: "result", result });
    } catch (error) {
      postMessage({ id, type: "error", error: error?.message || String(error) });
    } finally {
      busy = false;
    }
  };
}

// Loading is lazy and awaited inside the handler's try/catch: absent/stale
// builds become a UI error message, never an unhandled module rejection.
if (typeof self !== "undefined") {
  self.addEventListener("message", createEvaluationHandler(loadEngine, (message) => self.postMessage(message)));
}
