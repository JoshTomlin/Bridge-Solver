# DD-Safe Competent Defence

The competent defender is used by browser full-play runs and the current
AlphaMu2 report playthrough. It is implemented in `engine/src/defender.cpp` and
exposed by `AnalysisSession::defender_move` and the WebAssembly `defenderMove`
binding.

The full-play defender uses DDS as a strict primary objective. It never chooses
a card that gives declarer more double-dummy tricks than the best legal defence.
When several cards have the same DD result, it ranks those cards as follows:

1. A card that defeats the retained alpha-mu policy on the true layout.
2. A card that creates an observation the retained policy does not support.
3. A card whose policy branch succeeds in a smaller proportion of sampled
   worlds.
4. A card that better preserves honours, guarded honours, trump, and suits in
   the configured hold order.
5. A seeded deterministic choice between otherwise equivalent cards.

This is an adversarial training defender rather than a model of a defender's
real information. It may inspect the true layout and the current declarer
policy, but it cannot sacrifice the optimal DD result to exploit that
information.

The browser records the selected reason and every candidate's diagnostics with
each defender play. The retained `ddsMove` binding remains available for
comparison, while full play uses `defenderMove` by default.

## Relationship to Alpha-Mu

Inside alpha-mu, defender nodes are adversarial MIN nodes with perfect
information in each possible world. The competent defender serves a different
purpose: it chooses one card on the source-of-truth deal while a full hand is
being played. Its policy-aware tie-break tries to expose weak declarer plans,
but DDS prevents it from choosing a technically inferior defence merely to be
awkward.

The native interactive CLI's simple `bot` command and older recorded
playthroughs still use the plain DDS defender. This keeps those historical
comparisons reproducible.

## Current Limitations

- Before the first declarer analysis there is no retained policy, so opening
  leads fall back to DD plus resource preservation.
- Resource preservation is deliberately conservative and is not yet a full
  model of unblock, count, attitude, or suit-preference agreements.
- The policy score uses the active sampled worlds rather than rebuilding a
  defender-specific information set.
- The final tie-break is reproducible, not a game-theoretic mixed strategy.

## Regression Coverage

The native tests include an equal-DD honour discard, an unsupported policy
observation that overrides the simple discard preference, and a matrix of
full-deal defender positions and strains that asserts the chosen card remains
DD-optimal.
