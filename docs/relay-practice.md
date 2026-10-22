# Relay practice

Relay practice is a separate Bridge Lab page at `website/relay.html`. It combines
a fixed hidden partner hand, deterministic relay answers, public constraints,
compatible-hand sampling and double-dummy contract comparison.

The phone layout keeps the auction, bidding box and all 13 cards in the
viewport. It uses dynamic viewport height and safe-area padding; landscape
places the table beside the controls and cards. The main bidding screen does
not scroll. Settings, information and analysis open in dismissible sheets;
long reference material and reports can scroll inside their sheet.
Both hands use short cards to leave more room for the auction. Partner's 13
cards sit above the auction, face down during bidding and face up at completion.
Undoing completion hides them again.

Choose **Asker · Ask and interpret** or **Teller · Answer the questions** in
the top-right **Practice settings** menu. The asker chooses relay questions, interprets the replies and
selects the final contract. The teller sees the describing hand and answers
the practice partner's questions. All 63 exercises support both roles,
including Dappleton's reversed North/South seats. Changing role restarts the
exercise. Replaying the same branch and seed preserves the same two hands.

The menu's main choice is **Which auction family?** Select **Jacoby · 1M–2NT**,
**1D–1NT**, **Minor 3-bid**, **Horton · 2NT**, **Dappleton · 1NT**,
**Split range**, **Reordered rebid**, or **Club · 1C–1S**. **New hand** draws
a fresh seed and a random entry branch within that family. Reordered rebid
includes single-suiters, support entries, reverses and mini–mega splinters;
the separate club family retains the existing 1C–1S continuations.

In settings, open **Study a particular branch** to choose a specific entry. **Next study
hand** then deals fresh cards within that entry. Choose **Random branch · Whole
family** to mix entries again; changing the main family also clears the branch
selection. The seed is hidden inside **Hand seed and replay** in the study
menu. **Replay this branch** reuses the entered seed for the current branch
without pinning future random-family hands to that branch.

In teller practice, partner follows supported questions in source order,
checking any action prerequisites against the asker's own hand. It never
chooses a question by inspecting the teller's undisclosed cards. At the source
boundary it takes the lowest available final-contract action. This is a
deterministic recall coach, not an optimal bidding policy. A wrong response
leaves the question, deal and constraints unchanged so you can try again.
Choose a level, then tap a suit or **PASS** to bid. The level starts at the next
supported relay or response, so that call usually needs one tap. All legal
calls are available; lower, illegal bids stay disabled. A small hollow dot
marks a call with no agreed meaning in this exercise. Final contracts use the same bidding box. **Undo** restores
the previous question and the same cards.

Hover over a bid on desktop, or focus it with the keyboard, to preview its
meaning before bidding. On a phone, **press and hold** the bid. Releasing the
hold closes the preview without bidding; a separate normal tap commits it.
Dragging away or cancelling the touch also leaves the auction unchanged.
The preview and agreement markers use public agreements, never the hidden
hand or knowledge of the correct teller answer.

An undiscussed call is recorded at the correct seat and pauses practice for
review without inventing a partner answer or adding constraints. Cards stay
hidden while an undiscussed continuation is paused. Undo resumes the previous
question. If the call is Pass, the actual last contract and its first-strain
declarer are retained, and partner's hand is revealed at completion. These states autosave
and restore like supported auctions.

Tap a call in the auction for its meaning. Below it, **Alternatives** shows
the auction through that question and all its agreed response steps, marking
the response actually played. Tap either a question or its answer, including
older calls in **Full auction**. This is a read-only study view: later bids,
hands and undo history stay unchanged. Fixed opening sequences without a
recorded response ladder say so; no alternatives are invented. Older saved
major auctions recover their ladders from the saved undo states.

Bid descriptions use compact wording in previews, meanings and alternatives:
for example, **Club shortage 12-14**. The same display format applies to saved
auctions; source definitions and stored bidding progress retain their original
meanings.

