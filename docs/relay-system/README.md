# Relay system tables

Readable reference tables for the Bridge Lab relay trainer. Start with the
family you are practising; use the catalogue to find its dropdown entry.

| Reference | What it contains |
|---|---|
| [Major raises and shared slam asks](major-and-slam.md) | 1M–2NT, exact range ladders, keycards, queen and specific suits |
| [Revised minor relays](minor-relays.md) | 1D–1NT, the July email's eight entries, weak-hand screen, shape stacks and agreements |
| [Club and Dappleton](club-and-dappleton.md) | 1C–1S, strong 2C–2D resolution, minor transfers and Baron |
| [Reordered opener rebids](reordered-rebids.md) | Single-suiters, three-card support, reverses, mini–mega splinters and strength escapes |
| [Split-range and Horton](split-and-horton.md) | Raises, 1NT support routes, Horton shape/shortage and 0/1/2 keycards |
| [Exercise catalogue](scenario-catalog.md) | All 63 exercises, fixed prefixes, initial calls and player roles; generated from code |
| [Coverage and remaining work](coverage.md) | What is implemented, known decisions, exclusions and next work |
| [Maintainer guide](../relay-maintenance.md) | Source updates, engine contracts, tests and documentation workflow |

See the [practice guide](../relay-practice.md) for running the app, recall mode,
undo/reveal, compatible-hand sampling and interpretation of DD reports.

## Reading the tables

| Notation | Meaning |
|---|---|
| C / D / H / S / NT | Clubs / diamonds / hearts / spades / notrump |
| m / M | A minor / a major; use the actual suit in the auction |
| SHDC | Exact shape in spades, hearts, diamonds, clubs order; `3154` = 3–1–5–4 |
| `(322)6` | Six clubs with 3–2–2 outside, in any order; parentheses permit permutations only within that group |
| N / M / H / L / E in a shortage alphabet | No / middle / high / low / equal; these letters describe shortage here, not a bid strain |
| Shortage | Singleton or void, unless a later answer distinguishes them |
| Step | Next permitted asking call for that branch; reservations vary by branch |
| KC / SKC | Ordinary keycard / Shortage Keycard |
| GF / non-serious | Game forcing / the partnership's limited slam-interest call |
| Pnnnn / Rnnnn / E1–E6 | Main Word paragraph / rebid Word paragraph / July email screenshot reference |

**Asking reservations and answer steps differ.** A skipped asking call does
not remove that call from an answer ladder. Responses normally count every
consecutive bid, unless an explicit table reserves one. Where public lengths
rule out an honour category, specific-suit replies compress before counting.

**Balanced** in this system means no singleton or void. It includes 6322 and
7222 when the entry permits them; it does not automatically mean only 4333,
4432 or 5332. Each exercise can impose a narrower public shape set.

Most exercises have South asking about opener North. In Dappleton exercises,
you are opener North and hidden responder South describes their hand. The
full fixed prefix remains visible and determines declarer, including artificial
bids. Opponents pass throughout.

## Authority and scope

These tables summarise the implemented uncontested practice system. They do
not claim every continuation of the partnership's full notes is coded. A row
marked **source only** is useful context, not a selectable exercise. A row
marked **practice policy** is a deterministic training choice where the source
leaves judgement or a boundary open. **Provisional** requires a partnership
definition; Horton's minimum threshold is the principal current example.

| Priority | Authority |
|---|---|
| 1 | Explicit subsequent user/partnership clarifications |
| 2 | July email for its revised Bourke/fourth-suit branches; separate rebid document for the natural-response auctions it revises |
| 3 | Main Dappleton notes elsewhere |
| Separate | Disclosed practice policies and generation restrictions; these do not amend the partnership system |

Both unchanged Word originals and the email transcription are in
[system sources](../system-sources/README.md). Paragraph references preserve
blank-paragraph numbering. The detailed [source review](../relay-source-review.md),
[club map](../relay-club-source.md), [advanced map](../relay-advanced-source.md)
and [rebid map](../relay-reordering-source.md) retain interpretation details
and source conflicts. Consult those or the originals before changing a rule.
