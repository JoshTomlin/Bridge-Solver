#pragma once

#include <array>
#include <cstddef>
#include <optional>
#include <string>
#include <vector>

#include "bridge/alpha_mu.h"
#include "bridge/card.h"
#include "bridge/dds_solver.h"
#include "bridge/game.h"

namespace bridge {

struct PlayerView {
    Seat seat {};
    Hand hand {kEmptyHand};
};

struct AnalysisRequest {
    PlayerView declarer;
    PlayerView dummy;
};

struct AnalysisResult {
    std::size_t unseen_card_count {};
    std::string summary;
};

struct HandSamplingConstraints {
    std::array<std::uint8_t, 4> min_lengths {};
    std::array<std::uint8_t, 4> max_lengths {
        kRanksPerSuit,
        kRanksPerSuit,
        kRanksPerSuit,
        kRanksPerSuit,
    };
    std::uint8_t min_hcp {};
    std::uint8_t max_hcp {37};
};

struct SamplingDebugInfo {
    std::array<std::array<std::uint64_t, 38>, 14> final_dp {};
};

AnalysisResult analyze(const AnalysisRequest& request);
std::uint8_t high_card_points(Hand hand);
std::uint64_t count_constrained_hands(
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards,
    const HandSamplingConstraints& constraints,
    std::uint8_t target_card_count = kRanksPerSuit);
std::optional<Hand> sample_constrained_hand(
    Hand available_cards,
    const HandSamplingConstraints& constraints,
    std::uint64_t random_seed,
    std::uint8_t target_card_count = kRanksPerSuit);
std::optional<Hand> sample_constrained_hand(
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards,
    const HandSamplingConstraints& constraints,
    std::uint64_t random_seed,
    std::uint8_t target_card_count = kRanksPerSuit);
SamplingDebugInfo sampling_debug_info(
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards,
    const HandSamplingConstraints& constraints,
    std::uint8_t target_card_count = kRanksPerSuit);
std::string format_sampling_debug_table(const SamplingDebugInfo& debug_info, std::uint8_t max_hcp);

}  // namespace bridge
