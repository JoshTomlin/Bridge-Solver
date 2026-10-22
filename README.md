# Bridge Solver

Bridge Solver is a bridge declarer-play research project. Given the visible
North/South hands and constraints on the defenders, it counts and samples legal
hidden deals, then searches for one declarer policy that works across those
possible worlds.

The search engine is written in C++20 and runs both as a native command-line
lab and in the browser through WebAssembly. The browser provides deal entry,
defender constraints, interactive play, complete-hand simulation, and detailed
explanations of the sampled layouts behind each decision.

## Why this project exists

A double-dummy solver can find the best play when all four hands are visible.
Declarer does not have that information at the table. Solving each possible
layout independently and combining the answers can therefore recommend a line
that depends on knowing which hidden layout is real. This is the strategy-fusion
problem.

Bridge Solver uses alpha-mu search to avoid that leak. Declarer must choose the
same card in worlds that are still indistinguishable, but the retained policy
may branch after a defender reveals new public information by playing a card.

The second search mode, AlphaMu2, addresses a separate sampling problem: common
layouts can crowd rare but decisive layouts out of a small search set. It:

1. samples a larger reservoir of legal deals;
2. selects a smaller, strategically varied active set;
3. searches that set with alpha-mu;
4. tests the fixed policy against held-out, double-dummy-makeable layouts; and
5. promotes distinct failures as counterexamples before searching again.

The result is still an approximation, but the approximation is visible and
testable. Reports show which layouts built the policy, which layouts challenged
it, the card sequence that caused a failure, and whether the next policy fixed
that failure.

## What is implemented

- Complete bridge card, trick, scoring, and legal-play mechanics
- Exact counting and uniform sampling under known-card, suit-length, and HCP
  constraints
- A narrow wrapper around Bo Haglund's Double Dummy Solver (DDS)
- Binary-outcome alpha-mu with Pareto fronts and retained contingent policies
- AlphaMu2 reservoir screening, probability reassignment, adversarial layouts,
  counterexample refinement, and persistent hard layouts
- Exact search shortcuts including transposition tables, equivalent-card
  reduction, target bounds, quick-trick proofs, and DTAC-style claim proofs
- A DD-safe training defender that uses policy weaknesses to break ties between
  equally sound defensive cards
- Native CLI, benchmark lab, regression corpus, browser UI, Web Worker boundary,
  WebAssembly build, local run history, and GitHub Pages deployment

One useful regression is a reconstructed Bridge Master 6S discovery problem.
DDS proves the contract makeable in all 12,376 legal hidden layouts. In the
recorded test, the baseline fixed policy passed 58.35% of the oracle while the
refined AlphaMu2 policy passed all layouts at the same M horizon. The assumptions
and reproduction command are in the
[Bridge Master benchmark](docs/results/bridge-master-6s.md).

## System outline

```text
Browser UI (JavaScript, HTML, CSS)
              |
        Web Worker messages
              |
      WebAssembly / Embind API
              |
        AnalysisSession (C++)
       /        |          \
  constrained  alpha-mu   DDS
   sampler     AlphaMu2   leaves
```

The same C++ library is linked into the native tools and compiled by Emscripten
for the browser. Bridge rules and search logic are not reimplemented in
JavaScript.

## Languages and tooling

| Technology | How it is used | Why it is used |
|---|---|---|
| C++20 | Card model, game state, constrained sampler, alpha-mu, AlphaMu2, DDS integration, CLI, and tests | Search copies and compares many compact states; bitmasks and value types keep that work predictable and fast. The same source also compiles to WebAssembly. |
| JavaScript ES modules | UI state, rendering, worker protocol, playback, and local persistence | It keeps browser interaction separate from the engine and requires no application framework or runtime dependency. |
| HTML and CSS | Accessible controls, bridge table, dialogs, reports, and responsive layout | The interface is a static site that can be served locally or from GitHub Pages. |
| WebAssembly and Embind | Browser build of the C++ engine and its small JSON-based API | The browser uses the real engine instead of a second rules/search implementation. |
| Node.js and npm | Local static server, JavaScript tests, static-site copy step, and WASM smoke test | They provide a small development toolchain without adding browser runtime dependencies. |
| CMake | Native and Emscripten build graph | One build description covers the engine, DDS, tools, tests, and WebAssembly target. |
| PowerShell | Windows build entry points | The scripts locate an installed MSVC or LLVM-MinGW toolchain and keep the common commands short. |
| GitHub Actions YAML | WebAssembly build, smoke test, and Pages deployment | Every push to `main` can rebuild and verify the static browser application. |

DDS is included as a Git submodule under `external/dds`. It provides exact
perfect-information leaf values; imperfect-information policy construction is
implemented in this repository.

## Repository map