**Meanings** shows the available
questions or answers; **Show response steps** expands the ladders without
selecting the correct answer. The “i” beside a name opens that hand's details:
your known cards, or public facts about the describing hand. Partner's cards
stay hidden until **Reveal partner** or auction completion. **Assess** opens
contract comparisons in asker mode. **Type** opens optional keyboard entry.

North/East/South/West columns include the opponents' automatic passes. A dealer
dot and **You** mark the seats. The table retains as many recent rounds as fit
the screen, with no fixed six-round limit; **Full auction** opens the complete history, including meanings
for earlier calls. Opening or closing a sheet does not change bidding progress.

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

## Returning to an auction

Relay practice automatically saves the current hand, auction, role, pending
teller question, chosen contract and undo history after every successful action.
It also remembers meanings, sample count, assessment settings and an unfinished
typed bid. Reopening the page restores the saved auction instead of dealing
again. **New hand**, **Next study hand**, or changing family/branch/role starts
another exercise. Restoration keeps the current hand and branch; subsequent
hands still draw across the family unless you explicitly chose a study branch.
Older saves resume their exact auction in random-family mode.

The save is local to the same browser and site address, including its port.
Clearing site data or using a different browser/address does not carry it over.
The page shows whether progress was saved; blocked storage or a full quota
produces a visible notice. Invalid/incompatible saves fall back to a new hand
with an explanation. Samples and DDS results are recomputed when requested;
running analysis does not resume after reopening. Auctions lost before autosave
was added were not stored and cannot be restored from browser storage.

## Covered auction families

| Family | Practice entry and scope | Asker seat |
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

In teller practice you occupy the other North/South seat and describe that
hand. The source asking/describing roles remain fixed throughout each exercise.

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
  recovered. Queen/suit asks reserve game and slam bids in trumps and the bid
  immediately below a small slam in the agreed suit. Trump bids below game
  remain relay steps: with diamonds agreed and a game force established, 4D
  can ask for the queen after a 4C keycard reply.
  Grand-try responses remain undefined, so that reserved call is marked undiscussed.

Asking omissions are branch-specific. Revised minor relays reserve responder's
3NT for play and do not inherit the major-raise 4M omission. Club/Dappleton
minor agreements also reserve 3NT where the source says so; their defined
major-agreement routes use their own policy. Reply steps are counted separately
from ask reservations. The response-step panel shows the actual ladder used.

Meanings stay off the table for recall practice. Open **Meanings** and enable
**Show response steps** to inspect the compressed answer ladder.
Use the bidding box, or open **Type** for text/suit-symbol entry. Undo restores
the prior auction with the same partner hand. Choosing a final contract reveals
partner and allows the selected contract to be highlighted in comparison.

### Judging the final contract as asker

Open **Assess**, choose a **Contract** before signing off or when reviewing the
finished auction, then use **Compare contracts**. The report shows
the required tricks, DD make rate, 95% sampling interval and mean DD tricks.
Game, small slam and grand slam in the agreed suit and notrumps share exactly
the same complete deals. Your chosen contract remains marked when you assess
an alternative. The paired-outcome table counts both contracts making, only
the assessed contract making, only the alternative making, and neither making.
These are make/fail comparisons; a higher make rate is not a duplicate-score
ranking or a grade for the bidding decision.

**Auction information** uses only the asker's cards, public practice
restrictions and the teller's disclosed responses. It samples compatible
teller hands, each with a random opponent split. Revealing partner does not
change what this sampler knows. Use this view to assess the information you
had when choosing your contract.

