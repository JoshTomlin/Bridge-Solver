# Alpha-Mu Optimization Guide

This is the audit map for the alpha-mu implementation. It answers four
questions for every optimization:

1. What work does it avoid?
2. Why is that safe?
3. Where is it implemented?
4. How can it be disabled, measured, and regression-tested?

The core algorithm is described separately in `docs/alpha-mu.md`. Bridge card,
trick, and position mechanics are in `docs/bridge-mechanics.md`.

The five optimizations proposed in Cazenave, Legras, and Ventos,
*Optimizing alpha-mu* (`docs/Optimising Alpha-Mu.pdf`) are implemented here:
useful worlds, world cuts, empty entries, alpha cuts, and cut on win. The
paper's leaf parallelization is implemented through DDS's batched-board API.
The older paper's early and root cuts were already present.

## Code Reading Order

1. `engine/include/bridge/card.h` and `engine/src/card.cpp`: one-hot cards and
   hand bitmasks.
2. `engine/include/bridge/game.h` and `engine/src/game.cpp`: legal plays, trick
   winners, and the single `play_card` state transition.
3. `engine/src/alpha_mu_pareto.cpp`: binary outcome dominance and MAX/MIN front
   algebra. This file contains no bridge search.
4. `engine/src/alpha_mu_state.cpp`: active-world masks, move ordering,
   equivalent-card representatives, and exact/canonical transposition keys.
5. `engine/src/alpha_mu.cpp`: DDS leaves, `evaluate_max_node`,
   `evaluate_min_node`, `alpha_mu_node`, and iterative root search.
6. `engine/src/alpha_mu_policy.cpp`: reconstructs one selected strategy for the
   rest of the current trick.
7. `engine/src/analysis_session.cpp`: samples worlds and invokes the search.
8. `engine/src/interactive_cli.cpp`: user controls, audit display, and A/B
   benchmark display.

The search uses plain structs and free functions intentionally. These states are
small values copied through a recursive algorithm; classes and virtual methods
would hide transitions without making them faster. A class is warranted later
only where it enforces a real invariant.

`kMaxDeclarerPlies` is 26 because declarer and dummy make at most 13 plays each.
The transposition table stores depth slots 0 through 26. A five-second adaptive
search will rarely reach that ceiling in a full deal, but short endings can now
be searched all the way to completion.

## Reference Search

Every shortcut is in `AlphaMuOptimizations`. To run the recurrence without any
optimization:

```cpp
AlphaMuConfig config;
config.optimizations = disabled_alpha_mu_optimizations();
```

The test `test_alpha_mu_optimizations_match_reference_search` compares the
optimized result with this mode. Reference mode is deliberately slow and is
intended for short endings and regression tests.

## Optimization Map

| CLI name | Configuration member | Main implementation | Why it is safe | Primary measurement |
|---|---|---|---|---|
| `iterative` | `iterative_deepening` | `run_search` | Earlier depths provide move ordering and valid upper bounds; measured iteration growth avoids starting an M unlikely to fit the soft budget | `completed_iterations`, `completed_depth`, iteration timing |
| `tt` | `transposition_table` | `alpha_mu_node`, `search_root_iteration` | An exact front is reused only for the same state and M | `transposition_probes`, `hits`, `stores` |
| `canonical-tt` | `canonical_transposition_keys` | `make_node_key` | Absolute rank gaps do not matter once those cards are gone; relative remaining ownership is preserved | Compare TT hits and nodes in A/B benchmark |
| `max-equals` | `max_equivalent_cards` | `representative_cards` | Cards are grouped only when no live intervening rank or current trick status can distinguish them | `max_equivalent_moves_skipped` |
| `min-equals` | `min_equivalent_successors` | `evaluate_min_node` | Defender cards merge only when legal in the same worlds and the resulting public states have equal keys | `min_equivalent_moves_skipped` |
| `early-cut` | `early_cut` | `alpha_mu_node` | A shallower MIN front is an optimistic bound; a bound already covered by MAX alpha cannot improve the result | `early_cuts` |
| `useful-worlds` | `useful_worlds` | `alpha_mu_node`, `evaluate_min_node` | Once every vector is zero in a world at MIN, further defender choices can never restore that bit | `useful_worlds_removed` |
| `world-cuts` | `world_cuts` | `evaluate_world_cut` | Zero useful worlds return the zero vector; one useful world is an ordinary perfect-information DDS problem | `world_cuts`, split into zero/one counters |
| `empty-entry` | `empty_entry` | `alpha_mu_node` | A missing shallower MIN entry is calculated exactly before it is used as an optimistic early-cut bound | `empty_entry_searches` |
| `deep-alpha` | `deep_alpha_cut` | `evaluate_min_node`, `front_is_covered_by_alpha` | A partial MIN front can only stay equal or worsen; if any upper MAX front already covers it, that branch cannot affect the root front | `deep_alpha_cuts` |
| `root-cut` | `root_cut` | `search_root_iteration` | The previous iteration's root score is an upper bound; reaching it proves the current best score | `root_cuts` |
| `win-cut` | `win_cut` | `evaluate_max_node`, `search_root_iteration` | A binary vector winning every active world cannot be improved | `win_cuts` |
| `forced-trump` | `forced_trump_run` | `evaluate_forced_trump_run` | With only trumps in the MAX leader and no opposing trumps, every remaining trick is proven | `forced_trump_run_cuts` |
| `leaf-dds-batch` | `leaf_dds_batch` | `evaluate_leaf`, `double_dummy_future_tricks_batch` | DDS solves the same independent world positions; only their scheduling changes | `leaf_dds_batches`, `leaf_dds_worlds` |

