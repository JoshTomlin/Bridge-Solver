#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <string_view>
#include <vector>

#include "bridge/game.h"

namespace bridge {

struct DoubleDummyTable {
    std::array<std::array<int, 4>, 5> tricks {};
};

struct DoubleDummyMoveScore {
    Card card {kNoCard};
    std::uint8_t future_tricks {};
};

DoubleDummyTable solve_double_dummy_table(const Deal& deal);
int double_dummy_tricks(const Deal& deal, Seat declarer, std::optional<Suit> trump_suit);

// Returns future tricks for declarer's partnership from an arbitrary partial position.
std::uint8_t double_dummy_future_tricks(const Position& position, Seat declarer);

// Solves independent leaf worlds through DDS's multi-board scheduler. Native
// DDS may evaluate boards in parallel; the single-thread WASM build uses the
// same API sequentially.
std::vector<std::uint8_t> double_dummy_future_tricks_batch(
    const std::vector<Position>& positions,
    Seat declarer);

// Scores every legal root card. DDS returns touching equals through a compact
// rank mask; this wrapper expands them so callers receive one entry per card.
std::vector<DoubleDummyMoveScore> double_dummy_move_scores(
    const Position& position,
    Seat declarer);
std::vector<std::vector<DoubleDummyMoveScore>> double_dummy_move_scores_batch(
    const std::vector<Position>& positions,
    Seat declarer);

// Chooses a defender card that minimizes declarer's double-dummy total.
// hold_order is used only to break exact DD ties while discarding: suits later
// in the string are released first, and low cards are preferred within a suit.
Card choose_double_dummy_defender_card(
    const Position& position,
    Seat declarer,
    std::string_view hold_order = "SHDC");

}  // namespace bridge
