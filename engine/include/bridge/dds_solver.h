#pragma once

#include <array>
#include <cstdint>
#include <optional>

#include "bridge/game.h"

namespace bridge {

struct DoubleDummyTable {
    std::array<std::array<int, 4>, 5> tricks {};
};

DoubleDummyTable solve_double_dummy_table(const Deal& deal);
int double_dummy_tricks(const Deal& deal, Seat declarer, std::optional<Suit> trump_suit);

// Returns future tricks for declarer's partnership from an arbitrary partial position.
std::uint8_t double_dummy_future_tricks(const Position& position, Seat declarer);

}  // namespace bridge
