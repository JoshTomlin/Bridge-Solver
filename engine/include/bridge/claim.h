#pragma once

#include <cstdint>

#include "bridge/game.h"

namespace bridge {

// DTAC-style public claim proof.
//
// This is conservative and target-directed. It sees declarer/dummy's remaining
// cards and the combined defender pool, but not which defender owns which card.
// A successful result means the declaring side can take required_tricks against
// every split compatible with that pool.
struct ClaimProof {
    bool proven {};
    Card first_card {kNoCard};
    std::uint8_t tricks_claimed {};
    std::uint64_t states_examined {};
    std::uint64_t cache_hits {};
    std::uint64_t equivalent_cards_skipped {};
    bool budget_exhausted {};
};

ClaimProof prove_declarer_claim(
    const Position& position,
    Seat declarer,
    std::uint8_t required_tricks);

}  // namespace bridge
