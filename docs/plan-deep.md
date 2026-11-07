# Proof-aware deep plan construction

The native `plan-deep-6s` experiment searches a small layout sample through the
remaining hand and builds a shared instruction graph directly. It preserves
sound winning/loss bounds instead of expanding already settled endings into
every card sequence. This is a separate construction experiment; the website
and the older persistent-repair driver still use their existing paths.

See [the first measurements](results/plan-deep.md). A complete one-layout plan
has been constructed and independently replayed without DDS winning leaves.
The ten-layout plan is still limited by construction size.

The next [bounded-storage experiment](plan-budget.md) separates lookahead M
from stored-instruction depth, retains completed broad passes, and adds DD
challenge mining that continues past unfinished or unsupported branches.

## Instructions and proof scope

In addition to `Play`, `Observe`, and `Frontier`, the graph accepts `WinProof`
and `LossProof` leaves. A proof leaf stores its method, not a cached result:

```json
{"kind":"win_proof","proof_reason":"declarer_quick_tricks"}
```

The evaluator reruns that method in the current execution position. If it does
not prove the claimed result there, the continuation is unresolved. Reaching
the target or finishing the deal is checked before interpreting the node.

| Method | Scope and meaning |
|---|---|
| Target reached | Public score already meets the contract target |
| Target impossible | Public score plus all remaining tricks is insufficient |
| Declarer quick tricks | Known declarer/dummy cards can cash enough winners against the combined defender pool |
| Declarer claim | Existing conservative DTAC-style claim proof succeeds from the public position |
| Defender quick tricks | The concrete layout's defending hands can cash enough tricks to defeat the target; a layout-specific loss |
| DDS loss | Even perfect-information declarer cannot make in this concrete layout |

DDS winning values never become `WinProof`. Defensive quick-trick and DDS loss
results cannot stand for an unseen layout: their stored method is checked anew
in each challenger. A defender quick-trick proof uses the opposite partnership
as the cashing side and requests `remaining - declarer_needed + 1` tricks.

Public quick-trick and claim methods currently work from an empty trick with
the declaring side on lead. They remain conservative when voids or auction
constraints would permit a stronger proof. They do not infer a public void just
because every sampled layout happens to have it.

These proof leaves certify the contract outcome; they do not contain the
remaining exact card script. The existing proof routines return a first card,
not a complete contingent suffix. Playing every card after a claim endpoint
would require an additional continuation exporter or a verified execution
routine. The current experiment stops at the sound claim.

## Carrying information through a shared graph

The graph stores instructions. Execution carries the remaining hands, played
cards, current trick and leader, trump suit, score, and public path separately.
`play_card` advances those facts on every edge. On a defensive observation,
construction removes every sampled world in which that card is illegal. That
includes worlds contradicted by a failure to follow suit. Initial auction
constraints must already be reflected in the supplied legal layouts.

Three caches have different scopes:

1. Construction continuations use full exact keys containing compatible world
   IDs, each compatible current position, selected outcome, and remaining M.
2. Public proof checks use the known declaring hands, played cards, score and
   current trick. Declarer, target, trump and optimization settings are fixed
   within that builder. Complete-deck validation makes the combined defender
   pool a function of those public facts. No defensive-layout result enters
   this cache.
3. Replay reuses only exhaustively successful subtrees with the same instruction
   ID **and complete current concrete position**. Failure events, unresolved
   continuations, and interrupted traversals are not cached. A cached DDS
   horizon survivor retains its optimistic status.

Exact instruction interning remains independent of these context caches. Two
histories can share one `WinProof` instruction while only one history actually
passes its check. The regression fixture explicitly tests a defender who has
played a king versus one who still holds it: after the same declaring cards,
only the former history permits the quick-trick claim.

The sampled-world filter carries learned information for choosing plays.
The public claim routines deliberately use a broader combined-pool model,
so ignoring stronger learned constraints can miss a proof but cannot create
a false one. There is not yet a separate constraint-aware claim prover that
uses every inferred void or suit-length restriction.

## Construction and budgets

`build_deep_plan` shares one alpha-mu search context between value calculation
and reconstruction. It builds the interned graph directly, avoiding the large
intermediate pointer tree and raw-tree capture. Public proof checks run before
expanding a continuation. Layout-specific losses must be checked in every
compatible sample before construction can retain a common loss leaf.

Fixed-depth mode attempts the requested M immediately. With
`optimizations.iterative_deepening` enabled, value search retains completed
depths and uses half the total budget, reserving the remainder for construction.
An interrupted deeper iteration can therefore export the deepest completed
value's partial program. The native benchmark deliberately selects fixed M
to measure the full-depth request directly.

Defaults are 30 seconds, 100,000 interned nodes, and 250,000 expanded execution
contexts. Public proof caching is separately bounded by the context limit.
Time, node, and context exhaustion produce explicit `Frontier` instructions.
Unreachable construction fragments are removed before export. `stop_reason`
records why construction stopped.

The deadline is retained during reconstruction; it is never disabled. It is
still cooperative around indivisible DDS/claim calls and final graph cleanup.
The underlying alpha-mu transposition table retains its existing implementation
and is not covered by the new construction-context count limit.

`completed_m` records a completed value-search depth, or the requested scope
settled by a depth-independent root proof. An immediate timeout leaves it zero.
`variable_horizon` is true: a value depth is not a promise that every stored
path is complete. `selected_wins` is likewise a search value, not a replay
certificate. Only exhaustive replay to actual success or public proofs sets
`proven_contract` for a layout.

At an ordinary M horizon the branch stays unfinished. When declarer/dummy have
played their last cards, the builder completes the final defensive responses
so it does not stop before the last trick's winner is known.

## Native command and integration boundary

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-deep-6s 10 26 30 11565831 build\plan-deep-results\ten
```

Arguments are layout count, requested M, seconds, seed, and optional output
directory. M counts declarer/dummy choices. The 6S root has 24 such cards left;
M=26 is sufficient to cover the entire remaining deal. The oracle uses the
user-confirmed auction guarantee of East's singleton diamond ace.

The initial sample and 256 held-out layouts are disjoint within each run. The
actual hand is not forced into construction. The frozen graph and partition
identities are written as `plan.dag.json` and `split.csv`. CSV goes to stdout.
Strict replay checks the sample, holdout, and actual hand separately, with the
same seconds budget for each group, up to two million expanded states per
layout and 500,000 cached successful contexts. Unknowns are not passes.

The native proof graph can be evaluated, exported, and edited with the existing
tools. The persistent-repair driver has not been switched to this constructor:
its initial fixed-M assumptions and minimum-suffix-depth reuse check need to
treat a verified proof as complete before integration. No production search
behavior changes in this milestone; the only shared-core change moves the
internal deadline exception declaration so the native builder can catch it.

## Verification

Sixteen CTest suites pass. New checks cover proof storage and reason identity,
public versus layout-specific scope, rechecking one shared proof after different
histories, defender-turn construction, finishing the last defensive card,
budget and metadata boundaries, exact-context replay reuse, repeated failure
deduplication, and retention of DDS optimism. Existing tree/DAG, challenge,
repair, engine and lab checks continue to pass.
