# Major raises and shared slam asks

[All system tables](README.md) · [Coverage](coverage.md)

## 1M–2NT: shape and range

South's 2NT shows four-plus support and game-forcing values. North describes
the fixed hidden hand. Sources: P1467–P1477 and subsequent user clarifications.

| North after 1M–2NT | Meaning | South's next enquiry |
|---|---|---|
| 3C | No shortage | 3D asks range |
| 3D | Middle shortage: diamonds | 3H asks range |
| 3H | High shortage: hearts over spades; spades over hearts | 3S asks range |
| 3S | Low shortage: clubs, 9–11 | Already knows range; next eligible ask is SKC |
| 3NT | Low shortage: clubs, 12–14 | Already knows range; next eligible ask is SKC |
| 4C | Low shortage: clubs, 15–17 | Already knows range; next eligible ask is SKC |
| 4D | Low shortage: clubs, 18–19 | Already knows range; next eligible ask is SKC |
| 4M | 9–10 balanced with a great suit | **Source only:** suit-quality judgement not generated |

| Shape answer | Range ask | 9–11 | 12–14 | 15–17 | 18–19 |
|---|---|---|---|---|---|
| 3C no shortage | 3D | 3H | 3S | 3NT | 4C |
| 3D middle shortage | 3H | 3S | 3NT | 4C | 4D |
| 3H high shortage | 3S | 3NT | 4C | 4D | 4H |

The low-shortage row rolls shape and range together; do not ask range again.
No-shortage practice hands have at least 13 HCP, so the first no-shortage
range rung is retained in the table but cannot be selected by a generated hand.

| Reservation | Rule |
|---|---|
| 4M | Skip it when choosing a relay ask, including the ask after a void |
| 4M as an answer | Count it normally; e.g. 1H–2NT–3H–3S–4H = 18–19 |
| 3NT after no shortage | Offer to play; if it would be the next ask, move to 4C |
| 3NT after shortage | Can be an artificial answer/ask according to the branch; do not infer an offer to play |
| Immediate 1M–3NT | Minor-suit hand in the notes; not a trainer shortcut to a 3NT contract |

Practice restrictions: opener 9–19, five-plus major, side suits at most four,
at most one shortage; responder four-plus trumps and 12+ HCP. Opening-choice
judgements, two shortages and a five-card side suit are excluded.

## Keycards

Keycards are **all four aces plus the agreed trump king**. A known shortage
does not remove its ace from this count. Source: P1456/P1462, with the user's
ordinary balanced-keycard and five-keycard clarifications.

| Ordinary KC rung | Meaning |
|---|---|
| 1 | 0 or 3 keycards |
| 2 | 1 or 4 keycards |
| 3 | 2 or 5 keycards, without trump queen |
| 4 | 2 or 5 keycards, with trump queen |

| SKC rung | Meaning |
|---|---|
| 1 | Void in the already identified shortage suit |
| 2 | Singleton shortage; 0 or 3 keycards |
| 3 | Singleton shortage; 1 or 4 keycards |
| 4 | Singleton shortage; 2 or 5 without trump queen |
| 5 | Singleton shortage; 2 or 5 with trump queen |

After the void answer, the next eligible ask uses the four ordinary KC
responses. After no shortage, use ordinary KC directly. A source-defined
ordinary Kickback call remains ordinary even when shortage is already known.
Keep 0/3; a known 12–15 range removes the redundant strength question, not
the first keycard category. Horton has its separate 0/1/2 ladder below.

| Agreed trump | Ordinary Kickback where the source calls for it | Horton direct Kickback |
|---|---|---|
| Clubs | 4D | 4D, unless already assigned as a shortage ask |
| Diamonds | 4H | 4H |
| Hearts | 4S | 5C |
| Spades | 4NT | 4NT |

These are source-node calls, not a replacement for every rolling next-step
keycard ask. A higher 4NT route is used in some split-range continuations.
Reordered single-suiters can add a strength-escape answer at a playable game;
see [reordered rebids](reordered-rebids.md).

## Queen and specific-suit asks

| Queen answer | Meaning |
|---|---|
| First response | No trump queen |
| Second response | Has trump queen |

The queen ask is available when the earlier KC answer has not settled it.
The asker may skip the queen ask and ask a side suit. Horton omits the queen
ask after two keycards, but offers it after zero or one.

| Specific-suit category, before compression | Holding |
|---|---|
| 1 — None | No king/queen and at least three cards |
| 2 — Third-round control | Queen, or two cards/shorter, unless a more specific king category applies |
| 3 — Kxx+ | King with three-plus cards, without queen |
| 4 — Kx | King-doubleton, without queen |
| 5 — KQ | King and queen, any permitted length |

KQ takes priority over Kx/Kxx; those king categories take priority over generic
third-round control. Categories impossible from **public lengths** are removed
before response bids are counted. Actual hidden cards and the asker's cards
never change this public ladder.

| Public information | Categories retained |
|---|---|
| Suit known to be four cards | None; third-round control; Kxx+; KQ — no Kx |
| Suit known to be exactly two cards | Third-round control; Kx; KQ |
| Two unknown side suits | Ask high, then low |
| Three unknown side suits | Ask middle, then high, then low |

Exclude agreed trumps and the identified shortage from the side-suit list.
Skipping an earlier suit does not recover it after a later suit answer.
Queen/suit asking calls skip game and slam bids in the agreed suit and the
call immediately below six of that suit, which is reserved for the unimplemented
general grand try. Trump bids below game remain available as relay steps in
these game-forcing auctions. In particular, after
`1D–1S–2C–2H–3H–3S–4C`, **4D asks for the diamond queen**, with 4H denying
and 4S showing it; skipping the queen ask uses 4H for hearts or 4S for clubs.
This follows the user's 21 October 2026 clarification. Answers still count
consecutive bids. Stop when no complete ladder fits
below 7NT; the program never truncates a ladder to force another enquiry.

Fourth-round-control asks, general-grand-try answers and IMP/MP scoring are
not yet defined in the trainer. Evaluation percentages are double-dummy make
rates, not human-play probabilities.
