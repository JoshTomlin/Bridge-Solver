# Deep plans with checked proof endings

Measured on 2026-09-24 in the isolated `codex/plan-tree-storage` worktree, using
the Windows Release build with Clang 23.1.1 and CMake 4.4.3.

**The one-layout experiment now has a complete saved plan that makes the
contract against every legal defensive response in that layout.** Its endings
are checked public quick-trick proofs, not optimistic DDS winning leaves.
The ten-layout experiment computes a full-depth search value quickly, but its
saved program is still unfinished when construction hits its state limit.
There is no universal solution of the 6S information set yet.

## Measured depth-first runs

All three runs use seed 11565831, requested M=26, a 30-second construction
budget, at most 100,000 instruction nodes, and 250,000 expanded construction
contexts. The initial samples are nested prefixes of the same shuffled legal
oracle. M counts declarer/dummy card choices; this root has 24 such cards left,
so 26 covers the entire remaining hand.

| Construction layouts | Full-depth value time | Plan construction time | Stored nodes | Deepest explicit declaring choices | Strict sample proof | Stop |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 0.012 s | 7.879 s | 11,604 | 20 | 1 / 1 | Complete |
| 2 | 0.013 s | 18.552 s | 33,270 | 22 | 1 / 2; one unfinished | Context limit |
| 10 | 1.649 s | 8.362 s | 28,940 | 20 | 0 / 10; ten unfinished | Context limit |

The one-layout graph contains no `Frontier` instruction. All its terminal
instructions share a quick-trick proof method, rechecked in each current
position. Twenty explicit declaring choices are sufficient on its deepest
branch because the remaining contract requirement is then provable. This is
not a twenty-choice DDS horizon.

The two-layout graph contains both public quick-trick and public claim methods.
The ten-layout graph contains public quick-trick endings. Each partial graph
also contains one shared `Frontier` instruction, potentially reached by many
unfinished public histories. A count of one frontier node does not mean only
one continuation remains to be solved.

The full-depth alpha-mu values report winning all initial layouts in each run.
Those values are kept separate from the saved-plan certificate: the partly
constructed ten-layout program has not been proved to execute successfully on
all ten. This is the central remaining gap.

The one-layout instruction payload is 751,248 bytes; the ten-layout partial
payload is 2,085,168 bytes. These counts exclude context caches, alpha-mu tables,
allocator overhead and any claim prover working memory. Direct construction
avoids the previous intermediate expanded pointer tree and raw-tree capture,
but it still visits many distinct execution states: 117,069 for the completed
one-layout run and the full 250,000 allowed for the other two.

## Validation and wider layouts

The graph is frozen and exported before validation. Strict replay accepts only
actual target achievement or a verified public proof, and explores every legal
defensive response before certifying a layout. It never accepts a DDS winning
frontier. Replay has a separate 30-second budget per validation group, up to
two million expanded states per layout and a 500,000-entry exact-context cache.
No final recorded validation ended as budget-unknown.

| Construction layouts | Held-out proven / 256 | First unfinished continuation | First coverage gap | Actual hand |
|---:|---:|---:|---:|---|
| 1 | 0 | 0 | 256 | Coverage gap |
| 2 | 0 | 0 | 256 | Coverage gap |
| 10 | 0 | 175 | 81 | Unfinished |

The sample and held-out layouts are disjoint within each run. Different sample
sizes shift the held-out boundary, so these are not perfectly paired holdouts;
they also overlap and are all drawn from one deal universe. They measure scope,
not generalization across different bridge problems. The actual hand was not
forced into the construction sample.

Unfinished/gap counts record the first such event under the traversal budget.
An unfinished path can coexist with a missing response or loss elsewhere. The
strict proven count is the exhaustive metric. No universal guarantee follows
from either the full-depth search value or the one-layout certificate.

The 12,376-layout oracle includes the user's confirmed auction guarantee that
East's diamond ace is singleton. This constraint is retained when forming all
samples and challengers.

## Comparison with the old short horizon

A ten-layout M=6 run of the new builder produced the same 690-instruction size
as the previous stored plan. It took 0.171 seconds for value search and 3.117
seconds for construction, and retained an unfinished horizon. None of its ten
sample layouts was a strict full-contract proof.

The preceding legacy probe measured M=6 value search at 0.154 seconds and old
pointer-policy reconstruction at 2.060 seconds. It had not completed its next
row when the whole probe was stopped at 40 seconds. That is an incomplete run,
not a measurement of M=7 completion time.

The new constructor is not faster at M=6 in these single measurements. Its
useful change is preserving real proof endings and permitting a bounded deep
construction attempt, instead of insisting on a short fixed horizon or removing
the deadline while materializing the policy.

## What changed and what remains

- Declarer quick tricks, public claims, score/remaining-trick bounds, and
  layout-specific defensive quick tricks can terminate saved continuations.
- A shared proof instruction is rechecked from the current cards, public trick,
  score and played-card set. It cannot inherit another history's conclusion.
- Compatible layouts are filtered after each observation, including evidence
  from failure to follow suit. Public claim bounds remain conservative about
  stronger auction/void constraints rather than assuming sampled facts are known.
- Value search, direct graph construction and replay use distinct context caches
  with explicit scopes. No execution cache is keyed by shared instruction alone.
- Construction retains one cooperative deadline and returns explicit unresolved
  branches when time or state limits prevent completion.

The next bottleneck is constructing and validating the many defensive
continuations of a full-depth policy. This result supports keeping depth first:
there is now a complete deep seed plan to experiment with, and the ten-layout
value calculation is already inexpensive. Completing its executable program
needs less repeated expansion or stronger public proofs before substantially
widening the sample. The current deep constructor is not yet wired into the
older persistent-repair driver.

## Checks and reproduction

All sixteen CTest suites pass, including new proof storage, history-sensitive
rechecking, exact-context cache, deadline/metadata, and final-trick tests.
The website remains unchanged. See [implementation details](../plan-deep.md)
for proof scopes, cache keys, endpoint execution limitations and budgets.

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-deep-6s 1 26 30 11565831 build\plan-deep-results-v2\worlds-1
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-deep-6s 2 26 30 11565831 build\plan-deep-results-v2\worlds-2
.\build\engine\Release\bridge_alpha_mu_lab.exe plan-deep-6s 10 26 30 11565831 build\plan-deep-results-v2\worlds-10
```

Recorded summaries: [one layout](raw/plan-deep/worlds-1.csv),
[two layouts](raw/plan-deep/worlds-2.csv), [ten layouts](raw/plan-deep/worlds-10.csv),
[ten-layout M=6](raw/plan-deep/ten-worlds-m6.csv), and
[legacy probe](raw/plan-deep/legacy-depth-probe.csv).
The `-split.csv` companions preserve exact initial and held-out identities.
[Graph hashes](raw/plan-deep/graph-hashes.csv) identify the frozen exports,
which remain in the ignored build directories. Timings are single local
measurements, not performance guarantees.
