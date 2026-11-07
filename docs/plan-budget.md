# Separate search depth from instruction storage

The native budget experiment keeps alpha-mu's deep lookahead while limiting how
much of its chosen policy is materialized. It also tests unfinished plans with
DDS without treating DDS success as a complete single-dummy plan.

This is an opt-in extension of [deep plan construction](plan-deep.md). The
website, production engine, and persistent-repair driver retain their existing
paths.

See the [budget and counterexample results](results/plan-budget.md). The broad
prefix baseline reached M=6, while deeper partial plans exposed a losing
discard at choice eight.

## Two depths and broad coverage

`PlanDeepOptions::max_stored_declarer_plies` is optional. When omitted, the
original depth-first constructor is used. When present, construction attempts
complete storage-depth passes from zero through the requested bound. Only a
completed pass replaces the exported root. If a later pass hits the cumulative
time, node, or context limit, the preceding completed pass is retained.

The alpha-mu search horizon remains independent. With search M=26 and storage
M=8, a declaring move after five earlier declaring choices is selected using
21 remaining search choices, while at most three further choices are stored.
Both residual depths are part of the exact construction-context key. The
current positions, compatible worlds, and selected outcome remain in that key.

Every legal sampled defensive observation is included before a storage
frontier. Worlds are filtered by legality and the observed play history, not
by whether a defence was DD-optimal. Public proofs are checked before the
storage horizon; final defensive cards are still resolved when no declaring
cards remain. Otherwise the storage limit can stop before the defence after
the last stored declaring choice.

The progressive approach intentionally repeats some work. Caches, contexts,
interned nodes, and deadlines remain cumulative across passes. Unpublished
fragments are removed from the exported graph, but their construction cost is
still charged. A completed storage pass is broad coverage on the training
sample, not a contract proof or coverage of every unseen layout.

Result fields distinguish:

- `graph.completed_m`: completed value-search depth.
- `completed_storage_plies`: last fully completed storage pass.
- `storage_horizon_complete`: whether the requested storage bound was reached.
- `storage_passes`: completed passes, including the zero-depth baseline.
- `min_frontier_m`: shortest declaring-choice depth to an unfinished leaf;
  -1 means there is no structural frontier, not that proof methods have been
  successfully rechecked on unseen layouts.
- `first_responses` and `continued_responses`: edges at the first defensive
  observation, and how many lead to something other than immediate Frontier.

The storage fields are zero/false for the original opt-out constructor.

## DD challenge mining

`PlanEvaluationOptions::mine_partial_plan=true` requires DDS frontier mode.
It continues through other defensive branches after a coverage gap or rejected
public proof. It never supplies or substitutes a declarer instruction.

At an existing frontier, or just after an unsupported defensive observation,
DDS answers whether the concrete current layout is still makeable. A loss
refutes that played prefix if the root layout was makeable. A success is an
optimistic continuation bound, not evidence that one common continuation
works across indistinguishable layouts.

Coverage gaps and DD losses have separate event counts and witness lists.
`max_partial_witnesses` limits storage of gap and DD-feasible witnesses, not
traversal; a gap flood cannot consume the loss-witness budget. Node, time, and
loss-witness limits still bound the evaluation. A rejected proof is checked
with DDS and retains its origin in the witness.

Event counts describe expanded execution contexts. Cached successful contexts
are not counted repeatedly. `complete` means the bounded replay finished;
`survives_horizon` additionally requires no losses or missing responses;
`proven_contract` additionally requires actual success or public proofs on
every branch, with no successful DDS leaves. An incomplete replay can still
contain a valid losing witness.

Strict replay defaults are unchanged. Existing callers still stop at their
configured first unresolved frontier or failure unless they opt into mining.

## Reproducible command

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-budget-6s 10 26 12 500000 30 11565831 build\plan-budget-example 1000000
```

Arguments are worlds, search M, storage M, context cap, construction seconds,
seed, output directory, optional instruction-node cap (default 1,000,000), and
optional mining seconds per layout (default 0.1). Storage M=-1 selects the
original depth-first constructor, allowing a controlled memory comparison.
The original `plan-deep-6s` command remains available.

The command freezes the graph before checking the same ten training layouts,
the next 256 disjoint holdout layouts, and the actual deal. The oracle retains
the auction guarantee that East's diamond ace is singleton. The graph is never
repaired or changed using holdout findings in this experiment.

Strict replay has the construction-seconds setting as a separate budget for
each group. DD mining by default gives every layout the same 0.1-second, 20,000-node
budget, with eight loss witnesses and eight witnesses of each partial kind.
These are cooperative limits around indivisible DDS/proof calls. The full
command can therefore take longer than the construction-seconds setting.

Outputs are `plan.dag.json`, `split.csv`, `mining.csv`, and `witnesses.csv`, with
the aggregate CSV on stdout. Mining rows keep completeness, losses, gaps, and
partial success independent rather than choosing a first-event label. Gap
witness positions in the CSV are advanced through the observed defensive card
and agree with their full path. Illegal-instruction witnesses describe the
position before the attempted illegal card. Loss diagnosis is disabled in this
benchmark, so a DD-loss witness records the failing endpoint.

`benchmark-plan-budget.ps1` runs storage M=8,12,16 crossed with context caps
250k,500k,1m. All cells use the same layouts, seed, 30-second construction
budget, and 1m-node cap. Each cell runs in a fresh process. The script preserves
per-cell outputs, a combined `matrix.csv`, and graph/partition SHA-256 hashes.

On Windows, peak process working set and peak committed memory are sampled
before construction and immediately after it, before replay. These include
DDS and oracle setup as well as construction; they are not isolated graph or
cache byte counts. Other platforms currently report zero for these unsupported
measurements. `program_bytes` separately measures the stored node/edge payload.

Additional profiling columns measure cumulative builder terminal-check time
(`terminal_ms`) and alpha-mu value-probe time (`value_probe_ms`, including the
root search and reconstruction). They are non-overlapping. `search_claim_ms`
is a subset of the value probes spent in alpha-mu's existing claim heuristic;
it must not be added to the other timers. Budget exhaustion can occur inside
one of these probes, and the timers still include the interrupted call.

## Verification

Regression tests check that short storage preserves deep-search choices,
includes all sampled first responses, retains the preceding complete pass
under a context cap, checks public proofs before a zero-depth frontier, and
finishes the final defensive card. Mining tests verify that a first gap or
rejected proof cannot hide a later DD loss, witness caps do not change outcome
counts, current positions and origins are retained, and DDS success never
becomes a full-contract certificate.
