# Shared plan graph: measured comparison

Measured locally on 2026-09-23 in `codex/plan-tree-storage`, based on `be0e09d`.
The native experiment now stores the selected policy as a shared graph and
verifies it against every occurrence in the uncompressed reference tree.
These are single-run measurements on two positions, not general scaling or
playing-strength guarantees.

## Storage by depth

For the reconstructed Bridge Master 6S position, 30 uniformly sampled legal
layouts and seed 11565831:

| Requested/completed M | Raw nodes | Shared nodes | Raw instruction bytes | Shared instruction bytes |
|---:|---:|---:|---:|---:|
| 1 | 2 | 2 | 64 | 64 |
| 2 | 48 | 4 | 1,904 | 496 |
| 3 | 71 | 5 | 2,640 | 528 |
| 4 | 815 | 73 | 32,400 | 8,656 |
| 5 | 3,615 | 93 | 144,400 | 9,696 |
| 6 | 40,035 | 929 | 1,601,200 | 92,352 |

M counts declarer/dummy card choices, not tricks. The M=6 plan reaches ten
total card plays. Shared counts and bytes match the independent estimates in
the [raw-tree baseline](plan-tree-baseline.md), now with an actual graph and
an exact behavior check.

At M=6 this is a **94.2% reduction in instruction payload**, or about 17.3 times
less storage. The graph has 476 Play nodes, 452 Observe nodes and one Frontier;
the raw tree has 20,029 Play nodes, 1,796 Observe nodes and 18,210 Frontiers.
Thus the saving includes substantial sharing of actual instructions as well
as merging identical unresolved endpoints. A shared Frontier means only
"stop here"; its eventual expansion still depends on its incoming state.

Vector allocation includes spare capacity. At M=6, the raw instruction vectors
allocate 2,473,984 bytes, versus 98,304 bytes for the graph. These figures exclude
allocator overhead and all search state. Raw per-occurrence evidence has a
640,560-byte payload, and the optional raw-to-shared mapping has a 160,140-byte
payload/allocation. Evidence cannot be attached to a shared node as if every
incoming history had the same knowledge.

The comparison command holds the source policy, raw tree, graph and mapping
together. It does **not** reduce measured peak process memory. A caller that
only executes instructions can retain the graph and its own current game and
knowledge state, discarding the diagnostic raw tree and mapping.

## Other sample sizes

Samples use the same seed and are nested on this toolchain; no actual layout
is forced into the sample. This is one selected plan per sample and depth.

| Position | Layouts | M | Raw nodes | Shared nodes | Raw / shared instruction bytes |
|---|---:|---:|---:|---:|---:|
| Discovery fixture | 2 | 6 | 142 | 36 | 5,664 / 1,632 |
| Bridge Master 6S | 8 | 4 | 562 | 64 | 22,304 / 6,368 |
| Bridge Master 6S | 30 | 4 | 815 | 73 | 32,400 / 8,656 |
| Bridge Master 6S | 64 | 4 | 859 | 73 | 34,160 / 9,008 |
| Bridge Master 6S | 8 | 6 | 23,710 | 642 | 948,224 / 59,168 |
| Bridge Master 6S | 30 | 6 | 40,035 | 929 | 1,601,200 / 92,352 |

Sharing helps strongly here, but the 30-layout shared node count still grows
from 93 at M=5 to 929 at M=6. It remains exponential in the worst case. These
examples do not justify extrapolating a whole-hand plan size or a general
linear bound in layouts or depth.

## Construction and traversal

For 30 layouts at M=6:

| Stage | Milliseconds |
|---|---:|
| Existing alpha-mu tree search | 698.81 |
| Existing policy reconstruction | 2,798.76 |
| Raw-tree capture | 1.73 |
| Raw measurements, including independent suffix counting | 5.45 |
| Graph compression, including input validation | 5.55 |
| Exact raw/graph verification | 0.42 |
| Full raw instruction walk, average of 32 | 0.086 |
| Full graph instruction walk, average of 32 | 0.057 |

Both walks visit 40,035 instruction occurrences and all observation histories.
The graph walk revisits shared nodes for each incoming path; it does not skip
histories using node IDs. Counts and content checksums agree, in addition to
the stronger structural verifier that checks every exact response beforehand.

The walk measures reading instructions only, excluding card legality, DDS and
knowledge updates. Raw walks run before graph walks; these small timings are
not a controlled performance study. Search/construction timings are single
runs, and first-row DDS startup can distort comparisons across depths. Export
time is excluded.

Policy reconstruction dominates this example. The useful next experiment is
to construct shared continuations during reconstruction, avoiding the expanded
reference tree in the normal path. This result alone does not establish an
alpha-mu search speedup. Evaluations and frontier expansions must still use
their game/knowledge context, rather than a shared instruction ID alone.

## Reproduce and inspect

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-dags engine\tests\data\alpha_mu_corpus.tsv 6 10 build\plan-dag-results\discovery
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-dags-6s 8 6 15 11565831 build\plan-dag-results\six-spades-8
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-dags-6s 30 6 15 11565831 build\plan-dag-results\six-spades-30
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-dags-6s 64 4 15 11565831 build\plan-dag-results\six-spades-64
```

CSV files: [discovery](raw/plan-dags/discovery.csv),
[8 layouts](raw/plan-dags/six-spades-8.csv),
[30 layouts](raw/plan-dags/six-spades-30.csv),
[64 layouts](raw/plan-dags/six-spades-64.csv).
An inspectable M=2 example is retained as both a
[raw tree](raw/plan-dags/discovery-m2.tree.json) and a
[shared graph](raw/plan-dags/discovery-m2.dag.json). After South plays SK,
West's SQ/S7 responses share "North plays SA", while S9/S8 share
"North plays SJ". Each path retains its own state when executed.

The full 44 JSON exports remain local under `build/plan-dag-results`.
All 22 pairs were parsed independently with Node.js and checked across 72,734
raw occurrences for matching actions, players, complete observation domains,
frontiers, topology and metadata. Graph exports contain no shared evidence.

Windows x64 Release build, LLVM-MinGW 20260908 (Clang 23.1.1), CMake 4.4.3;
same [local DDS include workaround](plan-tree-baseline.md#build-and-verification-environment)
as the baseline. All nine CTest suites passed, including exhaustive exact-card
and player transition checks on real M=1..6 policies, synthetic sharing cases,
malformed-input rejection and the existing engine tests. A separate read-only
code review found no correctness blocker.

The experiment remains native-only and local to the feature worktree. The
production search, WebAssembly target and website are unchanged. No deployment
was performed. See the [representation and command reference](../plan-trees.md).
