# Relay practice

Relay practice is a separate Bridge Lab page at `website/relay.html`. It combines
a fixed hidden partner hand, deterministic relay answers, public constraints,
compatible-hand sampling and double-dummy contract comparison.

Choose a first/second-seat, uncontested practice family: **1M–2NT**, the revised
**minor-opening relays**, selected **1C–1S** continuations, or **Dappleton** after
a balanced club rebid, plus **reordered opener rebids**, **split-range** and
**Horton** enquiries. Each scenario displays its fixed auction prefix and
disclosed hand restrictions. The Word notes, July email, earlier **Practice relay
bidding** conversation and subsequent user clarifications supply the meanings. See the
[source review](relay-source-review.md) for provenance and remaining boundaries.

For bidding lookup, use the [system tables](relay-system/README.md). They cover
each family and shared response ladder, with a generated
[63-exercise catalogue](relay-system/scenario-catalog.md). The
[coverage/backlog](relay-system/coverage.md) distinguishes delivered behaviour
from remaining work; the [maintenance guide](relay-maintenance.md) explains
how to update source definitions, documentation and checks together.

## Run

From `website`, run `node server.js` and open
`http://localhost:3000/relay.html`. Practice and sampling need no WebAssembly.

For double-dummy evaluation, initialize the DDS submodule, install the pinned
Emscripten toolchain and run `build-wasm.ps1` from the repository root. Then run
`node server.js dist` from `website`. The static build includes all relay assets
and the compiled engine. A missing engine or an older build without `ddTable`
disables comparison and displays an explanation; no results are invented.

## Covered auction families

| Family | Practice entry and scope | Your role |
|---|---|---|
| Major raises | 1H/1S–2NT, shape, range, keycards and specific-suit asks | South, responder |
| Base diamond relay | 1D–1NT–2D (9–11) or 2C (12–15), then 2H shape enquiry | South, responder |
| Revised three-bid minor entries | The July email's eight 1m response/rebid starts, weak-hand screen and supported shape stacks | South, responder |
| 1C–1S Baron | Fixed 1NT/2C rebid, Baron answers and the explicit club Kickback continuation | South, responder |
| Other 1C–1S entries | Known-major-shortage 2H/2S rebids, and two-minor 2NT/3D rebids | South, responder |
| Dappleton minor transfers | Four-major/five-minor route, or five-major/five-minor route through the puppet; shortage and keycards | North, opener |
| Dappleton Baron | Fixed five-major/four-minor lead-in and minor agreement; shortage and keycards | North, opener |
| Strong club resolution | 1C–1S–2C–2D: balanced 3NT or 16+ unbalanced descriptions, shortage and SKC | South, responder |
| Split-range/support relay | Four direct 1m major raises and two 1D–1M–1NT support entries; shape, agreement and keycard | South, responder |
| Horton enquiries | 2D/2H/2S–2NT, minimum follow-up, shape, shortage and simplified keycard | South, responder |
| Reordered single-suiters | Five zero–two-major-support rebids and four 2NT three-card-support entries; shortage, natural escapes and strength distinctions | South, responder |
| Reordered reverses | Four entries, high/low/equal shortage and the 14/15 three-card-support fourth answer | South, responder |
| Reordered mini–mega splinters | Ten high/low shortage positions, partscore escape, non-serious and control cues | South, responder |

These are bounded entry scenarios, not every possible continuation of a club or
diamond opening. The detailed source maps distinguish literal tables, inferred
step assignments and excluded cases: [July minor email](relay-minor-email.md)
and [club-opening notes](relay-club-source.md).
The [advanced-family source review](relay-advanced-source.md) records the strong
club, split-range and Horton tables and their practice policies. The
[reordering source review](relay-reordering-source.md) maps the supplied rebid
document and its follow-ups. There are 63 selectable exercises in total.
Both Word originals, searchable extracts and the July email content are
retained in [system sources](system-sources/README.md).

