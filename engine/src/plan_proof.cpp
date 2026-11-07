#include "bridge/plan_proof.h"
#include "bridge/claim.h"
#include "bridge/dds_solver.h"
#include "bridge/quick_tricks.h"
#include <stdexcept>

namespace bridge {
namespace {
int won(const Position& p, Seat side) {
    return same_side(side, Seat::North) ? p.score.north_south : p.score.east_west;
}
int remaining_tricks(const Position& p) {
    unsigned cards = p.current_trick.card_count;
    for (Hand hand : p.deal.hands) cards += card_count(hand);
    if (cards % 4) throw std::invalid_argument("proof position has incomplete hand sizes");
    return static_cast<int>(cards / 4);
}
PlanProofResult check(PlanProofKind kind, const Position& p, const AlphaMuConfig& c) {
    const int needed = c.target_tricks - won(p, c.declarer);
    const int remaining = remaining_tricks(p);
    const Seat turn = next_to_play(p.current_trick);
    const bool declaring = same_side(turn, c.declarer);
    bool proved = false;
    std::uint64_t states = 0;
    switch (kind) {
    case PlanProofKind::None: break;
    case PlanProofKind::TargetReached: proved = needed <= 0; break;
    case PlanProofKind::TargetImpossible: proved = needed > remaining; break;
    case PlanProofKind::DeclarerQuickTricks:
    case PlanProofKind::DeclarerClaim:
        if (needed > 0 && needed <= remaining && declaring && !p.current_trick.card_count) {
            if (kind == PlanProofKind::DeclarerQuickTricks) {
                const auto proof = prove_declarer_quick_tricks(p, c.declarer, static_cast<std::uint8_t>(needed));
                proved = proof.proven; states = proof.states_examined;
            } else {
                const auto proof = prove_declarer_claim(p, c.declarer, static_cast<std::uint8_t>(needed));
                proved = proof.proven; states = proof.states_examined;
            }
        }
        break;
    case PlanProofKind::DefenderQuickTricks:
        if (needed > 0 && needed <= remaining && !declaring && !p.current_trick.card_count) {
            const auto proof = prove_declarer_quick_tricks(p, turn,
                static_cast<std::uint8_t>(remaining - needed + 1));
            proved = proof.proven; states = proof.states_examined;
        }
        break;
    case PlanProofKind::DdsLoss:
        proved = needed > 0 && double_dummy_future_tricks(p, c.declarer) < needed;
        break;
    default: throw std::invalid_argument("invalid plan proof kind");
    }
    return {proved ? kind : PlanProofKind::None, proved && plan_proof_is_win(kind),
        proved && kind != PlanProofKind::DefenderQuickTricks && kind != PlanProofKind::DdsLoss, states};
}
}

std::string_view to_string(PlanProofKind kind) {
    switch (kind) {
    case PlanProofKind::None: return "none";
    case PlanProofKind::TargetReached: return "target_reached";
    case PlanProofKind::TargetImpossible: return "target_impossible";
    case PlanProofKind::DeclarerQuickTricks: return "declarer_quick_tricks";
    case PlanProofKind::DeclarerClaim: return "declarer_claim";
    case PlanProofKind::DefenderQuickTricks: return "defender_quick_tricks";
    case PlanProofKind::DdsLoss: return "dds_loss";
    }
    throw std::invalid_argument("invalid plan proof kind");
}
bool plan_proof_is_win(PlanProofKind kind) {
    return kind == PlanProofKind::TargetReached || kind == PlanProofKind::DeclarerQuickTricks ||
        kind == PlanProofKind::DeclarerClaim;
}
bool plan_proof_is_loss(PlanProofKind kind) {
    return kind == PlanProofKind::TargetImpossible || kind == PlanProofKind::DefenderQuickTricks ||
        kind == PlanProofKind::DdsLoss;
}

PlanProofResult prove_plan_terminal(const Position& p, const AlphaMuConfig& c, bool allow_dds_loss) {
    PlanProofResult result;
    for (const auto kind : {PlanProofKind::TargetReached, PlanProofKind::TargetImpossible,
             PlanProofKind::DeclarerQuickTricks, PlanProofKind::DefenderQuickTricks,
             PlanProofKind::DeclarerClaim, PlanProofKind::DdsLoss}) {
        if ((kind == PlanProofKind::DeclarerQuickTricks || kind == PlanProofKind::DefenderQuickTricks) &&
            !c.optimizations.quick_trick_bounds) continue;
        if (kind == PlanProofKind::DeclarerClaim && !c.optimizations.claim_bounds) continue;
        if (kind == PlanProofKind::DdsLoss && !allow_dds_loss) continue;
        const auto proof = check(kind, p, c);
        result.states += proof.states;
        if (proof.kind != PlanProofKind::None) {
            result.kind = proof.kind; result.win = proof.win; result.public_information = proof.public_information;
            return result;
        }
    }
    return result;
}
bool recheck_plan_proof(PlanProofKind kind, const Position& p, const AlphaMuConfig& c) {
    return kind != PlanProofKind::None && check(kind, p, c).kind == kind;
}
} // namespace bridge
