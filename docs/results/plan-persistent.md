# Ten-layout construction with persistent local repairs

Measured locally on 2026-09-23 in the isolated `codex/plan-tree-storage`
worktree, using Windows Release builds with Clang 23.1.1 and CMake 4.4.3.

**The mechanism works, but this scheduling policy does not yet improve complete
layout coverage.** It can retain a plan, repair specific public histories, reuse
validated continuations, and deepen selected branches without rebuilding the
whole plan. Missing exact defensive responses still dominate the experiment.
No run proves the full contract, on the actual hand or on every legal layout.

## Current implementation: reserved search attempts

Each run starts with ten layouts and M=6, then draws two batches of 256 fresh
challengers. All makeable challengers are retained, leaving an archive of 522
layouts. Each batch selects up to eight failing layouts for local repairs and
attempts one frontier extension of three declarer/dummy choices. M counts
declarer/dummy card choices, not tricks.

These runs cap copied-continuation trials at half the eight-attempt repair
budget, preserving attempts for fresh local search. The implementation was
frozen before running seeds 101, 102, and 103. Each run reserves 256 layouts
that cannot participate in construction, challenges, repair, or the control.

| Seed | Initial horizon passes / 256 | After two local rounds / 256 | Full rebuild at M=6 / 256 | Graph nodes, initial -> local |
|---:|---:|---:|---:|---:|
| 101 | 1 | 0 | 7 | 622 -> 730 |
| 102 | 0 | 0 | 23 | 485 -> 553 |
| 103 | 0 | 0 | 18 | 460 -> 534 |

A horizon pass requires the fixed program to handle **every legal defensive
response in that layout** through its stored frontiers, each of which must
remain DD-makeable. The local plans contain branches of depth six to nine;
initial and control plans have depth six. Consequently, the lost survivor in
seed 101 is a regression against the variable stored horizon, not evidence
that an earlier declarer choice has become losing at the same fixed depth.
The experiment does not include a matched-depth projection of edited plans.

Every reported nonpass in these evaluations first encounters a missing
observation; none is classified as a DD loss or budget unknown. A first missing
observation can hide another kind of failure elsewhere. All strict full-contract
proof counts are zero. The local plans pass 0/768 test evaluations and the
rebuild controls pass 48/768, but these are overlapping samples of one deal
universe, not 768 independent bridge problems.

The oracle includes all 12,376 hidden layouts consistent with the user's
confirmed auction guarantee of East's singleton diamond ace and the observed
prefix. Earlier exhaustive root DDS screening established that every member
is individually makeable. That does not establish a common single-dummy plan.

## Work performed and cost

| Seed | Accepted occurrence repairs | Reused existing suffix | Accepted extensions | Initial construction, s | Both local rounds, s | Control rebuild, s |
|---:|---:|---:|---:|---:|---:|---:|
| 101 | 15 | 6 | 2 | 1.97 | 4.58 | 4.27 |
| 102 | 12 | 9 | 2 | 1.61 | 15.27 | 4.02 |
| 103 | 11 | 8 | 2 | 1.60 | 20.07 | 4.28 |

There were 38 accepted occurrence repairs: 23 reused an existing continuation
and 15 constructed a new one. All six selected extensions were accepted,
taking those paths from six to nine choices. No accepted repair replaced the
root. Local searches used at most fifteen layouts, while candidate acceptance
checked every archived layout compatible with the affected public history.

An accepted occurrence repair is not a repaired whole layout. The same layout
can expose other missing responses on other defensive paths. This explains how
many successful patches coexist with no whole-layout survivors.

The timing columns are components, not an equal-budget speed comparison.
Local-round time includes drawing challengers, root DDS screening, witness
collection, selection, candidate construction, archive validation, graph
editing, and deepening. The control is a fresh M=6 build on the initial ten plus
the same sixteen selected layouts; its time excludes their discovery. The
control also has fewer constraints than the 522-layout repair archive and does
not deepen to M=9. Timings are single measurements, not performance guarantees.

Archive validation dominates several later repairs. Compact graph storage does
not remove the cost of replaying the many defensive histories in each layout.
The size result is encouraging for storage; it does not establish cheap search
or validation.

## Earlier run and the scheduling fix

The first version allowed sibling-reuse failures to consume all eight attempts.
Inspection of its repair traces found failures with eight attempts and zero
locally searched layouts. The implementation now reserves at least half the
attempts for search, with regression tests for budgets of one and two.

The original results are retained rather than replaced:

| Earlier seed | Initial / 256 | After local repair / 256 | Rebuild / 256 | Accepted repairs / reused / extensions |
|---:|---:|---:|---:|---:|
| 11565831 | 0 | 0 | 12 | 10 / 8 / 2 |
| 42 | 0 | 0 | 15 | 9 / 6 / 2 |
| 2026 | 9 | 9 | 23 | 10 / 10 / 1 |

The new seeds avoid selecting parameters against these particular earlier
holdout outcomes, but partitions from different seeds can overlap. This is an
exploratory experiment on one position. It does not measure a statistically
independent benefit from the scheduling fix. The fix addresses demonstrated
attempt starvation; it does not resolve the coverage bottleneck.

## What the result suggests

Simply selecting more failing layouts is not yet selecting strategically
critical layouts. Most failures currently mean that an exact response card
has no stored instruction. Increasing the initial search depth exposes more
combinations of such responses before the evaluator can reach a meaningful
decision or a useful unfinished continuation.

The next useful experiment is **observation coverage repair in groups**:

1. Group missing cards by the same public decision history. Try covering their
   union with a validated continuation before spending deep search on each.
2. Prioritize groups that affect many archived layouts. Keep demonstrated DD
   losses separate from missing instructions and unresolved depth.
3. Measure coverage at a common fixed depth as well as at each plan's deepest
   stored continuations, then deepen branches whose observation coverage holds.

Grouping must use the public execution context and validate the proposed
continuation in every compatible archived layout. A shared instruction node,
similar suit shape, or similar DD profile alone is not an equivalence proof.
The current implementation deliberately edits only one occurrence at a time;
group repair has not yet been implemented.

## Reproduction and recorded data

See [the implementation notes](../plan-persistent.md) for API contracts,
frontier modes, and cooperative deadline limits. All thirteen CTest suites
passed after the current changes, including the native persistent-loop smoke
test and focused repair tests. The website and production AlphaMu2 are unchanged.

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-persist-6s 6 101 2 256 30 build\plan-persistent-results\seed-101
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-persist-6s 6 102 2 256 30 build\plan-persistent-results\seed-102
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-persist-6s 6 103 2 256 30 build\plan-persistent-results\seed-103
```

Current-version summaries: [101](raw/plan-persistent/v2/seed-101.csv),
[102](raw/plan-persistent/v2/seed-102.csv), [103](raw/plan-persistent/v2/seed-103.csv).
Their `-repairs.csv`, `-archive.csv`, and `-split.csv` companions preserve repair
events, archived identities, and all partition identities. Graph exports remain
in the ignored build output directories.

Historical summaries: [11565831](raw/plan-persistent/v1/seed-11565831.csv),
[42](raw/plan-persistent/v1/seed-42.csv), [2026](raw/plan-persistent/v1/seed-2026.csv),
with companion repair traces. These precede the reserved-search-attempt fix;
running the current command with those seeds need not reproduce them.

The CSV's `strict_unresolved` field records an unfinished frontier encountered
before the first failure, because the strict traversal stops after one such
frontier. A change from `strict_failure` to `strict_unresolved` is not a measured
whole-layout improvement. `horizon_pass` is the exhaustive stored-horizon metric.
No recorded holdout evaluation exhausted its validation budget.
