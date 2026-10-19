# Split-range, support and Horton tables

[All system tables](README.md) · [Detailed advanced source map](../relay-advanced-source.md)

## Split-range and three-card-support entries

South asks about North. Sources: P1524–P1687. Exact practice bands below make
the source's overlapping parenthesized boundaries deterministic.

| Entry | Opener's practice meaning | GF/range enquiry |
|---|---|---|
| 1C–1D–2H | 9–10 unbalanced, three/four hearts; or 14–15 no shortage, four hearts | 2S |
| 1C–1H–2S | 9–10 unbalanced, three/four spades; or 14–15 no shortage, four spades | 2NT |
| 1D–1H–2H | 9–10 unbalanced, three/four hearts | 2S |
| 1D–1S–2S | 9–10 unbalanced, three/four spades | 2NT |
| 1D–1H–1NT | 11–15, exactly three hearts, listed support shapes | 2C |
| 1D–1S–1NT | 11–15, exactly three spades, listed support shapes | 2C |

Practice responder is 14–21 with four–six major cards. The old Bourke prefixes
in this source section are not reintroduced alongside the superseding July
email. Natural invitational alternatives to the direct GF enquiry are source
context and are not separate bot branches.

### Three-card-support shape answers

| Major / opened minor | Shape answer | Exact shape or family |
|---|---|---|
| Hearts / clubs | 2NT | 4315 / 4306: four spades, diamond shortage |
| Hearts / clubs | 3C | Six-plus clubs, no undisclosed four-card suit, exactly three hearts |
| Hearts / clubs | 3D | 1345 / 0346: four diamonds, spade shortage |
| Spades / clubs | 3C | Six-plus clubs, no undisclosed four-card suit, exactly three spades |
| Spades / clubs | 3D | 3145 / 3046: four diamonds, heart shortage |
| Spades / clubs | 3H | 3415 / 3406: four hearts, diamond shortage |
| Hearts / diamonds | 2NT | 4351 / 4360: four spades, club shortage |
| Hearts / diamonds | 3C | 1354 / 0364: four clubs, spade shortage |
| Hearts / diamonds | 3D | Six-plus diamonds, no undisclosed four-card suit, exactly three hearts |
| Spades / diamonds | 3C | 3154 / 3064: four clubs, heart shortage |
| Spades / diamonds | 3D | Six-plus diamonds, no undisclosed four-card suit, exactly three spades |
| Spades / diamonds | 3H | 3451 / 3460: four hearts, club shortage |

The corrected diamond shapes follow the later explicit P1600/P1617 examples.
After a direct 2M raise, **3M instead shows weak four-card support**. Only
club raises also have the higher no-shortage four-card-support answers below.

### 1D–1M–1NT range resolution

| Answer to 2C | Range in practice | Next step |
|---|---|---|
| 2D | 13, middle band | 2NT continues to shape; 2M can be played when legal |
| 2M | 11–12, minimum | 2NT continues to shape, or pass 2M |
| Above 2M | 14–15, maximum | Describe the applicable shape immediately |

The maximum shape replies retain their printed bids in the shape table.
The minimum/middle 2NT follow-up also uses that shape table; **the heart/diamond
1NT entry omits the four-spade 2NT answer**, because four spades were denied
by the earlier 1NT route. These are disjoint practice interpretations of the
source's `(11)12 / 12/13 / 14/15` bands, not new partnership boundaries.

### No-shortage 14–15 club-raise policy

The notes leave slam judgement to the player. The bot uses this disclosed
**practice policy**, counting ace = two controls, king = one.

| Hand / controls | Hearts agreed | Spades agreed |
|---|---|---|
| Up to three controls | 4H | 4S |
| Exactly four controls | 3S non-serious | 3NT non-serious |
| Five-plus, a suitable outside control | Cheapest serious cue: 3NT spades, 4C clubs, 4D diamonds | Cheapest serious cue: 4C clubs, 4D diamonds, 4H hearts |
| Five-plus but no permitted cheaper control | 4H | 4S |

Artificial non-serious/cue answers at 3NT cannot be passed as a natural offer.

### Agree a suit after a shortage/shape description

| Entry / North's shape answer | Agree opened minor | Agree responder's major | Agree North's second suit |
|---|---|---|---|
| Clubs/hearts, 2NT | 3C clubs | 3H hearts | 3D spades |
| Clubs/hearts, 3D | 4C clubs | 3H hearts | 3S diamonds |
| Clubs/spades, 3D | 4C clubs | 3S spades | 3H diamonds |
| Clubs/spades, 3H | 4C clubs | 3S spades | 4D hearts |
| Diamonds/hearts, 2NT | 3D diamonds | 3H hearts | 3C spades |
| Diamonds/hearts, 3C | 3D diamonds | 3H hearts | 3S clubs |
| Diamonds/spades, 3C | 3D diamonds | 3S spades | 3H clubs |
| Diamonds/spades, 3H | 4D diamonds | 3S spades | 4C hearts |

