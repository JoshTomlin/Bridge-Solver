# Whole-auction opening practice

Choose **Whole auction → Opening family** to practise a particular opening.
The selector includes weak 1NT, strong 2C, each Horton two, strong 2NT and
passed-hand openings alongside 1C, 1D and 1M. **Just bid** and **Mix all
openings** draw an opening group and an independent opener/responder seat.
The passed-hand group draws third/fourth seat and vulnerability in Just bid.
In a dedicated passed-hand family those are settings. Replay preserves the
seat, deal and applicable settings. All selectable Study branches are reachable
from the opening in either seat. Study can start directly at the selected relay.

The selector also offers separate [uncontested passed-hand openings](passed-hand.md),
with third/fourth-seat and vulnerability controls. Those ranges and meanings
must not be inferred from the first/second-seat tables below.

In the mixed modes, the sampler keeps one quarter of ordinary 2NT and balanced
strong 2C draws. It reallocates the other draws to 1C, 1D, 1M, weak 1NT,
Horton and occasional three-level preempts. Within the passed-hand group,
it keeps one third of strong notrump
and 2C draws and reallocates the rest to one-level suit openings. Named
opening families deal from their own ranges. These are practice weights.

Both hands exist before the first bid. Each bot decision receives only its
own cards and the public auction. A sampling stratum is never stored as an
answer or supplied to the bot. When a route reaches an existing relay,
physical seats, cards and every actual bid survive; only the interpreter's
asker/teller roles may change. Undo and reopening work across this transition.

## Implemented increment

| Opening | Playable routes | Training subset / boundary |
|---|---|---|
| 1C | Major transfers, artificial 1S into balanced, two-minor or major-shortage rebids, positive 2C with all five opener rebids, weak 1NT, weak suit jumps at two and three, and the existing Bourke/split/reordered rebids | P0439/P0440/P0442 give shortage questions but omit the reply steps. Further 1S Baron and detailed Dappleton shortage routes remain incomplete. |
| 1D | Natural 1H/1S, artificial 1NT, weak 2C, invitational 3D, or the Jacoby-style 2NT diamond raise. Also the implemented July minor, 1NT support, direct weak support, reordered single-suit, support-2NT, reverse and mini–mega entries | The 2NT diamond raise needs five-plus diamonds and game-forcing values. Weak 2C and invitational 3D use provisional natural rebids. Two-major response priorities and strong reverses after 1D–1NT are incomplete |
| 1H/1S | Three-way 2C, natural 2D and 1S–2H, natural invitations, weak raises and Jacoby. 1H–1S continues through natural rebids, the 1NT range and shape enquiries, the 2C resolver and reordered rebids | After the direct nonforcing 1NT response, opener may pass or continue with provisional natural rebids. Some later slam, shortage and invitation continuations are incomplete |
| Weak 1NT | Stayman, invitations, Smolen, transfers to majors, super-accept and splinter entries, 2NT minor puppet, Baron, natural game and quantitative choices | Uses a 9–13 subset of P0070–P0072. Later control and Keycard routes are incomplete. The doubles and runouts family is described below |
| Strong 2C | 2D = 0/1/4 controls; 2H = 2/5; 2S = 3. Direct 2NT/3C/3D/3H transfer to clubs/diamonds/hearts/spades and opener's acceptance asks exact controls. After a control reply, a 2NT rebid uses Muppet, transfers and minor Stayman | 23+ balanced and selected distributional game forces. After the 2NT rebid opener alone can use Keycard. Later slam continuations after natural suit rebids are incomplete |
| Horton 2D/2H/2S | Signoffs, mild invitations, direct Kickback, 2NT enquiry and subsequent shortage/keycard routes use the same tables as the focused drills | Four/five spades, four-plus diamonds/hearts/clubs respectively, 0–8. One fifth of whole-auction deals target a responder with a strong fit in one shown suit |
| 3C/3D/3H/3S | Natural weak preempts, direct game or partscore choices and a natural forcing new suit below game. Opener usually bids 3NT without two-card support when legal. | Six-plus cards and 0–8 HCP. With four/five spades and a long side suit, the matching Horton bid has priority. Six spades prefer a spade preempt. Four-level opening choices and vulnerable exceptions are matters of judgement in P1062 and P1435–P1439. |
| Passed hand | Third/fourth-seat club, diamond, major, strong 1NT, strong 2NT and strong 2C into 2NT | See [the passed-hand tables](passed-hand.md) for prior passes, vulnerability, response tables and gaps |
| 2NT | Muppet and direct/delayed minor Stayman; major transfers/re-transfers; major/minor slam tries; cues, Kickback, queen and specific-suit enquiries; quantitative choices | 20–22 in 4333/4432/5332; responder 6–16. Subjective policies and remaining Exclusion/general-grand-try questions are disclosed in the [2NT tables](notrump-opening.md) |