**Revealed partnership** becomes available after reveal or final signoff.
It fixes both original North/South hands and samples 100, 500 or 1,000 random
East/West layouts. This provides a separate hindsight check across many
opponent layouts rather than relying on the single practice-deal split.
Switching views clears cached samples and results. Undoing reveal or signoff
disables revealed-partnership analysis again.

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
entries use 9–10 for the very-poor response and include ordinary 11-counts in
the shape stack. In particular, 1D–1S–2C admits 9–22 before responder asks;
after a non-poor ordinary shape answer its practice range is 11–22. Named
support and balanced exceptions retain their source limits, and the base
9–11 diamond prefix retains its separately known range.
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
| `website/relay/families.js` | Broad family choices, complete entry grouping and seeded random-branch selection |
| `website/relay/minor-profiles.js` | Revised July-email shape/range nodes and public alternative agreements |
| `website/relay/club-profiles.js` | Bounded 1C–1S and Dappleton nodes, including fixed lead-ins |
| `website/relay/strong-club-profiles.js` | Strong 2C–2D resolution and conditional diamond SKC |
| `website/relay/split-profiles.js` | Split-range raises, three-card support enquiries and suit agreements |
| `website/relay/horton-profiles.js` | Horton shape enquiries, minimum follow-ups and configurable minimum policy |
| `website/relay/rebid-profiles.js` | Reordered single-suiters, support, reverses and mini–mega splinters |
| `website/relay/source-utils.js` | Shared declarative shape, shortage, control-cue and answer helpers |
| `website/relay/profile-utils.js` | Shared source-definition notation, step arithmetic and declarer lookup |
| `website/relay/core.js` | Hand features, constraints, auction transitions and seeded generation/sampling |
| `website/relay/practice.js` | Asker/teller controller, public question prompts, response validation and human seat/hand view |
| `website/relay/progress.js` | Versioned browser saves, validated restoration, undo history and preferences |
| `website/relay/continuations.js` | Keycards, queen and specific-suit asks; public response compression |
| `website/relay/sampling-worker.js` | Deal generation and bounded sampling off the UI thread |
| `website/relay/evaluation.js` | Opponent completion, declarers, DD aggregation and Wilson intervals |
| `website/relay/evaluation-worker.js` | Loads DDS and solves complete deals off the UI thread |
| `website/relay/app.js` | Practice, hints, undo, reveal, cancellation and reports |
| `website/relay/table-ui.js` | Four-seat auction layout with opponent passes and pending-call placement |
| `website/relay/bid-preview.js` | Hover/focus/hold previews with cancelled-touch and compatibility-click suppression |
| `website/relay/browser/families.spec.mjs` | Cross-browser family/study, cache, compatibility, cancellation and restoration regression |
| `website/relay/browser/mobile.spec.mjs` | Phone/landscape geometry, on-demand information and a complete long auction without page scrolling |
| `website/relay/browser/previews.spec.mjs` | All legal calls, agreement markers, undiscussed restore/undo, and preview gestures without unintended bids |
| `website/relay-browser-smoke.mjs` | Playwright regression using shipped modules and real DDS |
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
The revealed-partnership analysis view instead repeats opponent completion
with both original hands fixed and reports its own make rates and intervals.
Stop terminates the worker; the practice hand remains unchanged.

IMP/MP scoring, honour-conditioned generation for extremely rare hands, and
decision-by-decision system analysis remain future work.

## Verification

Run from `website`:

```powershell
npm ci
npm test
npm run test:ui
npm run build
npm run test:wasm
```

The browser regressions use the pinned Playwright development dependency.
After building with the compiled engine, run from `website`:

```sh
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
npm run test:relay:browser
```

The matrix starts a preview on port 3013 and checks Chromium, Firefox, WebKit,
Android Chrome emulation and iPhone Safari emulation. It exercises every family
and study entry in both roles, visible hands/auctions/actions, bidding/undo,
restoration, deal failure/cancellation, hidden controls, replay, keyboard/touch interaction, cached legacy
scripts and startup without `Map.groupBy`. Set `BRIDGE_RELAY_BASE_URL` to a
site URL ending in `/` to check an existing deployment instead.
The real-DDS smoke starts a preview on port 3012; override with
`BRIDGE_RELAY_TEST_PORT` if necessary. `BRIDGE_PLAYWRIGHT_MODULE` can point at
an existing Playwright ES module when using a shared test-tools installation.
The Pages workflow runs both browser suites before publishing and retains
failure screenshots and traces. Built pages use content-versioned URLs for
the complete module/worker/engine graph so cached scripts cannot mix builds.

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

