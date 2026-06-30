#include "alpha_mu_internal.h"

#include <algorithm>
#include <stdexcept>
#include <utility>

namespace bridge::alpha_mu_detail {
namespace {

struct PolicyChoice {
    OutcomeVector outcome;
    std::vector<OutcomeVector> child_outcomes;
};

struct DefenderPolicyBranch {
    Card card {kNoCard};
    WorldMask legal_worlds {};
    std::vector<AlphaMuWorld> child_worlds;
    ParetoFront child_front;
};

bool add_policy_choice(std::vector<PolicyChoice>& choices, PolicyChoice candidate) {
    for (const PolicyChoice& existing : choices) {
        if (existing.outcome.wins == candidate.outcome.wins ||
            outcome_dominates(existing.outcome, candidate.outcome)) {
            return false;
        }
    }

    std::erase_if(choices, [&](const PolicyChoice& existing) {
        return outcome_dominates(candidate.outcome, existing.outcome);
    });
    choices.push_back(std::move(candidate));
    return true;
}

std::shared_ptr<const AlphaMuPolicyNode> build_policy_for_outcome(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    std::uint8_t max_moves_left,
    OutcomeVector target,
    std::uint8_t starting_completed_tricks,
    SearchContext& context) {
    if (active_worlds == 0 || max_moves_left == 0) {
        return nullptr;
    }

    const Position& position = worlds[first_world(active_worlds)].position;
    if (is_deal_finished(position) ||
        position.completed_tricks != starting_completed_tricks) {
        return nullptr;
    }

    const Seat turn = player_to_act(position);
    if (same_side(turn, context.config.declarer)) {
        const Hand legal_moves = shared_declarer_moves(worlds, active_worlds);
        for (const Card move : representative_cards(
                 position, legal_moves, kNoCard, context)) {
            auto child_worlds = worlds;
            for (std::size_t world = 0; world < child_worlds.size(); ++world) {
                if ((active_worlds & (WorldMask {1} << world)) != 0) {
                    play_card(child_worlds[world].position, move);
                }
            }

            NodeEvaluation child = alpha_mu_node(
                child_worlds,
                active_worlds,
                static_cast<std::uint8_t>(max_moves_left - 1),
                context,
                nullptr,
                nullptr,
                0);
            const auto selected = std::find_if(
                child.front.vectors.begin(),
                child.front.vectors.end(),
                [&](const OutcomeVector& outcome) {
                    return outcome.wins == target.wins;
                });
            if (selected == child.front.vectors.end()) {
                continue;
            }

            return std::make_shared<AlphaMuPolicyNode>(AlphaMuPolicyNode {
                .player = turn,
                .possible_worlds = active_worlds,
                .outcome = target,
                .declarer_move = move,
                .continuation = build_policy_for_outcome(
                    child_worlds,
                    active_worlds,
                    static_cast<std::uint8_t>(max_moves_left - 1),
                    *selected,
                    starting_completed_tricks,
                    context),
            });
        }
        throw std::logic_error("failed to reconstruct alpha-mu MAX strategy");
    }

    std::vector<DefenderPolicyBranch> branches;
    const Hand possible_moves = union_of_defender_moves(worlds, active_worlds);
    for (const Card move : ordered_cards(possible_moves)) {
        DefenderPolicyBranch branch {.card = move, .child_worlds = worlds};
        for (std::size_t world = 0; world < branch.child_worlds.size(); ++world) {
            const WorldMask world_bit = WorldMask {1} << world;
            if ((active_worlds & world_bit) == 0) {
                continue;
            }

            Position& child_position = branch.child_worlds[world].position;
            const Seat player = player_to_act(child_position);
            if (is_legal_play(
                    child_position.current_trick,
                    hand_of(child_position.deal, player),
                    move)) {
                play_card(child_position, move);
                branch.legal_worlds |= world_bit;
            }
        }
        if (branch.legal_worlds == 0) {
            continue;
        }

        branch.child_front = alpha_mu_node(
            branch.child_worlds,
            branch.legal_worlds,
            max_moves_left,
            context,
            nullptr,
            nullptr,
            0).front;
        branches.push_back(std::move(branch));
    }

    std::vector<PolicyChoice> choices {
        PolicyChoice {.outcome = OutcomeVector {.wins = active_worlds}},
    };
    for (const DefenderPolicyBranch& branch : branches) {
        std::vector<PolicyChoice> combined;
        const WorldMask impossible_worlds = active_worlds & ~branch.legal_worlds;
        for (const PolicyChoice& existing : choices) {
            for (const OutcomeVector& child : branch.child_front.vectors) {
                PolicyChoice candidate = existing;
                candidate.outcome.wins &= child.wins | impossible_worlds;
                candidate.child_outcomes.push_back(child);
                add_policy_choice(combined, std::move(candidate));
            }
        }
        choices = std::move(combined);
    }

    const auto selected = std::find_if(
        choices.begin(),
        choices.end(),
        [&](const PolicyChoice& choice) {
            return choice.outcome.wins == target.wins;
        });
    if (selected == choices.end() || selected->child_outcomes.size() != branches.size()) {
        throw std::logic_error("failed to reconstruct alpha-mu MIN strategy");
    }

    std::vector<AlphaMuPolicyBranch> policy_branches;
    policy_branches.reserve(branches.size());
    for (std::size_t index = 0; index < branches.size(); ++index) {
        const DefenderPolicyBranch& branch = branches[index];
        policy_branches.push_back(AlphaMuPolicyBranch {
            .card = branch.card,
            .possible_worlds = branch.legal_worlds,
            .continuation = build_policy_for_outcome(
                branch.child_worlds,
                branch.legal_worlds,
                max_moves_left,
                selected->child_outcomes[index],
                starting_completed_tricks,
                context),
        });
    }

    return std::make_shared<AlphaMuPolicyNode>(AlphaMuPolicyNode {
        .player = turn,
        .possible_worlds = active_worlds,
        .outcome = target,
        .defender_branches = std::move(policy_branches),
    });
}

const OutcomeVector& highest_scoring_outcome(const ParetoFront& front) {
    if (front.vectors.empty()) {
        throw std::logic_error("cannot select a strategy from an empty Pareto front");
    }
    return *std::max_element(
        front.vectors.begin(),
        front.vectors.end(),
        [](const OutcomeVector& left, const OutcomeVector& right) {
            return winning_world_count(left) < winning_world_count(right);
        });
}

}  // namespace

std::shared_ptr<const AlphaMuPolicyNode> build_trick_policy(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config,
    Card root_move,
    SearchContext& context) {
    if (root_move == kNoCard || config.max_declarer_plies == 0) {
        return nullptr;
    }

    const WorldMask active_worlds = all_worlds_mask(worlds.size());
    const Position& root = worlds.front().position;
    if (!same_side(player_to_act(root), config.declarer)) {
        return nullptr;
    }

    auto child_worlds = worlds;
    for (AlphaMuWorld& world : child_worlds) {
        play_card(world.position, root_move);
    }
    NodeEvaluation child = alpha_mu_node(
        child_worlds,
        active_worlds,
        static_cast<std::uint8_t>(config.max_declarer_plies - 1),
        context,
        nullptr,
        nullptr,
        0);
    const OutcomeVector selected = highest_scoring_outcome(child.front);

    return std::make_shared<AlphaMuPolicyNode>(AlphaMuPolicyNode {
        .player = player_to_act(root),
        .possible_worlds = active_worlds,
        .outcome = selected,
        .declarer_move = root_move,
        .continuation = build_policy_for_outcome(
            child_worlds,
            active_worlds,
            static_cast<std::uint8_t>(config.max_declarer_plies - 1),
            selected,
            root.completed_tricks,
            context),
    });
}

}  // namespace bridge::alpha_mu_detail
