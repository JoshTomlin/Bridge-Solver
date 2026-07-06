# AlphaMu2: Adaptive World Selection

AlphaMu2 is an experimental layer beside the existing alpha-mu engine. It does
not replace or alter `alpha_mu_search()`. Its job is to choose a better small set
of worlds, call the original search, and challenge the returned policy with
worlds that were not searched.

## Pipeline

1. The constrained sampler creates a larger uniform reservoir.
2. DDS scores every legal root card in every reservoir world.
3. Worlds with the same root score vector form a screening bucket.
4. AlphaMu2 selects a small active set from those buckets.
5. The original alpha-mu searches only the active set.
6. AlphaMu2 executes the fixed selected trick policy in reserve worlds.
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

Remaining slots are distributed between selected buckets approximately in
proportion to their reservoir frequency. This is currently implemented by
D'Hondt-style slot allocation. It is a discrete approximation to weighted
worlds and lets the original unweighted alpha-mu engine remain untouched.

`AlphaMu2ScreeningVector::equivalent_worlds` records the full reservoir bucket
size, so the approximation can be inspected.

## Counterexample Validation

Validation does not search for a new declarer strategy:

- At declarer nodes, it plays the card already stored in the selected policy.
- At defender nodes, it checks every legal defender card.
- If an observed defender card has no policy branch, the world fails validation.
- At the end of the retained trick policy, DDS evaluates the leaf.

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

A reserve failure is ignored when the retained policy already loses an active
world with the same root fingerprint. Such a world is more evidence for a known
weakness, not a new counterexample. This prevents refinement from repeatedly
overweighting an unavoidable losing class.

## Public API

```cpp
bridge::AlphaMu2SessionAnalysis analysis = session.analyze2({
    .reservoir_world_count = 256,
    .initial_active_worlds = 30,
    .max_active_worlds = 30,
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
- `rounds`, including each intermediate search and candidate decision
- screening, selection, search, and validation time

## Current Limitations

- Bucket frequency is represented by repeated active slots, not exact weights.
- Screening similarity sees only root DDS scores. Two worlds with identical root
  scores may still require different responses after an observation.
- Validation covers the retained current-trick policy and then uses a DDS leaf.
  It does not yet execute a complete multi-trick policy.
- The alpha-mu time setting is a total AlphaMu2 decision budget. Screening,
  validation, and every refinement search share the same deadline.
- The experiment is exposed in the native engine API but is not yet selected by
  the website.

These limitations are deliberate boundaries for the first version. The next
useful experiments are exact representative weights, batched policy leaves, and
deeper observation fingerprints.
