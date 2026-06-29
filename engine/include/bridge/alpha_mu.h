#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "bridge/game.h"

namespace bridge {

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

struct AlphaMuConfig {
    Seat declarer {Seat::South};
    std::optional<Suit> trump_suit {};
    std::uint8_t target_tricks {};

    // Paper parameter M: number of Max-side card choices before a DDS leaf.
    // Defender choices do not consume M; M=1 is the paper's PIMC baseline.
    std::uint8_t max_declarer_plies {};

    bool use_iterative_deepening {true};
    bool use_transposition_table {true};
    bool use_early_cut {true};
    bool use_root_cut {true};
    bool build_trick_policy {false};
};

struct AlphaMuSearchStats {
    std::uint64_t nodes {};
    std::uint64_t leaves {};
    std::uint64_t dds_worlds {};
    std::uint64_t transposition_probes {};
    std::uint64_t transposition_hits {};
    std::uint64_t transposition_stores {};
    std::uint64_t early_cuts {};
    std::uint64_t root_cuts {};
    std::uint8_t completed_iterations {};
};

struct AlphaMuRootMove {
    Card move {kNoCard};
    std::size_t winning_worlds {};
    std::size_t pareto_vectors {};
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
};

AlphaMuResult alpha_mu_search(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config);
std::string format_alpha_mu_front(const ParetoFront& front, std::size_t world_count);
std::string alpha_mu_debug_tree(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config);

}  // namespace bridge
