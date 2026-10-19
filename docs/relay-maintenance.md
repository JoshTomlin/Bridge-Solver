# Relay trainer maintenance

Use the [system tables](relay-system/README.md) for bidding lookup, the
[coverage file](relay-system/coverage.md) for implementation status, and the
[practice guide](relay-practice.md) for running the app and analysis semantics.
This file explains how to extend the implementation without losing source
provenance or the fixed-hand/public-information guarantees.

## Source and documentation layout

| Path | Responsibility |
|---|---|
| `docs/system-sources/` | Two unchanged Word originals, searchable P/R extracts, July email transcription, SHA-256 manifest and precedence |
| `docs/relay-system/` | Readable family tables, coverage/backlog and generated exercise catalogue |
| `docs/relay-source-review.md` | Major/SKC/user-confirmation evidence and interpretation boundaries |
| `docs/relay-club-source.md` | Wider club/Dappleton source map, including unimplemented branches |
| `docs/relay-advanced-source.md` | Strong club, split-range and Horton evidence/practice policies |
| `docs/relay-reordering-source.md` | Rebid source interpretation, shape/count corrections and strength escapes |
| `docs/relay-practice.md` | User workflow, module map, sampler/DD semantics and historical verification |
| `scripts/extract-system-notes.py` | Reproduce paragraph-numbered Word extracts and source hashes |
| `scripts/generate-relay-catalog.mjs` | Generate the exact selectable exercise inventory from the registry |

Main-note identifiers `Pnnnn` and rebid identifiers `Rnnnn` count blank body
paragraphs. Email `E1`–`E6` identify the original screenshot sequence; the
retained file is a transcription, not a fabricated `.eml` original. Normalized
text extracts omit trailing paragraph whitespace and use LF. `.gitattributes`
keeps Word binaries intact and source-text hashes portable across checkouts.

For revised notes, preserve the supplied original and its provenance. Do not
edit an old original or silently renumber all references to hide a correction.
Record explicit user overrides, distinguish literal tables from inferred steps,
and keep practice policies separate from partnership rules. Refresh the source
manifest with the extraction script after an intentional source update.

## Engine structure

Paths below are relative to `website/relay/`, unless specified otherwise.

| Layer | Modules | Contract |
|---|---|---|
| Registry | `profiles.js` | Unique stable profile IDs, group/name, seat roles and source references |
| Source definitions | `system.js`, `*-profiles.js`, `profile-utils.js`, `source-utils.js` | Public entry constraints; source actions, response predicates and next states; branch-specific reservations |
| Session interpreter | `core.js` | Seeded fixed hands, immutable transitions, exactly one compatible partner answer |
| Shared continuations | `continuations.js` | Ordinary/Horton KC, SKC, queen, specific suits, public length bounds and range escapes |
| Sampling | `core.js`, `sampling-worker.js` | Uniform proposals weighted by remaining card combinations; bounded rejection against all public facts |
| DD analysis | `evaluation.js`, `evaluation-worker.js` | Complete opponents, preserve seats, find declarer, compare shared deals and report uncertainty |
| UI | `app.js`, `relay.html`, `relay.css` | Render available actions and source meanings; undo/reveal/cancel; no hidden-hand inference |
| Shipped build | `website/build.js` | Copy every runtime module into ignored `website/dist/` |
| Native solver | `engine/src/wasm_bindings.cpp` | Stateless validated `ddTable` using DDS, without altering a play session |

The major family retains its shape/range handler in `core.js`. Other families
start at a named profile node, then normally transition to shared keycards.
There is no external bidding-language parser yet: definitions are declarative
JavaScript objects plus functions of public auction state.

### Profile/node fields

| Field | Meaning |
|---|---|
| `initialAuction`, `playerSeat`, `partnerSeat` | Complete displayed prefix and current describing/asking roles |
| `partnerConstraints`, `playerConstraints` | Public admitted practice universe; generation fixes both hands before any question |
| `initialState`, `defaultTrump`, `startNode`, `nodes` | Public state, provisional suit and source tree entry |
| Node `actions` | Available artificial/source continuations; final-contract actions are added contextually |
| Action `bid`, `label`, `responses` | Asking call, explanation and exact reply alternatives |
| Reply `constraints` | Conjunction; exactly one alternative must match the original partner hand |
| Reply `bid` or step order | Explicit source call, otherwise consecutive response arithmetic |
| `state`, `nextNode`, `phase` | Public facts and next family/shared handler; do not encode hidden hand data here |
| Action `kind: 'keycard'` | Use the shared exact-call keycard helper without inserting a second relay step |
| Action `playerConstraints` | Validate a prerequisite such as five diamonds; do not choose the public ladder from actual user cards |
| `agreementOptions`, `naturalMinorKeycardSuits` | Public alternative trump agreements, closed after the first KC question |
| `relayPolicy`, `threeNTToPlay` | Asking reservations and whether a 3NT answer is passable; replies need their own counting rules |
| `strengthSplit`, `strengthKnown` | Reordered single-suit range boundary and whether further game-escape replies are required |
| `signoffs`, `requireAgreement` | Branch-specific final contracts and obligation to establish a fit |
| `assumptions`, `limitations` | Visible training restrictions and named excluded continuations |

Dynamic node functions receive state with **both actual hands removed**.
Action availability and public response compression must survive replacing
either hand with nonsense. Only applying an answer inspects the fixed teller's
cards. Optional player-hand prerequisites are checked when the user chooses
the action; they must not silently change its bidding meaning.

### Invariants to preserve

