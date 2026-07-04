# Quick-Trick Bounds

## What DDS Does

Bo Haglund's DDS applies several bounds before expanding ordinary moves in
`ABsearch.cpp`:

1. The score plus the number of tricks remaining gives the trivial
   `tricksToCome`-style lower/upper limit.
2. `QuickTricks.cpp` looks for immediate winners, communication between
   partners, long-suit winners, trump safety, and ruffs. It stops as soon as it
   can settle the current target.
3. `LaterTricks.cpp` computes complementary optimistic bounds for tricks that
   may be established later.

The current DDS source no longer contains a function literally named
`tricksToCome`; that idea is split between the remaining-trick arithmetic and
the `QuickTricks`/`LaterTricks` calls in `ABsearch.cpp`.

DDS can use exact lengths and card locations because it is a double-dummy
solver. Alpha-mu cannot copy that logic at a public node: using the defender
split from one sampled world would leak hidden information into a strategy
shared by every world.

Official source:

- <https://github.com/dds-bridge/dds/blob/develop/src/ABsearch.cpp>
- <https://github.com/dds-bridge/dds/blob/develop/src/QuickTricks.cpp>
- <https://github.com/dds-bridge/dds/blob/develop/src/LaterTricks.cpp>

The same revision is vendored under `external/dds/src`.

## The Alpha-Mu Proof

`prove_declarer_quick_tricks` answers one target-directed question:

> From the current lead, can declarer and dummy take N consecutive tricks
> without ever giving the defenders the lead, for every hidden split?

It runs only at the start of a trick when North/South is on lead. Its state is:

- declarer's remaining hand;
- dummy's remaining hand;
- which of those two hands is on lead;
- how many consecutive tricks are still required.

The combined defender pool is calculated from declarer, dummy, and
`Position::played_cards`; East's and West's individual hands are never read.

For each possible suit:

1. Find the absolute highest remaining card in that suit.
2. If the leader owns it, lead that card and search every legal partner
   follow/discard.
3. If partner owns it, search leads in that suit that transfer the lead to
   partner's top card.
4. Recurse with one fewer required trick.

Failed states are memoized. The search stops on the first proof and reports its
first card. It has a 100,000-state safety budget; exhausting the budget simply
declines the optimization and falls back to normal alpha-mu.

## Why It Is Safe

Defender cards are never removed in the hypothetical cashing line. A card such
as the king therefore continues to block declarer's queen even if some actual
layouts would force that king under the ace. This loses opportunities but does
not manufacture winners.

In no trump, an absolute top card cannot lose. In a trump contract, a top trump
is likewise safe, but a side-suit winner is rejected while any defender trump
is outstanding: without knowing the split, one defender might be void and able
to ruff.

The proof models entries exactly because both declarer-side cards are removed
on every trick and the winner becomes the next leader.

## Where It Cuts

`AnalysisSession::analyze` runs the proof before sampling worlds. Thirteen
running winners therefore need neither the dynamic-programming sampler nor DDS.

`evaluate_quick_trick_bound` runs the same proof at every empty-trick MAX node.
If it succeeds, the node returns an all-one outcome vector for its useful worlds
and iterative deepening stops when this occurs at the root.

Use `set opt quick-tricks off` to disable it. The audit log names each proof,
and the counters report probes, examined cashing states, cuts, root cuts, and
budget aborts.

## Deliberate Limitations

This first bound does not:

- analyze a partial trick;
- remove defender cards forced under winners;
- prove that top trumps draw every outstanding trump before cashing side suits;
- calculate unavoidable losers from declarer/dummy alone.

The last item is fundamentally harder: a missing top card is not necessarily a
loser because declarer may discard that suit, ruff it, or never lead it.
Upper-bound proofs need either additional public facts (known voids and length
bounds) or a conservative all-world defender analysis. These can be added later
without weakening this proof.
