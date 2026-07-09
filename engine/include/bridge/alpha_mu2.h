#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <vector>

#include "bridge/alpha_mu.h"

namespace bridge {

// Experimental world-selection layer. The existing alpha-mu implementation is
// called unchanged after AlphaMu2 chooses a strategically diverse active set.
struct AlphaMu2Config {
    std::size_t initial_world_count {30};
    std::size_t max_world_count {30};
    std::size_t max_refinement_rounds {2};
    std::size_t counterexamples_per_round {3};
    AlphaMuConfig search;
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
    std::vector<AlphaMuWorld> worlds;
    std::vector<AlphaMuWorld> reservoir;
    std::vector<AlphaMu2RoundTrace> rounds;
    AlphaMu2Stats stats;
};

AlphaMu2Result alpha_mu2_search(
    const std::vector<AlphaMuWorld>& reservoir,
    const AlphaMu2Config& config);

}  // namespace bridge
