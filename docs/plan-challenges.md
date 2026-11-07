# Varied plan counterexamples

This native research experiment executes the shared plan graph against new
layouts, collects several failure witnesses per layout, and selects a small
batch for a second alpha-mu search. It is separate from the production
AlphaMu2 implementation and the website. The reusable API is
`engine/include/bridge/plan_challenge.h`.

## Fixed-plan evaluation

`evaluate_plan_dag` validates the program and executes it using the full bridge
position for each incoming history. Declarer follows the stored exact card;
defenders can take every legal response. The evaluator never repairs declarer's
choice during validation. A shared node is not a cache key for execution state.

The result distinguishes:

- **DD loss:** the deal ends below target or a frontier is no longer DD-makeable.
- **Missing observation:** a legal defender card has no stored continuation.
- **Illegal instruction:** the stored player, instruction kind or card does not
  match this execution state.
- **Horizon survivor:** all legal defensive branches reach the target or a
  DD-makeable frontier. The latter remains optimistic, not a full-hand proof.
- **Unknown:** the node/time budget ends before exhaustive traversal and no
  failure has been established.

Terminal scores are checked before the frontier. Optional failure diagnosis
replays a losing path and obtains DDS scores at declarer decisions. It records
the first decision where another card retained DD makeability but the stored
card lost it. These alternatives describe that complete deal; they do not
establish a common imperfect-information strategy across layouts.

Witnesses contain the failure kind, instruction ID, complete position, exact
card, path and any diagnosed making alternatives. Duplicate exact failure
contexts are collapsed within one evaluation. The default witness cap is three.
Hitting a cap before all branches are visited leaves `complete=false`; an
already recorded failure is still a valid refutation or coverage gap. A
survival result always requires complete traversal.

Node and time limits are cooperative. Individual DDS calls cannot be interrupted.
`max_seconds=0` explicitly means unlimited; callers with an exhausted external
budget must stop instead of passing zero. Failure diagnosis shares the same
time budget. Node limits apply to program traversal, not the separate DDS
search's internal nodes.

## Mixed challenger batches

`draw_plan_challengers` accepts a pool that the caller has already constrained
to legal layouts. It returns unique unused indices from that pool. In the 6S
lab, the pool comes from the exact legal-layout enumeration, so every returned
layout preserves the known cards, observed play and forced diamond allocation.
The API can also consume a constrained sampler's reservoir. It does not itself
implement general bidding constraints or claim that a finite pool is exhaustive.

Each batch aims for:

- Half fresh random draws from the remaining pool.
- A quarter selected to vary suit lengths and honour ownership, relative to
  the seed layouts and the other members of the batch.
- A quarter targeting legal paths to known failing observations, or one-card
  exchanges between hidden partners near seed layouts. These are existing
  legal pool members; no unconstrained deal is fabricated. If none qualify,
  the source is explicitly recorded as a structural fallback.

Targeted draws prefer observations already covered by fewer members of the
current batch. After each batch, the lab refreshes its target paths and nearby
layout seeds using up to twelve diverse failing candidates. This prevents the
first few discoveries from permanently controlling subsequent draws. The lab
retains all candidates for final selection, even when the guidance subset is
smaller.

DDS scores every legal root card. Only initially DD-makeable layouts are sent
to fixed-plan validation. A root fingerprint is not an equivalence proof;
different later failures remain eligible even with identical root scores.

## Selecting the second-pass layouts

`plan_failure_features` creates complete, comparable feature vectors from each
witness: failure kind, player, exact card, diagnosed alternatives, current trick
and score context, plus relevant suit lengths and honour ownership. It excludes
the full earlier exact-card ordering and shared node ID from the coarse
decision feature. A second feature includes more hidden-layout context.

`select_plan_counterexamples` greedily selects candidates adding the most
uncovered features. It breaks ties using structural distance from both the
active layouts and the already selected candidates, then root DD profile
distance. Each pool layout can be promoted once. When both are available and
capacity permits, a demonstrated DD loss and a missing-observation case receive
representation. Cases with no established failure are not promoted.

