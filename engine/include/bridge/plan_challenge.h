#pragma once

#include "bridge/alpha_mu2.h"
#include "bridge/plan_dag.h"

namespace bridge {

enum class PlanFailureKind { MissingObservation, IllegalInstruction, DdLoss };
enum class PlanFrontierReason { StoredFrontier, MissingObservation, RejectedProof };

struct PlanFailureWitness {
    PlanFailureKind kind {PlanFailureKind::MissingObservation};
    PlanNodeId node {kNoPlanNode};
    Position position {}; // Full execution context; never identified by node alone.
    Card card {kNoCard};
    Hand making_moves {kEmptyHand}; // Diagnostic DDS alternatives, not a single-dummy proof.
    bool diagnosed_choice {};
    std::vector<AlphaMuPolicyStep> path;
    std::optional<PlanFrontierReason> frontier_reason;
};

enum class PlanFrontierMode { Dds, ReportUnresolved, PublicClaim };

struct PlanFrontierWitness {
    PlanNodeId node {kNoPlanNode};
    Position position {};
    std::vector<AlphaMuPolicyStep> path;
    PlanFrontierReason reason {PlanFrontierReason::StoredFrontier};
};

struct PlanEvaluationOptions {
    std::size_t max_witnesses {3};
    std::size_t max_nodes {1000000};
    double max_seconds {}; // Cooperative budget, including failure diagnosis.
    bool diagnose_losses {true};
    PlanFrontierMode frontier_mode {PlanFrontierMode::Dds};
    std::size_t max_frontiers {1};
    // Successful subtrees may be reused only for the exact instruction AND
    // current position. Zero disables this per-evaluation cache.
    std::size_t max_cached_contexts {100000};
    // Opt-in challenge mining requires Dds frontier mode. Missing observations
    // and rejected proof leaves are checked with DDS, without inventing any
    // declarer instructions. Continue to other branches after these gaps;
    // only actual losses/illegal instructions consume max_witnesses.
    bool mine_partial_plan {};
    // Storage limit per partial-witness list, never a traversal limit. Zero
    // retains counters only. Node/time/loss-witness limits still bound mining.
    std::size_t max_partial_witnesses {8};
};

struct PlanEvaluation {
    bool survives_horizon {}; // True only after exhaustive traversal with no failure.
    bool complete {}; // False if witness/node/time budget stops traversal early.
    std::size_t visited_nodes {};
    std::size_t dds_calls {};
    std::size_t frontier_survivors {}; // DD-feasible leaves, including mined gaps/rejected proofs.
    std::vector<PlanFailureWitness> failures;
    std::vector<PlanFrontierWitness> unresolved_frontiers;
    std::size_t public_claims {};
    bool proven_contract {}; // All paths terminal or proven using public information.
    std::size_t checked_proofs {}, rejected_proofs {};
    std::size_t cache_hits {};
    // Event counts for expanded contexts, independent of retained witness caps.
    // Cached successful subtrees are not counted again.
    std::size_t coverage_gaps {}, dd_losses {}, illegal_instructions {};
    // Mining keeps gaps separate so they cannot crowd out genuine losses.
    std::vector<PlanFailureWitness> coverage_gap_witnesses;
    // Concrete positions and paths for later refinement; a DD-feasible leaf
    // is unresolved single-dummy, never a complete-contract certificate.
    std::vector<PlanFrontierWitness> dd_feasible_frontier_witnesses;
};

// Validates the graph and follows the fixed program against all legal defence.
// A successful DDS frontier is optimistic horizon survival, not full-hand proof.
PlanEvaluation evaluate_plan_dag(Position position, const PlanDag& graph,
    const AlphaMuConfig& config, const PlanEvaluationOptions& options = {});

enum class PlanChallengeSource { Random, Structural, Targeted };
struct PlanChallengeDraw {
    std::size_t index {}; // Index in caller-supplied legal candidate pool.
    PlanChallengeSource source {PlanChallengeSource::Random};
};

// The pool must already satisfy all known-card, play and bidding constraints.
// Only returns unused pool members: targeted generation can never invent an
// illegal deal or draw from a separately held-out test set.
std::vector<PlanChallengeDraw> draw_plan_challengers(
    const std::vector<AlphaMuWorld>& legal_pool,
    const std::vector<AlphaMuWorld>& seeds,
    const std::vector<PlanFailureWitness>& targets,
    const std::vector<std::size_t>& used,
    std::size_t count, std::uint64_t seed);

struct PlanChallengeCandidate {
    std::size_t pool_index {};
    PlanChallengeSource source {PlanChallengeSource::Random};
    Position root {};
    std::vector<std::uint8_t> root_profile;
    PlanEvaluation evaluation;
};

// Full structural descriptors are heuristic features for selection, not an
// equivalence relation for pruning plans, execution states or evidence.
std::vector<std::vector<std::uint64_t>> plan_failure_features(
    const PlanChallengeCandidate& candidate);

// Returns candidate-vector indices. Greedily adds new failure coverage, then
// structural distance from active AND already selected layouts. When available
// and capacity >= 2, reserves a place for both DD losses and coverage gaps.
std::vector<std::size_t> select_plan_counterexamples(
    const std::vector<PlanChallengeCandidate>& candidates,
    const std::vector<AlphaMuWorld>& active, std::size_t maximum);

} // namespace bridge
