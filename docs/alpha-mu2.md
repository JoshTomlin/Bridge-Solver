# AlphaMu2: Adaptive World Selection

AlphaMu2 is an adaptive layer around the alpha-mu engine. Its job is to choose a
better small set of worlds, assign the reservoir's exact probability mass to
those representatives, and challenge the returned policy with worlds that were
not searched.

## Pipeline

1. The constrained sampler creates a larger uniform reservoir.
2. DDS scores every legal root card in every reservoir world.
3. Worlds with the same root score vector form a screening bucket.
4. AlphaMu2 selects a small active set from those buckets.
5. The original alpha-mu searches only the active set.
6. AlphaMu2 executes the complete retained M-horizon policy in reserve worlds.
7. Makeable worlds where that policy fails are added as counterexamples.
8. The original search runs again after each counterexample batch.

The normal `AnalysisSession::analyze()` path is unchanged. The experiment is
entered explicitly through `AnalysisSession::analyze2()`.

## DDS Screening Vectors

For shared legal root cards `[SA, SJ]`, a world might have:

```text
[5, 4]  -> SA makes the target, SJ does not
[4, 5]  -> SJ makes the target, SA does not
[5, 5]  -> either card makes the target
```

`double_dummy_move_scores_batch()` asks DDS for all legal cards with
`solutions = 3`. DDS returns touching equals compactly; the wrapper expands
them to one score per legal card.

These are screening vectors, not valid imperfect-information strategies. DDS
can choose later cards using hidden information. AlphaMu2 uses the vectors only
to avoid spending all active slots on layouts that look strategically identical
at the root.

## Selecting Active Worlds

Every distinct score vector receives one representative when capacity permits.
If there are more vectors than slots, farthest-first selection favors vectors
that disagree about making moves and trick totals.

Remaining probability slots maximize structural distance rather than repeating
common buckets. Every reservoir particle's probability is assigned to its
nearest active probability representative, so bucket frequency remains exact
without consuming extra world-mask slots.

Adversarial, remembered, and discovered hard layouts form a separate challenge
pool. They may have zero probability weight. Alpha-mu maximizes represented
probability first; within a configurable near-tie tolerance it prefers the
strategy that survives more challenge worlds.

`AlphaMu2ScreeningVector::equivalent_worlds` records the full reservoir bucket
size, so the approximation can be inspected.

## Counterexample Validation

Validation does not search for a new declarer strategy:

- At declarer nodes, it plays the card already stored in the selected policy.
- At defender nodes, it checks every legal defender card.
- If an observed defender card has no policy branch, the world fails validation.
- At the end of the complete retained M-horizon policy, DDS evaluates the leaf.

This is cheaper than alpha-mu because there are no declarer MAX choices, Pareto
front combinations, or transposition-table searches for alternative policies.

A reserve world is a counterexample candidate only when:

1. the selected fixed policy fails, and
2. DDS says at least one root card can still make the target.

The second condition rejects layouts where the contract is double-dummy
impossible. Candidates with an unseen defender observation are preferred,
followed by layouts with greater DDS regret and greater fingerprint distance.

Counterexamples fill unused active slots first. If the active set is full,
AlphaMu2 replaces a representative only from a duplicated screening bucket, so
it does not discard the sole representative of a known root fingerprint.
Several counterexamples can be added in one batch, but only one per distinct
`(root fingerprint, policy-path signature)` behavior. Selected hard layouts are
protected from same-round and later-round churn.

Reserve failures are never suppressed merely because an active world shares
their root fingerprint. Their full policy-path signature and failure depth are
recorded, exposing the collisions that root-only DDS screening cannot see.

## Public API

```cpp
bridge::AlphaMu2SessionAnalysis analysis = session.analyze2({
    .reservoir_world_count = 256,
    .initial_active_worlds = 30,
    .max_active_worlds = 64,
    .max_refinement_rounds = 2,
    .counterexamples_per_round = 3,
});

const bridge::AlphaMuResult& search = analysis.search.search;
const bridge::AlphaMu2Stats& stats = analysis.search.stats;
```

Useful diagnostics include:

- `distinct_screening_vectors`
- `active_reservoir_indices`
- `counterexample_indices`
- `search_runs`
- `reserve_worlds_checked`
- `policy_dds_leaves`
- `policy_fingerprint_collisions`
- `challenge_worlds`
- `active_world_weights`
- `rounds`, including each intermediate search and candidate decision
- screening, selection, search, and validation time

## Current Limitations

- Screening similarity still begins with root DDS scores. Full-policy
  counterexamples repair collisions after the first search rather than making
  the cheap fingerprint itself omniscient.
- Alpha-mu fronts still use a 64-bit world mask, so at most 64 active worlds can
  be searched at once. Probability reassignment and challenge selection make
  those slots carry more information.
- The alpha-mu time setting is a total AlphaMu2 decision budget. Screening,
  validation, and every refinement search share the same deadline.
- Complete-oracle policy validation can be much more expensive than DDS
  coldness checks because it explores every legal defender observation.

The browser exposes AlphaMu2 directly, including adversarial-layout count,
persistent hard-layout capacity, and critical near-tie tolerance.
