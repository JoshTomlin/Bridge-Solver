#pragma once

#include "bridge/plan_dag.h"

namespace bridge {
struct PlanDeepOptions {
    double seconds {30};
    std::size_t max_nodes {100000};
    std::size_t max_contexts {250000};
    // Opt-in breadth guarantee: construct successively deeper complete storage
    // passes, retaining the last finished pass if a shared budget is exhausted.
    // Move selection still uses the full residual alpha-mu search depth.
    std::optional<std::uint8_t> max_stored_declarer_plies;
};
struct PlanDeepResult {
    PlanDag graph;
    AlphaMuSearchStats search_stats;
    WorldMask selected_wins {}; // Search value only, not a completed-plan proof.
    bool value_complete {};
    bool budget_exhausted {};
    // Meaningful in bounded-storage mode. A completed pass covers every legal
    // sampled response to this many declaring choices, or a checked proof.
    // These are storage coverage metrics; graph.completed_m is search depth.
    std::uint8_t completed_storage_plies {};
    std::size_t storage_passes {};
    bool storage_horizon_complete {};
    std::size_t contexts {}, context_hits {}, proof_probes {}, proof_states {};
    std::size_t public_proof_cache_hits {};
    std::string stop_reason {"none"};
    double value_ms {}, construction_ms {}, total_ms {};
    // Non-overlapping builder terminal checks and alpha-mu value probes.
    // Value probes include the initial search and reconstruction lookahead.
    double terminal_ms {}, value_probe_ms {};
    std::size_t value_probes {};
};

// Builds instructions directly into an interned DAG, retaining typed proof
// leaves. The cache key includes exact current states, compatible world IDs,
// selected outcome and remaining depth. No execution fact is cached by node ID.
// Both value search and construction share one cooperative deadline. The
// requested M is a search ceiling; unfinished branches remain Frontier, never
// a win. An optional, independent storage ceiling enables progressive complete
// storage-depth passes. Budgets and counters are cumulative across passes.
PlanDeepResult build_deep_plan(const std::vector<AlphaMuWorld>& worlds,
    AlphaMuConfig config, const PlanDeepOptions& options = {});

int run_plan_deep_lab(std::vector<AlphaMuWorld> legal_worlds, std::size_t world_count,
    int requested_m, double seconds, std::uint64_t seed, const std::string& output_directory,
    std::optional<Position> actual = std::nullopt,
    const PlanDeepOptions& build_options = {}, bool mine_challengers = false,
    double mining_seconds_per_layout = 0.1);
} // namespace bridge
