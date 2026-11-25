# Relay implementation coverage and remaining work

[System-table index](README.md) · [Exercise catalogue](scenario-catalog.md)

The [22 October 2026 source/code audit](audit-2026-10-22.md) supplements this
coverage record with reproduced discrepancies and questions requiring partnership
clarification. The direct club known-shortage diamond-SKC ladder now skips the reserved 3NT response (P0425). The artificial-3NT passing concern
was resolved by Josh: the asker may pass any relay answer; Q1 in
[questions for Markey](questions-for-markey.md) supersedes that old invariant. See [implementation.md](implementation.md) for
the bid-tree and sampling algorithms.

## Whole-auction reachability, 22 November 2026

Just Bid chooses an opening group and a seat independently. It deals
first/second-seat openings and unopposed third/fourth-seat openings with
prior passes. The human makes their first available call. The same real
auction can reach each of the 63 study entries from either seat, including
Dappleton and club Baron auctions where the asker changes. The mix is
weighted by opening group and practice route. Individual branches can be rare.

### Which auctions can you actually be dealt?

An entry in the reference or a focused exercise with the first three bids
already on the table does not establish that either player can bid those
calls in a whole auction. This check traced the deal generator, both bots,
the playable calls and the transition into the next decision.

| Auction | What changed |
|---|---|
| 1C–1S | Previously every generated responder had a four/five-card major. Now one third of club draws target the artificial response, normally (7)8+ without a four-card major. Opener can rebid 1NT or 2C balanced, or 3D (9–13) or 2NT (14–16) with both minors. The latter two reuse the focused shortage and keycard exercises with the actual cards. Known major-shortage hands use the 2H/2S rebids described below. The bot agrees its longer minor and prefers clubs with equal lengths. The opener therefore gets to answer either shortage ask. |
| 1C–2C | A single-suited positive diamond hand meets all five opener rebids. After the 2D preference, responder can pass with 10–13 or use provisional natural stopper bids, invitations and game choices. After the 3D raise, 3H asks opener for shortage. The shortage asks pause at the missing reply table. |
| 1C–1NT and direct weak jumps | Weak 1NT and natural jumps at two and three are dealt. After a two-level jump, only 2NT invites. The 1NT response has provisional natural rebids because its opener table is missing. |
| 1C–1D/1H | The existing Bourke/fourth-suit, split-range, reordered and mini–mega exercises can be reached through the transfer and opener’s actual rebid. |
| 1C–1S–1NT/2C | The two Baron exercises and the strong 2C–2D description can be reached from the opening, including the known diamond-short and strong unbalanced opener hands. |
| 1D–2C/3D/2NT | Weak long clubs, invitational diamond support, and a five-plus-diamond game force respectively. The 2NT route uses Jacoby shortage and range replies. Weak-club and invitational rebids are provisional natural practice. |
| 1M–1NT and 1M–3m | The nonforcing 1NT response and six-plus-card minor invitations are dealt. The 1NT rebids are provisional natural practice. |
| 1C–1S–2H/2S | The direct major-shortage rebids are dealt. After 3D, two diamonds give 3NT to play. With three diamonds the SKC steps skip 3NT. Direct and strong routes share the same reply table. |
| 1C–1S–2D | Mini Bourke is dealt from both sides, including 4414, the upper-range shape enquiry, long clubs and each shortage. The Club study menu has an explicit 4414 drill. |
| 1D–1NT–2H/2S | The natural 16+ reverses are dealt from both sides with dedicated sampling for the default, solid clubs, diamond fit and major fit asks. Shape can reach a two-suiter, a three-suiter, or the 6/5 shortage enquiry before keycard. |
| 1C–1S–1NT vs 1C–1S–2C | Over 1NT responder can pass, sign off in 2C/2D or bid 3NT. Over 2C, 2D requests 3NT or an unbalanced description. The whole-auction 2C branch currently deals balanced openers and lets opener declare 3NT. The reference also lists the other source continuations. |
| 1H–1S | Jump-rebid exercises supplied this entry. Ordinary 12–17 balanced 1NT and natural clubs/strong balanced 2C now have a deal-generation route into the existing continuations. |
| 1M–2C–3D–3M | Responder can show the three-card raise or a balanced game force with a doubleton (P1520). Both fit types reach the game choice in either seat. |
| Horton Twos | Responder can invite in a shown suit or use direct Kickback. Over 2S, 3S and 4C mildly invite, 4D asks for club keycards and 4NT asks for spade keycards. Both roles use the 0/1/2 ladder. A human opener can accept or decline an invitation. |

