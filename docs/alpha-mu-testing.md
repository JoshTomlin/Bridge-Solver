# Alpha-Mu Reliability Lab

The reliability lab tests more than the recommended opening card. It checks
whether the retained policy continues to work after every legal defensive
observation through its M horizon. Sampled probability and hard-layout coverage
are treated as different signals:

- Reservoir particles carry normalized probability mass.
- Adversarial, remembered, and discovered counterexamples are challenge worlds.
  They may have zero probability mass, so adding one cannot make a rare layout
  look common.
- Alpha-mu maximizes represented probability first. Within the configured
  near-tie tolerance it prefers the policy that survives more challenge worlds,
  then uses exact probability and unweighted world count as tie-breakers.
- AlphaMu2 validates the complete retained M-horizon policy, records the policy
  path signature and failure depth, and keeps distinct counterexamples from the
  same DDS root-fingerprint bucket when their policy paths differ.

The analysis session also creates adversarial layouts by swapping one unknown
East/West card in sampled deals. It ranks legal mutations for structural
pressure (voids, singletons, extreme shapes, and HCP imbalance). Selected hard
layouts are carried forward through later play while they remain legal.

## Test Layers

| Layer | What it checks |
|---|---|
| Native unit suite | Card/game rules, constrained sampling, Pareto algebra, exact cuts, weighted choice, policy reconstruction, AlphaMu2 traces, and defender safety |
| Authored corpus | Expected root move and fixed-policy success across all listed layouts for each information set |
| Collision miner | Two layouts with the same root DDS fingerprint but different policy requirements |
| Paired benchmark | Baseline and AlphaMu2 on the same shuffled rare-layout reservoirs and exact two-layout oracle |
| Bridge Master 6S oracle | Coldness and fixed-policy coverage over all 12,376 legal hidden layouts |
| Browser tests | Deal utilities, static UI/report contracts, and a real WebAssembly engine response |

## Running the Checks

Build the native engine, then run:

```powershell
.\build\engine\Release\bridge_engine_tests.exe
.\build\engine\Release\bridge_alpha_mu_lab.exe corpus engine\tests\data\alpha_mu_corpus.tsv
.\build\engine\Release\bridge_alpha_mu_lab.exe mine
.\build\engine\Release\bridge_alpha_mu_lab.exe paired 100 11565831
.\build\engine\Release\bridge_alpha_mu_lab.exe bridgemaster6s 256 4 60 11565831 12376
```

After a WebAssembly build, run the browser checks with:

```powershell
cd website
npm test
npm run test:ui
npm run test:wasm
```

The unit suite includes weighted-choice, critical near-tie, duplicate-particle,
world-order, same-root-fingerprint, full-policy, and probability/challenge-pool
regressions.

`mine` enumerates a compact six-card defender space. It groups layouts by their
complete DDS root score vector, learns a policy from one layout, and looks for a
held-out layout in the same group that defeats that policy. This specifically
detects information lost by shallow root fingerprints.

`paired` uses the same shuffled rare-layout reservoir for both engines. Baseline
alpha-mu sees one initial world; AlphaMu2 gets the same initial budget and may
add one counterexample. Every fixed policy is scored against the two-layout
exact oracle. Output is CSV so seed-level failures and aggregate success rates
can be compared directly.

`bridgemaster6s` exhaustively proves the reconstructed 6S discovery hand cold,
then compares fixed policies against either the complete 12,376-layout oracle
or a deterministic held-out subset. See
[Bridge Master 6S discovery benchmark](results/bridge-master-6s.md) for the
assumptions and measured results.

## Corpus Format

The corpus is tab-separated, with one layout per line and eleven fields:

```text
case  north  east  south  west  leader  strain  target  max_m  played_prefix  expected_move
```

Hands use SHDC notation. `strain` is `S`, `H`, `D`, `C`, or `NT`.
`played_prefix` is a space-separated list such as `S6 S4`; it may be empty.
Rows with the same case name form one imperfect-information oracle and must
share the same public position and settings. The lab requires the expected root
move and the resulting fixed policy to make the target in every listed layout.

## Adding Bridge Master or Authored Problems

Add only deals you are entitled to store. Reduce each problem to the decision
position being tested, then add every relevant hidden layout as a row under one
case name. A useful small corpus deliberately includes:

1. The normal layouts that explain the percentage play.
2. Rare but technically decisive layouts.
3. Layouts with the same root DDS vector but different later observations.
4. Suit-permuted or East/West mirrored variants when those transformations
   preserve the problem.

Keep an expected move based on the authored solution, but also inspect
`policy_passes`. A matching first card with a failing continuation is still a
regression.

For larger collections, run the corpus command in CI and archive its CSV. Useful
paired metrics are exact-oracle policy pass rate, expected-root agreement,
counterexamples added, fingerprint collisions, active probability coverage,
nodes, DDS leaves, and wall time.