In the base diamond relay the range is already known, so 2H asks shape without
another weak-hand screen. Once the applicable shape description is complete,
the next enquiry is keycard. The eight expanded minor entries retain their
initial very-poor-opening screen; after that response the next step continues
shape and other bids may be chosen as final contracts.

Alternative trump agreements use the steps offered by the current source
branch. They do not consume a second strength enquiry. A selected agreement
changes which king and queen are relevant to subsequent answers. The initial
keycard choice closes those alternative agreements.

## Major-raise and shared continuations

- Balanced, middle-shortage and high-shortage answers lead to a range ask.
  Low shortage gives range immediately: 3S = 9–11, 3NT = 12–14,
  4C = 15–17, 4D = 18–19.
- In the major-raise family, relay asks skip 4M. Opener's answers count every bid, including 4M.
  After a balanced description, 3NT is an offer to play and the ask moves to 4C.
- A known shortage uses void-first Shortage Keycard. A void answer is followed
  by a separate ordinary-keycard ask; a non-void answer establishes a singleton.
  Balanced hands use ordinary keycard directly: 0/3, 1/4, 2/5 without the queen,
  2/5 with the queen. Keycards are the four aces and trump king.
  The 0/3 rung remains even when a disclosed HCP range makes one of those counts
  unlikely. A source-defined ordinary Kickback ask keeps the four-answer ladder
  even if a shortage is already known.
- The queen ask has two replies: no queen, queen. It can be skipped to ask a
  specific suit. Unknown side suits are ordered middle/high/low when there are
  three, high/low when there are two. Trumps and the known shortage are excluded.
- Specific-suit replies are no third-round control, third-round control,
  Kxx or longer, Kx, KQ. The more specific king categories take precedence.
  Third-round control here means a queen or a doubleton/shorter holding.
  Impossible length categories are removed using public constraints and the
  13-card total, never either player's actual cards. Exact shape alternatives
  and unions of conjunctions retain their correlations when deriving these
  bounds. For example, a publicly
  established four-card suit cannot produce the Kx answer.
- After a suit ask, later eligible suits can be asked; skipped suits cannot be
  recovered. Queen/suit asks reserve trumps and the bid immediately below a
  small slam in the agreed suit, including when that suit is a minor.
  Grand-try responses remain undefined, so that reserved call is not offered.

Asking omissions are branch-specific. Revised minor relays reserve responder's
3NT for play and do not inherit the major-raise 4M omission. Club/Dappleton
minor agreements also reserve 3NT where the source says so; their defined
major-agreement routes use their own policy. Reply steps are counted separately
from ask reservations. The response-step panel shows the actual ladder used.

Show meanings can be switched off for recall practice. With meanings on,
expand “Response steps for these asks” to inspect the compressed answer ladder.
Enter a bid using text or suit symbols, or use the bid buttons. Undo restores
the prior auction with the same partner hand. Choosing a final contract reveals
partner and allows the selected contract to be highlighted in comparison.

## Practice restrictions and exclusions

Each family lists its own generation choices and exclusions. They are not a
complete model of opening-bid judgement. For the retained major-raise family:

- Opener: 9–19 HCP, at least five cards in the opened major, no side suit longer
  than four, and zero or one shortage. No-shortage hands have at least 13 HCP.
- Responder: at least four trumps and 12 HCP. The system definition is
  game-forcing values; 12 is only the practice floor.
- Opponents pass throughout; partner accepts the user's selected final contract.

That family's direct 4M great-suit answer, weak-NT opening choices, two-shortage
hands and long side suits remain excluded.

The revised minor profiles use explicit shape sets and retain the email's
named three-suited and exceptional support cases where implemented. Expanded
entries narrow the very-poor opening to 9–10 and omit the judgmental 11-count
boundary; the base 9–11 diamond prefix retains its separately known range.
Unspecified 6/5 continuation tables and the base 2S solid-club enquiry remain
outside these profiles. The reordered strong reverses have separate entries.

