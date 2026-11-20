# 2NT opening and deeper continuations

[System tables](README.md) · [Original notes P1311–P1429](../system-sources/main-notes.txt)

This is the first/second-seat **20–22 2NT opening**, separate from the Horton
2NT enquiry. Whole auction and Just bid now continue beyond game selection.
Both hands stay fixed. Either physical seat can ask or answer keycards;
each call, public constraint and actual first bidder of a strain is retained.

Josh confirmed the same continuations after **2C–2D/2H/2S–2NT** in first or
second seat. That 2NT rebid shows **23+ balanced** and retains the control
reply and both hands. Opener alone asks Keycard (P1309). The bot treats 25+
as a maximum for slam invitations after this rebid. Third/fourth-seat
**2C–control reply–2NT** continues with Puppet under P1829.

## Implemented routes

| Route | Continuations |
|---|---|
| 2NT–3C Muppet | Four/five-card major answers; opposite-major fit enquiry; both-major game/slam choices; major agreement and control cues |
| 2NT–3C–3H | Direct 3NT = five spades/four hearts; 3S puppets to 3NT; natural five-card-minor slam tries and separate 5–4 major slam tries |
| 2NT–3C–3H–3S–3NT | Delayed minor Stayman, five-plus/five-plus major slam tries, or Pass |
| Muppet finds no fit for responder's four-card major | Five-plus-minor slam tries, quantitative 4NT and 5NT asking for a four-card minor |
| 2NT–3D/3H transfers | Ordinary and super acceptances, four-level re-transfers, game/notrump choice, second-major descriptions and natural four-plus-minor slam tries |
| 2NT–3S minor Stayman | Four/five-card-minor answers, natural slam tries after 3NT, shortage descriptions, control cues and source-specific Kickback |
| Direct 2NT–4C/4D | Slam try in the opposite minor; opener may ask keycards, cue, choose minor game or offer 4NT |
| 2NT–4H–4S | Responder can pass or use 4NT spade Kickback |
| Agreed suit | Available control cues and ordinary Kickback, then shared queen and specific-suit enquiries |
| Explicit quantitative 4NT | Opener may pass or accept with 6NT; it is never silently converted into keycard |

An explicit source meaning takes precedence over a generic asking or final
contract call. In particular, 4NT may be quantitative, to play, a fit/quality
description, a shortage description or keycard depending on the full prefix.

## Minor-suit Kickback positions

| Auction before the ask | Keycard call and suit | Source |
|---|---|---|
| 2NT–3S–4C | 4D, clubs | P1405 |
| 2NT–3S–4D | 4H, diamonds | P1410 |
| 2NT–3S–4H | 4NT, clubs | P1399 |
| 2NT–3S–4S | 4NT, diamonds | P1399 |
| 2NT–3C–3H–3S–3NT–4C–4D | 4H, clubs; 4S, diamonds | P1349 |
| Same delayed enquiry, opener 4H | 4S, clubs; 4NT is no fit | P1350 |
| Same delayed enquiry, opener 4S | 5C, diamonds; 4NT is no fit | P1351 |
| 2NT–4C | Opener 4D, diamonds | P1416 |
| 2NT–4D | Opener 4H, clubs | P1422, printed `4HHH` interpreted as 4H |

The direct opposite-minor asks reverse the asking role: opener asks and
responder answers. After 2NT–4C and an opener 4H/4S diamond cue, responder's
4NT is diamond Kickback (P1417).

After a normal major transfer, responder's natural 4m can give opener a
choice of keycard suits. After 2NT–3D–3H–4C, 4D asks in clubs and 4S asks
in hearts. After 2NT–3H–3S–4C, 4D asks in clubs and 4NT in spades. After
2NT–3H–3S–4D, 4H asks in diamonds and 4NT in spades. The less spacious
2NT–3D–3H–4D table retains P1375: 4H/4NT to play, 4S heart Kickback and
5C a diamond cue; no extra diamond keycard call has been invented.

## Response ladders and public information

Ordinary Kickback uses the existing 0/3, 1/4, 2/5 without queen, 2/5 with
queen ladder. Responses count consecutive calls, including game. Later queen
and specific-suit enquiries reuse the shared continuation engine, public
length compression and its game/grand-try reservations. A shortage cue does
not automatically change ordinary Kickback into void-first SKC.

The human answers their own call. No answer is computed from their cards and
inserted before their turn. Menus and previews use only public information;
the bot receives only its own hand and the auction. Historical alternatives
retain the response ladder that belonged to that question.

## Training policy and remaining questions

Generation uses 20–22 opener hands in 4333/4432/5332, opposite 6–16. It now
includes slam-interest responders and super-accept fits. This numerical
subset is not a claim that stronger responders or other balanced shapes are
forbidden by the full system.

The bot takes game choices with weaker responders; with **11+** it explores
a shown fit and follows the shared questions. For explicit quantitative
invitations it accepts with **22** and declines with **20/21**. These are
disclosed practice policies, not partnership definitions of slam quality.
Humans are not graded against those cutoffs. Controls and explicitly promised
lengths are checked. The existing Q6 asks for partnership judgement examples.

Q8 remains open: after Muppet shows five hearts with 3NT, a responder 4D
retains P1354's **diamond cue agreeing hearts**, not an inferred re-transfer.

The notes identify Exclusion calls but do not give their response alphabet.
Q13 asks whether ordinary 0/3–1/4–2–2+Q steps apply excluding the void ace.
Those calls still use the explicitly labelled unsupported-contract fallback.
General-grand-try and fourth-round-control replies remain unconfirmed in the
shared engine. The retained original notes are unchanged.

## Verification

Source fixtures cover the distinct minor Kickback positions, role reversal,
ordinary and super transfers, re-transfers, quantitative/signoff/keycard 4NT,
queen and side-suit replies, wrong-answer immutability and actual declarer.
Generated walks exercise both seats, random compatible alternatives, all
saved turns and complete undo histories. Phone browser checks use the built
assets and cover alternatives, errors, reopening, undo and partner reveal.
