# Relay implementation coverage and remaining work

[System-table index](README.md) · [Exercise catalogue](scenario-catalog.md)

## Current coverage

This is the state after the source archive/rebid extension and the subsequent
documentation audit. “Implemented” means deterministic behaviour within the
publicly disclosed practice subset, not every source-note continuation.

| Family | Exercises | Implemented scope | Main boundary |
|---|---:|---|---|
| Major raises | 2 | 1M–2NT shape/range, rolling low shortage, shared slam asks | Great-suit direct 4M and opening-choice judgement excluded |
| Revised minor relays | 10 | Two confirmed 1D–1NT ranges; eight July entries; weak screen; shape and alternative agreements | 6/5 postscript, solid-club entry and some balanced exceptions incomplete |
| Club relays | 7 | Two Baron paths, two known-shortage paths, two minor two-suiters, strong 2C–2D resolution | Full role swaps, direct long-suit continuations and four-club exceptions incomplete |
| Dappleton | 12 | Eight exact-five-minor transfers, four fixed five-major/four-minor Baron entries | Broader balanced ranges, quantitative/both-major/three-suited/solid-suit routes incomplete |
| Split-range/support | 6 | Four direct raises, two 1NT support entries, shape/fit, cues and keycards | Natural invitations and broader subjective slam judgement incomplete |
| Horton | 3 | Main/minimum enquiries, shape, shortage, zero/one/two KC and queen rule | Minimum threshold provisional; Last Train/cue and competitive replies incomplete |
| Reordered opener rebids | 13 | Five no-support single-suiters, four three-card-support entries, four reverses, strength escapes | Some natural continuations and discretionary bidding over a final contract excluded |
| Reordered mini–mega | 10 | New high/low bid positions, partscore escape, non-serious/control route | Opener-takes-control keycard, Exclusion and extreme-shape upgrades excluded |
| **Total** | **63** | See the generated catalogue for exact selectable prefixes | No unrestricted opening-auction engine yet |

## Application and analysis work completed

| Component | Behaviour | Principal files |
|---|---|---|
| Fixed practice deals | Both hands exist before the first question; original partner hand never changes; seeded repeats | `core.js`, `sampling-worker.js` |
| Bidding interpreter | Source actions, exactly one truthful answer, immutable state, public dynamic nodes, terminal partner Pass | `core.js`, family profile modules |
| Constraint tracker | HCP, controls, lengths, exact SHDC shape sets, unions of conjunctions, keycards/queen/honours | `core.js`, `continuations.js` |
| Shared slam enquiries | Void-first SKC, ordinary KC, queen/specific suits, public compression and branch-specific omissions | `continuations.js` |
| Compatible-hand sampler | Public constraints plus known user cards; shape weighted by actual hand counts; bounded rejection | `core.js`, `sampling-worker.js` |
| Contract evaluator | Random opponents, common complete deals for compared contracts, real DDS, correct seats/first-strain declarer | `evaluation.js`, `evaluation-worker.js`, WASM binding |
| Reports | DD make rates, Wilson 95% intervals, selected contract, original deal separately | `evaluation.js`, `app.js` |
| Practice UI | Family selector, hidden hand, recall mode, optional meanings/response ladders, typed/symbol bids, undo/reveal/stop | `relay.html`, `app.js`, `relay.css` |
| Source preservation | Unchanged Word originals, indexed extracts, email transcription, precedence, reproducible hashes | `docs/system-sources/`, extraction script |
| Human reference | Family tables, generated 63-exercise catalogue, source reviews, coverage and maintainer guide | `docs/relay-system/`, `docs/relay-*.md` |

Relay JavaScript paths in this table are relative to `website/relay/`.
The C++ binding is `engine/src/wasm_bindings.cpp`. Shipped static assets come
from `website/build.js`; generated `website/dist/` and build logs are ignored.

## Decisions that must stay visible