`equivalent_moves_skipped` is the sum of the MAX and MIN equivalent counters.
`tree_search_ms` times root iteration; `policy_build_ms` separately times the
optional retained-trick-policy reconstruction.

Policy reconstruction reuses the search's transposition table. It requests the
same exact fronts in order to recover one concrete contingent strategy, so a
fresh table would needlessly repeat the completed search depth.

## Active And Useful Worlds

`WorldMask` is a 64-bit integer, so membership tests, union, intersection, and
world removal are single machine operations. The recursive search carries two
masks with deliberately different meanings:

- `active_worlds` are still compatible with the publicly observed defender
  cards. At a MIN move this becomes the worlds where that card is legal.
- `useful_worlds` are active worlds whose result can still affect the returned
  front. It is always a subset of `active_worlds`.

`worlds_with_possible_win(front)` ORs the vectors in a front. At a MIN node,
any world absent from that union is already zero in every available strategy.
More defender replies only intersect vectors, so a zero can never become one;
`evaluate_min_node` safely removes that world from `current_useful`.

The distinction matters when combining a defender move. A currently useful
world in which the move is impossible is the paper's `x`, not a loss. The code
temporarily sets that bit to one before `combine_min_fronts` intersects the
branch. A world already declared useless remains zero. This is why one mask
cannot safely represent both concepts.

Both masks are part of `make_node_key`. The same bridge position with a
different information set or a different set of proven losses is a different
dynamic-programming problem. Leaves call DDS only for useful worlds.

## Paper Cuts In Code

### Useful Worlds And World Cuts

Useful worlds are removed in two places:

1. At entry to a MIN node, a shallower cached front is an optimistic bound for
   the deeper search. Worlds already zero in every vector of that bound cannot
   recover at greater `M`.
2. After each defender move, the partial MIN front may prove more worlds lost.

`evaluate_world_cut` then handles the paper's two terminal cases. With no
useful worlds it returns `[0 ... 0]`. With one useful world, imperfect
information has disappeared, so one DDS call gives that world's exact bit and
all other bits remain zero.

### Early And Empty-Entry Cuts

`shallow_cached_node` returns the deepest exact transposition entry below the
requested `M`. At MIN this is optimistic for MAX: searching more MAX choices
exposes more strategy-fusion constraints and cannot improve the result. If
`front_is_covered_by_alpha` says the upper MAX front already dominates that
bound, `alpha_mu_node` returns immediately.

Iterative root cuts can leave a newly visited interior node with no shallow
entry. The Empty Entry optimization performs one exact `M-1` search to create
that bound, then immediately attempts the early cut. It runs only at a MIN node
with a real upper MAX bound; eagerly filling every missing table slot is valid
but wastes more work than it saves.

### Deep Alpha Cut

`AlphaBounds` is the explicit version of walking parent pointers in Algorithm
1 of the paper. Before MAX searches another card, it appends its current Pareto
front. Descendants retain all such upper MAX fronts.

After every defender branch, `evaluate_min_node` compares its partial front
against every upper bound. MIN can only intersect more outcomes, so a covered
front can never become relevant to that ancestor. `front_is_covered_by_alpha`
also restores the paper's `x` semantics: a world that became impossible below
the ancestor is treated optimistically as one for the comparison, while a
world already proved useless remains zero.

A cut result is marked `NodeEvaluation::pruned`. Pruned fronts are control-flow
bounds, not exact node values, so `alpha_mu_node` does not store them as exact
transposition entries.

### Cut On Win

At MAX, `front_wins_all_worlds` detects a vector containing every useful world.
No binary vector can improve on all ones, so remaining cards are skipped. The
root applies the same proof over all sampled worlds.

### Batched DDS Leaves

