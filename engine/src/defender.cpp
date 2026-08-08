#include "bridge/defender.h"

#include <algorithm>
#include <array>
#include <bit>
#include <stdexcept>

namespace bridge {
namespace {

std::uint64_t mix64(std::uint64_t value) {
    value += 0x9e3779b97f4a7c15ULL;
    value = (value ^ (value >> 30)) * 0xbf58476d1ce4e5b9ULL;
    value = (value ^ (value >> 27)) * 0x94d049bb133111ebULL;
    return value ^ (value >> 31);
}

std::size_t hold_priority(Suit suit, std::string_view hold_order) {
    const char symbol = to_string(suit).front();
    const std::size_t priority = hold_order.find(symbol);
    return priority == std::string_view::npos ? hold_order.size() : priority;
}

int rank_resource_cost(Rank rank) {
    constexpr std::array<int, 13> costs {
        0, 0, 0, 0, 0, 0, 1, 2, 4, 7, 11, 16, 22,
    };
    return costs[static_cast<std::size_t>(rank)];
}

bool contains_honor(Hand hand) {
    for (const Rank rank : {Rank::Ace, Rank::King, Rank::Queen, Rank::Jack}) {
        for (const Suit suit : {Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades}) {
            if (contains(hand, make_card(suit, rank))) return true;
        }
    }
    return false;
}

int defensive_resource_cost(
    const Position& position,
    Seat player,
    Card card,
    std::string_view hold_order) {
    const Hand hand = hand_of(position.deal, player);
    const Suit suit = suit_of(card);
    const Hand holding = cards_in_suit(hand, suit);
    const Hand after = remove_card(holding, card);
    const bool is_discard =
        position.current_trick.card_count > 0 &&
        cards_in_suit(hand, suit_of(position.current_trick.cards[0])) == kEmptyHand;

    int cost = rank_resource_cost(rank_of(card));
    if (position.current_trick.trump_suit == suit) cost += 10;

    // A low card can still be important when it is the last guard protecting
    // a short honour holding. DDS remains the primary objective, so this only
    // decides between cards that are tactically tied on the actual layout.
    if (rank_of(card) < Rank::Jack && contains_honor(after)) {
        const std::uint8_t before_length = card_count(holding);
        const std::uint8_t after_length = card_count(after);
        if (before_length <= 3) cost += static_cast<int>(4 - after_length) * 2;
    }

    if (is_discard) {
        const std::size_t priority = hold_priority(suit, hold_order);
        if (priority < hold_order.size()) {
            cost += static_cast<int>(hold_order.size() - priority) * 2;
        }
    }
    return cost;
}

int policy_tier(const DefenderCardAssessment& assessment) {
    if (assessment.policy_branch_supported &&
        !assessment.policy_makes_target &&
        !assessment.unsupported_observation) {
        return 0;
    }
    if (assessment.unsupported_observation ||
        !assessment.policy_branch_supported) {
        return 1;
    }
    return 2;
}

int compare_policy_fraction(
    const DefenderCardAssessment& left,
    const DefenderCardAssessment& right) {
    if (left.policy_possible_worlds == 0 || right.policy_possible_worlds == 0) {
        if (left.policy_possible_worlds == right.policy_possible_worlds) return 0;
        return left.policy_possible_worlds == 0 ? 1 : -1;
    }
    const std::uint64_t left_scaled =
        static_cast<std::uint64_t>(left.policy_winning_worlds) *
        right.policy_possible_worlds;
    const std::uint64_t right_scaled =
        static_cast<std::uint64_t>(right.policy_winning_worlds) *
        left.policy_possible_worlds;
    if (left_scaled == right_scaled) return 0;
    return left_scaled < right_scaled ? -1 : 1;
}

bool assessment_better(
    const DefenderCardAssessment& left,
    const DefenderCardAssessment& right,
    bool policy_available,
    std::uint64_t tie_seed,
    Hand played_cards) {
    if (left.declarer_future_tricks != right.declarer_future_tricks) {
        return left.declarer_future_tricks < right.declarer_future_tricks;
    }
    if (policy_available) {
        const int left_tier = policy_tier(left);
        const int right_tier = policy_tier(right);
        if (left_tier != right_tier) return left_tier < right_tier;
        if (left_tier < 2 && left.failure_depth != right.failure_depth) {
            return left.failure_depth < right.failure_depth;
        }
        const int fraction = compare_policy_fraction(left, right);
        if (fraction != 0) return fraction < 0;
    }
    if (left.resource_cost != right.resource_cost) {
        return left.resource_cost < right.resource_cost;
    }
    const std::uint64_t left_mix = mix64(tie_seed ^ played_cards ^ left.card);
    const std::uint64_t right_mix = mix64(tie_seed ^ played_cards ^ right.card);
    if (left_mix != right_mix) return left_mix < right_mix;
    return left.card < right.card;
}

std::string selection_reason(
    const DefenderCardAssessment& selected,
    const std::vector<DefenderCardAssessment>& candidates,
    bool policy_available) {
    const std::size_t tied = static_cast<std::size_t>(std::count_if(
        candidates.begin(),
        candidates.end(),
        [&](const DefenderCardAssessment& candidate) {
            return candidate.dd_optimal;
        }));
    if (tied <= 1) return "only double-dummy best card";
    if (policy_available) {
        const int tier = policy_tier(selected);
        if (tier == 0) return "defeats the retained declarer policy";
        if (tier == 1) return "forces an observation outside the retained policy";

        const bool has_easier_policy_branch = std::any_of(
            candidates.begin(),
            candidates.end(),
            [&](const DefenderCardAssessment& candidate) {
                return candidate.dd_optimal &&
                    compare_policy_fraction(selected, candidate) < 0;
            });
        if (has_easier_policy_branch) {
            return "leaves the retained policy successful in fewer sampled worlds";
        }
    }
    const bool preserves_more = std::any_of(
        candidates.begin(),
        candidates.end(),
        [&](const DefenderCardAssessment& candidate) {
            return candidate.dd_optimal &&
                selected.resource_cost < candidate.resource_cost;
        });
    return preserves_more
        ? "preserves defensive honours, guards, trump, or preferred suits"
        : "seeded mix among strategically equivalent cards";
}

}  // namespace

DefenderDecision choose_competent_defender_card(
    const Position& position,
    Seat declarer,
    const std::shared_ptr<const AlphaMuPolicyNode>& policy,
    const AlphaMuConfig& config,
    std::string_view hold_order,
    std::uint64_t tie_seed) {
    if (is_deal_finished(position)) {
        throw std::logic_error("the deal is finished");
    }
    const Seat player = next_to_play(position.current_trick);
    if (same_side(player, declarer)) {
        throw std::logic_error("competent defender move requested on declarer's turn");
    }

    const std::vector<DoubleDummyMoveScore> dd_scores =
        double_dummy_move_scores(position, declarer);
    if (dd_scores.empty()) {
        throw std::logic_error("DDS returned no legal defender cards");
    }
    const std::uint8_t best_dd = std::min_element(
        dd_scores.begin(),
        dd_scores.end(),
        [](const DoubleDummyMoveScore& left, const DoubleDummyMoveScore& right) {
            return left.future_tricks < right.future_tricks;
        })->future_tricks;
    const bool policy_available = policy != nullptr && policy->player == player;

    DefenderDecision decision {
        .declarer_future_tricks = best_dd,
        .policy_available = policy_available,
    };
    decision.candidates.reserve(dd_scores.size());
    for (const DoubleDummyMoveScore& dd_score : dd_scores) {
        DefenderCardAssessment assessment {
            .card = dd_score.card,
            .declarer_future_tricks = dd_score.future_tricks,
            .dd_optimal = dd_score.future_tricks == best_dd,
            .resource_cost = defensive_resource_cost(
                position, player, dd_score.card, hold_order),
        };

        if (policy_available && assessment.dd_optimal) {
            const auto branch = std::find_if(
                policy->defender_branches.begin(),
                policy->defender_branches.end(),
                [&](const AlphaMuPolicyBranch& candidate) {
                    return candidate.card == dd_score.card;
                });
            if (branch == policy->defender_branches.end()) {
                assessment.unsupported_observation = true;
                assessment.failure_depth = 0;
            } else {
                assessment.policy_branch_supported = true;
                assessment.policy_possible_worlds =
                    std::popcount(branch->possible_worlds);
                if (branch->continuation != nullptr) {
                    assessment.policy_winning_worlds = std::popcount(
                        branch->continuation->outcome.wins &
                        branch->possible_worlds);
                }

                Position child = position;
                play_card(child, dd_score.card);
                const AlphaMuPolicyEvaluation evaluation =
                    evaluate_alpha_mu_policy(
                        std::move(child), branch->continuation, config);
                assessment.policy_makes_target = evaluation.makes_target;
                assessment.unsupported_observation =
                    evaluation.unsupported_observation;
                assessment.failure_depth = evaluation.failure_depth;
                if (branch->continuation == nullptr) {
                    assessment.policy_winning_worlds = evaluation.makes_target
                        ? assessment.policy_possible_worlds
                        : 0;
                }
            }
        }
        decision.candidates.push_back(assessment);
    }

    const DefenderCardAssessment* best = nullptr;
    for (const DefenderCardAssessment& assessment : decision.candidates) {
        if (!assessment.dd_optimal) continue;
        if (best == nullptr || assessment_better(
                assessment,
                *best,
                policy_available,
                tie_seed,
                position.played_cards)) {
            best = &assessment;
        }
    }
    if (best == nullptr) {
        throw std::logic_error("failed to select a DD-safe defender card");
    }
    decision.card = best->card;
    decision.reason = selection_reason(
        *best, decision.candidates, policy_available);
    return decision;
}

}  // namespace bridge