With club selected, replay seeds `opening-audit-0`, `opening-audit-1`,
`opening-audit-3` and `opening-audit-48` to practise the 2C, 1NT, 3D and
2NT rebids respectively. With Horton 2S selected, `opening-audit-2` gives
a direct club Kickback opportunity and `opening-audit-83` a club invitation.
The same seed gives the same two hands from either seat.

With club selected, replay `opening-audit-11`, `64`, `20`, `88` and `19`
(use the same `opening-audit-` prefix for each) for the five opener rebids
after the positive 2C, in ascending bid order. Seed 4 gives the weak heart
jump and 2NT invitation. Seed 2 gives 1C–1S–2S–3D–3NT with two diamonds.

### Remaining gaps and source decisions

| Agreement | Current boundary |
|---|---|
| Positive diamonds after 1C–2C | The notes give the shortage asks after 2H/2S or 3D–3H without their answer order. The trainer pauses with the original cards and Undo available. See Q17. |
| Other artificial 1S rebids (P0387, P0389–P0390) | Solid 3C is playable to a contract. The remaining direct long-club and two-suiter branches need deeper continuations. |
| 1D–1NT, other immediate 16+ rebids | The 2NT and 3♣/3♦/3♥/3♠ entries are separate from the 16+ major reverses. The 2♠ solid-club enquiry after opener's 2m is also a separate branch. |
| Horton Last Train and slam after a forcing jump | Range/shape, invitations, direct keycards and forcing-jump cues to game are playable. Last Train replies and later slam continuations remain open. |
| Weak 1NT and 2NT | Weak-1NT competitive methods and further slam continuations remain incomplete. Exclusion replies after 2NT are unconfirmed (Q13). |
| Passed hand | Third/fourth-seat uncontested openings are dealt. P1780, some subsequent rebids, and competitive continuations remain incomplete. |
| Extreme shapes and judgement | Two-shortage hands and some opening exceptions fall outside individual relay subsets. Additional natural rebids and partnership-specific slam decisions need examples. |

Question numbers refer to [questions for Markey](questions-for-markey.md).

### Corrections from the current audit

- The detailed five-plus-diamonds agreement in P1468 takes precedence over the shorthand four-plus in P0643. After 1D–2NT, responder’s 3NT is to play. A range *answer* can still be 3NT (P1475–P1477).
- A balanced invitation over the weak 1NT opening goes through Stayman, including 5332 hands with a five-card major (P0206). A direct 2NT rebid after a transfer no longer claims to invite in notrump.
- The strong-2NT bot can show both five-card majors through the spade transfer. It no longer tries the exact-five-hearts/four-spades description on a five-five hand (P1372/P1389).
- The 1D generator now checks the same opening shapes as the bid validator. A balanced 5422 hand with five diamonds is excluded from 1D practice (P0633).
- Confirmed that the opening and partner’s automatic responses receive only the acting hand and public auction. Fixed seeds exercise both seats, the original auction prefix, same cards, roles, save and Undo at relay transitions.

