#pragma once

#include <cstddef>
#include <cstdint>
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
};

struct AlphaMuResult {
    Card best_move {kNoCard};
    // The complete root Pareto front, containing strategies from every root move.
    ParetoFront front {};
};

AlphaMuResult alpha_mu_search(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config);
std::string format_alpha_mu_front(const ParetoFront& front, std::size_t world_count);
std::string alpha_mu_debug_tree(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config);

}  // namespace bridge
