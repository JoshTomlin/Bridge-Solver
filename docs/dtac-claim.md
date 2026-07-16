# DTAC-Style Claim Bounds

Source reference: Paul Bethe's DTAC repository, `github.com/pmbethe09/DTAC`.

This project does not compile DTAC directly. The upstream code has its own
card model and Bazel build. Instead, `engine/src/claim.cpp` ports the core idea
into this engine's bitmask `Card` / `Hand` representation.

## What It Proves

`prove_declarer_claim(position, declarer, required_tricks)` tries to prove that
declarer/dummy can take `required_tricks` immediately, from the current leader,
without using the hidden East/West split.

It only runs when:

- the current trick is empty;
- North/South, or the configured declaring side, is on lead;
- the target has not already been reached.

The proof sees:

- declarer and dummy's remaining cards exactly;
- the combined defender card pool;
- the trump suit.

It does not see which defender owns each card. A successful proof is therefore
safe across all hidden worlds with the same public defender pool.

## Combined Defender Model

For each suit, the proof computes:

- `max_rounds`: how many rounds a single defender could still follow;
- `min_rounds`: how many early rounds both defenders must follow by pigeonhole;
- `highest_rank`: the highest outstanding defender card.

This lets the proof answer questions such as:

- "Can a defender still hold a trump?"
- "Are both defenders forced to follow this side suit?"
- "Can the combined defender still hold a higher card in the winning suit?"

## Search

The search chooses a declarer/dummy two-card trick:

1. The side on lead chooses any card.
2. Partner follows suit when possible, otherwise may ruff or discard.
3. The trick is accepted only if the combined defender cannot beat it.
4. The winning declaring-side hand leads the next trick.

A failed-state transposition cache stores positions already proven not to claim.
The proof has a fixed state budget so a hard claim does not replace alpha-mu's
main search.

## Alpha-Mu Integration

The optimization is named `claim-bounds`.

Order of root checks:

1. target already reached / impossible;
2. forced or equivalent root move;
3. quick-tricks cashing proof;
4. DTAC-style claim proof;
5. normal world sampling and alpha-mu search.

The same claim proof also runs at interior MAX nodes before card expansion.

Stats exposed through C++ and WASM:

- `claim_probes`
- `claim_states`
- `claim_cache_hits`
- `claim_cuts`
- `claim_root_cuts`
- `claim_budget_aborts`

## Limitations

This first version proves unconditional claims only. DTAC's upstream code also
has a "claim with one loser" path; that is not ported yet.

The proof is intentionally conservative. If it cannot prove the claim, alpha-mu
continues normally.
