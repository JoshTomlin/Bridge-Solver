#pragma once

#include <cstdint>

#include "bridge/game.h"

namespace bridge {

// Result of a target-directed, layout-independent cashing proof.
//
// The proof uses only declarer/dummy's remaining cards and the cards already
// played. It never inspects which defender owns an unseen card. A successful
// result means the declaring side can take required_tricks consecutively from
// the current lead, regardless of the hidden split.
struct QuickTrickProof {
    bool proven {};
    Card first_card {kNoCard};
    std::uint64_t states_examined {};
    bool budget_exhausted {};
};

QuickTrickProof prove_declarer_quick_tricks(
    const Position& position,
    Seat declarer,
    std::uint8_t required_tricks);

}  // namespace bridge
