let modulePromise;
let engine;

function parseResult(serialized) {
  const result = JSON.parse(serialized);
  if (!result.ok) throw new Error(result.error || "Engine request failed");
  return result;
}

async function loadEngine() {
  if (!modulePromise) {
    modulePromise = import("./engine/bridge_engine.js")
      .then(({ default: createBridgeEngine }) => createBridgeEngine({
        locateFile: (file) => new URL(`./engine/${file}`, import.meta.url).href
      }))
      .then((module) => {
        engine = new module.BridgeEngine();
        self.postMessage({ type: "status", status: "ready", message: "Engine ready" });
        return module;
      })
      .catch((error) => {
        self.postMessage({
          type: "status",
          status: "error",
          message: "WebAssembly engine is not built yet"
        });
        throw error;
      });
  }
  return modulePromise;
}

function analyze(settings) {
  return parseResult(engine.analyze(
    settings.worlds,
    settings.depth,
    settings.target,
    settings.seed,
    settings.timeLimit
  ));
}

async function runFull(settings) {
  const analyses = [];
  const plays = [];
  const frames = [];
  const startState = parseResult(engine.state()).state;
  const startedAt = performance.now();
  let currentAnalysisIndex = -1;
  const alreadyPlayed = startState.completedTricks * 4 + startState.trick.length;
  const remainingCards = Object.values(startState.hands).reduce(
    (total, hand) => total + hand.record.replace(/[-\s]/g, "").length,
    0
  );
  if (settings.priorAnalysis &&
      (startState.turn === "North" || startState.turn === "South")) {
    analyses.push({
      ...settings.priorAnalysis,
      atCard: alreadyPlayed + 1,
      turn: startState.turn
    });
    currentAnalysisIndex = 0;
  }

  for (let step = 0; step < remainingCards; step += 1) {
    const current = parseResult(engine.state()).state;
    if (current.finished) break;
    const cardNumber = alreadyPlayed + step + 1;

    const declarerSide = current.turn === "North" || current.turn === "South";
    let card;
    let source;
    if (declarerSide) {
      const retained = parseResult(engine.policyMove()).card;
      if (retained) {
        card = retained;
        source = "policy";
      } else {
        const result = analyze(settings);
        analyses.push({ ...result.analysis, atCard: cardNumber, turn: current.turn });
        currentAnalysisIndex = analyses.length - 1;
        card = result.analysis.bestMove;
        source = "alpha-mu";
      }
    } else {
      card = parseResult(engine.ddsMove()).card;
      source = "dds";
    }

    const played = parseResult(engine.play(card));
    const play = {
      number: cardNumber,
      seat: current.turn,
      card,
      source,
      analysisIndex: declarerSide ? currentAnalysisIndex : null
    };
    plays.push(play);
    frames.push({ state: played.state, play });
    self.postMessage({
      type: "progress",
      progress: {
        cardNumber,
        percent: Math.round(((step + 1) / remainingCards) * 100),
        label: `${current.turn} played ${card}`,
        state: played.state,
        play
      }
    });
  }

  const state = parseResult(engine.state()).state;
  return { startState, state, analyses, plays, frames, totalMs: performance.now() - startedAt };
}

self.addEventListener("message", async (event) => {
  const { id, command, payload } = event.data;
  try {
    await loadEngine();
    let result;
    switch (command) {
      case "create":
        result = parseResult(engine.createSession(
          payload.north,
          payload.east,
          payload.south,
          payload.west,
          payload.leader,
          payload.trump
        ));
        if (payload.restrictions) {
          result = parseResult(engine.setRestrictions(
            payload.restrictions.east,
            payload.restrictions.west
          ));
        }
        break;
      case "analyze": result = analyze(payload); break;
      case "play": result = parseResult(engine.play(payload.card)); break;
      case "undo": result = parseResult(engine.undo()); break;
      case "replay": result = parseResult(engine.replay()); break;
      case "run-full": result = await runFull(payload); break;
      default: throw new Error(`Unknown engine command: ${command}`);
    }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
});

loadEngine();
