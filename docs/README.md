# Documentation Guide

The documentation is organized by purpose. Start with the current design and
algorithms; use the result reports when you want a concrete measured example.

## Suggested reading order

1. [Project overview](../README.md) explains the problem, implemented features,
   technology choices, and build commands.
2. [System architecture](architecture.md) follows one decision from the browser
   or CLI through sampling, search, and DDS.
3. [Bridge mechanics](bridge-mechanics.md) describes cards, hands, positions,
   legal plays, and state transitions.
4. [Alpha-mu](alpha-mu.md) explains the imperfect-information recurrence,
   Pareto fronts, world masks, and retained policies.
5. [AlphaMu2](alpha-mu2.md) explains adaptive world selection and
   counterexample-guided policy refinement.
6. [Browser architecture](web-architecture.md) covers the worker, WebAssembly
   API, UI reports, persistence, and deployment.

## Focused implementation notes

| Document | Subject |
|---|---|
| [Relay practice](relay-practice.md) | Major, revised minor, club and Dappleton exercises, auction constraints, hand sampling and DDS comparisons |
| [Relay system tables](relay-system/README.md) | Readable family-by-family bidding tables, response ladders and practice qualifications |
| [Relay exercise catalogue](relay-system/scenario-catalog.md) | Generated inventory of all 63 entries, prefixes, initial calls and asking roles |
| [Relay coverage and remaining work](relay-system/coverage.md) | Delivered behaviour, unresolved partnership decisions, source boundaries and backlog |
| [Relay maintenance](relay-maintenance.md) | Engine contracts, documentation/source update workflow and verification commands |
| [Partnership system sources](system-sources/README.md) | Retained Word originals, searchable notes, July email content and source precedence |
| [Advanced relay source review](relay-advanced-source.md) | Strong club, split-range and Horton tables and practice policies |
| [Reordered rebid source review](relay-reordering-source.md) | Single-suiters, reverses, mini–mega splinters and playable-game strength escapes |
| [Alpha-mu optimization guide](alpha-mu-optimizations.md) | Every search shortcut, its safety argument, switch, counter, and test strategy |
| [Quick-trick bounds](quick-tricks.md) | Layout-independent proof of consecutive cashing winners |
| [DTAC-style claim bounds](dtac-claim.md) | Conservative public claim proof using the combined defender pool |
| [Competent defence](competent-defender.md) | DD-safe policy-breaking defender and its limitations |
| [Reliability lab](alpha-mu-testing.md) | Corpus format, collision miner, paired tests, and Bridge Master test method |

## Recorded experiments

Files in `results/` are point-in-time records with fixed seeds and settings.
They support the design notes, but their timings should not be read as current
performance guarantees.

| Report | What it demonstrates |
|---|---|
| [Bridge Master 6S discovery benchmark](results/bridge-master-6s.md) | Exact 12,376-layout oracle and a fixed-policy continuation failure repaired by AlphaMu2 |
| [AlphaMu2 forced-prefix analysis](results/alpha-mu2-forced-prefix.md) | Active-set screening, counterexamples, and the retained discovery policy in one position |
| [AlphaMu2 6S playthrough](results/alpha-mu2-6s-playthrough.md) | Full card-by-card generated report from an earlier engine configuration |
| [Alpha-mu optimization results](results/alpha-mu-optimization-results.md) | Correctness checks and same-seed measurements for paper optimizations |
| [7NT adaptive search experiment](results/alpha-mu-7nt-adaptive.md) | Ten-deal comparison of adaptive depth with older fixed-depth runs |

## Research sources and raw inputs

- [Alpha-Mu Search Algorithm for Bridge](references/alpha-mu-search-algorithm-for-bridge.pdf)
- [Optimising Alpha-Mu](references/optimising-alpha-mu.pdf)
- [`references/example-hands.txt`](references/example-hands.txt) contains the
  small authored positions used by early demos.
- [`results/raw/`](results/raw/) contains the fixed-depth output behind the
  recorded 7NT comparison.

The `archive/` directory contains early UI notes and raw diagnostics retained
for provenance. It is not part of the current implementation guide.

## Terminology

- **alpha-mu** is the paper-derived imperfect-information search implemented in
  `engine/src/alpha_mu*.cpp`.
- **AlphaMu2** is this project's adaptive layer around alpha-mu. It controls
  which worlds are searched and how held-out failures are promoted.
- **DDS** is the external perfect-information solver used for screening,
  terminal values, and DD-safe defensive choices.
- A **world** is one complete hidden East/West layout consistent with the public
  position and entered restrictions.
- A **policy** is a declarer plan that can branch on public defender cards, not
  on the hidden identity of a world.