## Weak 1NT doubles and runouts

Choose **Whole auction → Opening family → 1NT · Doubles and runouts**.
In Just bid and Mix all openings, one in eight weak 1NT draws uses this
family. It deals the same cards and the same scripts on replay from either
seat. Calls, including opponents' bids, stay in the auction through Undo
and saved-hand review.

| Position | Agreement |
|---|---|
| `1NT – (Pass) – ?` | 0–7 with 4333 or 4432 must act. Junk Stayman can lack a four-card major, and an advanced-run transfer can have fewer than five in the target major. With a five-plus suit, responder can pass and show the suit later. |
| `1NT – (X) – ?` | Responder's immediate XX is (7)8+ and balanced or suitably semi-balanced. Natural two-level escapes show five-plus. Pass asks opener for a five-plus suit or a redouble. The notes allow a rare opener pass with 4333. |
| `1NT – (X) – Pass – (Pass) – XX – (Pass) – ?` | Start with the lower of two suits. The trainer uses four-plus in both suits and a natural correction when needed. With one five-plus suit, bidding it directly is the preferred route. |
| `1NT – (Pass) – Pass – (X) – ?` | Opener automatically redoubles in the practice deals. Responder can run naturally in a five-plus suit. |
| After immediate responder XX or automatic opener XX | If the opponents escape, our first double of a suit is takeout. The next partnership double and any later doubles are penalty. The opponents can run to 2♥ and raise to 3♥. |
| Competitive 2NT | Immediately over X it is Lebensohl, puppeting to 3♣ and then passing or correcting. Going through Lebensohl is more willing to defend than a direct three-level bid. After responder initially passes and an opponent bids a suit, 2NT is scrambling with two places to play. In practice those are two four-plus suits. |

