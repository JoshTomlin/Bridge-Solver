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
DDS for East/West. Progress is posted after every card.

## Deployment

The Pages workflow checks out the DDS submodule, installs Emscripten, builds the
single-thread WebAssembly engine, creates `website/dist`, and deploys it with
the official GitHub Pages actions. All asset paths are relative, so the app
works under the `/Bridge-Solver/` project path.
