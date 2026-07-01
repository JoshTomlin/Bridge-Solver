# Browser Architecture

## Why WebAssembly

Alpha-mu, uniform constrained sampling, and DDS remain in C++. Emscripten
compiles the existing engine to `bridge_engine.wasm`; Embind generates the
small JavaScript loader. The UI does not contain a second implementation of
bridge rules.

The module runs inside `engine-worker.js`, not on the browser's main thread.
DDS is built in its single-thread mode, so GitHub Pages does not need the COOP
and COEP headers required by `SharedArrayBuffer`/WebAssembly pthreads.

## Boundaries

`engine/src/wasm_bindings.cpp` exposes one `BridgeEngine` session with methods
for:

- Creating and validating a full or shortened deal
- Reading current hands, trick, score, turn, and legal cards
- Running alpha-mu with worlds, M, target, seed, and time settings
- Returning each representative root card's exact Pareto outcome vectors and
  the sampled East/West layouts behind those vectors
- Applying hard East/West card, shape, and HCP restrictions
- Playing a card, undoing, and replaying
- Following the retained within-trick policy
- Choosing a defender card with DDS

Methods return JSON strings. This keeps C++ ownership inside WebAssembly and
makes the worker protocol easy to inspect in browser developer tools.

## Browser Responsibilities

- `app.js`: rendering and interaction
- `engine-client.js`: request/response and cancellation
- `engine-worker.js`: WebAssembly ownership and full-deal orchestration
- `storage.js`: versioned localStorage deal and run history

Saved data never leaves the browser. Full-deal analysis repeatedly asks
alpha-mu for North/South decisions, follows retained trick policies, and uses
DDS for East/West. It starts from the current live position rather than
replaying the deal, so an entered or manually played prefix is preserved.
Progress and a state snapshot are recorded after every remaining card.

## Analysis And Playback

Web analysis enables `compare_all_root_moves`. Internal alpha-mu cuts remain
active, but one root card is never pruned merely because another root card is
already better. Each returned `rootMoves` entry therefore contains its exact
Pareto vectors as arrays of sampled-world indices. `sampledWorlds` contains the
corresponding remaining East and West holdings.

The UI presents these vectors as a win/loss world grid. Selecting a world shows
the sampled defender layout; selecting a different Pareto strategy changes the
grid. Equal root scores are labelled explicitly rather than hidden behind the
deterministic tie-break.

`app.js` owns a client-side timeline separate from the live engine state. Deal
prefix cards, manual cards, and bot cards all append immutable state frames.
The arrow controls inspect those frames without changing the engine. During a
saved bot continuation, timeline frames retain the analysis index that chose a
declarer card, allowing playback and the analysis panel to stay synchronized.

## Defender Restrictions

The entered East and West hands remain the hidden source of truth. Defender
restrictions represent public knowledge available to alpha-mu and must be
consistent with that true layout. Each seat can specify required cards,
forbidden cards, suit-length ranges, and an HCP range.

West constraints are converted to complementary East constraints using the
currently unseen defender cards. For example, if seven hearts remain and West
has two to four, East has three to five. Required and forbidden cards are
converted to the DP sampler's included and excluded masks. This preserves the
existing uniform, rejection-free sampling over every compatible layout.

Initial ranges are reduced as cards are played. A five-card heart minimum, for
example, becomes four remaining hearts after that defender plays one heart.
Known voids are then intersected with those remaining ranges.

## Deployment

The Pages workflow checks out the DDS submodule, installs Emscripten, builds the
single-thread WebAssembly engine, creates `website/dist`, and deploys it with
the official GitHub Pages actions. All asset paths are relative, so the app
works under the `/Bridge-Solver/` project path.

`npm run test:ui` checks the static DOM contract and continuation/timeline
hooks. `npm run test:wasm` checks the freshly built engine response, including
sampled layouts and per-root outcome vectors.