The ordinary weak 1NT and this family both apply the 0–7 rule.
[P0229](../system-sources/main-notes.txt#L208) allows a partnership to lower
the upper limit to five or six in second seat. The trainer uses 0–7.
[P0230–P0231](../system-sources/main-notes.txt#L209) also cover rare natural
opener exceptions to the automatic redouble and exceptional (32)44 escapes
after it. The practice deals use the standard routes. Doubled Stayman,
doubled transfers and an immediate suit overcall have separate treatments
in [P0236–P0239](../system-sources/main-notes.txt#L215). Those positions
remain outside this exercise.

The competitive controller reads the actual four-seat calls to determine
which agreement applies and counts only partnership doubles for the
takeout-to-penalty change. It reuses the weak escape routes from the ordinary
1NT table when responder acts after an opponent pass. The opponents follow scripts
conditioned on public calls. Their cards and double-dummy scoring are
outside the exercise.

The diamond and major opening tables follow P0631–P0691, P0885–P0924,
P1478–P1522, the July email and the separate reordering document. The strong
2NT opening follows P1311–P1429; it is separate from the Horton 2NT enquiry.

P1468 specifies five-plus diamonds for the game-forcing 1D–2NT response.
P0643’s four-plus summary is superseded by the detailed agreement. Opener
answers 3C with no shortage, 3D with a heart shortage, 3H with a spade
shortage, or rolls the club shortage into the strength bands (3S/3NT/4C/4D
for 9–11/12–14/15–17/18–19). Responder can offer 3NT to play. The next
relay enquiry skips 3NT; its replies still count every legal step. Practice
also leaves 5D available as the agreed diamond game. Hands with two
shortages are outside this relay’s current subset.

After 1C–1NT, 1D–2C, 1D–3D and 1M–1NT, natural continuation ranges and
automatic invitations are provisional. The menus label those continuations. After
1C–1NT, the bot passes with 14–16 balanced, including hands with both
four-card minors. It invites with 17–19 balanced.

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
  After 1H–2D, opener's 2S is treated as a natural reverse with four-plus
  spades and 14+, inferred from P1021. Responder can choose game.
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

After **1M–2♣–3♣**, opener has made a natural, forcing club reverse.
P1511–P1518 give responder **3♦** or **3OM** as natural or a club cue,
**3M** as a good three-card limit raise or better, **3NT** to play,
**4♣** for three-card major support and four-plus clubs, **4♦** as club
Kickback, and **4M** as a poor or average limit raise. For practice, the
natural side-suit options accept three-plus cards, or four-plus clubs and
a control in the side suit. A low trump agreement leads to the partnership's
control-bidding and keycard methods, including P1690's serious/non-serious
distinction with a major fit below game.

After **1M–2♣–2♦–2OM**, P1486 defines 15+ HCP and exactly three trumps.
Opener can now describe shape and the pair can agree the major below game.
The notes leave the descriptive calls unspecified. Practice uses natural
shape descriptions and a delayed trump agreement, following the [ACBL's
two-over-one examples](https://cdn.acbl.org/assets/documents/teachers/Teacher-Manuals/More-Commonly-Used-Conventions-Lesson-8.pdf).
After **1M–2M**, practice offers natural help-suit tries, a balanced 2NT
invite and a general 3M try. These are provisional while Q19 is open.
[ACBL weak major-suit raises](https://web2.acbl.org/documentLibrary/teachers/MajorSuitRaises1.pdf)
describes how to evaluate help-suit tries.

The remaining ordinary-major gaps include the full **1M–1NT** table (Q9)
and quantitative slam invitations after natural agreements.

Independent expected-auction tests cover both physical seats, partscore and
game after the three-way response, diamond/heart enquiry replies, declared
strain, false descriptions, saved progress and historical alternatives.
Generated walks retain both hands and save every turn; browser checks exercise
these routes on desktop and phone layouts, including reload, undo and reveal.

## First- and second-seat 1♣ suit responses

After **1♣–2♣** responder has 10+ HCP and six-plus diamonds, single-suited.
The sampler targets this response on one in six dedicated 1♣ deals.

| Opener | Meaning | What can be practised next |
|---|---|---|
| 2♦ | Unbalanced, 0–2 diamonds | Pass with 10–13 or choose game |
| 2♥ | Shortage ask | The subsequent strength steps are 10–12, 13–15 and 16+, then Shortage Keycard. The shortage reply order awaits confirmation. |
| 2♠ | Six-plus decent clubs, shortage ask | Strength relay and Shortage Keycard follow. The shortage replies and trump agreement await confirmation. |
| 3♣ | 9–11 with (6)7+ clubs, probably short in diamonds | Pass or choose game. Diamond shortage is a tendency. |
| 3♦ | 9–12 unbalanced, three-plus diamonds | Pass, choose game, or bid 3♥ to ask **opener** for shortage. The answer order awaits confirmation. |

In Whole Auction with opening family 1♣, replay `positive-club-29` for 2♦,
`positive-club-2` for 2♥, `positive-club-10` for 2♠,
`positive-club-45` for 3♣ or `positive-club-20` for 3♦.

After a weak **1♣–2♦/2♥/2♠**, opener's 2NT genuinely invites. Responder
may pass, correct to three of the long suit or choose game. An immediate
raise to three is to play. For practice the bot invites on 17+ and accepts
with 6+ opposite the invite. Human players can exercise their own judgement.
[Main notes, P0437–P0444](../system-sources/main-notes.txt#L411)
