# Whole-auction opening practice

Choose **Whole auction → Opening family** to practise a particular opening.
The selector includes weak 1NT, strong 2C, each Horton two, strong 2NT and
passed-hand openings alongside 1C, 1D and 1M. **Just bid** and **Mix all
openings** draw an opening group and an independent opener/responder seat.
The passed-hand group draws third/fourth seat and vulnerability in Just bid.
In a dedicated passed-hand family those are settings. Replay preserves the
seat, deal and applicable settings.

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
| 1H/1S | Three-way 2C, natural 2D and 1S–2H, natural invitations, weak raises and Jacoby. 1H–1S continues through natural rebids, the 1NT range and shape enquiries, the 2C resolver and reordered rebids | Further rebids over the direct nonforcing 1NT response and some later slam, shortage and invitation continuations are incomplete |
| Weak 1NT | Stayman, invitations, Smolen, transfers to majors, super-accept and splinter entries, 2NT minor puppet, Baron, natural game and quantitative choices | Uses a 9–13 subset of P0070–P0072. Later control/Keycard and competitive routes are incomplete |
| Strong 2C | 2D = 0/1/4 controls; 2H = 2/5; 2S = 3. Long-suit transfers and exact controls after acceptance, direct 3NT description, natural rebids and game choices | 23+ balanced and selected distributional game forces. First/second-seat 2NT continuations and opener's later Keycard agreements need confirmation |
| Horton 2D/2H/2S | Bid the actual opening, then use the same signoffs, 2NT enquiry, shape, shortage and Keycard tables as the focused drills | Four/five spades, four-plus diamonds/hearts/clubs respectively, 0–8. Whole auctions include weaker responders |
| Passed hand | Third/fourth-seat club, diamond, major, strong 1NT, strong 2NT and strong 2C into 2NT | See [the passed-hand tables](passed-hand.md) for prior passes, vulnerability, response tables and gaps |
| 2NT | Muppet and direct/delayed minor Stayman; major transfers/re-transfers; major/minor slam tries; cues, Kickback, queen and specific-suit enquiries; quantitative choices | 20–22 in 4333/4432/5332; responder 6–16. Subjective policies and remaining Exclusion/general-grand-try questions are disclosed in the [2NT tables](notrump-opening.md) |

The diamond and major opening tables follow P0631–P0691, P0885–P0924,
P1478–P1522, the July email and the separate reordering document. The strong
2NT opening follows P1311–P1429; it is separate from the Horton 2NT enquiry.

In first or second seat, 1♥–1♠ shows four-plus spades and forces opener to
rebid. Four spades and three hearts can take this route. After opener's
12–17 1NT rebid, 2♣ asks range and 2♦/2♥/2♠ show 14–15/12–13/16–17
respectively. Responder can also pass 1NT. The direct 1M–1NT response is
nonforcing. Forcing new suits stay distinct from the weak spade jumps and
natural invitations described in P0889–P0908. A forcing call cannot trigger
the trainer's contract fallback or be passed by partner.

After 1♠–2♥–2♠ the notes explicitly give 3♠ as three spades and six hearts,
forcing (P0996). The trainer also offers 2NT and 3♥ as natural invitations,
and 3♣/3♦ as four-plus cards in the new minor, forcing for one round. Over
a new minor, opener can show support, give a heart or spade preference, or
choose game. These natural continuations are practice agreements pending
confirmation. The bot's invitation decisions reuse the existing practice
cutoff of 12 HCP. Human choices use the shown lengths and retain judgement.

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

The 2NT bot explores fits with an 11+ responder, then follows the shared
keycard questions; weaker responders choose game. Quantitative invitations
are accepted with 22 and declined with 20/21. These are provisional practice
policies; human super-accepts and slam judgements are checked for promised
lengths/controls, not graded against those cutoffs. Partnership criteria and
1M–2C limit-raise acceptance remain Q6/Q7 in [questions for Markey](questions-for-markey.md).

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
