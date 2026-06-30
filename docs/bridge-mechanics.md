# Bridge Mechanics

This document describes the representation and the rules code used by the
search. The implementation is deliberately based on small value types and free
functions. There is no inheritance, allocation, or virtual dispatch in card and
trick operations.

## Source Map

- `engine/include/bridge/card.h`: card, hand, suit, rank, and seat types
- `engine/src/card.cpp`: parsing, conversion, counting, and display
- `engine/include/bridge/game.h`: deal, trick, score, and position types
- `engine/src/game.cpp`: legal moves, trick winners, state transitions, and display
- `engine/include/bridge/alpha_mu.h`: outcome vectors, Pareto fronts, and search API
- `engine/src/alpha_mu_pareto.cpp`: outcome dominance and Pareto-front algebra
- `engine/src/alpha_mu_state.cpp`: state keys, move ordering, and card equivalence
- `engine/src/alpha_mu.cpp`: MAX/MIN recursion, cuts, DDS leaves, and iteration
- `engine/src/alpha_mu_policy.cpp`: retained within-trick strategy reconstruction
- `engine/src/alpha_mu_internal.h`: private interface between those search files
- `engine/include/bridge/dds_solver.h`: narrow DDS wrapper API
- `engine/src/dds_solver.cpp`: conversion to DDS data structures
- `engine/include/bridge/engine.h`: umbrella header plus sampling API
- `engine/src/engine.cpp`: constrained-hand counting and sampling

## Why Value Structs and Free Functions

`Deal`, `Trick`, `Score`, and `Position` are plain value structs. They contain
state but no hidden behavior. Rule operations such as `legal_plays` and
`winning_seat` are free functions.

This is a good fit here because:

- The state has simple, visible invariants.
- Search needs cheap copies of complete positions.
- Pure rule functions are easy to test independently.
- There is no need for runtime polymorphism.
- A `class` would not be faster. In C++, `struct` and `class` differ mainly in
  default access control.

A class becomes useful if a type later needs to prevent invalid construction or
maintain a complex invariant. It should not be introduced only to group related
functions.

## Card and Hand Bitmasks

Both `Card` and `Hand` are aliases of `std::uint64_t`.

- A valid `Card` has exactly one bit set.
- A `Hand` has one bit set for every card it contains.
- Only the low 52 bits are used.

The bit layout is:

```text
bits  0..12: C2 C3 ... CA
bits 13..25: D2 D3 ... DA
bits 26..38: H2 H3 ... HA
bits 39..51: S2 S3 ... SA
```

For example, `make_card(Suit::Spades, Rank::Ace)` calculates index 51
and returns `1ULL << 51`.

The main operations are direct bit operations:

```cpp
hand | card       // add a card
hand & ~card      // remove a card
hand & card       // test membership
hand & suit_mask  // select one suit
```

`is_single_card(card)` uses `card & (card - 1)`. Removing one from a
nonzero power of two clears its only set bit and sets all lower bits, so the AND
is zero only when exactly one bit was set.

`card_count` uses `std::popcount`, which compilers normally map to a processor
population-count instruction. `suit_of` and `rank_of` use
`std::countr_zero` to recover the set bit's index.

## Legal Moves

`legal_plays(trick, hand)` returns another `Hand` bitmask:

1. If no card has been led, every card in the hand is legal.
2. Otherwise the first card fixes the lead suit.
3. The hand is ANDed with that suit's 13-bit mask.
4. If that result is nonzero, those are the only legal cards.
5. If it is zero, the player may play any card.

This operation does not loop over 52 cards. It is a few integer operations and
is effectively constant time.

## Trick State and Winner

`Trick::cards` stores cards in play order. `Trick::leader` identifies who played
`cards[0]`, and `card_count` identifies the next free slot. `next_to_play`
advances clockwise once for every card already present.

`winning_seat` scans at most four cards. A challenger wins when:

1. It is a trump and the current winner is not.
2. Neither card has trump priority, and it follows the lead suit while the
   current winner does not.
3. Both cards have the same suit and the challenger has the higher rank.

The lead suit is read from `cards[0]`; it is not mutable state and therefore
cannot accidentally change later in the trick.

## Applying a Play

`play_card(position, card)` is the only complete position transition:

1. Determine the player from the current trick.
2. Validate follow-suit and card ownership.
3. Remove the card from that player's remaining hand.
4. Add it to the trick and to `played_cards`.
5. If four cards are present, calculate and score the winner.
6. Start a fresh trick led by that winner, preserving the trump suit.

The alpha-mu search copies a `Position` for each branch and calls this same
function. Search and interactive play therefore use exactly the same rules.

## Equivalent Cards

`equivalent_play_groups` groups legal cards that are currently interchangeable.
Two same-suit cards can be grouped only when:

- Every rank between them is already in the hand or has been played, so no
  unseen card can distinguish their rank interval.
- Both have the same current win/loss status in the partial trick.

The second condition prevents cards such as Q, J, and 9 from being grouped when
Q and J currently win but 9 currently loses.

## Cost Summary

```text
Add/remove/test a card       O(1), one or two integer operations
Extract a suit              O(1), one integer AND
Count cards                 O(1), one 64-bit popcount
Generate legal-move mask    O(1)
Calculate trick winner      O(1), at most four cards
Copy a Position             O(1), fixed-size value copy
Enumerate legal cards       O(number of cards returned)
```

The expensive part of the program is not bridge mechanics. It is the number of
search branches, Pareto vectors, sampled worlds, and DDS leaf calls.

For the optimization switches and measurements around those costs, continue
with `docs/alpha-mu-optimizations.md`.
