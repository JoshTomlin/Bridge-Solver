# Whole-auction opening practice

Choose **Whole auction** in settings, then **Opening family**: 1C, 1D, a
random 1H/1S, either individual major, 2NT, or **Mix all openings**. Each new
hand chooses opener/responder independently. Seed replay retains the same
cards, seat and opening. Existing saved 1C auctions remain compatible.

Both hands exist before the first bid. Each bot decision receives only its
own cards and the public auction. A sampling stratum is never stored as an
answer or supplied to the bot. When a route reaches an existing relay,
physical seats, cards and every actual bid survive; only the interpreter's
asker/teller roles may change. Undo and reopening work across this transition.

## Implemented increment

| Opening | Playable routes | Training subset / boundary |
|---|---|---|
| 1C | Existing transfer responses, balanced acceptance/1NT rebid, weak exits, puppet, exact-five-minor and Baron routes into Dappleton | Existing balanced 14–19 subset; unchanged |
| 1D | Natural 1H/1S or artificial 1NT, then the implemented July minor, 1NT support, direct weak support, reordered single-suit, support-2NT, reverse and mini–mega entries | 9–19 opener; clear 14–19 responder with a supported route, or a weak 5–8 diamond raise. Two-major response priorities and strong reverses after 1D–1NT are not generated |
| 1H/1S | Three-way 2C, natural 2D and 1S–2H responses; documented opener rebids, resolving enquiries and game choices; weak raises, Jacoby and selected reordered 1H–1S entries | Ordinary 1NT rebids, detailed cue/solid-suit continuations and remaining 1H–1S routes are incomplete |
| 2NT | Muppet Stayman, major transfers, re-transfers, notrump/major game choice, minor-suit Stayman descriptions and minor game choice, passing any reply, final slam choices | 20–22 in 4333/4432/5332; responder 6–10. Generated transfer routes avoid the subjective super-accept cases. Quantitative and advanced slam continuations use the contract fallback |

The diamond and major opening tables follow P0631–P0691, P0885–P0924,
P1478–P1522, the July email and the separate reordering document. The strong
2NT opening follows P1311–P1429; it is separate from the Horton 2NT enquiry.

The four/five-card major Muppet answers are implemented literally:
3D = one/both four-card majors; 3H = no four/five-card major; 3S = five spades;
3NT = five hearts. Opposite 3D, responder's 3H shows spades and 3S shows
hearts. Opposite 3H, responder's 3S puppets to 3NT; a direct 3NT instead
shows five spades and four hearts. These meanings stay visible on played bids.

Re-transfer sequences retain the actual artificial bids for determining
declarer. For example, `2NT–3D–3S–4D–4H` is declared by opener; a direct
`2NT–3C–3NT–4H` is declared by responder. The code never substitutes an
intended declarer for the first actual bidder of the final strain.

## Decisions and explicit limits

The asking hand may pass any relay answer, including an artificial Muppet
answer below game, or choose a final slam. The reply keeps its original
meaning; the deal and public facts are unchanged.

The bot uses a disclosed game-first policy in this 2NT increment. Human
super-accepts are checked for the promised three/four/five-card support and
actual cue controls; “poor/decent/great for slam” is not given an invented
HCP threshold. These judgement criteria and 1M–2C limit-raise acceptance are
recorded as Q6/Q7 in [questions for Markey](questions-for-markey.md).

Public menus show documented routes beyond the current playable subset.
An unimplemented legal continuation is accepted as a contract choice, with
a labelled partner-Pass fallback and Undo. It is not graded as a wrong system
bid or used to invent partner facts. The finished auction reveals partner. In particular, the strong-club 2NT rebid question
Q2a remains separate and unresolved.

## Verification

Independent source fixtures cover the actual 1D–1M–2NT opening sequence,
major-opener Jacoby handover, every Muppet major category, correct contract
declarer and the 2NT transfer/re-transfer distinction. Generated walks test
both human seats, unchanged cards, historical bid prefixes, every saved turn,
completed undo history and deterministic explicit-seat replay. Browser tests
exercise opening selection, mixed openings, old 1C mode, both seats,
reload/undo, meanings and compact phone layouts.

## Ordinary major responses — 15 November 2026

Whole-auction **1H**, **1S**, **1M** and **Mix all openings** now include:

- **1M–2C:** accept/decline the limit raise, natural other-major acceptance,
  balanced/diamond 2NT resolution (3C asks; 3D balanced, 3H no shortage,
  3S high shortage, 3NT low shortage), strong club/long-major descriptions,
  balanced game-force and club/diamond responder descriptions, and game choices.
- **1M–2D:** minimum major rebid or diamond support; stronger natural rebids,
  2NT and its 3C enquiry. Replies distinguish three diamonds, 5422 with clubs,
  6322 with six of the major, and 14–17 versus 18/19 balanced with two diamonds.
- **1S–2H:** minimums, heart support, natural stronger rebids, 2NT and the
  3C enquiry, including the explicit six-spade/two-heart 14–16 category.

These follow P0993–P1052 and P1478–P1522. For these tables, standard balanced
shapes mean 4333/4432/5332; 5422 and 6322 are admitted only where described.
The engine's older generic `balanced` flag means no shortage and is too broad
for these distinctions.

Generation mixes these routes with the previous major exercises. New ordinary
hands have 9–19 openers and 10–19 responders, with response shape restrictions.
Five-diamond minimum openers opposite 2D are currently excluded because the
literal minimum-support row specifies three/four diamonds. An invitational
six-diamond responder uses the separate jump-response route, so is excluded.
The generation category is discarded; partner chooses bids using its own hand
and public auction only.

Partner uses a **game-first practice policy**, not optimal bidding. In the
ordinary limit-raise/invitation routes it declines with 9–11 and accepts with
12+ after checking whether a more specific rebid applies. This numeric policy
is not an agreed partnership rule; Q7 remains open. Human acceptance and
decline are both available without grading this judgement against the bot's
cutoff. Solid-suit and great-control quality are described but not given new
honour-count thresholds for human answers. The bot uses the existing conservative
AKQJT9-or-better policy when choosing the solid-major rebid. Human responders may pass an artificial reply or
choose a final slam, as previously clarified by Josh.

Detailed later descriptive rebids, cue-bidding, keycard after these natural
agreements, and quantitative slam acceptance remain incomplete. The automated
partner chooses a game or accepts the selected contract. This increment does
not claim complete ordinary-major or slam coverage. The missing **1M–1NT**
continuation table is recorded as Q9 rather than filled from generic Acol.

Independent expected-auction tests cover both physical seats, partscore and
game after the three-way response, diamond/heart enquiry replies, declared
strain, false descriptions, saved progress and historical alternatives.
Generated walks retain both hands and save every turn; browser checks exercise
these routes on desktop and phone layouts, including reload, undo and reveal.
