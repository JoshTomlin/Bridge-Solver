#pragma once

#include <cstdint>
#include <cstddef>

namespace bridge::demo {

void run_alpha_mu_playthrough(
    bool pause_between_cards,
    std::uint8_t target_tricks,
    std::uint8_t search_depth,
    double max_search_seconds);

void run_alpha_mu_playthrough_with_seed(
    bool pause_between_cards,
    std::uint8_t target_tricks,
    std::uint8_t search_depth,
    double max_search_seconds,
    std::uint64_t true_deal_seed);

void run_alpha_mu_batch(
    std::size_t run_count,
    std::uint8_t target_tricks,
    std::uint8_t search_depth,
    double max_search_seconds);

}  // namespace bridge::demo
