# Partnership questions for Markey

Recorded 11 November 2026. Q1 and Q2 have been sent to Josh; answers pending.

Open questions are recorded without changing the retained source notes. Later
answers should record the date, scope and affected source examples, then update
rules, readable tables and independent expected-auction tests together.

## Questions sent to Josh

| ID | Question | Source / conflict | Current treatment |
|---|---|---|---|
| Q1 | After an artificial opener 3NT reply showing shape or keycards, may the asker pass to play 3NT, or is it forcing except where the sequence explicitly permits Pass? | The maintenance invariant says artificial replies are forcing; some current continuations offer Pass. July's responder-3NT-to-play rule does not settle opener's artificial reply. Explicit reordered strength escapes must be retained. | Awaiting answer; existing relay behaviour retained. |
| Q2 | Does 16+ unbalanced apply to the 1C–1S–2C rebid generally, including Baron, or only to the 2D resolver? | P0382/P0402/P0412–P0414 retain 17+; the later clarification established 16+ in the resolver. | Awaiting answer; new balanced-opening slice does not depend on this. |

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