| Decision | Status and effect |
|---|---|
| 1D–1NT–2D = 9–11; 2C = 12–15 | User confirmed; not reordered into step = bust |
| After completed shape, proceed to keycards | User confirmed; known strength does not remove the 0/3 KC category |
| Ask skips 4M, answer counts 4M in 1M–2NT | User confirmed, including void follow-up ask |
| Balanced KC and rare five keycards | User confirmed ordinary ladder without void, retaining 2/5 possibilities |
| Public length compression | User confirmed; four cards cannot produce Kx; no hidden-card compression |
| Two unknown specific suits | High then low; three use middle/high/low |
| Strong club 2C–2D | Balanced always 3NT; 16+ unbalanced, per user clarification |
| July revisions | User confirmed precedence over matching Bourke/fourth-suit sections |
| Reordered rebids | Separate supplied document governs its natural-response auctions, not artificial 1C–1S |
| Horton minimum | **Provisional:** 0–4 versus 5–8; source gives no numerical definition |
| Split balanced cue judgement | **Practice policy:** controls choose game/non-serious/cue; not a new partnership rule |
| Borderline HCP/shape/suit quality | Narrower admitted subsets are published by each profile; not a complete opening model |
| Selected final contract | Partner accepts it; optional source continuations over a signoff are excluded |

Specific source typos/conflicts are recorded in the detailed source reviews,
including copied diamond shapes, rebid suit-name/count slips, R0120's explicit
low-shortage table and the Horton 3NT/Last Train conflict. Originals remain intact.

## Remaining system transcription

| Work item | What is needed to finish it |
|---|---|
| Confirm Horton minimum | Partnership definition of minimum, including any shape/quality judgement; replace the provisional policy |
| July 6/5 additions | Complete entry-specific stacking and later shortage/agreement tables; do not infer all bids from the short postscript |
| Base 2S solid clubs | Agreed solid-suit subset and complete shortage/strength continuations |
| Remaining Dappleton | Both-major routes, invitations/range, quantitative decisions, six-card-minor Baron, exceptional major fits, three-suited and solid-major cases |
| Remaining club responses | 1C–2C diamond relay, direct long-suit branches, responder-description swaps and four-club opening exception |
| Broader split-range judgement | Natural invitations, source boundary hands and a confirmed deterministic slam policy if desired |
| Rebid natural continuations | Additional natural follow-ups, optional maximum continuation over signoff, opener-takes-control KC and Exclusion |
| New slam response alphabets | General-grand-try and fourth-round-control replies need explicit definitions |
| Broader auctions | Other system sections, third/fourth seat and competition need separate source-backed families |

Some items need only further transcription; others need a partnership decision.
The source reviews explain which. No undefined response is filled with an LLM
guess during practice.

## Remaining analysis/product work

| Feature | Current limit |
|---|---|
| IMP/MP comparisons | DD make percentages only; no scoring/vulnerability/field model yet |
| Human make probability | No single-dummy declarer/defence model; DD is explicitly labelled |
| Auction-decision/system analysis | No expected-value comparison of asking again versus signing off at each relay |
| Extremely rare late constraints | Shape-conditioned sampling is exact but rejection can hit the displayed attempt limit; honour-conditioned generation is future work |
| Several opponent layouts per partner hand | Current evaluation uses one layout per independently sampled hand; original-hand column is one separate reproducible split |
| Full declarative editor | Profiles are declarative JavaScript data/functions; no standalone bidding language or partner-facing editor yet |
| Browser regression automation | Earlier manual browser flow was checked; current host's browser automation was unavailable during the extension |

## Delivery and verification record

| Change | Record |
|---|---|
| `e0c66dd` — initial usable trainer | Major/minor/club/Dappleton practice and DDS integration; 30 exercises, 78 relay tests |
| `656ae99` — source archive and extensions | Both Word originals/email retained; strong club, split-range, Horton and reordered entries; 63 exercises, 99 relay tests |
| Documentation audit | Added these family tables, coverage and maintainer guide; reproducible exercise catalogue. Found and corrected duplicated 4D agreement/Kickback meaning after split clubs/spades 3H; all six support-entry agreement schedules now have an explicit regression check |

The audit's final verification is **100 relay tests**, static build, deal utility
tests, existing play-UI smoke, compiled DDS smoke including a reordered entry,
documentation-link checks and catalogue regeneration. It does not establish
complete coverage of the partnership's full system or constitute a fresh
visual browser check. See the maintainer guide for exact commands and test scope.
