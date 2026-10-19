# Strong club, split-range and Horton extension

This extension uses the original Word paragraph numbering from the earlier
source maps and the user's subsequent clarification. It adds ten exercises:
one strong-club entry, six split-range/support entries, and three Horton entries.

For quick lookup see [club/Dappleton tables](relay-system/club-and-dappleton.md)
and [split-range/Horton tables](relay-system/split-and-horton.md). The
[coverage file](relay-system/coverage.md) records completed and remaining work.

## Reordering opener's rebid

The main notes refer to a separate **Reordering Opener's Rebid** document.
The user subsequently supplied it; its unchanged original and paragraph
extract are now retained with the [system sources](system-sources/README.md).
The original main-note references give these entry meanings:

| Auction | Referenced meaning | Paragraph |
|---|---|---|
| 1C–1D–2D | Six-plus clubs, (13)14+, zero–two hearts | P0301 |
| 1C–1D–2S | Diamond reverse; five-plus clubs/four-plus diamonds, 16+, or 14/15 1345 | P0304 |
| 1C–1H–2D | Six-plus clubs, (13)14+, zero–two spades | P0348 |
| 1C–1H–2H | Diamond reverse; five-plus clubs/four-plus diamonds, 16+, or named 14/15 exception | P0349 |
| 1C–1H–3C | Heart reverse; five-plus clubs/four-plus hearts, 16+, or 14/15 3415 | P0363 |
| 1D–1S–2H | Six-plus diamonds, (13)14+, zero–two spades | P0655 |
| 1D–1H–2S | Six-plus diamonds, (13)14+, zero–two hearts | P0656 |
| 1D–1S–3C | Heart reverse; five-plus diamonds/four hearts, 16+ | P0658 |
| 1H–1S–3C | Six-plus hearts, (13)14+, zero–two spades | P0916 |

The [reordering source review](relay-reordering-source.md) maps the supplied
continuations and 23 implemented entries. This is separate from the artificial
1C–1S strong-club 2C–2D route below.

## 1C–1S–2C–2D

The user confirmed that balanced hands simply bid **3NT**, including the former
19/20 supermaximum case, and that the unbalanced describing range is **16+**.
This takes precedence over the older P0421 exception and 17+ boundary.

The implemented describing schedule retains 2H/2S major shortages, 3C long
clubs, 3D five-plus clubs/four-plus diamonds, and 3H/3S six-plus clubs/five in
that major. P0421 explicitly relocates the two-minor hand to 3D. Within the
disclosed single-shortage training set, the remaining long-club 3C hands have
diamond shortage; that restriction and deduction are public.

After 2M, 3C is club SKC. A 3D enquiry requires five diamonds in responder's
hand: with three diamonds opener answers SKC immediately, bypassing 3NT;
with two, opener bids 3NT to play (P0422–P0425). The answer ladder includes
the doubleton 3NT alongside, but outside, the keycard responses.

After 3C, 3D asks shortage. The practice uses the system's middle/high/low
ordering. After 3D, 3H agrees clubs and 3S agrees diamonds, asking high/low
shortage. After 3M, 4C agrees clubs and 4D agrees that major, asking shortage;
3NT remains to play (P0431–P0436). Four-club opening exceptions and two
shortages remain excluded. The balanced responder-5332 branch after 3NT is
still a separate, unimplemented continuation.

## Split range and three-card support

P1524–P1687 supplies four direct entries and two 1D–1M–1NT support entries.
Direct club raises combine weak unbalanced three/four-card support with
14/15(16) balanced four-card support. Direct diamond raises have only the
weak option. The implemented practice narrows those boundaries to 9–10 and
14–15 respectively.

For the 1NT entries, the overlapping (11)12 / 12/13 / 14/15 boundaries are
represented by disjoint practice ranges 11–12 / 13 / 14–15. Maximum hands
describe shape immediately; minimum/middle hands can use the further 2NT relay.

The shape responses and lowest-level suit agreements follow the printed tables.
Two copied diamond shapes are resolved from later explicit examples: P1600's
**4351/4360** replaces P1555's club-shaped typo, and P1617's **3154/3064**
replaces P1560's reversed minor lengths. Three-card major support and the
opened minor are retained. The single-suited diamond/heart exception uses
**3H to agree hearts and 3S to ask shortage** (P1563, P1651–P1657).

The source makes slam judgement subjective. The bot uses a disclosed practice
policy for balanced 14–15 hands: up to three controls signs off, four chooses
non-serious, five-plus cues a control. This is not a new partnership rule.
After forcing agreements, its disclosed cue policy chooses the cheapest ace,
king or shortage; 3S is reserved in hearts and 3NT can cue spades. Kickback or
the explicitly higher 4NT route follows the cue. The user must agree a suit
below game where P1564 requires it; 3NT remains available to play.

The source's lowest-level agreement meanings take precedence over a generic
Kickback option at the same call. In particular, after
1C–1H–2S–2NT–3H, **4D agrees hearts** (P1595). Club interest uses 4C agreement
and the subsequent cue/4NT route. The documentation audit corrected a duplicate
4D action and added an explicit agreement-table regression across all six
support entries.

The obsolete Bourke three-card-support prefixes are not added back alongside
the superseding July-email definitions. Borderline weak 11-counts, exceptional
singleton-honour opening choices and a full partnership slam-judgement model
remain outside the practice policy.

## Horton 2NT enquiry

P1060–P1292 describes 2D/2H/2S openings, with spades and respectively diamonds,
hearts or clubs. Practice admits 0–8 HCP, four/five spades and four-plus in
the second suit; vulnerable nine-count and poor-six-spade exceptions are omitted.
The opening priority is preserved: hands with four hearts use 2H. The 2S
practice subset also excludes four diamonds, avoiding the source's subjective
choice between 2D and 2S when both minor Horton openings qualify (P1065).

Main 2NT replies are 3C minimum, 3D longer second suit, 3H longer spades,
3S four-four, then 3NT five-five without a void, 4C five-five high void and
4D five-five low void. The source does not quantify **minimum**: an exported
practice policy currently sets it to 0–4 HCP, with 5–8 nonminimum, pending the
user's definition. Changing that policy does not change the response tables.

After a minimum, 2D–2NT–3C uses **3H** as the further enquiry and **3D to play**;
replies are 3S four spades and 3NT five. After 2H/2S the further enquiry is
3D, with replies 3H longer second suit, 3S four-four, 3NT five spades. Five-five
minimums remain possible in the five-spade reply; it does not falsely promise
exactly four cards in the second suit.

Step and step+1 agree spades/the second suit and ask no/high/low shortage,
retaining the printed Last Train and game reservations. Direct Kickback is
4NT spades, 5C hearts, 4H diamonds and 4D clubs; a shortage ask assigned to 4D
takes precedence over club Kickback. Five-five descriptions instead use step
and step+1 keycard enquiries, skipping games in the two shown suits.

Horton keycard replies are **0 / 1 / 2**. Shortage Keycard adds its void answer,
followed by the three ordinary answers. After a void the further keycard ask
also has three replies. A queen ask is available after zero or one keycard;
it is omitted after two (P1288–P1292). Asking reservations use actual game in
the agreed suit, including 5C/5D when appropriate.

The general **3NT to play** rule is retained over the contradictory P1274 row
which labels 3NT as a shortage enquiry. Two-shortage basic hands are excluded;
the usual five-five high/low void cases are included. Competitive continuations,
Last Train replies and discretionary cue-bid sequences remain unimplemented.
