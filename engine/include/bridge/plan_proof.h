#pragma once

#include "bridge/alpha_mu.h"
#include <string_view>

namespace bridge {

enum class PlanProofKind : std::uint8_t {
    None, TargetReached, TargetImpossible, DeclarerQuickTricks, DeclarerClaim,
    DefenderQuickTricks, DdsLoss
};
std::string_view to_string(PlanProofKind kind);
bool plan_proof_is_win(PlanProofKind kind);
bool plan_proof_is_loss(PlanProofKind kind);

struct PlanProofResult {
    PlanProofKind kind {PlanProofKind::None};
    bool win {};
    bool public_information {};
    std::uint64_t states {};
};

// Declarer proofs use the known declaring hands and combined defender pool.
// Learned voids/auction constraints may make a stronger proof possible, but
// ignoring them here is conservative. Defence quick tricks use the supplied
// concrete defender hands and prove a loss only in that layout. They never
// become a public declarer certificate or a condition in an executable play.
PlanProofResult prove_plan_terminal(const Position& position,
    const AlphaMuConfig& config, bool allow_dds_loss = false);

// A stored proof leaf requests this check in its CURRENT execution state.
// Its interned node ID carries neither a layout nor permission to reuse a
// previous result. Failed rechecks leave an unresolved continuation.
bool recheck_plan_proof(PlanProofKind kind, const Position& position,
    const AlphaMuConfig& config);

} // namespace bridge