These features are selection heuristics only. They neither merge game states
nor prove that apparently similar failures have the same repair. Active layouts
contribute structural distance; the API does not have their prior failure
features. More selected features is a diagnostic, not evidence of better play.

## Controlled second-pass lab

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-refine-6s 4 11565831 4 256 30 build\plan-refinement-results\seed-11565831
```

Arguments are `[MAX_M=4] [SEED=11565831] [BATCHES=4] [BATCH_SIZE=256]`
`[STAGE_SECONDS=30] [OUTPUT_DIR]`.

The lab shuffles the 12,376-layout oracle without forcing the actual deal into
any sample. It partitions thirty initial search layouts, 256 untouched test
layouts, and the remaining candidate pool before mining starts. Each layout
belongs to one partition. The held-out layouts are never exposed to the drawer
or selector.

After mining, it freezes two batches of up to eight promotions:

1. `first_failure_reference`: a simple selection-only reference, using each
   candidate's first witness, prioritising coverage gaps and deduplicating the
   exact path plus root DD profile.
2. `diverse`: the new multi-witness feature/structural selector.

Both methods see the same mixed challenger pool. The reference is not the full
existing AlphaMu2 pipeline: it does not reproduce that pipeline's initial
representative selection, regret/distance ordering or probability reassignment.
It is also not a timing comparison between one-witness and three-witness mining.
Diagnosed paths can be shortened to their first losing choice.

Each second search retains all thirty initial layouts with their original
equal weights. Promoted challenges have zero probability weight and set critical
tie-break bits. The active set therefore grows to at most 38 of the engine's
64 supported layouts. No previously active layout is discarded in this test.

The original and both second-pass plans are evaluated on the same untouched
DD-makeable test layouts. Output reports horizon survival, first encountered
failure type, unknowns, repaired failures, regressions and repair of promoted
cases. Validation takes one failure witness per layout, so a reported coverage
gap does not establish the absence of a DD loss on another branch.

The seconds setting applies separately to mining, each search, each holdout
validation and each promoted-set check. Drawing and DDS batches may overrun a
cooperative deadline; the lab checks it before starting the next expensive
operation. Existing alpha-mu policy reconstruction remains outside its search
deadline. This is not a hard wall-clock limit for the entire command.

CSV summary is written to stdout; progress goes to stderr. With an output
directory, `selected.csv` contains the chosen layouts and witnesses, `split.csv`
records partition identities, and three `.dag.json` files contain the plans.
Matching filenames are overwritten on a repeat run.

`plan-audit-6s` accepts the same arguments (default stage budget 60 seconds).
It reconstructs the same selected plans and additionally evaluates each one
on every member of the constrained oracle and on the stated actual layout.
The extra CSV columns distinguish oracle survivors, first DD losses, coverage
gaps and budget-unknowns; an actual failure includes its card path. The oracle
uses the user's confirmed auction guarantee of East's singleton diamond ace.
That constraint does not follow from the opening play alone. Even complete oracle coverage at M=4 would
prove only horizon survival. See the [exhaustive audit](results/plan-refinement.md#exhaustive-audit-of-the-selected-plan).

## Verification and results

`bridge_plan_challenge_tests` compares DAG and pointer-policy execution on
132 cases through M=1..6, including layouts absent from the search. It also
checks multiple failures, optimistic versus terminal outcomes, DD-loss
diagnosis, budget unknowns, malformed plans, mixed draws and greedy selection.
A CLI smoke test exercises the complete second-pass pipeline, including a
holdout larger than one DDS batch.

See [the first three-seed experiment](results/plan-refinement.md). It shows a
useful refinement effect but no consistent additional advantage from this
particular diversity score. The implementation has not been promoted to the
website or the production AlphaMu2 path.

The next experiment adds [persistent local repair and deepening](plan-persistent.md)
to retain the saved graph between challenge batches.

The [bounded-storage experiment](plan-budget.md) adds opt-in DD mining that
keeps coverage gaps separate from losing witnesses and continues past gaps or
rejected proofs. It does not change the existing refinement-driver defaults.
