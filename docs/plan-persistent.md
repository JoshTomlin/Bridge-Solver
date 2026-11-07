# Persistent plan repair and deepening

This native experiment keeps a concrete saved plan between challenge batches.
It starts with ten layouts, builds six declarer/dummy choices deep, and spends
later work on specific failing histories and unfinished continuations. The
website, WebAssembly build, and production AlphaMu2 path are unchanged.

The subsequent [proof-aware deep constructor](plan-deep.md) addresses the
short-horizon limitation in a separate native command. It is not yet the
constructor used by this persistent loop.

The first measurements are in [the experiment report](results/plan-persistent.md).
They demonstrate working local edits, but do not establish a speed or coverage
advantage over rebuilding, or a full solution of the 6S problem.

## What is stored

The executable program is the existing [shared instruction graph](plan-trees.md):

- `Play(player, card, next)` prescribes one exact declarer/dummy card.
- `Observe(player, card -> next)` branches on exact public defender cards.
- `Frontier` marks the end of the constructed continuation.

Equal instruction subtrees share storage. An execution occurrence is identified
by its entire public card history, not just its shared node ID. The remaining
hands, trick, score, and compatible layouts belong to execution and validation
evidence; they are not hidden conditions in the executable plan.

`patch_plan_occurrence(graph, prefix, replacement)` copies the selected path's
ancestors and imports other instructions unchanged. It then interns identical
instructions again. A final missing observation may be added by the same API.
`plan_continuation(graph, node)` extracts a compact reachable suffix.

Editing one occurrence therefore does not silently edit every history reaching
a shared node. The original graph remains available for comparison. Edited
graphs have `variable_horizon: true`; `completed_m` retains the initial search
depth and is not a claim that every edited branch ends at that depth.

## Repair decisions

The repair API first replays the affected public history through every archived
root layout. It retains only layouts in which that history is legal, with the
failing layout first. All declarer decisions are common to these compatible
layouts until a further public observation distinguishes them.

For a missing observation, it tries existing sibling continuations. Reuse is
accepted only after the candidate survives all legal defensive responses in
every compatible archived layout through its stored horizon. A bare frontier
cannot fill an observation gap, and reuse must preserve the initial depth.
At most half the attempt budget is spent trying copied continuations, so failed
copies leave room for fresh search.

If reuse fails, local alpha-mu search begins at that public history. It starts
with up to ten compatible layouts. A failure found by archive validation is
added to the local search sample, up to sixteen layouts by default. If the
continuation cannot repair a demonstrated loss, the repair can move back to an
earlier declarer decision. Search at defender turns first constructs the union
of legal exact observations, filtering compatible layouts on each branch,
before invoking alpha-mu at the next declarer turn.

An accepted candidate must pass every compatible archived layout at the
affected occurrence. Other histories retain their instructions. The local
search depth is at least the old suffix's greatest declarer depth and the
remaining initial depth, subject to a default ceiling of six. Repairs needing
more depth are left pending; a shortened suffix cannot masquerade as a repair.

`extend_plan_frontier` uses the same construction and validation machinery to
add three more declarer/dummy choices at one unfinished occurrence. A failed
extension remains unfinished. It does not force an earlier choice to change.
Repair and extension return an unchanged graph when rejected or budgeted out.

## Three meanings of an ending

`evaluate_plan_dag` supports three frontier modes:

| Mode | Meaning at a frontier |
|---|---|
| `Dds` | DDS says this particular layout is still makeable; optimistic horizon survival |
| `ReportUnresolved` | Record the public history as unfinished, without consulting DDS |
| `PublicClaim` | Try the existing conservative combined-defender-pool claim proof; otherwise record unfinished |

Reaching the target number of tricks succeeds before any frontier check.
`proven_contract` requires every legal defensive path to reach the target or a
sound public claim. A DDS-only frontier, a missing branch, an unfinished
frontier, or a stopped traversal cannot produce that flag. The flag applies
to the evaluated root layout; a universal guarantee still requires exhaustive
coverage of the whole legal information set.

The persistent lab's strict check uses `ReportUnresolved`, not `PublicClaim`.
Its `strict_unresolved` count means the traversal encountered an unfinished
path before a failure; another defensive path may still fail. It is not a
count of fully covered layouts.

## Native experiment

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-persist-6s 6 101 2 256 30 build\plan-persistent-results\seed-101
```

Arguments are initial M, seed, rounds, batch size, per-stage seconds, and
optional output directory. Defaults are `6 11565831 2 256 30`.

The 6S oracle uses the user's confirmed auction guarantee that East's diamond
ace is singleton. Its 12,376 legal layouts are shuffled into ten initial
layouts, 256 reserved test layouts, and the challenger pool. Every oracle
layout is initially DD-makeable.

Each round draws a mixed batch of unused challengers, screens their root DD
feasibility, and archives all makeable draws. Thus two batches of 256 retain
522 layouts including the original ten. Up to eight varied failing layouts
are selected for local repairs. Their failures are refreshed after each edit,
because node IDs and failing paths may have changed. One frontier-extension
attempt per round reserves some effort for depth while breadth work continues.

The full-rebuild control searches the initial ten plus the same selected
layouts at the original M. Added challenges have zero probability weight and
are marked critical; they do not become extra statistical samples. Local
search also has to validate against the larger archive before acceptance.
This is a practical comparison with different validation requirements, not an
equal-work ablation of production AlphaMu2.

All plans are frozen before the reserved layouts are evaluated. Test layouts
are never supplied to candidate drawing, repair, or the full-rebuild control.

CSV summary goes to stdout and progress to stderr. The output directory holds:

- `initial.dag.json`, `local_round_N.dag.json`, and `full_rebuild_control.dag.json`.
- `repairs.csv`: each attempted repair/extension, acceptance, reuse, search and
  validation work, and the accepted occurrence's public history.
- `split.csv`: exact partition identities by East hand mask.
- `archive.csv`: retained root layouts, source, and archive/pool indices.

Matching output files are overwritten on a repeated run. `work_ms` is the
individual stage's elapsed work, not a cumulative total. Local rounds include
challenger drawing, DD screening, selection, repair, and extension. Control
timing covers only its rebuild and excludes the shared challenge-mining cost.

## Costs and limits

Graph editing traverses instructions, not the expanded occurrence tree. Its
storage is proportional to the original graph plus the replacement and copied
ancestors; ordered full-key interning adds lookup cost. Replay validation can
still expand many defensive histories even when their instructions share
storage. It is deliberately not cached by node ID alone.

The eight-attempt default, sixteen-layout local search cap, six-choice local
depth ceiling, and five-second per-repair lab slice bound individual work.
Budgets are cooperative: DDS calls, graph capture, and existing alpha-mu policy
reconstruction can overrun a deadline. Reconstruction is still outside the
underlying search deadline. The stage seconds argument is not a hard process
wall-clock limit.

The archive protects already inspected compatible layouts. It cannot establish
correctness in unseen layouts. Likewise, fixing one observed failure does not
establish that the entire failing layout now passes: it may contain many other
missing defensive responses. Distinguishing these two units of progress is
central to interpreting the measurements.

## Verification

`bridge_plan_repair_tests` checks shared-sibling isolation, immutable source
graphs, missing-edge grafting, compact extraction, malformed paths, proof
boundaries, validated sibling reuse, reserved fresh-search attempts, backtracking
after a losing choice, defender-start extension, archive checks, and expired
budgets. A native CLI smoke test runs the whole persistent loop. All thirteen
CTest suites passed after the repair-budget fix.
