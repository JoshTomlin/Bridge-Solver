# Partnership questions for Markey

Recorded 11 November 2026. Q1 is resolved by Josh; balanced strong-club details
and the separate Baron scope remain open.

Open questions are recorded without changing the retained source notes. Later
answers should record the date, scope and affected source examples, then update
rules, readable tables and independent expected-auction tests together.

## Questions sent to Josh

| ID | Question | Source / conflict | Current treatment |
|---|---|---|---|
| Q1 — resolved | May the asker pass an artificial relay answer? | Example discussed: `1D–1S–2C–2H–2NT–3C–3NT`; the final North 3NT is 2/5 diamond keycards without the queen. R0105–R0108 explains the teller's strength escape beyond the normal response ladder. | Josh confirmed the asker is in charge and may pass. The earlier maintenance invariant saying artificial answers were forcing was incorrect. All relay answers are passable by the asker; original meanings, facts and source-specific strength escapes remain intact. |
| Q2 | Does 16+ unbalanced apply to the 1C–1S–2C rebid generally, including Baron, or only to the 2D resolver? | P0382/P0402/P0412–P0414 retain 17+. Josh's latest response explicitly describes `1C–1S–2C–2D`: all unbalanced replies are 16+; 2NT and 3NT are balanced exceptions. | Resolver scope reconfirmed. Application to the separate 2S Baron continuation remains open. |
| Q2a | What exact balanced hands bid 2NT after `1C–1S–2C–2D`? | Josh suggests a supermaximum, perhaps 20 balanced, and describes 3NT as standard 16–19 balanced. P0421 instead says the supermaximum is 19/20. An earlier user clarification removed the 2NT exception entirely. | Markey confirmation needed. Current resolver still sends 16–20 balanced to 3NT under that earlier clarification. No uncertain 2NT threshold has been invented. The new whole-auction slice is capped at 19 and does not enter this resolver. |

### Josh's latest clarification

The asker is in charge and can choose the final contract, including passing
an artificial relay answer. A teller who needs to prevent stopping at the
lower contract uses the appropriate source-defined response beyond the
normal relay ladder. R0105–R0108 supplies the reordered strength distinction:
an ordinary game reply is lower range; the first impossible response carries
that answer at the upper range. R0192 separately permits an undisclosed
maximum to continue after responder's signoff. Do not extrapolate the numeric
14–16/17–19 split to unrelated families without their source rules.

This resolves the artificial-3NT concern previously labelled A2 in the local
22 October audit. Passing that answer was not an implementation discrepancy;
the contrary documentation was the error.

After `1C–1S–2C–2D`, Josh believes 16+ unbalanced applies to all the
unbalanced replies. He identifies 2NT and 3NT as balanced exceptions, suggests
2NT may be a supermaximum 20-count, and describes 3NT as standard 16–19
balanced. Record the 2NT suggestion as provisional: do not silently turn
“some mega 20 balanced?” into an agreed exact range or infer the separate
Baron scope from this resolver sequence.

## Further decisions before extending the first opening slice

| ID | Gap / decision | Proposed next step |
|---|---|---|
| Q3 | How should borderline 16/17/18 balanced four-card-major hands choose simple transfer acceptance, split-range raise or jump raise? P0526–P0529 intentionally overlap. | Collect representative hands and acceptable alternative calls; first slice restricts opener to two/three in each major. |
| Q4 | Which hands are too weak/strong for an invitation, and how should a quant invitation be accepted? P0049–P0059/P0483–P0517 include judgement and vulnerability. | Define examples and accept multiple reasonable choices; do not impose an invented unique HCP threshold. The first slice includes only clear 3–6 weak exits and 12–19 slam-interest responses. |
| Q5 | Exact poor-hand and minimum criteria in Horton; the conflicting Horton 3NT shortage enquiry; weak-screen compression and the general grand-try reply alphabet. | Carry forward the detailed questions in audit-2026-10-22.md; resolve before those branches become normal full-auction choices. |

## Original 1C implementation scope

The first whole-auction release started from the 1C opening, with a randomly chosen human opener
or responder. That 1C subset generates first/second-seat uncontested balanced
14–19 openers (two/three in each major, no six-card minor) opposite one
four/five-card major. Responders are either clearly weak (3–6), or 12–19 with
a four/five-card minor. These are disclosed training restrictions.

The first playable routes cover the 1D/1H transfers, 14–17 transfer acceptance
or 18/19 1NT rebid, weak signoffs, the 2C puppet, exact-five-minor transfers,
and the five-major/four-minor Baron agreement leading into existing shortage
and keycard routines. Declarer retains all actual artificial opening bids.

The controller records each call and public facts as it happens, keeps the
human's seat fixed, and selects partner calls from that hand and the auction.
Unsupported routes pause with “Not implemented” and allow Undo. Quantitative
acceptance, broader Baron alternatives, two-major routes, balanced four-card
major choices and ordinary invitations remain subsequent increments.

## Opening-family increment — 13 November 2026

| ID | Question | Current treatment |
|---|---|---|
| Q6 | After a 20–22 **2NT opening**, what agreed examples or criteria distinguish poor/decent/great super-accepts, including the three-card-support 3NT super-accept? How should quantitative invitations be accepted? P1364–P1369 and P1322/P1342 use judgement. | Asked Josh whether to accept alternatives or use agreed examples. No HCP cutoff is invented. Generated transfers avoid the subjective cases; human responses are checked for lengths/controls without grading quality. Quantitative acceptance pauses. |
| Q7 | After **1M–2C**, what makes opener accept/decline the limit raise, and how should borderline responder types be admitted? P1479–P1485 supplies examples and exceptions without a complete numeric decision rule. | Asked together with Q6. The three-way response meaning is visible; its remaining continuation is not fabricated. Existing Jacoby, weak raise and reordered routes are playable from the opening. |

See [opening-auction coverage](opening-auctions.md) for the playable increment,
explicit hand restrictions and the 2NT bot's game-first practice policy. These
questions do not block the implemented mechanical response tables.

### Q8 — five-heart Muppet game and declarer

After `2NT–3C–3NT` (five hearts), does `4D` re-transfer to hearts, or is it a
diamond cue agreeing hearts as P1354 describes for 4m? The transfer re-transfer
rule in P1370 follows the separate major-transfer section. Asked Josh with the
concrete auction; Markey confirmation is welcome. Until clarified, retain the
printed cue meaning and allow a direct 4H final contract with responder as the
first actual heart bidder. Do not silently turn the cue into a transfer or
assign opener as declarer without a heart bid.