Club/Dappleton profiles narrow parenthesized ranges and fit judgments to
disclosed subsets. Dappleton currently uses an 18/19-balanced opener, with the
full transfer/puppet/Baron lead-in shown. Exceptional four-card-major support,
transfer rejection, the complete quantitative schedule, solid-suit judgments,
and several six-card-minor Baron continuations are excluded. The club Baron
scenario follows the explicit Kickback path rather than claiming to implement
every later swap of describing hand.

Split-range and Horton entries now have separate practice families. Their
subjective strength/slam choices use disclosed practice policies; in particular,
Horton's 0–4 HCP minimum threshold is provisional pending a partnership definition.
Competition, fourth-round-control asks and general-grand-try response tables
remain outside the implemented coverage. Reordered entries use the supplied
separate document. Mini–mega opener-takes-control keycard, Exclusion, optional
maximum continuations over a final signoff and some natural follow-ups remain
outside those bounded exercises.
An undefined branch stops with an explanation rather than inventing an answer.

## Components

| File | Responsibility |
|---|---|
| `website/relay/system.js` | Shape/range meanings and disclosed practice restrictions |
| `website/relay/profiles.js` | Registry of available entry scenarios and player roles |
| `website/relay/minor-profiles.js` | Revised July-email shape/range nodes and public alternative agreements |
| `website/relay/club-profiles.js` | Bounded 1C–1S and Dappleton nodes, including fixed lead-ins |
| `website/relay/strong-club-profiles.js` | Strong 2C–2D resolution and conditional diamond SKC |
| `website/relay/split-profiles.js` | Split-range raises, three-card support enquiries and suit agreements |
| `website/relay/horton-profiles.js` | Horton shape enquiries, minimum follow-ups and configurable minimum policy |
| `website/relay/rebid-profiles.js` | Reordered single-suiters, support, reverses and mini–mega splinters |
| `website/relay/source-utils.js` | Shared declarative shape, shortage, control-cue and answer helpers |
| `website/relay/profile-utils.js` | Shared source-definition notation, step arithmetic and declarer lookup |
| `website/relay/core.js` | Hand features, constraints, auction transitions and seeded generation/sampling |
| `website/relay/continuations.js` | Keycards, queen and specific-suit asks; public response compression |
| `website/relay/sampling-worker.js` | Deal generation and bounded sampling off the UI thread |
| `website/relay/evaluation.js` | Opponent completion, declarers, DD aggregation and Wilson intervals |
| `website/relay/evaluation-worker.js` | Loads DDS and solves complete deals off the UI thread |
| `website/relay/app.js` | Practice, hints, undo, reveal, cancellation and reports |
| `engine/src/wasm_bindings.cpp` | Stateless validated `ddTable(north,east,south,west)` binding |

The engine interprets source nodes containing actions, response predicates and
state transitions, then hands keycard/queen/suit enquiries to shared continuation
handlers. Dynamic node definitions receive public state with both actual hands
removed. The fixed partner hand must select exactly one response; missing or
overlapping definitions produce an error. New conventions still need an
explicit node or transition definition.

Constraint predicates include ranges, suit lengths, exact SHDC shape sets,
disjunctions of conjunctions, keycard-count alternatives, balance, queen
possession and specific-suit categories. New-family keycard and queen facts
record their trump suit explicitly. Legacy major-family constraint records
remain compatible with the existing tests.

## Sampling and evaluation semantics

Generation rejects whole joint North/South deals until both hands meet the
practice restrictions. Both hands are fixed before the first practice action.
The sampler first
enumerates shapes allowed by public length constraints and the cards available
outside the user's hand, whether the user is North or South. It weights each shape by its number of possible card
combinations, then draws uniformly within each suit. Remaining strength and
honour predicates are checked by rejection. This preserves uniform sampling
among compatible hands while avoiding proposals with an already impossible
shape. The attempt count measures these conditioned proposals.

The sampler never reads the hidden partner hand, reveal state or selected
contract. Samples are independent, so repeats are valid. An attempt limit
returns a visibly marked partial sample. No additional bidding-style likelihood
is applied.

