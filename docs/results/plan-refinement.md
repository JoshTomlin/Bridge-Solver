# First varied-counterexample experiment

Measured locally on 2026-09-23 in the isolated `codex/plan-tree-storage`
worktree. This tests whether a varied pool supplies enough useful failures
for a second pass and whether a multi-witness selector improves on a simple
first-witness reference. Algorithm choices were frozen before these three
held-out comparisons; the third seed's worse result is retained.

## Main result

There were enough failing layouts to form a meaningful second pass. Every run
found more than 550 failing layouts among 1,024 challengers. Both selectors
repaired all eight promoted layouts and improved on the initial plan without
an observed held-out regression. The diversity heuristic did **not** demonstrate
a consistent additional benefit over the simple reference.

All rows use the reconstructed 6S position and M=4, meaning four declarer/dummy
choices. A pass means the fixed plan handles every legal defensive response
through that horizon and leaves DD-makeable continuations. It is not a complete
single-dummy solution of the hand.

| Seed | Initial plan / 256 | First-witness reference / 256 | Varied selection / 256 | Reference / varied selected features |
|---:|---:|---:|---:|---:|
| 11565831 | 139 | 190 | 194 | 30 / 38 |
| 42 | 138 | 178 | 179 | 26 / 37 |
| 2026 | 135 | 158 | 152 | 26 / 36 |
| Total evaluations | 412 / 768 | 526 / 768 | 525 / 768 | |

Across these runs, varied refinement improved horizon survival from 53.6% to
68.4%. The simple reference reached 68.5%. The totals are descriptive: the
per-seed holdouts can overlap, and these are three samples of one position,
not 768 independent bridge problems. There were no budget-unknown validation
results and all held-out layouts were initially DD-makeable.

Every observed failure in these runs was a missing defensive response branch.
Thus this benchmark primarily demonstrates improved instruction coverage.
Diagnosed DD losses and balanced selection of losses versus gaps are covered
by the unit fixtures, but this position/horizon does not measure their value
in a larger challenge pool.

## Exhaustive audit of the selected plan

A follow-up on 2026-09-23 evaluated the seed-11565831 plans on every one of
the 12,376 layouts in the benchmark oracle. The three exported graphs were
byte-identical to those in the original experiment: the audit did not refine
them using the test set. Every layout was classified with no budget unknowns.

| Plan | Horizon survivors | Missing response branches | Actual layout at M=4 |
|---|---:|---:|---|
| Initial | 7,221 / 12,376 (58.35%) | 5,155 | Missing response |
| First-witness reference | 9,829 / 12,376 (79.42%) | 2,547 | Missing response |
| Varied second pass | 9,780 / 12,376 (79.02%) | 2,596 | Horizon survivor |

There were no first-encountered DD losses. Coverage gaps terminate that branch
of validation, so this does not imply no later losing choice exists. The
varied plan's actual-deal evaluation checks every legal defensive response
through the stored horizon, not just one chosen defensive line.

All Play instructions in the varied graph follow the same four-choice
sequence: South SA, North SK, South SQ, North S8, with exact West-observation
branches in between. The experiment has not constructed the remaining
continuation. At its frontier, DDS is allowed perfect information. It is
therefore incorrect to report this result as the algorithm making the full
contract on the actual hand, much less on every layout. The 2,596 missing
branches already refute universal coverage even at this short horizon.

The user subsequently confirmed that the auction guarantees East's singleton
diamond ace, hence every remaining diamond is in West. This validates the
oracle's existing constraint for this problem. The observed opening
`D2 D4 DA DK S2` alone would not establish it. Without that auction information,
the legal layout set would be larger and this exhaustive count would not apply.

