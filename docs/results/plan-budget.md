# Deep lookahead, bounded storage, and DD counterexamples

Measured on 2026-09-25 in the isolated `codex/plan-tree-storage` worktree, using
the Windows Release build. The website and main checkout were unchanged.

**DD mining of the deep partial plan found real counterexamples. Raising the
original constructor's context cap increased the number of refuted held-out
layouts from 12 to 51 within a 30-second construction allowance.** A separate
attempt to build broad instruction prefixes reached only six declaring-side
choices at every requested storage depth and context cap. That prefix is too
short to expose the observed error at choice eight.

No experiment here proves a common plan for all 12,376 legal layouts.

## Settings and evidence

All runs used ten training layouts, search M=26, seed 11565831, and the same
next 256 disjoint held-out layouts. The actual hand was tested separately.
East's singleton diamond ace remains an auction constraint. Graphs were frozen
before replay and were not repaired using these held-out results.

The primary matrix crossed storage M=8,12,16 with construction-context caps
250k,500k,1m. Every cell had a 30-second construction allowance and a 1m-node
cap. Cells ran sequentially in fresh processes. Memory peaks were captured
before validation and include the whole process, not only the saved graph.

Strict replay accepts actual target achievement or checked public proofs.
DD mining explores other branches after gaps and uses 0.1 seconds, 20,000
nodes, and up to eight loss witnesses per layout. Gaps and feasible leaves
have separate bounded witness storage. The later prefix-replay control uses
one second per layout with the same node cap.

Raw evidence: [matrix](raw/plan-budget/matrix.csv),
[controls](raw/plan-budget/controls.csv),
[profiling](raw/plan-budget/profile.csv),
[longer replay](raw/plan-budget/replay.csv),
[partition](raw/plan-budget/split.csv), and
[graph/partition hashes](raw/plan-budget/hashes.csv).
The implementation and runnable commands are in [bounded storage](../plan-budget.md).

## Broad storage matrix

All nine cells exported the **identical graph**, confirmed by SHA-256:

`F244197306CF62BC8E65355B33DEA3B82F355472D355CEF56124AD02A14418CD`

| Context cap | Requested storage M values | Completed storage M | Continued first responses | Construction stop | Peak working set |
|---:|---|---:|---:|---|---:|
| 250,000 | 8, 12, 16 | 6 | 20 / 20 | 30-second limit | 87.6–88.4 MiB |
| 500,000 | 8, 12, 16 | 6 | 20 / 20 | 30-second limit | 87.6–87.8 MiB |
| 1,000,000 | 8, 12, 16 | 6 | 20 / 20 | 30-second limit | 87.7–87.8 MiB |

The graph has 690 instructions and 63,392 bytes of node/edge payload (61.9
KiB). Its shortest unfinished path is six declaring choices deep. This is
broader than the previous depth-first graph, where 19 of 20 first defensive
responses immediately reached Frontier, but it loses those deeper partial
continuations when an unfinished storage pass is discarded.

The runs consumed only 19,398–19,634 construction contexts. Increasing the
context cap could not help because time ran out well before any cap. Requested
storage depths 8,12,16 therefore did not produce distinct policies; this matrix
does not establish an optimal storage depth among them.

At the short DD replay budget, eight training layouts finished optimistic
replay and two timed out. Of the 256 held-out layouts, 221 finished traversal
and 35 did not. Every held-out layout exposed at least one missing response;
no DD loss was found. These are overlapping observations, not percentages of
plan completion.

Requesting exactly storage M=6 constructed the same graph in **6.883 seconds**,
using 9,625 contexts. The remaining roughly 23 seconds in the matrix had been
spent attempting and discarding the seventh storage pass. With the longer
one-second DD replay budget:

- All ten training layouts completed replay and survived to their DDS leaves.
- All 256 held-out layouts completed traversal; all had coverage gaps and none
  exposed a DD loss in this prefix.
- The actual layout completed traversal, had a coverage gap, and exposed no
  DD loss in the prefix.
- No layout obtained a full-contract certificate from this unfinished graph.

The retained prefix is available as [frozen-prefix.dag.json](raw/plan-budget/frozen-prefix.dag.json).

## Raising the cap on the original deep constructor

