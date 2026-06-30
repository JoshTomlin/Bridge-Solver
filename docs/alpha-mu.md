# Alpha-Mu Implementation

The implementation follows the binary-outcome alpha-mu algorithm described in
the papers in this directory. Its purpose is to avoid strategy fusion: declarer
must choose one move based on public information instead of choosing a different
move after looking at each hidden world.

## Files and Public Types

The public API is in `engine/include/bridge/alpha_mu.h`. The implementation is
split by responsibility:

- `alpha_mu_pareto.cpp`: vector and Pareto-front algebra
- `alpha_mu_state.cpp`: possible-world state, canonical keys, and equivalents
- `alpha_mu.cpp`: leaf evaluation, MAX/MIN recursion, cuts, and root iteration
- `alpha_mu_policy.cpp`: reconstruction of the selected within-trick strategy
- `alpha_mu_internal.h`: the deliberately small private interface between them

Read them in that order. The detailed switch, counter, and benchmark map is in
`docs/alpha-mu-optimizations.md`.

The types are small value types rather than class hierarchies:

```cpp
using WorldMask = std::uint64_t;

struct OutcomeVector {
    WorldMask wins;
};

struct ParetoFront {
    std::vector<OutcomeVector> vectors;
};
```

When `AlphaMuConfig::build_trick_policy` is enabled,
`AlphaMuResult::trick_policy` retains the selected Pareto strategy for
the remainder of the current trick. Declarer nodes contain one selected card;
defender nodes branch on the publicly observed card and carry the compatible
world mask. The playthrough follows this policy instead of resolving later
decisions from a newly sampled information set.

This representation supports at most 64 sampled worlds. Bit `i` in `wins` is 1
when that strategy reaches the target in world `i`, and 0 when it does not.
For four worlds, `[1011]` is stored as bits `0b1101`; formatted vectors are
printed in world-index order, not integer display order.

The bitmask is compact and makes vector comparison, minimum, and scoring single
machine-word operations. A dynamically sized bitset can replace it later if
more than 64 worlds become necessary, without changing the Pareto concepts.

## Possible Worlds

Every `AlphaMuWorld` contains a complete `Position`, including hidden defender
cards. Before search, `validate_worlds` requires all worlds to share:

- Player to act and partial trick
- Trump suit and current score
- Played cards and completed-trick count
- Declarer and dummy's remaining cards

The defender cards may differ.

The recursion also carries an `active_worlds` bitmask. These are the worlds
still compatible with the public play sequence. The active mask is not stored
inside every outcome vector because every vector in one node has the same set
of possible worlds.

## Outcome Dominance

Outcome `a` strictly dominates `b` when every world won by `b` is also won by
`a`, and `a` wins at least one additional world:

```cpp
a.wins != b.wins && (a.wins | b.wins) == a.wins
```

`add_to_pareto_front(front, candidate)` performs the complete insertion rule:

1. Reject the candidate if it is duplicated or dominated.
2. Remove every existing vector dominated by the candidate.
3. Insert the candidate.

The front therefore stores only mutually non-dominated strategies. The function
is currently linear in front size for rejection plus linear removal. This is
simple and appropriate while fronts are small.

## MAX Front Calculation

A MAX node belongs to declarer or dummy. Declarer must play the same card in all
currently possible worlds.

For each legal card, the search obtains one child Pareto front. MAX combines the
children by taking their union and Pareto-pruning it:

```cpp
ParetoFront combine_max_fronts(const std::vector<ParetoFront>& children);
```

The union is correct because every child vector represents a strategy available
to declarer. A dominated strategy can never be preferable and is removed.

`shared_declarer_moves` intersects legal-move masks across active worlds. With
valid input these masks are identical because declarer/dummy cards and the
partial trick are public. The intersection makes the no-hidden-information
requirement explicit and safe.

## MIN Front Calculation

A MIN node belongs to a defender. The algorithm assumes defenders have perfect
information, as the paper does. A defender card may therefore be available in
only some worlds.

For two defender alternatives, every strategy from one child must be paired
with every strategy from the other child. The result in each world is the
minimum, which for binary values is bitwise AND:

```cpp
result.wins = left.wins & right.wins;
```

`combine_min_fronts(left, right)` calculates this Cartesian product and
Pareto-prunes the results.

`evaluate_min_node` obtains the union of defender cards across active worlds.
For each card it calculates `legal_worlds`, recurses only through those worlds,
and marks all other active worlds as neutral 1 bits before intersection. This is
important: a move that is impossible in world 3 must not turn world 3 into a
loss when that move's child is combined with other defender choices.

Observing the defender's card narrows the active-world mask. Subsequent MAX
decisions may use that public information, but cannot use the hidden identity of
worlds that remain indistinguishable.

