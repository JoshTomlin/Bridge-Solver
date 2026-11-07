# Detailed plan-tree experiment

This native-only experiment captures the concrete policy already reconstructed
by alpha-mu, with a raw-tree reference and an optional graph that shares exact
instruction subtrees. It adds neither a second search algorithm nor human-style
bridge instructions. The browser, WebAssembly target, production search and
policy execution are unchanged.

## Representation

`engine/include/bridge/plan_tree.h` defines an indexed, uncompressed tree:

- **Play** stores the acting seat, one exact card, and the next node ID.
- **Observe** stores the acting defender and an exact card-to-node mapping.
- **Frontier** marks the end of the constructed continuation. It does not
  assert a win, loss, or a valid continuation beyond the retained horizon.

Every occurrence is copied, including repeated pointers and identical suffixes.
This deliberately gives a raw-tree baseline. Null source continuations become
explicit frontier nodes; consequently node counts include those boundary nodes.
The parent-to-child IDs are forward-only and every non-root node has one parent.

Sample masks and winning-world evidence are stored in a separate vector. They
describe the search's sample and horizon, not executable program identity.
JSON encodes the masks as hexadecimal strings so JavaScript will not round away
bits. No complete hidden deal is embedded in the program.

`advance_plan_tree` accepts only a node ID, acting player and exact card. It
follows an existing action/observation edge. A wrong player/card, an unsupported
observation, or a frontier returns `nullopt`; it never chooses another move or
consults DDS. The caller owns the changing game state and information set.

The capture function has a one-million-node default safety limit. This limits
the new snapshot allocation, not the existing engine's reconstruction, which
happens first. An exception reports an exceeded limit rather than truncating a
tree silently.

## Run

Build using the repository's normal native build procedure, then run:

```powershell
# Same two-layout corpus, independent fixed-M searches from 1 through 6.
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-trees engine\tests\data\alpha_mu_corpus.tsv 6 10 build\plan-trees\discovery

# Reconstructed Bridge Master position; same seeded 30-world set for each M.
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-trees-6s 30 6 15 11565831 build\plan-trees\six-spades
```

`plan-trees` arguments are `FILE.tsv [MAX_M=4] [SECONDS=10] [OUTPUT_DIR]`.
`plan-trees-6s` arguments are
`[WORLDS=8] [MAX_M=4] [SECONDS=10] [SEED=11565831] [OUTPUT_DIR]`.
The latter samples without replacement and does not force the actual deal into
the sample. A fixed seed uses nested samples as world count grows on the same
toolchain. C++ shuffle results are not guaranteed identical across standard
library implementations.

Each command prints CSV. Supplying an output directory also writes one JSON
file per case/depth, using numeric case indices to avoid unsafe filenames.
The directory is intended for one run; matching filenames are overwritten.
The chosen root move and complete retained policy come from existing alpha-mu.
This first experiment measures one selected policy, not a portfolio of plans.

M counts **declarer/dummy card choices**, not tricks or total card plays.
Iterative deepening is disabled to measure each requested M independently.
The requested and completed M are both reported. A timed-out fixed-M search
exits unsuccessfully; it does not silently report a shallower policy as M.
Earlier CSV rows remain available if a later search fails.

The time setting applies to the existing tree search. Existing policy
reconstruction clears its deadline, so it can exceed that setting. Capture,
measurement and export are also outside the search budget. Time those stages
separately; this is a research command, not a hard real-time service.

## Metrics and compression estimate

The output includes:

- Counts of play, observation and frontier nodes, total card edges, maximum
  card/MAX path lengths, and maximum defender fanout.
- Exact vector-element payload bytes for the new program and its evidence.
- Allocated vector-capacity bytes for the program and evidence together.
- Search, existing policy construction, snapshot capture, and measurement times.
- A node-count profile at every total-card depth in the JSON export.
- The number of distinct exact instruction subtrees and estimated program bytes
  if identical subtrees were shared.

The last measurement is a diagnostic; it does **not** merge or prune anything.
It interns structural keys bottom-up: a Play key contains seat, card and child
signature; an Observe key contains seat and its sorted exact-card/child-signature
mapping. Frontier nodes all have the same instruction identity. Different sample
evidence does not prevent identical instruction suffixes from matching. Different
cards/players/continuations do prevent a match. Equality of a hash is not used
as proof: this baseline uses complete keys in an ordered map.

Shared-program byte estimates exclude evidence, interning tables and contextual
evaluation caches. All byte metrics exclude allocator headers, the original
pointer-based policy, alpha-mu's search/transposition tables, measurement scratch
space and JSON text. They are not peak process-memory estimates. In particular,
the original policy and the captured tree temporarily coexist.

Sharing an instruction does not imply its incoming information states are
equivalent. DAG execution must retain game/knowledge state per
execution. Frontier expansion and policy evaluation cannot be cached using just
a shared node ID. Identical current frontier instructions can require different
future expansions under different incoming information states.

## Optional shared graph