These controls retain the original depth-first construction and use the same
sample, holdout, search M=26, 30-second allowance, and 1m-node cap.

| Context cap | Expanded contexts | Total build | Peak working set | Stored instructions | Continued first responses | Strict training proofs | Held-out DD losses found |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 250,000 | 250,000 | 10.168 s | 195.9 MiB | 28,940 | 1 / 20 | 0 / 10 | 12 / 256 |
| 1,000,000 | 626,594 | 30.006 s | 365.1 MiB | 74,398 | 2 / 20 | 2 / 10 | 51 / 256 |

The first run stopped at its context cap. The second stopped at the time
limit before reaching its larger cap. Thus the extra capacity enabled more
computation and used about three times as much construction time; this is not
an equal-time speedup attributable to RAM alone.

Both graphs still have unfinished branches after the first declaring choice,
and some other branches reach twenty declaring choices. The larger graph's
instruction payload is 5,184,160 bytes. The actual hand remains uncertified.

The short mining replay completed traversal on 240 and 175 held-out layouts
respectively. Replays can stop after enough loss witnesses, as well as at node
or time limits. A valid loss does not require exhaustive traversal; an
unfinished loss-free traversal is not evidence of safety. The strict training
proof check has a larger node budget than mining, so its proof count need not
match the mining proof count.

## Concrete counterexample diagnosis

The two control runs retained 96 and 408 losing paths respectively. All 504
were independently replayed from their root layouts:

1. The layout satisfies the known hands and singleton-ace constraint.
2. DDS says the contract is makeable at the root.
3. Every player and card in the exported path is legal.
4. The saved declaring instructions match the corresponding frozen graph.
5. DDS says the endpoint is unmakeable.

**Every recorded path first becomes DD-unmakeable when North discards HA on
the eighth declaring-side choice.** The six-choice prefix ends before that
decision. A representative witness has this beginning:

`South:SA West:S6 North:SK South:SQ West:S5 North:S8 East:S4 South:SJ West:DQ North:S7 East:S3 South:ST West:DJ North:HA`

For the first independently checked witness in the smaller control, discarding
C2, C3, D5, D6, or D7 instead preserves DD feasibility. Those alternatives are
layout-specific diagnostics, not a proved replacement common plan.

Every recorded loss was discovered when DDS checked a missing defensive
response later in the path. The losing declaring choice was already present
in the stored instructions, before that gap. Merely stopping at the first
missing response would have classified these as coverage requests and hidden
the earlier tactical error.

The 51 failing layouts therefore represent useful variation in layouts, but
the current evidence diagnoses one shared tactical mistake, not 51 distinct
strategic problems. See [verified-losses.csv](raw/plan-budget/verified-losses.csv),
[input paths](raw/plan-budget/loss-paths.tsv), and the standalone
[DDS replay verifier](raw/plan-budget/verify-losses.cpp). The control graphs
remain under `build/plan-budget-controls/`, with their hashes archived.

## Where the time goes

A follow-up profiled storage-M=8 run again retained the same M=6 graph:

- Initial full-depth value search: 1.790 seconds.
- All alpha-mu value probes, including reconstruction: 25.555 seconds.
- Claim checks inside those value probes: 21.942 seconds (a subset, not an
  additional cost).
- Builder terminal/proof checks: 4.384 seconds.

The main cost in this run is repeated continuation evaluation, especially
claim work inside alpha-mu, rather than storing instruction bytes. The original
larger deep control also spent 19.216 of its 30 seconds in alpha-mu claim
checks. Raising a construction-context cap cannot remove this work.

The next implementation should preserve useful deep partial continuations
while filling missing prefixes, use the HA witnesses for local repair, and
reduce repeated claim/value work. Pure complete-pass deepening is a useful
coverage baseline, but these results do not support replacing all deep partial
plans with it. DD-best defence remains a possible ordering heuristic; no legal
defensive response was excluded in these experiments.

## Verification and scope

All 16 CTest suites passed after the implementation and instrumentation
changes; [test log](raw/plan-budget/ctest.log). Additional checks validated all
matrix partitions/hashes and all 504 exported losing paths. There was no
deployment or production-site change. The new paths remain opt-in native
research tooling, with unfinished states explicitly separated from wins.
