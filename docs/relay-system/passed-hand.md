# Uncontested passed-hand practice

[System tables](README.md) · [Opening practice](opening-auctions.md) ·
[Source notes](../system-sources/main-notes.txt)

Added 16 November 2026. Choose **Practice settings → Whole auction → Opening
family → Passed hand**. Mix the openings or select clubs, diamonds, a major,
1NT, 2NT or 2C followed by 2NT. Choose third/fourth seat and vulnerability.
The trainer assigns the early or late partnership turn independently and
displays the human as South. In the early seat, you choose Pass yourself.
That brings in partner’s third- or fourth-seat opening. You can also open a
qualifying Horton two or natural three-level preempt and continue with the same cards. In the late seat,
partner can open a Horton two when its cards qualify. Vulnerable 4432 hands
need two of A–10 including at least one of A–Q in each shown suit for the
bot to open (a practice interpretation of P1064).
Replay retains the position, vulnerability and both hands.

These are separate agreements from the first/second-seat transfer system.
The authority is P1751–P1783 and P1808–P1830. Competitive P1784–P1806 remains
outside this increment, as requested.

## Clubs

P1753 allows a third-seat lead-directing sub-opening hand, an opening-strength
(4)5+ club hand, or 9–19 balanced; fourth-seat balanced is 13–19. Generation
currently uses 9–19 in third seat, 13–19 in fourth, balanced or five-plus clubs.
Lead-directing subminimums and four-club unbalanced exceptions are excluded.
Here, balanced means no singleton/void; the strong-notrump generator below
uses a narrower shape set.

| Response to 1C | Meaning |
|---|---|
| 1D | Artificial maximum passed hand: about 6–8 NV, 7–9 vulnerable |
| 1H / 1S | Natural four/five-card major, minimum passed hand |
| 1NT | Natural minimum; can prefer this with a poor four-card major |
| 2C | Five clubs, minimum |
| 2D / 2H / 2S | Minimum with five-five H+C / D+C / H+D |
| 2NT / 3C / 3D | Minimum with 0544 / 0445 / 0454 |

The printed minimum is 0–5(6), overlapping the approximate maximum range.
For grading, the current practice splits at six NV or seven vulnerable; this
is a disclosed training choice, not a new exact partnership boundary. After
1C–1M–1NT, 2M shows a good five-card major, to play (P1774). Length is checked;
the quality judgement is left to the human.

After **1C–1D**, opener chooses **1NT to play** or **1H artificial GF**.
No HCP rule for choosing the game force is supplied. The bot uses 19+ or
17+ unbalanced with six clubs as a practice policy; human choice is not graded
against that policy.

For third-seat nonvulnerable practice, select **Passed hand · 1♣** and replay
`passed-club-audit-3` for the 1NT rebid or `passed-club-audit-17` for the
artificial 1H game force. Out of 1,500 mixed deals, 29 reached the artificial
1D response with the bot's passed-hand policy.

| After 1C–1D–1H | Responder's shape (SHDC) |
|---|---|
| 1S | No four-card major |
| 1NT | Five-five, excluding spades; 2C asks which suits |
| 2C / 2D / 2H / 2S | Four spades / five hearts / five spades / four hearts |
| 2NT / 3C / 3D | 0544 / 0445 / 0454 |
| 3H | 44(32) |

After the five-five resolver **1C–1D–1H–1NT–2C**, replies are **2D H+C,
2H D+C, 2S H+D**. The explicit three-suited and 44(32) descriptions take
precedence over generic major lengths. Five-five without spades takes
precedence over the generic five-heart reply.

After **1C–1D–1NT**, 2C asks for a correctable 2H, showing five hearts or
spades. Responder passes with hearts or corrects to 2S. 2D shows H+C and 2H
shows D+C; 2NT/3C/3D retain 0544/0445/0454. **The printed 2S duplicates
D+C (P1780), so that one call stops with a source warning and Undo.** H+D
looks like the missing category, but has not been assigned without confirmation.

## Diamonds and majors

| Opening | Passed-hand responses |
|---|---|
| 1D | 1H/1S natural, 5–8; 2C five-plus clubs and exactly three diamonds, 5–8; 2D (three) four-plus diamonds, 5–8 |
| 1H | 1S natural, 5–8; 1NT natural; 2C/2D five-plus side suit and exactly three hearts, 5–8; 2H three-plus hearts, 5–8 |
| 1S | 1NT natural; 2C/2D/2H five-plus side suit and exactly three spades, 5–8; 2S three-plus spades, 5–8 |

These 2/1 responses are fit-showing, not game forces. Four-card support uses
the raise in the bot policy. Natural subsequent partscore/game choices are
available; detailed opener rebid, invitation, cue and slam structures are not
invented from these short response tables.

## Strong notrumps

| Entry | Range | Responses implemented |
|---|---|---|
| 1NT | (19)20–21 | 2C four spades, 2D five hearts, 2H five spades, 2S four hearts; 2NT/3C/3D 0544/0445/0454, 3H 44(32), 3S five-five minors |
| 2NT | 22–23 | 3C Puppet; 3D/3H transfers to hearts/spades; natural game choice |
| 2C–control response–2NT | 24–25 at the 2NT rebid | Same Puppet and transfers |

Generation uses 4333/4432/5332 and 20–21 for 1NT; a human 19-count is
accepted under the source's parenthetical judgement. The 2C exercise generates
the balanced 24–25 route only. Its opening remains a strong game force,
not a public promise of that exact range or shape before the 2NT rebid.
Control responses are 2D = 0/1/4, 2H = 2/5, 2S = 3 (P1300–P1304).

Puppet replies are **3D one/both four-card majors, 3H five hearts, 3S five
spades, 3NT neither**. This differs from first-seat Muppet. Game-choice
continuations support the reversed four-card-major responses and 4D with
both majors. Detailed slam continuations remain outside this increment.
P1830 permits transfer super-accepts with slam aspirations opposite a maximum
passed hand; the human may make that judgement. The bot simply accepts the
transfer, then uses a conservative game-choice policy based on its own hand
and publicly shown lengths. Quality is not assigned an invented HCP test.

## Implementation and verification

[passed-hand.js](../../website/relay/passed-hand.js) supplies a small public
state graph to the existing whole-auction controller. Each action has a source,
meaning, hand predicates and next node. The selected call is checked against
the acting hand; only its disclosed facts are accumulated for that seat.
Partner receives its own cards and public node/auction data. It receives
neither the other hand nor the random generation category. There is no search
of possible auctions or use of DDS to choose replies.

Seeded deal generation draws two disjoint hands with bounded rejection. This
can take longer for rare 24–25 balanced hands; it is generation work, not an
enumeration performed for each bid. A separate sampling stratum increases
the chance of seeing the club game-force branch and is discarded afterwards.
Shared saving, fixed-card undo, auction study, South-seat mapping, hand history
and contract assessment continue to operate on the resulting session.

Independent fixtures test the printed shapes, all fit-showing 2/1 entries,
all Puppet categories and control responses. Generated walks test both human
roles, positions and vulnerabilities, public-fact compatibility, deterministic
replay and save/restore. Browser tests exercise the club game force, alternatives,
grading, settings, reopening, undo and compact South-seat display.

Missing work: competitive auctions, source P1780, lead-directing opening
judgement, fuller natural/invitational rebids, detailed major/minor continuations
after the 1NT descriptions, and advanced cue/slam routes. Legal untranscribed
calls retain the existing labelled contract-choice fallback; the known source
ambiguity at P1780 pauses instead of supplying an invented convention.