`engine/include/bridge/plan_dag.h` adds a separate `PlanDag`. It uses the same
Play/Observe/Frontier instructions, but multiple incoming edges can reference
the same node. The baseline tree is never modified. Compression works bottom-up
using complete structural keys, so hash collisions cannot merge unlike programs.
Observation cards remain exact; neither card groups nor strategic equivalence
are used. Observation mappings are sorted into a canonical order.

`compress_plan_tree` returns the graph plus a diagnostic mapping from each raw
occurrence to its shared node. Evidence stays on the original raw occurrences;
it is not unioned, overwritten, or treated as a property of the shared node.
Callers that only execute the program can discard the raw tree and mapping.
The construction lookup table is temporary and is discarded when compression
returns. Graph node IDs are children-first and are local to that graph.

`verify_plan_dag` checks the goal/horizon metadata, exact actions, complete
observation domains, and frontiers against **every raw occurrence**, including
repeated occurrences of the same shared instruction. It checks that all nodes
are reachable and that the graph is acyclic. `advance_plan_dag` follows exact
cards without consulting hidden layouts, belief masks, or DDS. Wrong players,
unseen observations and frontier continuations remain unsupported.

Run both representations together with:

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-dags engine\tests\data\alpha_mu_corpus.tsv 6 10 build\plan-dag-results\discovery
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-dags-6s 30 6 15 11565831 build\plan-dag-results\six-spades-30
```

Arguments match `plan-trees` / `plan-trees-6s`. The new commands preserve the raw
CSV columns and append actual graph node/edge counts, separate Play/Observe/
Frontier counts, instruction payload and allocated capacity, diagnostic mapping
memory, compression/verification time, and instruction-traversal timings.
With an output directory, each depth produces `case-N-mM.json` for the reference
tree and `case-N-mM.dag.json` for the graph. The graph export deliberately has no
shared world-mask or win annotations; those are contextual evidence.

Every command row must pass the verifier and match the independent raw-tree
distinct-subtree/byte estimate before it is reported. A discrepancy exits with
an error. The verification occurrence/edge counts must equal the raw tree's
counts; visiting only the much smaller set of graph nodes would not suffice.

Traversal timings average 32 full walks of each representation, following all
observation histories. Shared nodes are revisited for each incoming history,
so both walks perform the same logical work. Their occurrence/frontier counts
and content checksums must agree. This measures reading program instructions,
not card legality, DDS, posterior updates or full policy validation. Tiny
microsecond measurements are noisy; they are not playing-strength benchmarks.

All graph memory columns exclude raw-tree evidence and transient construction
scratch space. The optional raw-occurrence mapping is reported separately. In
comparison mode, the source policy, raw tree, mapping and graph coexist; graph
storage savings must not be presented as a measured reduction in peak process
memory. Counts by node kind show how much saving comes from merging unresolved
endpoints, rather than completed response programs.

## Complexity

Storage for the explicit representation is `O(V + E)`. In a raw tree, `E=V-1`.
Declarer contributes one chosen child per decision; defenders contribute all
retained legal observations. With a roughly constant observation branching
factor b over D defensive decisions, a raw policy can grow as `O(b^D)`.
Neither D nor b is fixed by M: trick winners change the order of players, and
card availability and information change the defensive branching factor.

Shared suffixes may substantially reduce storage, but a DAG remains exponential
in the worst case. There is no general `world_count * M` bound: even one hidden
layout can permit many defensive card sequences. Nor does compact storage imply
that validation needs to inspect only one execution per instruction node.

## Validation and next step

`bridge_plan_tree_tests` compares every edge/action/frontier against actual
alpha-mu policies through M=1..6 on the discovery corpus. Synthetic cases verify
that the raw tree preserves duplicate pointers, program identity ignores evidence
and branch ordering, distinct actions remain distinct, unsupported observations
are explicit, and capture enforces its allocation budget. A CTest command also
exercises the CSV experiment on the authored corpus.

The additional `bridge_plan_dag_tests` exercises shared continuations and
compares all 52 cards and all four player identities at raw occurrences in real
policies. A separate CTest smoke check exercises the new command. The original
engine and tree checks remain in place.

Recorded measurements: [initial baseline](results/plan-tree-baseline.md) and
[shared-graph comparison](results/plan-dag-comparison.md).
The next experiment can construct shared witnesses during policy reconstruction
to avoid materializing the raw tree first. More aggressive equivalence of
apparently different subtrees should remain a separate, validated experiment.

The [counterexample experiment](plan-challenges.md) now executes these shared
instructions against additional legal layouts, records multiple failure paths,
and tests a varied second-pass construction set on untouched holdout layouts.

## Branch and deployment isolation

Development started from `be0e09d` on `codex/plan-tree-storage`, in a separate
worktree. The existing Pages workflow automatically deploys pushes to `main`;
it also has an explicit manual dispatch. No deployment workflow was changed.
The new library and tests are only built in the native CMake branch, so this
experiment does not alter the WebAssembly engine or the website UI.

When the work is ready, commit/review it on the feature branch and merge into
`main`. A push of that merge triggers the normal Pages build. There is no second
algorithm to copy back. Conflicts are possible if both branches edit the same
lab/CMake lines, but most of this change consists of new files. Exposing tree
inspection in the website would be a subsequent UI/WASM integration step.