## Recursive Algorithm

`alpha_mu_node` has five conceptual steps:

1. Return an empty outcome for an empty active-world set.
2. At a terminal state or when `M == 0`, evaluate every active world with DDS.
3. Verify that all active worlds agree on the player to act.
4. Dispatch declarer/dummy positions to `evaluate_max_node`.
5. Dispatch defender positions to `evaluate_min_node`.

The leaf returns one outcome vector. For each active world it adds tricks already
won to the future tricks reported by DDS, then compares the total with
`target_tricks`.

## What Depth M Means

`AlphaMuConfig::max_declarer_plies` is the paper's parameter `M`: the number of
MAX-side card choices to search before using DDS.

- A declarer or dummy card decrements `M`.
- A defender card does not decrement `M`.
- `M=0` evaluates the current position immediately with DDS.
- `M=1` is the paper's PIMC baseline.

It does not mean a number of completed tricks. Depending on whose turn it is,
the leaf can be in the middle of a trick; DDS accepts partial tricks. The name is
kept for API compatibility, but `max_moves_left` is used inside the recursion.

## Selecting the Root Move

Each sampled world currently has equal weight. The score of an outcome is its
number of 1 bits. `winning_world_count` and `best_winning_world_count` expose
this calculation. The root chooses the move whose front contains the
highest-scoring vector. Equal scores use deterministic card order.

Weighted worlds would require replacing popcount with a sum of world weights;
the Pareto dominance rule itself would remain valid for positive weights.

## Correctness Invariants

The implementation and tests enforce these invariants:

- Declarer/dummy holdings are identical across worlds.
- A MAX move is applied identically to every active world.
- A MIN move retains only worlds where that card is legal.
- Impossible worlds are neutral during MIN intersection.
- Duplicate and dominated outcomes never remain in a Pareto front.
- DDS leaves are converted to declarer's perspective even when a defender is
  currently on lead.

Focused tests for front insertion, MAX union, MIN Cartesian intersection,
two-way guesses, discovery plays, and the four-world example are in
`engine/tests/engine_tests.cpp`.

## Search Optimizations

All current shortcuts are exact: turning one on may remove work but must not
change the winning-world score. They are collected in
`AlphaMuConfig::optimizations`; `disabled_alpha_mu_optimizations()` selects the
plain recurrence used as the correctness reference.

`AlphaMuSearchStats` reports tree-search time, policy-reconstruction time, node
and DDS counts, table activity, and a separate counter for each kind of cut or
equivalent branch. `collect_audit_log` records the concrete shortcuts taken in
one run. See `docs/alpha-mu-optimizations.md` for the complete code map,
dependencies, CLI commands, and extension checklist.

## Interactive Example 2 Playthrough

The CLI can play the 6NT example from `docs/Example Hands.txt` card by card:

```powershell
.\build\engine\Release\bridge_engine_cli.exe --alpha-mu-playthrough
```

Press Enter after each card. Add `--auto` to run without pauses. The simulator:

1. Generates one reproducible hidden East/West deal.
2. Makes a random non-spade opening lead from West.
3. Samples 64 worlds at the first declarer or dummy decision in each trick.
4. Selects and follows one contingent alpha-mu strategy until that trick ends.
5. Conditions each defender branch on the worlds where the observed card exists.
6. Resamples for the next trick using observed cards, remaining hand sizes, and
   proven voids.
7. Prints the sampled location of `SQ` and every alpha-mu move evaluation.
8. Uses DDS on the hidden true deal for defender decisions, excluding spade
   leads and discards when another legal suit is available, then breaking equal
   DDS choices toward the lowest rank.
9. Reveals the true deal only after the hand is complete.

With the documented target of 12 tricks, losing one trick to `SQ` still makes
6NT because declarer has nine side-suit winners and three remaining spade
tricks. Therefore alpha-mu has no reason to delay the spade play. To make the
two-way guess consequential, ask alpha-mu to target all 13 tricks:

```powershell
.\build\engine\Release\bridge_engine_cli.exe --alpha-mu-playthrough --target-13
```

Options can be combined, for example `--auto --target-13`. Defender card-choice
likelihood is not yet a sampling weight: previous defender plays constrain the
posterior only through the played cards and any failure to follow suit.

Add `--depth-3` to search three MAX decisions instead of the default `M=2`.
Add `--depth-4` to search four MAX decisions.
Use `--max-depth N` for another ceiling and `--time-limit SECONDS` for the
soft per-search budget. The playthrough default is 5 seconds. Every started M
finishes; growth measured over the previous iterations is used to avoid
starting a deeper M unlikely to fit in the remaining budget.
Add `--batch-10` to run ten reproducible random hidden layouts without pauses.
Add `--seed N` to replay one exact hidden layout without pauses.
