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
| 1H/1S | Weak three-card raise and partscore, Jacoby 2NT from the actual opening, plus supported reordered 1H–1S entries | First increment; ordinary 1NT/2C/2D continuations remain incomplete |
| 2NT | Muppet Stayman, major transfers, re-transfers, notrump/major game choice, minor-suit Stayman descriptions and minor game choice, passing any reply, final slam choices | 20–22 in 4333/4432/5332; responder 6–10. Generated transfer routes avoid the subjective super-accept cases. Quantitative and advanced slam continuations pause |

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
An unimplemented continuation pauses with **Not implemented** and **Undo**;
it is not graded as a wrong system bid and does not invent partner facts or
reveal the hidden hand. In particular, the strong-club 2NT rebid question
Q2a remains separate and unresolved.

## Verification

Independent source fixtures cover the actual 1D–1M–2NT opening sequence,
major-opener Jacoby handover, every Muppet major category, correct contract
declarer and the 2NT transfer/re-transfer distinction. Generated walks test
both human seats, unchanged cards, historical bid prefixes, every saved turn,
completed undo history and deterministic explicit-seat replay. Browser tests
exercise opening selection, mixed openings, old 1C mode, both seats,
reload/undo, meanings and compact phone layouts.
