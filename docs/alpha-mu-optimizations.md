# Alpha-Mu Optimization Guide

This is the audit map for the alpha-mu implementation. It answers four
questions for every optimization:

1. What work does it avoid?
2. Why is that safe?
3. Where is it implemented?
4. How can it be disabled, measured, and regression-tested?

The core algorithm is described separately in `docs/alpha-mu.md`. Bridge card,
trick, and position mechanics are in `docs/bridge-mechanics.md`.

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
| `root-cut` | `root_cut` | `search_root_iteration` | The previous iteration's root score is an upper bound; reaching it proves the current best score | `root_cuts` |
| `win-cut` | `win_cut` | `evaluate_max_node`, `search_root_iteration` | A binary vector winning every active world cannot be improved | `win_cuts` |
| `forced-trump` | `forced_trump_run` | `evaluate_forced_trump_run` | With only trumps in the MAX leader and no opposing trumps, every remaining trick is proven | `forced_trump_run_cuts` |

`equivalent_moves_skipped` is the sum of the MAX and MIN equivalent counters.
`tree_search_ms` times root iteration; `policy_build_ms` separately times the
optional retained-trick-policy reconstruction.

Policy reconstruction reuses the search's transposition table. It requests the
same exact fronts in order to recover one concrete contingent strategy, so a
fresh table would needlessly repeat the completed search depth.

## Dependencies

Some switches remain independently controllable but need another feature to do
useful work:

- `canonical-tt` affects table reuse only while `tt` is on. It also controls
  normalization used by `min-equals`.
- `early-cut` needs `tt` and a shallower cached result, normally produced by
  `iterative`.
- `root-cut` needs a previous root iteration, so it is inert without
  `iterative`.
- `max-equals`, `min-equals`, `win-cut`, and `forced-trump` are independent of
  the table.

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
runtime, nodes, DDS worlds, TT hits, equivalent branches, score, and move.
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
[win-cut] root move SA wins every sampled world
```

The full recursive vector calculation remains available through
`alpha_mu_debug_tree`. The debug tree explains MAX/MIN fronts; the audit log
explains only avoided work.

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

## Not Yet Implemented

The current structure leaves explicit room for useful-world and zero/one-world
cuts, deeper alpha bounds, incremental world state instead of whole-vector
copies, parallel DDS leaf evaluation, and alternative Pareto-front storage.
None should be added without an independent switch, counter, reference-result
test, and same-world benchmark.