A full guarantee requires one executable imperfect-information policy whose
every legal defensive path, in every layout satisfying the actual information,
reaches twelve declarer tricks or a sound public claim proof. Optimistic DDS
frontier values cannot supply that guarantee. The current experiment has not
met it.

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-audit-6s 4 11565831 4 256 60 build\plan-refinement-results\audit-11565831
```

[Raw exhaustive-audit CSV](raw/plan-refinement/audit-11565831.csv). The varied
plan's complete oracle evaluation took 20.6 seconds in this single run. The
challenge unit suite and second-pass CLI smoke check passed after adding the
audit command.

## Supply and cost of failures

Each run drew four batches of 256: 512 random, 256 structural and 256 targeted
layouts in total. All draws were unique members of the legal candidate pool
and disjoint from the initial thirty and final 256 test layouts.

| Seed | Failing layouts | Failure witnesses | Mining time, ms | Promoted layouts repaired, reference / varied |
|---:|---:|---:|---:|---:|
| 11565831 | 585 | 1,541 | 2,086.5 | 8 / 8 |
| 42 | 559 | 1,367 | 1,711.3 | 8 / 8 |
| 2026 | 597 | 1,518 | 1,589.6 | 8 / 8 |

Mining includes mixed drawing, DDS root screening, fixed-plan evaluation and
refreshing the next batch's target guidance. It does not include initial or
second-pass alpha-mu searches, final selection, exports, or held-out evaluation.
Failure witnesses are bounded at three per layout; these totals are not an
exhaustive enumeration of all weaknesses.

For seed 11565831, initial search/reconstruction took 113.5/65.1 ms, the
reference second pass 119.6/57.8 ms, and the varied second pass 127.6/56.6 ms.
Held-out evaluation took 149.9, 227.0 and 449.6 ms respectively. These are
single-run timings, affected by the defensive paths and DDS continuations in
each plan. A smaller graph does not necessarily validate faster. The workload
is this M=4 experiment, not the deeper M=6 storage benchmark.

## What the comparison establishes

Both selectors consume the same mixed pool and grow the same thirty-layout
construction set to 38. Challenges carry zero probability weight and receive
critical-case tie-breaking. Final test layouts are split off before mining,
and selection is frozen before any test-layout DDS screening or execution.

The `first_failure_reference` is an intentionally simple selection-only
reference: one witness per candidate, coverage-gap priority, then exact
path/root-profile deduplication. It is not the complete production AlphaMu2
selector or an end-to-end comparison against its sampler and probability
representatives. No claim of outperforming production AlphaMu2 follows here.

The varied selector covers more of its own feature descriptors, but this
does not reliably predict additional held-out repairs. The next research
question is how to measure overlap in what a promoted layout actually teaches
the reconstructed plan. A decision/continuation coverage measure or a larger
set of distinct positions could test that. The present implementation remains
an experiment; the mixed third-seed result has not been tuned away using its
holdout.

## Reproduction and artifacts

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-refine-6s 4 11565831 4 256 30 build\plan-refinement-results\seed-11565831
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-refine-6s 4 42 4 256 30 build\plan-refinement-results\seed-42
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-refine-6s 4 2026 4 256 30 build\plan-refinement-results\seed-2026
```

Summary CSVs: [11565831](raw/plan-refinement/seed-11565831.csv),
[42](raw/plan-refinement/seed-42.csv),
[2026](raw/plan-refinement/seed-2026.csv).
Selected-layout and exact-witness records:
[11565831](raw/plan-refinement/seed-11565831-selected.csv),
[42](raw/plan-refinement/seed-42-selected.csv),
[2026](raw/plan-refinement/seed-2026-selected.csv).
Full partition manifests and nine graph exports remain under the ignored
`build/plan-refinement-results` directory.

Windows x64 Release build, LLVM-MinGW 20260908 (Clang 23.1.1), CMake 4.4.3,
with the same local DDS include workaround as the
[storage baseline](plan-tree-baseline.md#build-and-verification-environment).
All eleven CTest suites passed. The DAG evaluator agreed with the existing
pointer-policy evaluator on 132 executions through M=1..6. A separate review
caught and corrected an exhausted-deadline/zero-budget ambiguity in the lab;
no benchmark run here exhausted its budget.
Independent artifact checks verified disjoint partitions and valid promotion
indices in all three manifests, and reachable acyclic topology in all nine
exported graphs.

See [the API and experiment reference](../plan-challenges.md). Production
search, existing AlphaMu2, WebAssembly and the website remain unchanged.