| Path | Purpose |
|---|---|
| `engine/include/bridge/` | Public C++ types and APIs |
| `engine/src/` | Bridge rules, sampling, search, DDS adapter, CLI, and WebAssembly bindings |
| `engine/tests/` | Native regression suite and authored alpha-mu corpus |
| `website/` | Framework-free browser UI, worker client, storage, and smoke tests |
| `docs/` | Reading guide, current design notes, algorithm explanations, and recorded results |
| `external/dds/` | Bo Haglund's Double Dummy Solver submodule |
| `.github/workflows/` | GitHub Pages build and deployment |

## Build and run

Clone the DDS submodule before building:

```powershell
git submodule update --init --recursive
```

### Native engine

Requirements are CMake 3.20 or newer and either MSVC with a Windows SDK or an
LLVM-MinGW toolchain. The helper script detects the available toolchain.

```powershell
.\build.ps1 -Configuration Release
.\build\engine\Release\bridge_engine_tests.exe
.\build\engine\Release\bridge_engine_cli.exe --interactive
```

Inside the position lab, `new` enters a deal in SHDC notation, `analyze` runs
baseline alpha-mu, `analyze2` runs AlphaMu2, and `bot` advances one card. Type
`help` for the complete command list.

The reliability lab provides reproducible corpus and rare-layout tests:

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe corpus engine\tests\data\alpha_mu_corpus.tsv
.\build\engine\Release\bridge_alpha_mu_lab.exe mine
.\build\engine\Release\bridge_alpha_mu_lab.exe paired 100 11565831
.\build\engine\Release\bridge_alpha_mu_lab.exe bridgemaster6s 256 4 60 11565831 12376
```

### Browser application

Requirements are Node.js, npm, and an active Emscripten SDK environment.

```powershell
.\build-wasm.ps1 -Configuration Release
cd website
npm run preview
```

The static build is written to `website/dist` and served at
`http://localhost:3000`. The build script also runs the WebAssembly smoke test.
JavaScript-only checks can be run separately:

```powershell
cd website
npm ci
npm test
npm run test:ui
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
npm run test:relay:browser
```

## Documentation

The [relay-practice subproject](docs/relay-practice.md) adds a trainer at
`website/relay.html`, using the partnership notes, July minor-relay revisions
and subsequent clarifications. Its 63 scenarios cover 1M–2NT, revised diamond
and club relays, Baron, Dappleton, reordered opener rebids, split-range and Horton continuations, then keycards, queen and
specific-suit asks within disclosed practice restrictions. Practice and hand
sampling run without the compiled engine; DD contract comparison uses the
rebuilt WebAssembly engine.

Choose **asker** to ask and interpret relay bids or **teller** to answer
partner's questions. All 63 exercises support both roles. Asker contract
assessment compares DD make rates and paired outcomes using auction-compatible
hands, with a separate post-reveal review over many opponent layouts.
The current relay hand, auction and undo history autosave in the browser and
restore when you return to the same site address.
The phone layout keeps the auction, bidding box and all 13 cards on one screen.
Tap a call for its meaning, use the “i” buttons for hand knowledge, and open
**Assess** for contract comparisons. Family, role, branch and replay settings
live behind the menu. The next-hand arrow deals a fresh random branch and hand.
All legal bids are selectable; a hollow dot marks undiscussed calls. Hover or
press and hold a bid to preview its meaning before a normal click/tap bids it.

The [partnership system sources](docs/system-sources/README.md) retain both
Word originals, searchable paragraph extracts and the July email content in
the repository, with source precedence and reproducible file hashes.

Use the [relay system tables](docs/relay-system/README.md) for bidding lookup,
the [exercise catalogue](docs/relay-system/scenario-catalog.md) for all 63
selectable entries, [coverage and remaining work](docs/relay-system/coverage.md)
for status, and the [maintenance guide](docs/relay-maintenance.md) when extending
the trainer.

Start with the [documentation guide](docs/README.md). It gives a short reading
order and separates current implementation notes from point-in-time experiment
reports.

The most useful next documents are:

- [System architecture](docs/architecture.md)
- [Bridge mechanics and representation](docs/bridge-mechanics.md)
- [Alpha-mu implementation](docs/alpha-mu.md)
- [AlphaMu2 adaptive world selection](docs/alpha-mu2.md)
- [Testing strategy](docs/alpha-mu-testing.md)
- [Browser architecture](docs/web-architecture.md)

## Current limits

- Alpha-mu uses a 64-bit outcome mask, so one search can contain at most 64
  active worlds. AlphaMu2 uses a larger reservoir but must compress it into that
  active budget.
- Sampling is uniform over deals that satisfy the entered constraints. Auction
  and carding likelihood models are not yet probability weights.
- The full-play defender is designed to challenge a declarer policy while
  remaining DD-safe; it is not a learned model of human defensive agreements.
- Recorded timings are machine- and configuration-specific. Correctness checks
  and same-world comparisons matter more than a single wall-clock result.
