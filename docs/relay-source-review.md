# Relay source review

Reviewed on 3–4 October 2026. This records system evidence, user clarifications and
transcription boundaries. Implemented scope is in [Relay practice](relay-practice.md).

Use the [system tables](relay-system/README.md) for concise bidding lookup and
the [coverage file](relay-system/coverage.md) for the current implementation
and remaining work. This review retains the underlying evidence.

## Sources

- User-supplied `Dappleton Collaboration (3).docx`, SHA-256
  `b114d3fba9f4280082a338c87ea1aa93b9b7ef83200786ccb7449a253a69f59c`.
- Earlier conversation **Practice relay bidding**, ID
  `6abf33e7-1480-83ec-8936-4a27f43ce67f`: all 23 turns reviewed.
- Six screenshots attached to that conversation: a 30 July email from Phil
  describing revised minor-suit relays. The email calls itself a draft summary
  and invites Dave's corrections. The user confirmed on 3 October that its
  revised minor-suit relays replace the corresponding Bourke and fourth-suit
  sections of the Word notes.
- The [minor email transcription](relay-minor-email.md) preserves literal
  tables separately from inferred step assignments and training restrictions.
- The [club-opening source map](relay-club-source.md) identifies 1C–1S and
  Dappleton roles, entry facts, branch-specific omissions and unimplemented
  continuations. It describes more of the source than the enabled profiles cover.
- The [retained system sources](system-sources/README.md) contain both unchanged
  Word originals, indexed extracts and the complete July email transcription.
- The [advanced source review](relay-advanced-source.md) covers the later user
  clarification of 1C–1S–2C–2D, split-range/support relays and Horton enquiries.
  The subsequently supplied [opener-reordering document](relay-reordering-source.md)
  now supplies the separate rebid and continuation tables.

Paragraph references below are extraction-order identifiers from the original
Word XML, including empty paragraphs; they are not page numbers. The original
attachment remains unchanged.

## Major-relay rules

The `1D/H/S–2NT 1st and 2nd` section establishes the following:

| Opener's response | Meaning |
|---|---|
| 3C | Balanced |
| 3D | Middle shortage |
| 3H | High shortage |
| 3S | Low shortage, 9–11 |
| 3NT | Low shortage, 12–14 |
| 4C | Low shortage, 15–17 |
| 4D | Low shortage, 18–19 |
| 4M | 9–10 balanced, great major suit |

P1470–1476: low shortage rolls straight into the strength answer; it must not
trigger the prototype's extra range ask. Balanced, middle-shortage and
high-shortage responses do have a subsequent range ask. After strength comes
Shortage Keycard.

P1477: responder's 3NT offers to play after the diamond start or a balanced
description, and the relay step becomes 4C. A relay ask that would be 4M moves
to 4M+1. The user confirmed that only asks skip 4M: after
1H–2NT–3H–3S, 18–19 is shown by 4H, not 4S.

Other important differences:

- P0063 defines balanced as no singleton or void. Restricting it to 5332 is a
  training filter, not the system definition.
- P0895/P1468 define 2NT as four-plus support with game-forcing values; an exact
  12-HCP responder minimum is only a practice filter. P1468 specifies five-plus
  diamonds for 1D–2NT, generally preferring 1NT with four diamonds.
- P0900 defines an immediate 1M–3NT as a minor-suit hand, not a signoff. A
  hypothetical contract comparison must be separate from bidding that call.
- P0886–88 and P0071–73 route many weak balanced/semi-balanced major hands into
  1NT; suit quality affects the choice. P0534, P1432 and P1437 add 1C, 3NT and
  4M opening alternatives for particular distributional hands. An unrestricted
  five-card-major sampler does not model those opening choices.
- The major relay section is for first/second seat, uncontested bidding.
  P1056 makes 2NT natural after specified interference.

## Queen and specific-suit asks supplied directly by the user

The earlier chat defines the queen ask as two responses: first step denies the
queen; second step shows it. Once the queen is known, or the queen ask is
skipped, subsequent asks concern unknown suits, excluding trumps and usually
the already-known shortage.

| Response step | User's definition |
|---|---|
| 1 | No third-round control |
| 2 | Third-round control |
| 3 | Kxx or longer |
| 4 | Kx |
| 5 | King and queen |

The user clarified that impossible categories are excluded: if teller has
shown four hearts, Kx is impossible. The implementation compresses based on
public length bounds, never hidden cards or asker's private cards.

The stated suit order is middle/high/low. A direct user example with diamonds
agreed and club shortage assigns 4NT to spades and 5C to hearts. The exercise
uses high/low for two suits, as stated in the clarification question, and
middle/high/low for three suits.

After a suit answer, the next eligible step asks another suit provided the
first ask did not skip it. Game and slam bids in the agreed suit and the bid
immediately below small slam in that suit are reserved; the latter is a general
grand try. On 21 October 2026 the user clarified that a trump bid below game
remains a relay step once committed to game: after
1D–1S–2C–2H–3H–3S–4C, 4D asks for the diamond queen rather than being skipped
in favour of 4H. This corrects the earlier blanket reservation of agreed-suit
bids. Opener's response ladders remain consecutive; they do not inherit the
asking-bid reservations.

