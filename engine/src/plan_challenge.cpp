#include "bridge/plan_challenge.h"

#include <algorithm>
#include <array>
#include <bit>
#include <limits>
#include <numeric>
#include <random>
#include <set>
#include <stdexcept>
#include <tuple>

namespace bridge {
namespace {

using Feature = std::vector<std::uint64_t>;

constexpr Hand honour_mask() {
    Hand result = kEmptyHand;
    for (std::uint8_t suit = 0; suit < kSuitCount; ++suit) {
        for (std::uint8_t rank = static_cast<std::uint8_t>(Rank::Ten);
             rank <= static_cast<std::uint8_t>(Rank::Ace); ++rank) {
            result |= make_card(static_cast<Suit>(suit), static_cast<Rank>(rank));
        }
    }
    return result;
}

// Lengths and honour ownership deliberately dominate insignificant spot swaps.
// All seats are inspected, so this does not assume that declarer is N/S.
std::size_t structural_distance(const Position& left, const Position& right) {
    std::size_t result = 0;
    for (std::size_t seat = 0; seat < 4; ++seat) {
        const Hand a = left.deal.hands[seat];
        const Hand b = right.deal.hands[seat];
        result += std::popcount(a ^ b);
        result += 8 * std::popcount((a ^ b) & honour_mask());
        for (std::uint8_t suit = 0; suit < kSuitCount; ++suit) {
            const int a_length = std::popcount(a & suit_mask(static_cast<Suit>(suit)));
            const int b_length = std::popcount(b & suit_mask(static_cast<Suit>(suit)));
            result += 4 * static_cast<std::size_t>(
                a_length > b_length ? a_length - b_length : b_length - a_length);
        }
    }
    return result;
}

bool same_public_state(const Position& a, const Position& b) {
    if (a.current_trick.leader != b.current_trick.leader ||
        a.current_trick.trump_suit != b.current_trick.trump_suit ||
        a.current_trick.card_count != b.current_trick.card_count ||
        a.score.north_south != b.score.north_south ||
        a.score.east_west != b.score.east_west ||
        a.completed_tricks != b.completed_tricks || a.played_cards != b.played_cards) {
        return false;
    }
    for (std::size_t i = 0; i < a.current_trick.card_count; ++i) {
        if (a.current_trick.cards[i] != b.current_trick.cards[i]) return false;
    }
    return true;
}

bool one_card_swap(const Position& candidate, const Position& seed) {
    if (!same_public_state(candidate, seed)) return false;
    std::array<std::size_t, 2> changed {};
    std::size_t changes = 0;
    for (std::size_t seat = 0; seat < 4; ++seat) {
        if (candidate.deal.hands[seat] == seed.deal.hands[seat]) continue;
        if (changes == changed.size()) return false;
        changed[changes++] = seat;
    }
    if (changes != 2 || changed[0] % 2 != changed[1] % 2) return false;
    const Hand a = seed.deal.hands[changed[0]];
    const Hand b = seed.deal.hands[changed[1]];
    const Hand c = candidate.deal.hands[changed[0]];
    const Hand d = candidate.deal.hands[changed[1]];
    return std::popcount(a & ~c) == 1 && std::popcount(c & ~a) == 1 &&
        (a & ~c) == (d & ~b) && (c & ~a) == (b & ~d);
}

bool reaches_target(Position position, const PlanFailureWitness& target) {
    std::size_t prefix_size = target.path.size();
    const Seat player = next_to_play(target.position.current_trick);
    if (target.card != kNoCard && prefix_size != 0 &&
        target.path.back().player == player && target.path.back().card == target.card) {
        --prefix_size;
    }
    for (std::size_t i = 0; i < prefix_size; ++i) {
        const auto& step = target.path[i];
        if (next_to_play(position.current_trick) != step.player ||
            !is_legal_play(position.current_trick,
                hand_of(position.deal, step.player), step.card)) {
            return false;
        }
        play_card(position, step.card);
    }
    if (!same_public_state(position, target.position)) return false;
    return target.card == kNoCard ||
        is_legal_play(position.current_trick, hand_of(position.deal, player), target.card);
}

void append_public_context(Feature& feature, const Position& position) {
    feature.push_back(seat_index(position.current_trick.leader));
    feature.push_back(position.current_trick.trump_suit ?
        1 + static_cast<std::uint64_t>(*position.current_trick.trump_suit) : 0);
    feature.push_back(position.current_trick.card_count);
    for (std::size_t i = 0; i < position.current_trick.card_count; ++i) {
        feature.push_back(position.current_trick.cards[i]);
    }
    feature.push_back(position.completed_tricks);
    feature.push_back(position.score.north_south);
    feature.push_back(position.score.east_west);
}

Feature target_identity(const PlanFailureWitness& target) {
    Feature result {static_cast<std::uint64_t>(target.kind), target.card};
    append_public_context(result, target.position);
    result.push_back(target.position.played_cards);
    for (const auto& step : target.path) {
        result.push_back(seat_index(step.player));
        result.push_back(step.card);
    }
    return result;
}

bool has_kind(const PlanChallengeCandidate& candidate, PlanFailureKind kind) {
    return std::any_of(candidate.evaluation.failures.begin(),
        candidate.evaluation.failures.end(),
        [kind](const PlanFailureWitness& witness) { return witness.kind == kind; });
}

std::size_t profile_distance(
    const std::vector<std::uint8_t>& left, const std::vector<std::uint8_t>& right) {
    std::size_t result = left.size() > right.size() ?
        left.size() - right.size() : right.size() - left.size();
    for (std::size_t i = 0; i < std::min(left.size(), right.size()); ++i) {
        result += left[i] > right[i] ? left[i] - right[i] : right[i] - left[i];
    }
    return result;
}

} // namespace

std::vector<PlanChallengeDraw> draw_plan_challengers(
    const std::vector<AlphaMuWorld>& legal_pool,
    const std::vector<AlphaMuWorld>& seeds,
    const std::vector<PlanFailureWitness>& targets,
    const std::vector<std::size_t>& used,
    std::size_t count, std::uint64_t seed) {
    std::vector<bool> unavailable(legal_pool.size());
    for (const std::size_t index : used) {
        if (index >= legal_pool.size()) throw std::invalid_argument("used challenger index out of range");
        unavailable[index] = true;
    }
    std::vector<std::size_t> order;
    for (std::size_t i = 0; i < legal_pool.size(); ++i) {
        if (!unavailable[i]) order.push_back(i);
    }
    count = std::min(count, order.size());
    if (count == 0) return {};
    std::mt19937_64 random(seed);
    std::shuffle(order.begin(), order.end(), random);

    // Duplicate witnesses must not give the same observation extra priority.
    std::set<Feature> target_keys;
    std::vector<const PlanFailureWitness*> distinct_targets;
    for (const auto& target : targets) {
        if (target_keys.insert(target_identity(target)).second) distinct_targets.push_back(&target);
    }
    std::vector<std::vector<std::size_t>> reachable(legal_pool.size());
    std::vector<bool> adjacent(legal_pool.size());
    std::vector<std::size_t> target_coverage(distinct_targets.size());
    std::vector<std::size_t> minimum_distance(legal_pool.size(),
        std::numeric_limits<std::size_t>::max());
    for (const std::size_t index : order) {
        const Position& position = legal_pool[index].position;
        for (const auto& active : seeds) {
            minimum_distance[index] = std::min(minimum_distance[index],
                structural_distance(position, active.position));
            adjacent[index] = adjacent[index] || one_card_swap(position, active.position);
        }
        for (std::size_t i = 0; i < distinct_targets.size(); ++i) {
            if (reaches_target(position, *distinct_targets[i])) reachable[index].push_back(i);
        }
    }

    std::vector<PlanChallengeDraw> result;
    result.reserve(count);
    const auto add = [&](std::size_t index, PlanChallengeSource source) {
        result.push_back({index, source});
        unavailable[index] = true;
        for (const std::size_t target : reachable[index]) ++target_coverage[target];
        for (const std::size_t other : order) {
            if (!unavailable[other]) {
                minimum_distance[other] = std::min(minimum_distance[other],
                    structural_distance(legal_pool[index].position, legal_pool[other].position));
            }
        }
    };

    // The random portion is selected first, before any targeted information is
    // used. The other portions diversify relative to those draws and the seeds.
    const std::size_t random_count = (count + 1) / 2;
    for (std::size_t i = 0; i < random_count; ++i) add(order[i], PlanChallengeSource::Random);
    const std::size_t structural_count = (count - random_count) / 2;
    const auto structural_pick = [&]() {
        std::size_t best = legal_pool.size();
        for (const std::size_t index : order) {
            if (unavailable[index]) continue;
            if (best == legal_pool.size() || minimum_distance[index] > minimum_distance[best]) best = index;
        }
        return best;
    };
    for (std::size_t i = 0; i < structural_count; ++i) {
        add(structural_pick(), PlanChallengeSource::Structural);
    }
    while (result.size() < count) {
        std::size_t best = legal_pool.size();
        std::tuple<std::uint64_t, bool, std::size_t> best_score {};
        for (const std::size_t index : order) {
            if (unavailable[index] || (reachable[index].empty() && !adjacent[index])) continue;
            std::uint64_t coverage_score = 0;
            for (const std::size_t target : reachable[index]) {
                coverage_score += 1000000 / (1 + target_coverage[target]);
            }
            const auto score = std::tuple {coverage_score,
                static_cast<bool>(adjacent[index]), minimum_distance[index]};
            if (best == legal_pool.size() || score > best_score) {
                best = index;
                best_score = score;
            }
        }
        if (best != legal_pool.size()) add(best, PlanChallengeSource::Targeted);
        else add(structural_pick(), PlanChallengeSource::Structural);
    }
    return result;
}

std::vector<std::vector<std::uint64_t>> plan_failure_features(
    const PlanChallengeCandidate& candidate) {
    std::set<Feature> features;
    for (const auto& witness : candidate.evaluation.failures) {
        Feature decision {0, static_cast<std::uint64_t>(witness.kind),
            seat_index(next_to_play(witness.position.current_trick)), witness.card,
            witness.diagnosed_choice ? 1ULL : 0ULL, witness.making_moves};
        append_public_context(decision, witness.position);
        features.insert(decision);

        // A second, more specific feature rewards previously unseen hidden
        // contexts without equating every harmless prior card ordering with a
        // different failure. Neither descriptor is used to merge execution.
        Feature contextual = std::move(decision);
        contextual[0] = 1;
        Hand relevant = witness.card | witness.making_moves;
        for (std::size_t i = 0; i < witness.position.current_trick.card_count; ++i) {
            relevant |= witness.position.current_trick.cards[i];
        }
        if (witness.position.current_trick.trump_suit) {
            relevant |= suit_mask(*witness.position.current_trick.trump_suit);
        }
        // At an undiagnosed frontier no suit is singled out, so retain all suit
        // shapes as a weaker structural distinction after the decision feature.
        if (relevant == kEmptyHand) relevant = kFullDeck;
        for (std::uint8_t suit = 0; suit < kSuitCount; ++suit) {
            const Hand mask = suit_mask(static_cast<Suit>(suit));
            if ((relevant & mask) == 0) continue;
            contextual.push_back(suit);
            for (const Hand hand : witness.position.deal.hands) {
                contextual.push_back(std::popcount(hand & mask));
                contextual.push_back(hand & mask & honour_mask());
            }
        }
        features.insert(std::move(contextual));
    }
    return {features.begin(), features.end()};
}

std::vector<std::size_t> select_plan_counterexamples(
    const std::vector<PlanChallengeCandidate>& candidates,
    const std::vector<AlphaMuWorld>& active, std::size_t maximum) {
    std::vector<std::size_t> selected;
    if (maximum == 0) return selected;
    std::vector<std::vector<Feature>> features;
    features.reserve(candidates.size());
    std::vector<std::size_t> minimum_distance(candidates.size(),
        std::numeric_limits<std::size_t>::max());
    for (std::size_t i = 0; i < candidates.size(); ++i) {
        features.push_back(plan_failure_features(candidates[i]));
        for (const auto& world : active) {
            minimum_distance[i] = std::min(minimum_distance[i],
                structural_distance(candidates[i].root, world.position));
        }
    }
    std::set<std::size_t> selected_pool_indices;
    std::set<Feature> covered;
    bool selected_loss = false;
    bool selected_gap = false;

    const auto choose = [&](std::optional<PlanFailureKind> required) {
        std::size_t best = candidates.size();
        std::tuple<std::size_t, std::size_t, std::size_t> best_score {};
        for (std::size_t i = 0; i < candidates.size(); ++i) {
            const auto& candidate = candidates[i];
            if (features[i].empty() || selected_pool_indices.contains(candidate.pool_index) ||
                (required && !has_kind(candidate, *required))) continue;
            std::size_t novelty = 0;
            for (const auto& feature : features[i]) novelty += !covered.contains(feature);
            std::size_t profile_novelty = 0;
            if (!selected.empty()) {
                profile_novelty = std::numeric_limits<std::size_t>::max();
                for (const std::size_t chosen : selected) {
                    profile_novelty = std::min(profile_novelty,
                        profile_distance(candidate.root_profile, candidates[chosen].root_profile));
                }
            }
            const auto score = std::tuple {novelty, minimum_distance[i], profile_novelty};
            if (best == candidates.size() || score > best_score) {
                best = i;
                best_score = score;
            }
        }
        return best;
    };
    const auto add = [&](std::size_t index) {
        selected.push_back(index);
        selected_pool_indices.insert(candidates[index].pool_index);
        covered.insert(features[index].begin(), features[index].end());
        selected_loss = selected_loss || has_kind(candidates[index], PlanFailureKind::DdLoss);
        selected_gap = selected_gap || has_kind(candidates[index], PlanFailureKind::MissingObservation);
        for (std::size_t i = 0; i < candidates.size(); ++i) {
            minimum_distance[i] = std::min(minimum_distance[i],
                structural_distance(candidates[index].root, candidates[i].root));
        }
    };

    // Choose a real loss first when both categories can be represented. A
    // many-branch coverage gap must not consume the entire second-pass budget.
    if (maximum >= 2) {
        const std::size_t loss = choose(PlanFailureKind::DdLoss);
        const std::size_t gap = choose(PlanFailureKind::MissingObservation);
        if (loss != candidates.size() && gap != candidates.size()) {
            add(loss);
            if (!selected_gap) {
                const std::size_t distinct_gap = choose(PlanFailureKind::MissingObservation);
                if (distinct_gap != candidates.size()) add(distinct_gap);
            }
        }
    }
    while (selected.size() < maximum) {
        const std::size_t best = choose(std::nullopt);
        if (best == candidates.size()) break;
        add(best);
    }
    return selected;
}

} // namespace bridge
