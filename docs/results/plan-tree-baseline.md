# Initial detailed-plan storage baseline

Measured locally on 2026-09-23, on the `codex/plan-tree-storage` worktree based
on `be0e09d`. These are single-run research measurements, not performance
guarantees or a claim of complete-hand solution quality.

## Main result

The reconstructed 6S position, with 30 uniformly selected legal layouts and
seed 11565831, produced the following one-policy sizes:

| Requested/completed M | Raw nodes | Distinct instruction subtrees | Raw instruction bytes | Shared instruction bytes, estimated |
|---:|---:|---:|---:|---:|
| 1 | 2 | 2 | 64 | 64 |
| 2 | 48 | 4 | 1,904 | 496 |
| 3 | 71 | 5 | 2,640 | 528 |
| 4 | 815 | 73 | 32,400 | 8,656 |
| 5 | 3,615 | 93 | 144,400 | 9,696 |
| 6 | 40,035 | 929 | 1,601,200 | 92,352 |

M counts declarer/dummy choices. At M=6 the longest retained path contained
10 total card plays. The tree had 20,029 Play nodes, 1,796 Observe nodes, and
18,210 explicit Frontier nodes. Maximum observation fanout was 23.

The M=6 instruction payload is about 1.53 MiB, plus 0.61 MiB of per-occurrence
sample evidence. Vector capacities allocate about 3.36 MiB for those payloads.
The hypothetical shared instruction payload is about 90.2 KiB, a 94.2%
reduction in **instruction bytes only**. Evidence, contextual state, graph
construction tables, allocator overhead and search memory are excluded from
that estimate. The original pointer policy still coexists with this snapshot.

The code stores the raw tree. The distinct count is computed from exact
instruction/continuation identity without merging nodes. It includes sharing
identical unresolved frontier instructions, which does not certify that their
future solutions will be identical.

## Dependence on the active layouts

These samples use the same shuffled oracle and seed; larger world sets include
the smaller samples on the measured toolchain.

| Active worlds | M | Raw nodes | Distinct instruction subtrees |
|---:|---:|---:|---:|
| 8 | 4 | 562 | 64 |
| 30 | 4 | 815 | 73 |
| 64 | 4 | 859 | 73 |
| 8 | 6 | 23,710 | 642 |
| 30 | 6 | 40,035 | 929 |

For this position, adding layouts increased raw size but many resulting suffixes
were identical. Increasing M from 5 to 6 increased the 30-world raw node count
by about eleven times. These few points are not enough to fit a general
complexity model: who leads, forced actions, remaining cards, and the selected
plan all change the curve.

The small two-layout discovery corpus reached 142 raw nodes and 36 distinct
subtrees at M=6. It is a useful correctness fixture, but understates the scale
of the full-hand example.

## Time

At 30 worlds, M=6:

| Stage | Milliseconds |
|---|---:|
| Existing alpha-mu tree search | 704.6 |
| Existing policy reconstruction | 2,820.2 |
| New raw-tree capture | 1.74 |
| New measurement and exact-suffix counting | 5.97 |

Export time is not included. DDS startup can disproportionately affect each
command's first row. These runs were not repeated or warmed for a timing study.
The large reconstruction cost suggests that constructing shared policy witnesses
earlier may eventually save more work than compressing an already expanded tree.
It does not establish that such a change will reduce search time.

## Reproduce

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-trees engine\tests\data\alpha_mu_corpus.tsv 6 10 build\plan-tree-results\discovery
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-trees-6s 8 6 15 11565831 build\plan-tree-results\six-spades-8
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-trees-6s 30 6 15 11565831 build\plan-tree-results\six-spades-30
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-trees-6s 64 4 15 11565831 build\plan-tree-results\six-spades-64
```

The retained policy uses DDS after its M horizon. All rows are baseline alpha-mu,
not AlphaMu2 refinement. No actual layout is forced into these size experiments.
These measurements say nothing about held-out makeability or policy coverage.

Raw CSVs and a small inspectable tree are in [raw/plan-trees](raw/plan-trees/).
The full 22 JSON exports are local under `build/plan-tree-results`; large
generated trees are deliberately not checked into the repository.

## Build and verification environment

Windows x64, LLVM-MinGW release 20260908 (Clang 23.1.1), CMake 4.4.3, Release
build. The tools were unpacked under `C:\Codex Projects\.tools`; no global
toolchain settings were changed. Runtime DLLs are found through the toolchain's
`bin` directory on the process PATH.

For this machine:

```powershell
$env:Path = 'C:\Codex Projects\.tools\llvm-mingw-20260908-ucrt-x86_64\bin;C:\Codex Projects\.tools\cmake-4.4.3-windows-x86_64\bin;' + $env:Path
.\build.ps1
```

The pinned DDS source relies on a transitive declaration of `sprintf` that this
compiler does not provide. The initial normal build failed in DDS `Par.cpp`.
The measurement build used this **local CMake-cache workaround**, without
changing DDS or the checked-in production build flags:

```powershell
cmake -S . -B build '-DCMAKE_CXX_FLAGS=-include cstdio'
cmake --build build --config Release --parallel 4
ctest --test-dir build -C Release --output-on-failure --timeout 120
```

All seven CTest suites passed, including the existing engine/corpus/miner/paired/
Bridge Master tests and both new plan-tree checks. Existing JavaScript deal
utilities and UI smoke checks passed. All 22 exported files parsed as JSON and
their reported node/edge counts matched their raw-tree topology. A WebAssembly
rebuild was not run; new experiment code is excluded from that build branch.