The later fourth-round-control idea was explicitly tentative and has no
agreed response table. Keep it out of the implemented partnership profile.

## Shortage Keycard evidence

P1456/P1462 define a void-first ladder in the splinter context: void, then
0/3, 1/4, two without the queen, two with the queen. After showing void, the
next step asks keycards, including when that step is the agreed major.
The document then refers to normal queen/king continuations. In this 1M–2NT
exercise, the user's rule that asks skip 4M also applies after a void; the
separate splinter exception is not imported.

This is scoped evidence, not a complete universal specification of rolling
Shortage Keycard. Horton Two keycard has a different simplified table
(P1289). None of the six email screenshots supplies a new SKC or specific-suit
response table. Do not infer exclusion of a shortage ace from assistant-made
practice auctions. Ordinary keycards count all aces plus the trump king.

The user also confirmed that balanced hands use ordinary 0/3, 1/4,
2-without-Q, 2-with-Q responses with the impossible void step removed, and
that “2” includes the rare five-keycard holding. The code retains [2,5] as
a public disjunction rather than revealing an exact count.

## Broader relay engine requirements

- Dappleton after balanced 1C has responder describing to opener; the engine
  must not assume opener is always the bot's answering hand.
- Agreed trump, asking/answering seats, previously shown suits, forcing status,
  and first bidder of each strain need their own state.
- Some meanings are unions of shapes and strength ranges, so constraints need
  disjunction as well as intersection.
- Step omissions vary by branch and stage: sometimes 3NT, sometimes 2NT,
  sometimes game in the agreed major. They cannot be one global switch.
- The notes contain judgmental terms and borderline ranges. Keep deterministic
  hand facts separate from an explicitly chosen bidding policy.
- Every transcribed rule should retain its source and verification status.

These requirements now underpin a bounded family registry and source-node
interpreter. Implemented extensions cover the base diamond relay, all eight
revised minor entry patterns, selected 1C–1S continuations, and fixed-entry
Dappleton minor-transfer/Baron scenarios. Full coverage and exclusions are
listed in [Relay practice](relay-practice.md); presence in a source map alone
does not mean a continuation is enabled.

The user clarified that a completed minor shape description proceeds directly
to SKC. The base 1D–1NT prefix has already disclosed its strength, so it must not
receive another very-poor-opening screen. The eight expanded entry patterns
retain the email's separate initial screen. Known HCP does not remove the
standard 0/3 keycard response rung.

On 21 October 2026 the user confirmed that 1D–1S–2C admits 9–22 HCP and must
not exclude 11-counts. The expanded practice entries now admit ordinary
11-counts in their shape stacks, with 9–10 retained as the deterministic
poor-opening practice band. This removes the former gap from generation,
public constraints and compatible sampling; it does not define which
exceptionally poor 11-counts the source's 9–10(11) judgement would classify as
weak. Explicit named-support and rare-balanced limits remain in force.

For revised minor relays, responder's 3NT remains to play. The major-raise 4M
omission is not imported into those auctions. Dappleton's minor-transfer
acceptance and major agreement use the different omissions stated in P0520.
Exact source-node asks, such as 3C/3D SKC after a known-shortage club rebid or
4D club Kickback after Baron, are made at their stated bids without inserting
an extra generic asking step. Ordinary Kickback does not gain a void rung merely
because a shortage is already public.

Public constraints now support exact shape sets and unions of conjunctions.
Response compression intersects those facts over the 560 possible 13-card
SHDC length vectors, then takes a safe interval envelope. Honour-only alternatives
remain possible during that length calculation. No actual hand is inspected to
choose which response categories are offered.

The user specifically requested useful relay-category practice hands (possibly
slam hands), and later requested 1D–1NT practice. The earlier assistant admitted
losing the original hidden hand during a rewind, so its example auctions are
not verified fixed-deal test cases.

## Resolved entry choice and remaining source issues

- P0668–69 give 1D–1NT–2C as 12–15 and 2D as 9–11; P0698 reverses them.
  The user confirmed the first mapping for the implemented base entries:
  2C = 12–15, 2D = 9–11. The contradictory source paragraph remains recorded;
  that choice is not a claim that every surrounding Word branch is consistent.
- P0773 repeats 3NT after earlier responses already reached 4C.
- P0810 and P0823–26 contain inconsistent shape lists; the latter includes a
  3H response to a 3H ask and appears copied from the other-major branch.
- P0917–18 and P1446 disagree on the 1H–1S splinter auctions.
- Two-shortage priority, a precise great-suit policy and detailed grand-try
  responses remain unspecified where the enabled profiles would require them.
  Their generation filters exclude ambiguous cases; grand-try calls are
  reserved without invented responses.

The July email is authoritative for the corresponding revised minor relays and
is now transcribed as a separately sourced family. Its weak-hand boundary,
unprinted 6/5 extensions and some alternative-agreement details still require
disclosed restrictions or further agreement. Club/Dappleton profiles similarly
exclude unresolved fit judgments, quantitative choices and unenumerated
continuations. The Word contradictions above remain relevant where the email
does not supply a replacement.