Sources are the [club response tables](../system-sources/main-notes.txt#L228),
[diamond responses](../system-sources/main-notes.txt#L608),
[major responses](../system-sources/main-notes.txt#L845), and
[Horton Twos](../system-sources/main-notes.txt#L1013). The separate
2S **response** showing solid clubs after 1D–1NT–2m is still a gap in the
[revised minor relays](minor-relays.md).

## Current coverage

This is the state after the source archive/rebid extension, documentation
audit and asker/teller practice addition. “Implemented” means deterministic behaviour within the
publicly disclosed practice subset, not every source-note continuation.

| Family | Exercises | Implemented scope | Main boundary |
|---|---:|---|---|
| Major raises | 2 | 1M–2NT shape/range, rolling low shortage, shared slam asks | Great-suit direct 4M and opening-choice judgement excluded |
| Revised minor relays | 10 | Two confirmed 1D–1NT ranges; eight July entries; weak screen; shape and alternative agreements | 6/5 postscript, solid-club entry and some balanced exceptions incomplete |
| Club relays | 7 | Two Baron paths, two known-shortage paths, two minor two-suiters, strong 2C–2D resolution | Full role swaps, direct long-suit continuations and four-club exceptions incomplete |
| Dappleton | 12 | Eight exact-five-minor transfers, four fixed five-major/four-minor Baron entries | Broader balanced ranges, quantitative/both-major/three-suited/solid-suit routes incomplete |
| Split-range/support | 6 | Four direct raises, two 1NT support entries, shape/fit, cues and keycards | Natural invitations and broader subjective slam judgement incomplete |
| Horton | 3 | Main/minimum enquiries, shape, shortage, zero/one/two KC, queen rule, forcing-jump cues and game | Minimum threshold provisional. Last Train and competitive replies remain open. |
| Reordered opener rebids | 13 | Five no-support single-suiters, four three-card-support entries, four reverses, strength escapes | Some natural continuations and discretionary bidding over a final contract excluded |
| Reordered mini–mega | 10 | New high/low bid positions, partscore escape, non-serious/control route | Opener-takes-control keycard, Exclusion and extreme-shape upgrades excluded |
| Whole-auction openings | Whole auction and Just bid | First/second-seat 1C/1D/1M, weak 1NT, strong 2C, Horton twos and strong 2NT. All 63 study profiles reachable from the opening in either seat | See [opening coverage](opening-auctions.md) for playable routes and pending slam/competitive agreements |
| Passed-hand openings | Whole auction and Just bid | Uncontested third/fourth-seat 1C, 1D, 1M, strong 1NT, strong 2NT and 2C/2NT, with prior passes and vulnerability | See [passed-hand coverage](passed-hand.md); P1780 and detailed later continuations remain incomplete |
| **Total relay entries** | **63** | See the generated catalogue for exact selectable prefixes | Opening mode has explicit source-backed subsets |

## Application and analysis work completed

| Component | Behaviour | Principal files |
|---|---|---|
| Fixed practice deals | Both hands exist before the first question; original partner hand never changes; seeded repeats | `core.js`, `sampling-worker.js` |
| Both auction roles | All 63 entries offer asker or teller; teller answers public automatic questions with retry and fixed-hand undo | `practice.js`, `app.js` |
| Family-first practice | Focused study offers eight broad choices draw a random branch and fresh seed; a collapsed study menu retains all 63 exact entries and seed replay | `families.js`, `app.js`, `relay.html` |
| Saved bidding progress | Autosave and restore cards, auction, role, pending question, chosen contract, undo and preferences across reopening in the same browser/site | `progress.js`, `app.js` |
| Bidding interpreter | Source actions, exactly one truthful answer, immutable state, public dynamic nodes, terminal partner Pass | `core.js`, family profile modules |
| Constraint tracker | HCP, controls, lengths, exact SHDC shape sets, unions of conjunctions, keycards/queen/honours | `core.js`, `continuations.js` |
| Shared slam enquiries | Void-first SKC, ordinary KC, queen/specific suits, public compression and branch-specific omissions | `continuations.js` |
| Compatible-hand sampler | Public constraints plus known user cards; shape weighted by actual hand counts; bounded rejection | `core.js`, `sampling-worker.js` |
| Contract evaluator | Random opponents, common complete deals for compared contracts, real DDS, correct seats/first-strain declarer | `evaluation.js`, `evaluation-worker.js`, WASM binding |
| Reports | Prospective/chosen contract assessment, DD make rates, mean tricks, Wilson 95% intervals and paired make/fail outcomes | `evaluation.js`, `app.js` |
| Hindsight review | Revealed partnership fixed over many opponent layouts; separate from auction-compatible sampling and the single original-deal column | `evaluation.js`, `app.js` |
| Phone practice UI | Fixed 13-card hand, four-seat auction, all legal calls with undiscussed markers, hover/focus/hold previews, settings, hand knowledge, typed bids, undo/reveal/stop, assessment sheets and full history | `relay.html`, `app.js`, `table-ui.js`, `bid-preview.js`, `relay.css` |
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
| 4M in 1M–2NT | Range and initial keycard asks skip 4M. Answers count 4M. The keycard follow-up after a void also counts 4M. |
| Balanced KC and rare five keycards | User confirmed ordinary ladder without void, retaining 2/5 possibilities |
| Public length compression | User confirmed; four cards cannot produce Kx; no hidden-card compression |
| Balanced Jacoby range replies | User confirmed 11 November: after 1M–2NT–3C–3D, 3H/3S/3NT = 12–14/15–17/18–19. Balanced 9–11 hands take 1NT or the direct great-suit 4M route; balanced practice floor is 12 |
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
| Several opponent layouts per compatible hand | Auction-information evaluation uses one layout per independently sampled hand; revealed-partnership mode now tests many layouts for the two actual hands |
| Full declarative editor | Profiles are declarative JavaScript data/functions; no standalone bidding language or partner-facing editor yet |
| Physical-device and later-continuation browser coverage | Automated Chromium/Firefox/WebKit and mobile emulations check all 63 initial branches in both roles; complete later continuations and real DDS are checked on representative branches |

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

The asker/teller and contract-assessment extension passes **107 relay tests**,
including all 63 teller exercises, plus the static build and existing utility,
UI and compiled DDS smoke checks. The optional Playwright regression exercises
both browser roles on representative families, real DDS assessment before
signoff, revealed-partnership review, retention of chosen contracts, undo,
Stop, mobile layout and absent DDS. It does not evaluate optimal bidding.

The subsequent game-force clarification keeps trump bids below game available
as queen/specific-suit asks. The exact 1D–1S–2C–2H–3H–3S–4C auction now offers
4D for the diamond queen, then 4H/4S for hearts/clubs. All **108 relay tests**,
the static build and compiled DDS smoke pass. A focused mobile Chromium check
also verifies the corrected buttons, queen answer, undo and typed 4D entry.

The progress-persistence fix brings the relay suite to **114 passing tests**.
Browser checks include reload in both roles, full browser restart, restored
undo/preferences/completed auctions and corrupt-save recovery. Saved state is
local to one browser/origin; DDS jobs/results are not persisted.

The 11-count correction removes the expanded minor entries' former gap between
9–10 and 12+. In particular, 1D–1S–2C now admits 9–22; ordinary 11-counts
describe shape and remain available to compatible sampling. All **116 relay
tests**, the static build and DDS smoke pass. A mobile browser check deals a
real 11-count, verifies the 9–22 entry and 11–22 ordinary-response labels,
samples 100 compatible hands and reveals the 11 HCP. Previously saved sessions
retain their recorded constraints; deal a new hand to use the corrected range.

The family picker groups all 63 study branches into eight broad choices.
**121 relay tests** pass, including complete grouping, random branch reach,
explicit study selection and backward-compatible family/study restoration.
Browser checks cover the family menu, fresh hidden seeds, random-mode replay,
pinned-branch next hands, both roles, saved progress, DDS and mobile layout.

The empty-menu fix removes the browser's `Map.groupBy` dependency and versions
the full module/worker/engine graph to avoid cached scripts from older pages.
Deal cancellation/failure restores the selected controls to the retained hand.
**122 Node unit/build tests** and **45 browser tests** pass, including all 63
initial branches in both roles in five desktop/mobile browser configurations,
stale-script and missing-API regressions. Real DDS and browser-restart checks
also pass. The Pages workflow requires these suites before publishing.
