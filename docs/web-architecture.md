# Browser Architecture

The browser is a static, framework-free JavaScript application backed by the
same C++ engine as the native tools. Emscripten compiles `bridge_engine` and DDS
to `bridge_engine.wasm`; Embind exposes one small session object.

## Files and responsibilities

| File | Responsibility |
|---|---|
| `index.html` | Accessible document structure, dialogs, and form controls |
| `styles.css` | Bridge table, cards, reports, dialogs, and responsive layout |
| `app.js` | UI state, rendering, input handling, playback, and analysis reports |
| `deal-utils.js` | Deal normalization and editor helpers that can be tested without a browser |
| `engine-client.js` | Promise-based request IDs, worker lifecycle, progress, and cancellation |
| `engine-worker.js` | WebAssembly ownership, session commands, and full-deal orchestration |
| `storage.js` | Versioned `localStorage` access for deals and recent runs |
| `build.js` | Copies static assets and the Emscripten output into `website/dist` |

There are no browser runtime dependencies in `package.json`. The build is a
copy step rather than a bundler pipeline.

## WebAssembly boundary

`engine/src/wasm_bindings.cpp` exposes one `BridgeEngine` class with methods for:

- creating a session and applying defender restrictions;
- reading the current public state;
- running baseline alpha-mu or AlphaMu2;
- playing, undoing, and replaying cards;
- following the retained declarer policy;
- choosing a plain DDS defender card or the policy-aware competent defender;
- returning double-dummy scores for each legal card.

Methods return JSON strings. C++ retains ownership of the session and search
objects, while the worker receives ordinary serializable data. The worker then
posts that data to the main thread using a request ID.

## Why the engine runs in a worker

Sampling, iterative deepening, policy validation, and DDS calls can take long
enough to block input and rendering. `engine-worker.js` loads WebAssembly and
owns the session away from the main thread. Progress messages are one-way worker
events; command results use the matching request ID.

Cancellation terminates the worker and starts a fresh one. This is simpler and
safer than trying to interrupt arbitrary C++ recursion while preserving a
partially mutated session.

DDS is compiled in single-thread mode for WebAssembly. GitHub Pages therefore
does not need the COOP/COEP headers required by WebAssembly pthreads and
`SharedArrayBuffer`.

## Analysis and explanation

Browser analysis enables `compare_all_root_moves`. Internal alpha-mu cuts remain
active, but the root does not stop after proving that one card is best. Each
displayed root card therefore has its own exact Pareto front for the completed
M iteration.

For baseline alpha-mu, the UI shows:

- the selected card and represented-world score;
- Pareto strategies for that card;
- a win/loss grid over sampled worlds; and
- the complete current position for a selected world.

For AlphaMu2, the main report is a search-and-challenge timeline. It separates
the active layouts that built a policy from held-out layouts that tested it.
Promoted counterexamples include the actual failure path, East/West hands,
failure reason, and revalidation result under the next policy. Fingerprints,
hashes, selection distances, and engine counters remain available in a folded
advanced section.

## Full-deal play and defence

`runFull` starts from the current session position, preserving an entered or
manually played prefix. North/South uses the retained alpha-mu policy where one
exists and re-analyzes when necessary.

East/West uses `defenderMove`. DDS is the strict first criterion, so the chosen
card never gives declarer more double-dummy tricks than the best legal defence.
Among DD ties, the engine prefers cards that break or stress the retained
declarer policy, then cards that preserve defensive resources. The plain
`ddsMove` binding remains available for comparisons.

The worker posts a state snapshot after every card. The main thread stores those
immutable frames in a separate timeline, so the arrow controls can review a
completed play without changing the live engine state. Frames retain the
analysis index that selected each declarer card, keeping playback and the
decision inspector synchronized.

## Defender restrictions

The entered East and West hands are the hidden source of truth. Restrictions
describe only information available to the analysis: required and forbidden
cards, suit-length ranges, and HCP ranges for each defender.

West constraints are converted to complementary East constraints over the
currently unseen pool. For example, if seven hearts remain and West has two to
four, East must have three to five. After a defender plays a heart, the remaining
length range is reduced. A failure to follow suit adds a public void. The
dynamic-programming sampler then remains uniform over every compatible deal;
there is no rejection loop.

## Local data

Saved deals and the 24 most recent runs are stored in `localStorage`. Data stays
in the browser and is never sent to a service. If the storage quota is reached,
old runs are dropped until the new record fits.

Relay practice separately saves its active session, fixed cards, undo states
and UI preferences under `bridge-lab.relay-progress.v1`. Bids, reveal, undo and
preference changes save immediately; startup validates/restores the snapshot
before dealing a new hand. Pending teller questions and completed contracts
survive reopening. Invalid saves fall back visibly, and failed writes display a
notice. Samples, DDS reports and running workers are transient. As with other
local data, the save belongs to the current browser and origin, including port.

## Build, tests, and deployment

`build-wasm.ps1` configures Emscripten, builds the C++ target, copies the static
site into `website/dist`, and runs the WASM smoke test.

- `npm test` checks deal utilities, relay logic/persistence and asset versioning.
- `npm run test:ui` checks the static DOM contract and key UI/report hooks.
- `npm run test:wasm` loads the built module under Node and exercises the engine
  response.
- `npm run test:browser` exercises families and study branches in both roles
  across Chromium, Firefox, WebKit and mobile emulations.
- `npm run test:relay:browser` checks complete bidding, browser restart and
  actual DDS assessment in Chromium.

The static build gives the complete runtime graph a content hash under
`assets/<hash>/`. HTML points there; relative imports and worker/engine URLs
stay inside the same version. This prevents a fresh page from loading cached
modules written for an earlier page. Original paths are also copied for Node
engine smoke tests.

On `main`, `.github/workflows/deploy-pages.yml` checks out DDS, installs the
pinned Emscripten version, runs JavaScript and real browser checks, and deploys
`website/dist` with the official GitHub Pages actions.
