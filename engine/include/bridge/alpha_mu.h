#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "bridge/game.h"

namespace bridge {

// Declarer and dummy can make at most 26 combined card choices in a full deal.
inline constexpr std::uint8_t kMaxDeclarerPlies = 26;

// Bit i represents sampled world i. The current implementation supports 64 worlds.
using WorldMask = std::uint64_t;

// A 1 bit means the strategy makes the target in that world.
struct OutcomeVector {
    WorldMask wins {};
};

// Only mutually non-dominated outcome vectors are retained.
struct ParetoFront {
    std::vector<OutcomeVector> vectors;
};

// Compatibility names retained for existing callers.
using AlphaMuVector = OutcomeVector;
using AlphaMuFront = ParetoFront;

// Strict component-wise dominance: a covers every win in b and at least one more.
bool outcome_dominates(const OutcomeVector& a, const OutcomeVector& b);
std::size_t winning_world_count(const OutcomeVector& outcome);
std::size_t best_winning_world_count(const ParetoFront& front);

// Adds candidate if it is not dominated or duplicated, removing vectors it dominates.
bool add_to_pareto_front(ParetoFront& front, OutcomeVector candidate);

// Max keeps every declarer strategy available, then Pareto-prunes their union.
ParetoFront combine_max_fronts(const std::vector<ParetoFront>& child_fronts);

// Min considers every pairing of defender responses and intersects their wins.
ParetoFront combine_min_fronts(const ParetoFront& left, const ParetoFront& right);

// True when every strategy in candidate is dominated by or equal to a
// strategy in bound. This is the paper's candidate <= bound relation.
bool pareto_front_is_covered_by(
    const ParetoFront& candidate,
    const ParetoFront& bound);

struct AlphaMuWorld {
    Position position {};
};

// Search shortcuts are deliberately independent so each one can be tested and
// benchmarked against the same reference search. Some have dependencies noted
// in docs/alpha-mu.md; disabling a dependency simply makes its shortcut inert.
enum class AlphaMuOptimization : std::uint8_t {
    IterativeDeepening,
    TranspositionTable,
    CanonicalTranspositionKeys,
    MaxEquivalentCards,
    MinEquivalentSuccessors,
    EarlyCut,
    UsefulWorlds,
    WorldCuts,
    EmptyEntry,
    DeepAlphaCut,
    RootCut,
    WinCut,
    TargetBounds,
    ForcedTrumpRun,
    LeafDdsBatch,
};

struct AlphaMuOptimizations {
    bool iterative_deepening {true};
    bool transposition_table {true};
    bool canonical_transposition_keys {true};
    bool max_equivalent_cards {true};
    bool min_equivalent_successors {true};
    bool early_cut {true};
    bool useful_worlds {true};
    bool world_cuts {true};
    bool empty_entry {true};
    bool deep_alpha_cut {true};
    bool root_cut {true};
    bool win_cut {true};
    bool target_bounds {true};
    bool forced_trump_run {true};
    bool leaf_dds_batch {true};
};

std::string_view to_string(AlphaMuOptimization optimization);
std::optional<AlphaMuOptimization> parse_alpha_mu_optimization(std::string_view name);
bool optimization_enabled(
    const AlphaMuOptimizations& optimizations,
    AlphaMuOptimization optimization);
void set_optimization_enabled(
    AlphaMuOptimizations& optimizations,
    AlphaMuOptimization optimization,
    bool enabled);
AlphaMuOptimizations disabled_alpha_mu_optimizations();

struct AlphaMuConfig {
    Seat declarer {Seat::South};
    std::optional<Suit> trump_suit {};
    std::uint8_t target_tricks {};

    // Paper parameter M: number of Max-side card choices before a DDS leaf.
    // Defender choices do not consume M; M=1 is the paper's PIMC baseline.
    std::uint8_t max_declarer_plies {};

    AlphaMuOptimizations optimizations {};
    bool build_trick_policy {false};

    // Search every representative root card without using another root card
    // as an alpha bound. This is slower, but makes each displayed move front
    // exact and comparable in analysis interfaces.
    bool compare_all_root_moves {false};

    // Records human-readable optimization events. This is intentionally off
    // by default because detailed logs can be large during a deep search.
    bool collect_audit_log {false};

    // Soft iterative-deepening budget. Zero disables it. A completed iteration
    // is never discarded; measured growth is used to avoid starting a deeper M
    // that is unlikely to fit in the remaining budget.
    double max_search_seconds {};
};

struct AlphaMuSearchStats {
    std::uint64_t nodes {};
    std::uint64_t leaves {};
    std::uint64_t dds_worlds {};
    std::uint64_t transposition_probes {};
    std::uint64_t transposition_hits {};
    std::uint64_t transposition_stores {};
    std::uint64_t early_cuts {};
    std::uint64_t useful_worlds_removed {};
    std::uint64_t world_cuts {};
    std::uint64_t zero_world_cuts {};
    std::uint64_t one_world_cuts {};
    std::uint64_t empty_entry_searches {};
    std::uint64_t deep_alpha_cuts {};
    std::uint64_t root_cuts {};
    std::uint64_t equivalent_moves_skipped {};
    std::uint64_t max_equivalent_moves_skipped {};
    std::uint64_t min_equivalent_moves_skipped {};
    std::uint64_t forced_trump_run_cuts {};
    std::uint64_t win_cuts {};
    std::uint64_t target_reached_cuts {};
    std::uint64_t target_impossible_cuts {};
    std::uint64_t leaf_dds_batches {};
    std::uint64_t leaf_dds_worlds {};
    std::uint8_t completed_iterations {};
    std::uint8_t completed_depth {};
    bool stopped_by_time_limit {};
    double last_iteration_ms {};
    double projected_next_iteration_ms {};
    double tree_search_ms {};
    double policy_build_ms {};
};

struct AlphaMuRootMove {
    Card move {kNoCard};
    std::size_t winning_worlds {};
    std::size_t pareto_vectors {};
    ParetoFront front;
};

struct AlphaMuPolicyNode;

// A defender card is an observation: only worlds where the card can be played
// remain possible, and the selected strategy continues from that information set.
struct AlphaMuPolicyBranch {
    Card card {kNoCard};
    WorldMask possible_worlds {};
    std::shared_ptr<const AlphaMuPolicyNode> continuation;
};

// The selected contingent strategy for the remainder of the current trick.
// At a declarer-side node, declarer_move and continuation are used. At a
// defender node, the observed card selects one of defender_branches.
struct AlphaMuPolicyNode {
    Seat player {Seat::North};
    WorldMask possible_worlds {};
    OutcomeVector outcome {};
    Card declarer_move {kNoCard};
    std::shared_ptr<const AlphaMuPolicyNode> continuation;
    std::vector<AlphaMuPolicyBranch> defender_branches;
};

struct AlphaMuResult {
    Card best_move {kNoCard};
    // Root front. With root cuts enabled it may omit dominated, unsearched moves.
    ParetoFront front {};
    std::vector<AlphaMuRootMove> root_moves;
    std::shared_ptr<const AlphaMuPolicyNode> trick_policy;
    AlphaMuSearchStats stats {};
    std::string audit_log;
};

AlphaMuResult alpha_mu_search(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config);
std::string format_alpha_mu_front(const ParetoFront& front, std::size_t world_count);
std::string alpha_mu_debug_tree(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config);

}  // namespace bridge