The shortage-suit cue agrees the second suit. Lowest-level agreement takes
precedence when its call could otherwise look like Kickback: specifically,
**1C–1H–2S–2NT–3H–4D agrees hearts** (P1595); it is not simultaneous club KC.
To pursue clubs there, agree with 4C, receive the cue and use the higher 4NT
route when necessary. The app offers only one meaning per call.

After the GF shape response the caller must establish a fit below game, use
an offered source-defined Kickback, or choose 3NT. The direct game jump is
blocked while the profile requires agreement. Bot cues use the cheapest
permitted ace, king or shortage; 3S is reserved in hearts and 3NT can cue spades.
After the cue, use ordinary Kickback, or 4NT when the lower Kickback is passed.

| Single-suit answer | Shortage enquiry | Low-level agreements before enquiry |
|---|---|---|
| 3C with hearts/clubs | 3D, spade then diamond shortage | 3H hearts; 4C clubs |
| 3C with spades/clubs | 3D, heart then diamond shortage | 3S spades; 4C clubs |
| 3D with hearts/diamonds | **3S**, spade then club shortage | **3H agrees hearts**; 4D diamonds |
| 3D with spades/diamonds | 3H, heart then club shortage | 3S spades; 4D diamonds |

Responses count from the actual ask. The diamond/heart 3S shortage enquiry
therefore receives 3NT high / 4C low, counting 3NT as an answer.

## Horton Two openings and 2NT

Sources: P1060–P1292. In this practice set opener has 0–8 HCP, four/five
spades, four-plus in the second suit and at most one outside shortage.
Vulnerable nine-count and poor-six-spade exceptions are excluded.

| Opening | Shown suits | Opening priority in the admitted set |
|---|---|---|
| 2D | Spades + diamonds | No four hearts |
| 2H | Spades + hearts | Four hearts selects this entry |
| 2S | Spades + clubs | No four hearts or four diamonds; avoids the subjective minor-opening choice |

**Provisional minimum policy:** 0–4 HCP minimum, 5–8 nonminimum. The source
does not define the threshold numerically. It is exported as `HORTON_POLICY`
and can change without changing the source shape schedule.

| Answer to 2NT | Description |
|---|---|
| 3C | Minimum, any admitted shape |
| 3D | Nonminimum: four spades, five-plus second suit |
| 3H | Nonminimum: five spades, four second suit |
| 3S | Nonminimum: four spades, four second suit |
| 3NT | Nonminimum: five-five or longer, no void |
| 4C | Nonminimum: five-five or longer, high outside void |
| 4D | Nonminimum: five-five or longer, low outside void |

High/low are the two suits left after removing spades and the second suit.
The source's “five-five” family can include longer second-suit hands within
the disclosed one-shortage subset.

### Further enquiry after 3C minimum

| Opening and ask | First answer | Second answer | Third answer |
|---|---|---|---|
| 2D–2NT–3C–**3H** | 3S, four spades | 3NT, five spades | — |
| 2H–2NT–3C–**3D** | 3H, four spades/five-plus hearts | 3S, four-four | 3NT, five spades |
| 2S–2NT–3C–**3D** | 3H, four spades/five-plus clubs | 3S, four-four | 3NT, five spades |

The five-spade reply includes possible five-five minimums; it does not promise
exactly four in the second suit. After a 2D minimum, 3D is to play, not the
further enquiry.

### Agree trump and ask shortage after a basic description

| Last basic shape answer | Agree spades / shortage ask | Agree second suit / shortage ask |
|---|---|---|
| 3D | 3H | 3S |
| 3H | 3S | 4C |
| 3S | 4C | 4D, except 2H opening |
| 3NT after minimum follow-up | 4C | 4D, except 2H opening |

The step/step+1 slots retain reservations rather than silently shifting a
blocked slot. **4D is Last Train in hearts after a 2H opening**, so that heart
shortage ask is absent; the direct 5C Horton heart-KC route is still available.
3NT by responder and games are reserved for play. The contradictory P1274
3NT-shortage row is not implemented. Last Train itself has no bot reply yet.

Shortage answers are **no/high/low**, consecutive after the actual ask, in
the two outside suits. Impossible no-shortage replies remain unselected for
hands already known to have five-five shape. Direct Horton Kickback is 4NT
spades, 5C hearts, 4H diamonds, 4D clubs; an assigned shortage enquiry wins
over a coincident direct-KC call.

### Five-five descriptions and keycards

After a main five-five description, step and step+1 ask KC in spades and the
second suit respectively, skipping 3NT and games in the two shown suits.
They use ordinary Horton KC, including when a void was already described.

| Horton ordinary KC rung | Meaning |
|---|---|
| 1 | Zero keycards |
| 2 | One keycard |
| 3 | Two keycards |

| Horton SKC rung after an identified shortage | Meaning |
|---|---|
| 1 | Void in that shortage |
| 2 | Singleton shortage, zero keycards |
| 3 | Singleton shortage, one keycard |
| 4 | Singleton shortage, two keycards |

After an SKC void reply the separate KC enquiry also has zero/one/two answers.
Offer the two-answer queen ask after zero or one; omit it after two. Later
asks skip the actual game in the agreed suit: 4M or 5m. Specific-suit asks
then use the shared public-length compression rules.