1. Generate both 13-card hands before bidding. Never construct partner's hand
   as the auction develops. Undo restores a prior state with the same cards.
2. Every admitted partner hand has exactly one answer to every applicable
   source question. Distinct replies may share a call only when their predicates
   are disjoint; user-facing actions must have one meaning per call.
3. The answer adds all facts needed to reproduce it from a compatible sample.
   Preserve whole `anyOf` conjunctions and correlated exact shape sets.
4. All public bounds and response compression depend on auction facts and
   disclosed training restrictions. Do not use either actual hand to remove
   a response category. Do not delete 0/3 merely because range is known.
5. Asking omissions do not automatically apply to answers. Specific source
   reservations, such as strong diamond-SKC's doubleton 3NT reply, are explicit.
6. Reaching a source boundary ends with an explanation or final-contract
   choices; never invent an answer or offer a partial ladder above 7NT.
7. Partner Pass ends the partscore with the correct last contract/declarer.
   Ordinary artificial 3NT answers cannot be passed unless the branch permits it.
8. Sampling reads public constraints plus the user's known cards, never the
   original hidden hand. Uniform hand probability requires shape weights by
   card combinations, not equal probability for each shape.
9. The agreed trump determines king/queen keycards; the first strain bidder
   determines declarer, even if that earlier bid was artificial. Dappleton seat
   reversal must flow through generation, sampling and DDS completion.
10. DD tables are real solver output. Use the same completed sample deals across
    contracts; keep the original-hand result separate from the sample estimate.

## Adding or correcting a family

1. Identify the governing P/R/E references and subsequent user clarifications.
   List incomplete branches and subjective decisions before choosing a practice
   subset. Keep an unresolved policy configurable and visibly provisional.
2. Encode the exact fixed prefix, roles, shape/HCP universe and first response
   table. Give every action one unambiguous meaning; source fit-agreement calls
   take precedence over a coincident generic Kickback option.
3. Add later nodes and shared-continuation transitions. Keep source reservations
   local. Add new facts to the constraint predicates and public length logic
   only when the source actually needs them.
4. Register the profile and include any new runtime file in `website/build.js`.
   The UI and sampler worker use the common registry; do not maintain another
   independent list of dropdown entries.
5. Verify meaningful bidding changes: every admitted shape/HCP partition,
   source examples/edge cases, truthfulness with actual fixed hands, action
   uniqueness and compatible-sample auction replay. Include role and declarer
   checks when either changes. Avoid tests that merely copy object literals.
6. Update the readable family table, detailed source review and coverage file.
   Regenerate the catalogue; change the public practice assumptions as needed.
7. Run relevant checks, then build and verify shipped assets. A unit test of
   source modules does not establish that the browser received the new file.

## Commands and validation scope

Run source-document refresh/catalogue generation from the repository root:

```powershell
python scripts/extract-system-notes.py
node scripts/generate-relay-catalog.mjs
git diff --check
```

Run app checks from `website`:

```powershell
node --test relay/*.test.mjs
node deal-utils.test.mjs
node ui-smoke.mjs
node build.js
node wasm-smoke.mjs
```

The runtime must support ES modules and `Map.groupBy` (for example Node 22+);
the extraction script uses Python 3.10+ for explicit LF output. The repository's
bundled runtimes can be used when `node`/`python` are not on PATH.

| Check | What it establishes | What it does not establish |
|---|---|---|
| Relay suite, currently 100 tests | Source partitions/examples, transitions, sampler uniformity/replay, shared asks, worker aggregation/errors and source hashes | Entire untranscribed partnership system or all human judgements |
| `deal-utils.test.mjs` | Play-lab deal utilities | New relay browser interactions |
| `ui-smoke.mjs` | Existing play-lab DOM/control smoke | A visual test of the relay page |
| `build.js` | Static assets copied into `dist` | Successful DDS availability by itself |
| `wasm-smoke.mjs` | Actual DDS, preserved play state and shipped minor/Dappleton/rebid sampling-to-evaluation paths | Human make probability or visual UI layout |
| Catalogue regeneration | Exact current profile count, prefixes, roles and first source calls | Every dynamic later response |
| Markdown link/heading/table review | Navigable, readable documentation | Bidding correctness without source/code comparison |

Compile WASM first if needed using the repository's pinned Emscripten/DDS
setup in the main README. The smoke imports the built relay modules, so build
before running it. A missing or stale `ddTable` engine must disable evaluation
with a message; it must never cause placeholder probabilities.

For the preview, run `node server.js dist` from `website` (default port 3000).
The active development session may use port 3011. Refresh after rebuilding.
Use browser checks when available and report honestly when only HTTP/assets
and solver checks were possible. Browser automation was unavailable during
the latest extension; earlier end-to-end browser results are recorded separately
in the practice guide.

For a documentation-only edit, regenerate affected derived files, check links,
tables and whitespace, and compare the changed meanings with source/code.
Do not rebuild the solver or add implementation-mirroring tests just for prose.

## Evaluation interpretation

The sampler proposes compatible partner hands and gives each one random
East/West layout. Contract make percentages are double-dummy. Wilson 95%
intervals describe sampling uncertainty only; they are not human-play odds or
uncertainty about partnership agreements. The original-hand column is one
separately seeded opponent split. Contracts share the same sampled layouts;
separate intervals are not a formal paired-contract comparison test. Partial
samples are explicitly labelled when the proposal limit is reached.

No IMP/MP field model, human-play solver, per-decision relay value analysis or
partner-facing system editor has been shipped. Keep those items in coverage
rather than describing them as current features.
