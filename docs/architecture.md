# System Architecture

Bridge Solver has one C++ engine and two front ends: a native command-line lab
and a browser application. The split is deliberate. C++ owns bridge rules,
sampling, search, and DDS integration; JavaScript owns interaction,
visualization, and browser persistence.

## Runtime shape

```text
                         +----------------------+
                         | Browser UI           |
                         | app.js / storage.js  |
                         +----------+-----------+
                                    |
                          request/response JSON
                                    |
                         +----------v-----------+
                         | Web Worker           |
                         | engine-worker.js     |
                         +----------+-----------+
                                    |
                              Embind methods
                                    |
+-------------------+    +----------v-----------+
| Native CLI / lab  +--->+ bridge_engine (C++)  |
+-------------------+    +----------+-----------+
                                    |
                 +------------------+------------------+
                 |                  |                  |
          game mechanics      imperfect-info      DDS adapter
          and sampler         search/policies     exact leaves
```

Both front ends use `AnalysisSession`. A session owns the source-of-truth deal,
the public play position, defender restrictions, search settings, undo history,
the retained declarer policy, and AlphaMu2 hard layouts that remain legal after
later cards.

## End-to-end decision flow

1. The caller creates an `AnalysisSession` from a complete deal, opening leader,
   and strain. East and West remain the hidden source of truth.
2. Public knowledge is converted into constraints on the unseen defender pool:
   required and forbidden cards, suit-length bounds, HCP bounds, played cards,
   and inferred voids.
3. The dynamic-programming counter calculates the number of legal East hands.
   The sampler then draws East uniformly without rejection; West is the
   complement of the unseen pool.
4. Baseline `analyze()` searches those sampled worlds directly. `analyze2()`
   first builds a larger reservoir, selects an active set, runs alpha-mu, and
   challenges the retained policy against held-out worlds.
5. Alpha-mu searches declarer/dummy choices and defender observations until the
   configured MAX horizon `M`. DDS evaluates the remaining position in each
   useful world.
6. The result contains the recommended card, Pareto outcomes, a retained
   contingent policy, sampled layouts, and detailed counters.
7. Playing a card advances the public state. Defender observations narrow the
   compatible worlds in the retained policy. At the end of its useful horizon,
   the next decision is sampled and searched again.

## C++ component map

| Component | Main files | Responsibility |
|---|---|---|
| Card representation | `card.h`, `card.cpp` | One-hot cards, 52-bit hands, parsing, formatting, and HCP helpers |
| Game state | `game.h`, `game.cpp` | Legal cards, trick winner, scoring, equivalent plays, and the single position transition |
| Counting and sampling | `engine.h`, `engine.cpp` | Exact constrained-hand counts and rejection-free uniform sampling |
| DDS adapter | `dds_solver.h`, `dds_solver.cpp` | Conversion between project positions and DDS boards; scalar, batch, root-card, and table queries |
| Alpha-mu | `alpha_mu*.cpp` | Pareto-front recurrence, possible-world masks, iterative deepening, exact cuts, and policy reconstruction |
| AlphaMu2 | `alpha_mu2.h`, `alpha_mu2.cpp` | Reservoir screening, active-set selection, probability reassignment, fixed-policy validation, and counterexamples |
| Public claim bounds | `quick_tricks.cpp`, `claim.cpp` | Layout-independent proofs that avoid sampling/search when a target is already forced |
| Training defender | `defender.h`, `defender.cpp` | DD-optimal defence with policy-breaking and resource-preservation tie-breaks |
| Session orchestration | `analysis_session.h`, `analysis_session.cpp` | Restrictions, sampling, analysis lifetime, policy advancement, undo, and persistent hard layouts |
| Native tools | `interactive_cli.cpp`, `alpha_mu_lab.cpp`, `alpha_mu2_report.cpp` | Manual exploration, reproducible tests, mining, comparisons, and report generation |
| Browser boundary | `wasm_bindings.cpp` | Small Embind class that returns owned C++ results as JSON strings |

## State and ownership

The low-level engine uses value types. `Card` and `Hand` are `std::uint64_t`;
`Deal`, `Trick`, `Score`, and `Position` are fixed-size structs. Search branches
copy complete positions and apply the same `play_card` transition used by the
CLI and browser session.

The search transposition table is intentionally scoped to one analysis. Outcome
bits refer to the indices of that analysis's sampled worlds, so reusing a table
with a different sample would change the meaning of cached values. A retained
policy may survive across a trick or a configured M horizon, but its search
cache does not escape the analysis that built it.

In the browser, C++ objects remain inside WebAssembly. The worker calls one
Embind `BridgeEngine` instance and parses its JSON results. JavaScript never
holds a pointer into C++ memory.

## Why these technologies

### C++20

The hot path performs bit operations, copies small states, combines many
outcome vectors, and calls a native C++ solver. C++ gives direct control over
those representations and lets the same engine target native code and
WebAssembly. Plain structs and free functions make state transitions explicit;
there is no class hierarchy in the recursive search.

### JavaScript, HTML, and CSS

The browser layer has no third-party runtime packages. ES modules are enough for
the worker client, UI state, rendering, and local storage. This keeps deployment
as a static directory and makes the C++/browser boundary easy to inspect.

### WebAssembly and a Web Worker

Emscripten compiles the engine and DDS without creating a second implementation
of bridge logic. Search runs in a worker so the table, dialogs, progress updates,
and cancellation controls stay responsive. DDS is single-threaded in the WASM
build, which avoids a `SharedArrayBuffer` deployment requirement.

### CMake, PowerShell, and GitHub Actions

CMake defines the native and WebAssembly targets. The PowerShell entry points
handle Windows toolchain discovery. GitHub Actions repeats the Emscripten build,
runs the WASM smoke test, and publishes `website/dist` to Pages.

## Important design boundaries

- DDS supplies perfect-information values; it does not choose an
  imperfect-information declarer policy.
- Alpha-mu receives complete worlds internally but only permits declarer to
  branch on public observations.
- Defender restrictions are data passed into the sampler, not special cases in
  the search.
- Probability worlds and AlphaMu2 challenge worlds are separate. A rare hard
  layout can test a policy without being assigned fake probability mass.
- Native and browser callers use the same engine APIs and the same bridge state
  transition.

## Constraints that shape the implementation

- `WorldMask` is 64 bits, limiting one alpha-mu search to 64 active worlds.
- AlphaMu2 can screen a larger reservoir, but it must select or promote worlds
  into that active limit.
- Browser DDS is single-threaded. Native DDS may use its multi-board scheduler
  across worker threads.
- The normal probability model is uniform over deals that satisfy explicit
  constraints. Bidding and carding likelihoods are not yet learned weights.

Continue with [bridge mechanics](bridge-mechanics.md) for the representation,
[alpha-mu](alpha-mu.md) for the recurrence, or
[browser architecture](web-architecture.md) for the WebAssembly boundary.
