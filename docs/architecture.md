# Architecture Notes

## Product Direction

This project is best split into two layers:

- A JavaScript app for data entry, controls, and visualization.
- A C++ engine for combinatorics, sampling, and search.

That split keeps the UI easy to iterate on while preserving headroom for heavy computation.

## Suggested Milestones

### 1. Core Card Model

Build the lowest-level bridge primitives first:

- `Card`
- `Suit`
- `Rank`
- `Hand`
- `Deal`
- `KnownCards`
- `Seat`

This stage should support:

- Parsing a hand from text
- Validating that no card is duplicated
- Converting between bitmasks and human-readable card sets

### 2. Restrictions Model

Represent West/East constraints explicitly instead of burying them inside search code.

Examples:

- High-card point range
- Suit length ranges
- Specific cards known or excluded
- Shape families such as `5-3-3-2`
- Honors or control constraints

Recommended rule: restrictions should be pure data plus validation helpers.

### 3. Counting Engine

Create a counting layer that answers:

- How many EW deals satisfy the restrictions?
- How many satisfy the restrictions after fixing lead/play history?
- How many satisfy the restrictions conditioned on bidding clues later on?

This is where careful combinatorics and memoization will matter.

### 4. Sampling Engine

Once counting is stable, sample legal worlds:

- Uniformly over legal deals, or
- Weighted by auction/play likelihood models later

Recommended output shape:

- `SampledWorld`
- West hand
- East hand
- Optional weight or log-probability

### 5. Play Search

Then add a declarer-play search layer that operates over sampled worlds:

- Alpha-mu style search over imperfect-information states
- Belief updates after plays
- Aggregation over sampled worlds

This layer should not know about the UI directly.

### 6. Bidding Extension

After play analysis is stable, reuse the same machinery for bidding:

- Represent partner range
- Sample hidden hands from that range
- Estimate expected value of candidate bids

## Recommended Technical Split

### UI Responsibilities

- Hand entry
- Restriction controls
- Sampling controls
- Search progress and results
- Visual trick-by-trick display

### Engine Responsibilities

- Parsing and validation
- Counting legal completions
- Sampling legal worlds
- Search and evaluation
- Stable JSON-like boundary objects for the UI

## Integration Options

There are three realistic ways to connect JS to C++ later:

1. CLI boundary
   Good for early development. The UI calls an executable and exchanges JSON files or stdout.
2. Local HTTP service
   Good for an app shell. The C++ engine runs as a local server process.
3. Native addon
   Fastest integration, but more setup complexity.

For this project, start with option 1 or 2. Native addons are worth considering later only if process boundaries become painful.

## First Engine Targets

The first meaningful C++ deliverables should be:

1. Parse North and South hands.
2. Infer unseen cards.
3. Count raw East/West completions.
4. Add a small restriction set:
   - HCP range
   - exact suit length for one suit
   - known card inclusion/exclusion
5. Sample a legal East/West deal.

Once those are working, the project becomes very tangible.
