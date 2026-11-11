# Partnership questions for Markey

Recorded 11 November 2026. Updated with Josh's partial response; see below.

Open questions are recorded without changing the retained source notes. Later
answers should record the date, scope and affected source examples, then update
rules, readable tables and independent expected-auction tests together.

## Questions sent to Josh

| ID | Question | Source / conflict | Current treatment |
|---|---|---|---|
| Q1 | After an artificial opener 3NT reply showing shape or keycards, may the asker pass to play 3NT, or is it forcing except where the sequence explicitly permits Pass? | Example sent: `1D–1S–2C–2H–2NT–3C–3NT`; the final North 3NT is 2/5 diamond keycards without the queen. May South pass? The maintenance invariant says artificial replies are forcing; some current continuations offer Pass. Explicit reordered strength escapes must be retained. | Josh requested an example; example supplied, answer pending. Existing relay behaviour retained. |
| Q2 | Does 16+ unbalanced apply to the 1C–1S–2C rebid generally, including Baron, or only to the 2D resolver? | P0382/P0402/P0412–P0414 retain 17+. Josh's latest response explicitly describes `1C–1S–2C–2D`: all unbalanced replies are 16+; 2NT and 3NT are balanced exceptions. | Resolver scope reconfirmed. Application to the separate 2S Baron continuation remains open. |
| Q2a | What exact balanced hands bid 2NT after `1C–1S–2C–2D`? | Josh suggests a supermaximum, perhaps 20 balanced, and describes 3NT as standard 16–19 balanced. P0421 instead says the supermaximum is 19/20. An earlier user clarification removed the 2NT exception entirely. | Markey confirmation needed. Current resolver still sends 16–20 balanced to 3NT under that earlier clarification. No uncertain 2NT threshold has been invented. The new whole-auction slice is capped at 19 and does not enter this resolver. |

### Josh's latest clarification

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

## First implementation scope

Whole auction starts from the 1C opening, with a randomly chosen human opener
or responder. It currently generates first/second-seat uncontested balanced
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