The 21 October 2026 role/assessment update passes **107 relay tests**, including
full teller sessions across all 63 profiles, wrong-answer retry, fixed-hand
undo states, public question selection, paired outcomes and retention of a
chosen contract when assessing alternatives. Static build, deal utility tests,
play-lab UI smoke and compiled DDS smoke also pass. The optional Chromium
regression checks shipped major/minor/Dappleton teller sessions and asker
assessment with real DDS, final signoff, revealed-partnership layouts,
alternative assessment, undo, Stop, mobile overflow and absent DDS.

The subsequent 21 October clarification permits trump bids below game in
queen/specific-suit relays. All **108 relay tests**, the static build and compiled
DDS smoke pass. A focused mobile Chromium check reproduces
1D–1S–2C–2H–3H–3S–4C, confirms 4D as the queen ask and 4H/4S as the side-suit
asks, then verifies the answer, fixed hand, undo and typed 4D entry.

The autosave fix brings the suite to **114 passing relay tests**, including
save/restore for both roles across all 63 profiles, pending questions, completed
contracts, undo history, corrupt data and storage failures. Browser regression
checks reloads in both roles, restored preferences/completed auctions, undo
after restore, full Chromium close/reopen with a persistent profile, and
recovery from a corrupt save. Static build and utility/UI/compiled DDS smoke
checks also pass.

The family-first picker passes **121 relay tests**, including complete and
non-overlapping coverage of all 63 entries, reproducible random branch draws,
explicit branch selection and restoration of old saves without pinning the
next deal. Browser checks cover all eight broad choices, fresh hidden seeds,
random-family restoration, study mode, both roles and the existing DDS flows.
An additional desktop/mobile check verifies exact seed replay in random-family
mode, fresh cards in a pinned branch, restored study selection, family changes
clearing the branch selection and no horizontal overflow with replay open.

The empty-picker regression was reproduced by loading the pre-family script
with the new HTML: the menu had zero options. Missing `Map.groupBy` separately
stopped startup after populating it. The fixes version the complete runtime
graph and use ordinary Map iteration. Failed/cancelled deals also restore
the committed family, role, branch and seed. Verification passes **122 Node
unit/build tests** (121 relay tests plus asset versioning), utility/UI and
compiled DDS checks, and **45 browser tests** across Chromium, Firefox,
WebKit and Android/iPhone emulations. Each browser selects all 63 study entries
as both asker and teller (630 selections total). Real-DDS assessment and full
browser-restart persistence checks also pass. The tests emulate missing APIs
and stale module URLs; they do not claim physical-device coverage. Both browser
suites now run before Pages publication.

The phone interface adds a fixed 13-card hand, level/suit bidding box, four-seat
auction and information/settings/assessment sheets. **125 Node unit/build
tests** pass (124 relay tests and asset versioning). The browser suite now
contains **60 cases** across the five configurations, including geometry at
320×568 through 412×915 and 844×390 landscape, on-demand meanings and hand
knowledge, and a 22-call teller auction through review, history, undo and
reload. The real-DDS/restart smoke also checks typed-bid validation in its
sheet. These are browser emulations rather than physical-device tests.

The legal-call and preview update passes **130 Node unit/build tests** and
**85 browser cases** across the five configurations. Coverage includes public
agreement markers in all 63 initial branches and both roles, undiscussed
recording/restoration/undo, hover and keyboard previews, held/dragged/cancelled
pointer gestures, Android native touch compatibility clicks, and normal taps
after a preview. Real-DDS assessment and full browser-restart checks also pass.
