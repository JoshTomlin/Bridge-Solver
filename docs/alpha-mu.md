# Alpha-Mu Implementation

The implementation follows the binary-outcome alpha-mu algorithm described in
the papers in this directory. Its purpose is to avoid strategy fusion: declarer
must choose one move based on public information instead of choosing a different
move after looking at each hidden world.

## Files and Public Types

The public API is in `engine/include/bridge/alpha_mu.h`; the recursion is in
`engine/src/alpha_mu.cpp`.

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

## Performance and Future Optimizations

The representation is already compact, but the current recursion favors clarity
over advanced optimization. The main costs are:

- Copying all worlds once per branch
- DDS calls at leaves
- Cartesian growth at MIN nodes
- Linear Pareto-front insertion

Useful optimizations can be added behind the current interfaces:

1. Equivalent-card move reduction
2. Transposition tables keyed by public state, active worlds, and M
3. Early cuts and root cuts from the papers
4. Incremental world storage instead of copying every world
5. Cached DDS leaf evaluations
6. Faster Pareto structures if measured fronts become large

These should be benchmarked individually. The current separated functions make
each optimization local and preserve a readable reference implementation.
