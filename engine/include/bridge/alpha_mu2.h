#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <vector>

#include "bridge/alpha_mu.h"

namespace bridge {

// Experimental world-selection layer. AlphaMu2 chooses a strategically diverse
// active set, assigns exact probability mass, and marks hard layouts critical.
struct AlphaMu2Config {
    std::size_t initial_world_count {30};
    std::size_t max_world_count {64};
    std::size_t max_refinement_rounds {2};
    std::size_t counterexamples_per_round {3};
    AlphaMuConfig search;

    // Empty means a uniform empirical reservoir. Zero-weight entries are
    // challenge worlds: they affect critical robustness without pretending to
    // carry probability mass.
    std::vector<double> reservoir_weights;
    std::vector<std::size_t> initial_challenge_indices;
    double critical_weighted_tolerance {0.005};
};

// Scores use a shared card order stored in AlphaMu2Result::screening_moves.
// Two worlds with identical scores have the same cheap DDS root fingerprint.
struct AlphaMu2ScreeningVector {
    std::vector<std::uint8_t> future_tricks;
    Hand making_moves {kEmptyHand};
    std::size_t equivalent_worlds {};
};

struct AlphaMu2Stats {
    std::size_t reservoir_worlds {};
    std::size_t distinct_screening_vectors {};
    std::size_t equivalent_screening_moves_skipped {};
    std::size_t initial_worlds {};
    std::size_t final_worlds {};
    std::size_t search_runs {};
    std::size_t refinement_rounds {};
    std::size_t reserve_worlds_checked {};
    std::size_t counterexamples_found {};
    std::size_t counterexamples_added {};
    std::size_t policy_dds_leaves {};
    std::size_t policy_fingerprint_collisions {};
    std::size_t challenge_worlds {};
    std::size_t probability_reassignments {};
    bool stopped_by_time_limit {};
    double screening_ms {};
    double selection_ms {};
    double search_ms {};
    double validation_ms {};
    double total_ms {};
};

struct AlphaMu2CounterexampleTrace {
    std::size_t reservoir_index {};
    bool unsupported_observation {};
    std::uint8_t root_regret {};
    std::size_t distance_from_active {};
    std::uint64_t policy_signature {};
    std::size_t failure_depth {};
    bool selected {};
    std::optional<std::size_t> replaced_reservoir_index;
};

struct AlphaMu2RoundTrace {
    std::size_t round {};
    std::vector<std::size_t> active_reservoir_indices;
    AlphaMuResult search;
    std::vector<AlphaMu2CounterexampleTrace> candidates;
    double search_ms {};
};

struct AlphaMu2Result {
    AlphaMuResult search;
    std::vector<Card> screening_moves;
    std::vector<AlphaMu2ScreeningVector> screening;
    std::vector<std::size_t> active_reservoir_indices;
    std::vector<std::size_t> counterexample_indices;
    std::vector<std::size_t> challenge_reservoir_indices;
    std::vector<double> active_world_weights;
    std::vector<double> reservoir_weights;
    std::vector<AlphaMuWorld> worlds;
    std::vector<AlphaMuWorld> reservoir;
    std::vector<AlphaMu2RoundTrace> rounds;
    AlphaMu2Stats stats;
};

struct AlphaMuPolicyEvaluation {
    bool makes_target {};
    bool unsupported_observation {};
    std::uint64_t policy_signature {};
    std::size_t failure_depth {};
    std::size_t dds_leaves {};
};

// Executes a fixed alpha-mu policy without making new declarer choices. Every
// legal defender action is checked; DDS is used only after the retained policy
// horizon ends.
AlphaMuPolicyEvaluation evaluate_alpha_mu_policy(
    Position position,
    const std::shared_ptr<const AlphaMuPolicyNode>& policy,
    const AlphaMuConfig& config);

AlphaMu2Result alpha_mu2_search(
    const std::vector<AlphaMuWorld>& reservoir,
    const AlphaMu2Config& config);

}  // namespace bridge
