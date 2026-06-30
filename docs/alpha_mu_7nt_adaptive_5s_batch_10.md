# Alpha-Mu 7NT Adaptive Five-Second Experiment

Settings: 64 sampled worlds per decision, target 13 tricks, maximum `M=13`,
five-second adaptive soft budget per alpha-mu decision, trick-scoped policies,
and no voluntary defender spade leads or discards. The ten true-deal seeds are
the same seeds used by the earlier fixed-M reports.

## Summary

| Search | Made 13 | Mean tricks | Runtime | Nodes | DDS worlds |
|---|---:|---:|---:|---:|---:|
| Old fixed M=3 | 6/10 | 11.9 | 388.053 s | 203,999 | 1,746,699 |
| Old fixed M=4 | 7/10 | 12.0 | 2,675.909 s | 3,200,823 | 11,309,702 |
| Adaptive, max M=13 | 7/10 | 12.0 | 263.137 s | 767,912 | 859,367 |

The adaptive run matched every old M=4 result while using 90.2% less time,
76.0% fewer nodes, and 92.4% fewer DDS-world evaluations. Compared with old
M=3 it used 32.2% less time and 50.8% fewer DDS-world evaluations, despite
searching deeper and therefore visiting more non-DDS nodes.

Equivalent-card reduction skipped 399,033 branches in total:

- MAX card representatives: 371,243 (93.0%)
- MIN equivalent successors: 27,790 (7.0%)
- Mean per alpha-mu decision: 3,069 branches

Completed depth across the 130 decisions was:

- M=4: 67 decisions
- M=6: 20 decisions
- M=8: 4 decisions
- M=13: 39 decisions

## Per-Deal Results

| Run | NS tricks M3 | NS tricks M4 | NS adaptive | Adaptive runtime | MAX equals | MIN equals | Completed M histogram |
|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 10 | 10 | 10 | 28.956 s | 66,292 | 5,995 | M4=7, M8=2, M13=4 |
| 2 | 13 | 13 | 13 | 28.563 s | 37,904 | 1,717 | M4=7, M6=2, M13=4 |
| 3 | 9 | 9 | 9 | 20.508 s | 19,813 | 1,597 | M4=8, M6=1, M13=4 |
| 4 | 10 | 10 | 10 | 31.179 s | 49,903 | 3,630 | M4=5, M6=3, M8=1, M13=4 |
| 5 | 12 | 13 | 13 | 25.371 s | 51,671 | 3,288 | M4=6, M6=3, M13=4 |
| 6 | 13 | 13 | 13 | 29.495 s | 38,873 | 3,957 | M4=5, M6=3, M8=1, M13=4 |
| 7 | 13 | 13 | 13 | 24.159 s | 23,924 | 981 | M4=8, M6=2, M13=3 |
| 8 | 13 | 13 | 13 | 27.837 s | 28,186 | 2,784 | M4=7, M6=2, M13=4 |
| 9 | 13 | 13 | 13 | 23.783 s | 34,176 | 2,045 | M4=7, M6=2, M13=4 |
| 10 | 13 | 13 | 13 | 23.287 s | 20,501 | 1,796 | M4=7, M6=2, M13=4 |

The wall-clock comparison measures the complete current engine, not equivalent
cards in isolation. The older reports do not contain equivalent-card counters,
and several optimizations changed together. Use the same-world `benchmark
max-equals` command for an isolated position-level A/B measurement.

The generated full play log is `build/alpha_mu_7nt_adaptive_5s_batch_10.log`.
