# Second-Paper Optimization Results

This file records a reproducible validation snapshot for the optimizations from
Cazenave, Legras, and Ventos, *Optimizing alpha-mu*. The implementation details
and switch names are in `docs/alpha-mu-optimizations.md`.

## Correctness Checks

`engine/tests/engine_tests.cpp` now checks that:

- optimized alpha-mu preserves the move and winning-world score of the plain
  recurrence on the four-world example;
- useful-world removal reaches zero/one-world cuts in a mixed-layout ending;
- a one-world cut returns the exact DDS outcome;
- batched and scalar DDS return identical world vectors;
- Empty Entry and deep alpha can each be switched off and on while preserving
  the winning-world score;
- reference mode reports no optimization events.

The Release test suite passes in approximately five seconds on the development
machine.

## Five-Card Stress Position

The existing `AJ32 A` opposite `K954 K` demonstration was run with 64 sampled
worlds and `M=10`:

```powershell
.\build\engine\Release\bridge_engine_cli.exe --alpha-mu-spade-64-demo
```

It selected `SA`, winning 59 of 64 sampled worlds, in 5.38 seconds. The run
visited 27,938 nodes and 18,402 DDS worlds. It also demonstrated that every new
mechanism is reachable in a real search:

| Event | Count |
|---|---:|
| Useful worlds removed | 1,509 |
| World cuts | 4,481 |
| Empty-entry searches | 134 |
| Deep alpha cuts | 18 |
| Batched DDS calls | 2,981 |

A focused four-world A/B run with early, root, and win cuts disabled isolated
deep alpha. Enabling it reduced nodes from 732 to 163 and DDS worlds from 688
to 146 while preserving `SA` and 4/4 winning worlds. Runtime changed from
307.6 ms to 75.3 ms in that run. Small timings are noisy; the invariant is the
matching result.

## 7NT Guess Playthrough

The comparison used the same hidden deal, random seeds, 64 worlds per search,
target of 13 tricks, adaptive maximum `M=26`, and five-second soft limit:

```powershell
.\build\engine\Release\bridge_engine_cli.exe `
  --alpha-mu-playthrough --auto --target-13 `
  --max-depth 26 --time-limit 5 --seed 5
```

| Measurement | Previous implementation | Second-paper implementation |
|---|---:|---:|
| Final declarer tricks | 10 | 10 |
| Total simulation time | 29.60 s | 24.05 s |
| Tree-search time | 29.08 s | 23.72 s |
| Nodes | 13,742 | 46,290 |
| DDS worlds | 39,920 | 74,274 |
| Deepest-iteration histogram | M2=4, M4=6, M26=3 | M4=6, M5=1, M6=2, M26=4 |

Wall-clock time fell by about 19%. The larger node and DDS counts are not a
regression by themselves: faster batched leaves let the adaptive controller
finish deeper iterations within the same limit. The selected play and final
result were unchanged. The new run recorded 12,259 useful-world removals,
2,428 world cuts, 466 empty-entry searches, and 10,670 DDS batches containing
71,914 worlds.

This seed is one difficult source-of-truth deal, not a playing-strength sample.
Use the existing ten-deal batch before drawing conclusions about contract
success rate; use same-world A/B benchmarks to evaluate an individual shortcut.
