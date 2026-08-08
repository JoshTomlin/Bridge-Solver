#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include "bridge/alpha_mu2.h"
#include "bridge/dds_solver.h"

namespace bridge {

struct DefenderCardAssessment {
    Card card {kNoCard};
    std::uint8_t declarer_future_tricks {};
    bool dd_optimal {};
    bool policy_branch_supported {};
    bool policy_makes_target {true};
    bool unsupported_observation {};
    std::size_t failure_depth {};
    std::size_t policy_winning_worlds {};
    std::size_t policy_possible_worlds {};
    int resource_cost {};
};

struct DefenderDecision {
    Card card {kNoCard};
    std::uint8_t declarer_future_tricks {};
    bool policy_available {};
    std::string reason;
    std::vector<DefenderCardAssessment> candidates;
};

// Keeps DDS as a strict primary objective, then uses the retained alpha-mu
// policy to choose the most testing card among exact DD ties. Resource
// preservation and a seeded deterministic mix break any remaining ties.
DefenderDecision choose_competent_defender_card(
    const Position& position,
    Seat declarer,
    const std::shared_ptr<const AlphaMuPolicyNode>& policy,
    const AlphaMuConfig& config,
    std::string_view hold_order = "SHDC",
    std::uint64_t tie_seed = 0);

}  // namespace bridge
