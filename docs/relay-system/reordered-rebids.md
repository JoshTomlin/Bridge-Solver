# Reordered opener rebid tables

[All system tables](README.md) · [Detailed rebid source map](../relay-reordering-source.md)

Authority: the separate [Reordering Opener's Rebid](../system-sources/reordering-openers-rebid.txt)
document, R0001–R0192. These are natural suit-response auctions, including
the club transfers that show a natural major. They do not include artificial
1C–1S. You are responder South; North is opener. There are 23 exercises.

## Single-suit rebids without three-card support

All five show six-plus in the opened suit, no second four-card suit and
zero–two in responder's major. Practice uses 14–19 and at most one shortage.

| Prefix | Shortage ask | Minimum response | Subminimum | Invitation | Six-card major | Solid major | Request 3NT |
|---|---|---|---|---|---|---|---|
| 1C–1D–2D | 2H | 2S, 5–6 | 2NT, 0–4 | 3C, 7–9 | 3D = hearts | 3H = hearts | 3S |
| 1C–1H–2D | 2H | 2S, 5–6 | 2NT, 0–4 | 3C, 7–9 | 3D = spades | 3H = spades | 3S |
| 1D–1H–2S | 2NT | 3C, 5–6 | — | 3D, 7–9 | 3H = hearts | Same major call | 3S |
| 1D–1S–2H | 2S | 2NT, 5–6 | 3C, 0–4 | 3D, 7–9 | 3H = spades | Same major call | 3S |
| 1H–1S–3C | 3D | 3H, 5–7 | — | — | 3S = spades | Same major call | — |

Minimum/subminimum paths return to opener's suit; the heart minimum passes
3H. The deterministic invitation policy passes 3m with 14–16 and bids 3NT
with 17–19. Source-permitted invitation slam cues are not compulsory here.
Responder's 3NT is to play when available as a final-contract action.

### Exact first shortage replies

`Lower` = 14–16 and `upper` = 17–19 in the minor-opening rows. A bare
shortage reply retains the full 14–19 range.

| Prefix and ask | No shortage | Middle shortage | High shortage | Low shortage, lower | Low shortage, upper |
|---|---|---|---|---|---|
| 1C–1D–2D–2H | 2S | 2NT hearts | 3C spades | 3D diamonds | 3H diamonds |
| 1C–1H–2D–2H | 2S | 2NT hearts | 3C spades | 3D diamonds | 3H diamonds |
| 1D–1H–2S–2NT | 3C | 3D hearts | 3H spades | 3S clubs | 3NT clubs |
| 1D–1S–2H–2S | 2NT | 3C hearts | 3D spades | 3H clubs | 3S clubs |
| 1H–1S–3C–3D | 3H | 3S diamonds | 3NT spades | 4C clubs, full range | No extra split |

R0108's eight-entry minor-opening strength rule does not add a fifth response
to the heart-opening entry. Use ordinary KC after no shortage, SKC after an
identified shortage. With an unbid five-plus minor and public nonshortage there,
responder may bid that minor for keycard, except the rolling step remains
reserved for the current agreed suit (R0066/R0103).

| Six-card-major continuation | Bot's supported reply |
|---|---|
| No two-card fit or singleton ten-plus | 3NT |
| Two/three cards or singleton T/J/Q/K/A, lower strength | 4M |
| Suitable support, upper strength | Cheapest permitted control cue, falling back to game |
| Separate solid-major option | Sets the major and starts the disclosed control-cue route |

The separate solid option requires AKQJT9 or better in the practice hand.
Major quality otherwise remains player judgement. Reverse-upgrade hands
below 16 are included in the lower-strength fit answer of their reverse entry.

## Six-card minor with three-card major support: 2NT rebid

| Prefix | Full range | Lower / upper | Minor-agreement shortage ask | Major-agreement shortage ask |
|---|---|---|---|---|
| 1C–1D–2NT | 14–19 | 14–16 / 17–19 | 3D, clubs | 3S, hearts |
| 1C–1H–2NT | 14–19 | 14–16 / 17–19 | 3D, clubs | 3H, spades |
| 1D–1H–2NT | 16–19 | 16–17 / 18–19 | 3C, diamonds | 3S, hearts |
| 1D–1S–2NT | 16–19 | 16–17 / 18–19 | 3C, diamonds | 3H, spades |

Exactly three in the major, six-plus in the minor; no second four-card suit.
Diamond 14/15 hands with three-card support use the separate 1NT support route.

| Agreed minor / ask | No shortage | High shortage | Low shortage, lower | Low shortage, upper |
|---|---|---|---|---|
| Clubs / 3D, either club prefix | 3H | 3S other major | 3NT diamonds | 4C diamonds |
| Diamonds / 3C, either diamond prefix | 3D | 3H other major | 3S clubs | 3NT clubs |

| Prefix / major-agreement ask | No shortage | High shortage | Low shortage | Fourth reply |
|---|---|---|---|---|
| 1C–1D–2NT–3S, hearts agreed | 3NT lower | 4C spades, full range | 4D diamonds, full range | 4H no shortage, upper |
| 1C–1H–2NT–3H, spades agreed | 3S full range | 3NT hearts, full range | 4C diamonds, lower | 4D diamonds, upper |
| 1D–1H–2NT–3S, hearts agreed | 3NT full range | 4C spades, full range | 4D clubs, lower | 4H clubs, upper |
| 1D–1S–2NT–3H, spades agreed | 3S full range | 3NT hearts, full range | 4C clubs, lower | 4D clubs, upper |

The first row deliberately retains R0120's explicit full-range diamond-shortage
answer, despite R0107's broader low-shortage rule. With a major agreed, 3NT
can be an asking call. With a minor agreed, responder's 3NT is to play.

## Playable-game strength distinction

When range is still broad, a relay reply on **3NT with a minor agreed** or
**4M with a major agreed** shows the lower range. The same hand-information
answer with upper-range values moves beyond the whole response ladder.

| Normal enquiry | Extra upper-range answer |
|---|---|
| Ordinary KC, four replies | Fifth reply repeats the game-landing category with upper strength |
| SKC, five replies | Sixth reply repeats the game-landing category with upper strength |
| Queen/specific-suit/follow-up enquiry | First reply beyond its complete public ladder, if one normal answer lands on the relevant game |
| Strength already disclosed | No extra range escape |

| Source example / ask | Normal lower answer | Upper escape | Same information |
|---|---|---|---|
| R0113, 3S club KC | 3NT | 4S | 0/3 KC |
| R0126, 3NT spade KC | 4S | 4NT | 2/5 KC + queen |
| R0137, 3C club SKC | 3NT | 4D | Singleton hearts; 2/5 KC without queen |
| R0139, 3D club SKC | 3NT | 4H | Singleton spades; 1/4 KC |
| R0151/R0178, 3S diamond SKC | 3NT | 4NT | Spade void |
| R0157, 4D heart SKC | 4H | 5H | Spade void |
| R0167, 4C spade SKC | 4S | 5D | Singleton hearts; 1/4 KC |
| R0185, 3C diamond KC | 3NT | 4C | 2/5 KC + queen |
| R0135 exception, 2NT club KC | 3S | 3NT | 2/5 KC + queen; explicit last-answer split before game |

Retain the ordinary 0/3, 1/4 and 2/5 alphabets even where an example names one
count. R0128's inconsistent keycard counts are resolved by keeping the ladder
category and changing only strength; see the detailed source review.

## Reverses

Ordinary practice reverses are 16–22, five-plus opened suit, four-plus reverse
suit, opened suit at least as long, no outside four-card suit. The rare
14/15 upgrades have the exact three-card-support shapes shown below.

| Prefix | Reverse suit | Shortage asks / agreement | Minimum escape | Major / 3NT request |
|---|---|---|---|---|
| 1C–1D–2S | Diamonds | 2NT clubs; 3D diamonds | 3C with 0–7, passed | 3H shows six hearts; 3S requests 3NT |
| 1C–1H–2H | Diamonds | 2S clubs; 3D diamonds | 2NT with 5–7, opener 3C; 3C with 0–4, passed | 3H shows six spades; 3S requests 3NT |
| 1C–1H–3C | Hearts | 3D clubs; 3H hearts | Pass 3C available | 3S shows six spades |
| 1D–1S–3C | Hearts | 3H diamonds | 3D with 5–6, passed | 3S shows six spades |

| Prefix / ask | High-shorter answer | Low-shorter answer | Equal outside lengths | 14/15 upgrade |
|---|---|---|---|---|
| 1C–1D–2S–2NT | 3C, spades | 3D, hearts | 3H | 3S = 1345 |
| 1C–1D–2S–3D | 3H, spades | 3S, hearts | 3NT | 4C = 1345 |
| 1C–1H–2H–2S | 2NT, spades | 3C, hearts | 3D | 3H = 3145 |
| 1C–1H–2H–3D | 3H, spades | 3S, hearts | 3NT | 4C = 3145 |
| 1C–1H–3C–3D | 3H, spades | 3S, diamonds | 3NT | 4C = 3415 |
| 1C–1H–3C–3H | 3S, spades | 3NT, diamonds | 4C | 4D = 3415 |
| 1D–1S–3C–3H | 3S, spades | 3NT, clubs | 4C | No fourth category |

High/low compare the two outside suit lengths. Equal can include 5422,
equal two-shortage or two-void hands. Normal 16+ hands of an upgrade shape
use the ordinary answer, not the fourth rung. A single known shortage leads
to SKC; equal outside lengths use ordinary KC.

After an upgrade, next step (excluding 3NT) asks ordinary KC in the agreed
suit; major Kickback is also available. The exception after
`1C–1H–3C–3H–4D` is **4H to play, 4S heart KC, 4NT spade KC**.

## Reordered mini–mega splinters

The two bids immediately below 3M show the two outside shortages, high then
low. Main notes P1442–P1458 supply continuations; R0006–R0021 moves the bids.

| First two calls | Agreed major | High-shortage splinter | Low-shortage splinter |
|---|---|---|---|
| 1C–1D | Hearts | 3C, spades | 3D, diamonds |
| 1C–1H | Spades | 3D, hearts | 3H, diamonds |
| 1D–1H | Hearts | 3C, spades | 3D, clubs |
| 1D–1S | Spades | 3D, hearts | 3H, clubs |
| 1H–1S | Spades | 3D, diamonds | 3H, clubs |

| South's continuation | Mini, 11–13 practice range | Mega, 17–19 practice range |
|---|---|---|
| 3M | Pass | 4M |
| 4M final contract | Pass | Pass under the final-contract practice policy |
| Non-serious: 3S in hearts, 3NT in spades | 4M | Permitted cheapest control cue; game if no cheaper cue |
| Serious control cue | 4M | Permitted cheapest control cue; game if no cheaper cue |

Practice promises exactly four trumps, five-plus in the opened suit and one
shortage. The cue route keeps responder as asker and then offers ordinary
major Kickback. Opener-takes-control keycard, Exclusion, extreme-shape upgrades
and optional bidding on over a selected final signoff are not implemented.