`evaluate_leaf` first collects every nonterminal useful world. With
`leaf-dds-batch` enabled it calls `double_dummy_future_tricks_batch`, which
converts them to DDS `boards` and invokes `SolveAllBoardsBin`. Native DDS can
schedule those independent boards across its worker threads. The WebAssembly
build uses the same batch API in DDS's single-thread configuration, preserving
identical results without requiring cross-origin isolation.

Batching changes neither the positions nor the returned bits. The scalar path
remains available as a correctness reference and for measurement.

## Dependencies

Some switches remain independently controllable but need another feature to do
useful work:

- `canonical-tt` affects table reuse only while `tt` is on. It also controls
  normalization used by `min-equals`.
- `early-cut` needs `tt` and a shallower cached result, normally produced by
  `iterative`.
- `useful-worlds` can shrink a partial MIN front by itself; its entry-time
  reduction additionally benefits from `tt` and shallower entries.
- `world-cuts` is independent, but useful-world removal creates most of its
  zero/one-world opportunities.
- `empty-entry` needs `tt`, a MIN node, and an upper MAX front. Its purpose is
  to create an entry for `early-cut`.
- `deep-alpha` does not need the table; it uses partial MIN fronts and the
  explicit `AlphaBounds` stack.
- `root-cut` needs a previous root iteration, so it is inert without
  `iterative`.
- `max-equals`, `min-equals`, `win-cut`, `forced-trump`, and `leaf-dds-batch`
  are independent of the table.

An inert optimization has a zero counter. Disabling a dependency never changes
the recurrence; it only removes the opportunity for the dependent shortcut.

## Interactive Controls

Start the position lab:

```powershell
.\build\engine\Release\bridge_engine_cli.exe --interactive
```

Inside the lab:

```text
optimizations
set opt max-equals off
set opt win-cut on
set audit on
analyze
benchmark max-equals
```

`benchmark NAME` samples one set of worlds, then searches those exact worlds
with that optimization off and on. All other settings are unchanged. It reports
runtime, nodes, DDS worlds, TT hits, equivalent branches, the selected
optimization's event counter, score, and move.
Policy reconstruction is disabled for this benchmark so the timing isolates the
tree search.

The displayed speed ratio is `off time / on time`; greater than 1 means the
optimization was faster in that run. Small searches are noisy, and DDS or CPU
cache warming can affect a single measurement. Use a fixed seed and repeat
meaningful benchmarks before drawing conclusions. `Score check: match` is the
important correctness guard. Equivalent cards may produce different literal
card names while representing the same play.

## Audit Log

`AlphaMuConfig::collect_audit_log` is off by default because deep searches may
produce large logs. When enabled, `AlphaMuResult::audit_log` contains events
such as:

```text
[iteration] starting M=2
[max-equals] kept SA from SA SK
  [tt] reused exact depth-1 front
  [early-cut] shallower MIN upper bound is covered by MAX alpha
[useful-worlds] removed 3 world(s) proved lost by the current MIN front
[world-cut] one useful world remains; solved it directly with DDS
[deep-alpha] current MIN front is covered by an ancestor MAX front
[win-cut] root move SA wins every sampled world
```

The full recursive vector calculation remains available through
`alpha_mu_debug_tree`. The debug tree explains MAX/MIN fronts; the audit log
explains only avoided work.

Measured stress runs and the same-seed 7NT before/after comparison are recorded
in `docs/alpha-mu-second-paper-results.md`.

## Adding an Optimization

Use this checklist so a new shortcut remains visible and removable:

1. Add one value to `AlphaMuOptimization` and one boolean to
   `AlphaMuOptimizations` in `alpha_mu.h`.
2. Add its stable CLI name to `to_string`, parsing, getter, setter, and the CLI
   list in `alpha_mu_state.cpp` and `interactive_cli.cpp`.
3. Put the implementation in the narrowest layer: Pareto algebra, state
   normalization, search, or policy. Do not mix it into bridge rules.
4. Gate the avoided work with that one boolean. The false branch must retain
   the reference recurrence.
5. Add a dedicated statistic and an `audit_line` at the point work is skipped.
6. Add a focused test proving the counter is nonzero when enabled, zero when
   disabled, and that the winning-world score matches reference mode.
7. Add the switch, dependency, safety argument, and measurement to the table
   above.
8. Run a same-world CLI benchmark before deciding the optimization is valuable.

## Remaining Optimization Space

The main paper optimizations are now represented. Future work includes
incremental make/unmake state instead of copying all worlds at every edge,
compact or small-vector Pareto storage, transposition-table memory limits and
replacement policy, and profiling whether DDS batches should be split by size.
None should be added without an independent switch, counter, reference-result
test, and same-world benchmark.