Each partner sample gets one uniform split of the remaining 26 cards between
East and West. The two known hands are placed in their actual North/South seats.
All compared contracts share the same complete deals. Declarer is the first
North/South player to bid the strain, including an earlier artificial bid.
For a hypothetical strain not yet bid, the user is the assumed declarer.
The report compares game, small slam and grand slam in the agreed trump suit
(4M or 5m for game), plus 3NT, 6NT, 7NT and the selected contract.
Comparisons include hypothetical contracts below the current auction.

The percentage is the fraction of sampled complete deals making double-dummy.
The 95% Wilson interval describes Monte Carlo uncertainty, not uncertainty
about the system, human play or modelling assumptions. Separate intervals do
not constitute a test of the difference between two paired contracts.

After reveal, a separate column solves the original partner hand with one
reproducible opponent split. It is not an average over opponent layouts.
Stop terminates the worker; the practice hand remains unchanged.

IMP/MP scoring, honour-conditioned generation for extremely rare hands, and
decision-by-decision system analysis remain future work.

## Verification

Run from `website`:

```powershell
node deal-utils.test.mjs
node ui-smoke.mjs
node --test relay/*.test.mjs
node wasm-smoke.mjs
```

The WASM smoke requires the compiled build. It checks known DDS trick counts,
malformed-hand rejection and that table solving does not mutate a play session.
Unit tests use synthetic tables only to check aggregation and worker errors;
the browser always uses the compiled DDS solver.

The local WASM build and real-deal evaluation were verified on 4 October 2026.
The original major-family browser flow was checked through a complete relay, final-contract reveal,
compatible-hand DD results, undo, recall mode, invalid-bid feedback and Stop.
The late `relay-1` auction produced all 1,000 requested compatible hands in
103,256 proposals in the browser, within the 500,000-proposal limit.

The expanded continuation/evaluation tests cover minor games, reversed practice
seats, first artificial bidders, alternative trump agreements, direct source-node
keycard asks, ordinary Kickback with known shortage, and sound shape/anyOf
compression. The retained major-family generated-auction and sampler-replay
checks also pass. A separate smoke through the compiled DDS engine verifies
minor contracts with North as user and South as the artificial first bidder.
These checks do not imply that every branch of the partnership's full system
has been transcribed or that all inferred step assignments have been confirmed.

On 20 October 2026, all 78 relay tests, the deal utility tests, the existing
play-lab UI smoke and the refreshed static build passed. The WASM smoke now
also exercises the shipped relay modules through generation, shape/keycard
answers, compatible sampling, opponent completion and real DDS evaluation.
It checks a South-player diamond relay and a North-player Dappleton exercise,
including the artificial first bidder as declarer and preservation of the
interactive play session. Browser automation was unavailable for this run;
the browser checks above describe the earlier session.

The subsequent strong-club, split-range and Horton extension passed all 88
relay tests, including exhaustive first-response partitions, balanced split
judgements under the disclosed policy, minimum follow-ups, Horton opening
priority, void-first 0/1/2 keycard and queen behaviour, reserved 3NT/Last Train
bids, and compatible-sample replay through the new source nodes. Build,
deal/UI smoke and compiled DDS checks also passed.

The supplied opener-reordering document adds 23 exercises. The combined 99
relay tests cover exhaustive shortage partitions, source game-escape examples,
real singleton/void strength answers, reverse upgrades, alternate minor
keycard, mini/mega partscore decisions, public sample replay and source hashes.
The shipped rebid module also runs through the real DDS smoke. A partnership
definition of Horton minimum remains outstanding; its current threshold is
explicitly a practice policy.

The documentation audit adds family reference tables, a generated catalogue,
coverage/backlog and maintenance instructions. Comparing the split-range
agreement tables with the implementation exposed a duplicate 4D action after
1C–1H–2S–2NT–3H. The source's 4D heart agreement now takes precedence over
generic club Kickback; club interest proceeds through 4C agreement and its
subsequent cue/keycard route. A regression check covers every listed support
shape's agreements, bringing the relay suite to 100 tests.
