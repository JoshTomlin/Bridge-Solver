#include "bridge/alpha_mu2.h"

#include "bridge/claim.h"
#include "bridge/dds_solver.h"
#include "bridge/quick_tricks.h"

#include <algorithm>
#include <chrono>
#include <limits>
#include <map>
#include <set>
#include <stdexcept>
#include <utility>

namespace bridge {
namespace {

struct FingerprintGroup {
    std::vector<std::uint8_t> fingerprint;
    std::vector<std::size_t> indices;
};

struct PolicyCheck {
    bool makes_target {};
    bool unsupported_observation {};
};

struct CounterexampleCandidate {
    std::size_t index {};
    bool unsupported_observation {};
    std::uint8_t root_regret {};
    std::size_t distance_from_active {};
};

std::uint8_t partnership_score(const Position& position, Seat declarer) {
    return same_side(declarer, Seat::North)
        ? position.score.north_south
        : position.score.east_west;
}

std::uint8_t remaining_tricks(const Position& position) {
    std::uint16_t cards = position.current_trick.card_count;
    for (const Hand hand : position.deal.hands) {
        cards = static_cast<std::uint16_t>(cards + card_count(hand));
    }
    return cards % 4 == 0 ? static_cast<std::uint8_t>(cards / 4) : 0;
}

WorldMask first_worlds_mask(std::size_t count) {
    return count >= 64 ? ~WorldMask {0} : (WorldMask {1} << count) - 1;
}

std::vector<std::size_t> first_reservoir_indices(
    const std::vector<AlphaMuWorld>& reservoir,
    std::size_t maximum) {
    const std::size_t count = std::min({reservoir.size(), maximum, std::size_t {64}});
    std::vector<std::size_t> indices;
    indices.reserve(count);
    for (std::size_t index = 0; index < count; ++index) {
        indices.push_back(index);
    }
    return indices;
}

std::vector<Card> cards_in_bridge_order(Hand cards) {
    std::vector<Card> result;
    result.reserve(card_count(cards));
    for (const Suit suit : {
             Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        for (int rank = static_cast<int>(Rank::Ace);
             rank >= static_cast<int>(Rank::Two);
             --rank) {
            const Card card = make_card(suit, static_cast<Rank>(rank));
            if (contains(cards, card)) result.push_back(card);
        }
    }
    return result;
}

Hand representative_move_mask(
    const Position& position,
    Hand legal_moves,
    bool collapse_equivalents,
    std::size_t* skipped = nullptr) {
    if (!collapse_equivalents) {
        if (skipped) *skipped = 0;
        return legal_moves;
    }

    Hand representatives = kEmptyHand;
    std::size_t skipped_count = 0;
    const Seat player = next_to_play(position.current_trick);
    const std::vector<Hand> groups = equivalent_play_groups(
        position.current_trick,
        legal_moves,
        hand_of(position.deal, player),
        position.played_cards);
    for (const Hand group : groups) {
        const std::vector<Card> ordered = cards_in_bridge_order(group);
        if (ordered.empty()) continue;
        representatives = add_card(representatives, ordered.front());
        skipped_count += card_count(group) - 1;
    }
    if (skipped) *skipped = skipped_count;
    return representatives;
}

std::size_t screening_index_for_move(
    const std::vector<Card>& screening_moves,
    const Position& root,
    Card move,
    bool collapse_equivalents) {
    const auto exact = std::find(
        screening_moves.begin(), screening_moves.end(), move);
    if (exact != screening_moves.end()) {
        return static_cast<std::size_t>(exact - screening_moves.begin());
    }
    if (!collapse_equivalents || move == kNoCard) {
        return screening_moves.size();
    }

    const Seat player = next_to_play(root.current_trick);
    const Hand legal = legal_plays(root.current_trick, hand_of(root.deal, player));
    const std::vector<Hand> groups = equivalent_play_groups(
        root.current_trick,
        legal,
        hand_of(root.deal, player),
        root.played_cards);
    for (const Hand group : groups) {
        if (!contains(group, move)) continue;
        const std::vector<Card> ordered = cards_in_bridge_order(group);
        if (ordered.empty()) break;
        const auto representative = std::find(
            screening_moves.begin(), screening_moves.end(), ordered.front());
        if (representative != screening_moves.end()) {
            return static_cast<std::size_t>(representative - screening_moves.begin());
        }
        break;
    }
    return screening_moves.size();
}

std::size_t fingerprint_distance(
    const AlphaMu2ScreeningVector& left,
    const AlphaMu2ScreeningVector& right,
    const std::vector<Card>& moves) {
    std::size_t distance = 0;
    for (std::size_t index = 0; index < left.future_tricks.size(); ++index) {
        const int difference =
            static_cast<int>(left.future_tricks[index]) -
            static_cast<int>(right.future_tricks[index]);
        distance += static_cast<std::size_t>(
            difference < 0 ? -difference : difference);
        if (contains(left.making_moves, moves[index]) !=
            contains(right.making_moves, moves[index])) {
            distance += 16;
        }
    }
    return distance;
}

std::vector<FingerprintGroup> fingerprint_groups(
    std::vector<AlphaMu2ScreeningVector>& screening) {
    std::map<std::vector<std::uint8_t>, std::vector<std::size_t>> grouped;
    for (std::size_t index = 0; index < screening.size(); ++index) {
        grouped[screening[index].future_tricks].push_back(index);
    }

    std::vector<FingerprintGroup> result;
    result.reserve(grouped.size());
    for (auto& [fingerprint, indices] : grouped) {
        for (const std::size_t index : indices) {
            screening[index].equivalent_worlds = indices.size();
        }
        result.push_back(FingerprintGroup {
            .fingerprint = std::move(fingerprint),
            .indices = std::move(indices),
        });
    }
    return result;
}

std::vector<std::size_t> choose_group_indices(
    const std::vector<FingerprintGroup>& groups,
    const std::vector<AlphaMu2ScreeningVector>& screening,
    const std::vector<Card>& moves,
    std::size_t count) {
    if (groups.size() <= count) {
        std::vector<std::size_t> all(groups.size());
        for (std::size_t index = 0; index < groups.size(); ++index) {
            all[index] = index;
        }
        return all;
    }

    const auto largest = std::max_element(
        groups.begin(),
        groups.end(),
        [](const FingerprintGroup& left, const FingerprintGroup& right) {
            return left.indices.size() < right.indices.size();
        });
    std::vector<std::size_t> selected {
        static_cast<std::size_t>(largest - groups.begin()),
    };
    while (selected.size() < count) {
        std::size_t best_group = groups.size();
        std::size_t best_distance = 0;
        std::size_t best_frequency = 0;
        for (std::size_t candidate = 0; candidate < groups.size(); ++candidate) {
            if (std::find(selected.begin(), selected.end(), candidate) !=
                selected.end()) {
                continue;
            }
            std::size_t minimum_distance =
                std::numeric_limits<std::size_t>::max();
            for (const std::size_t existing : selected) {
                minimum_distance = std::min(
                    minimum_distance,
                    fingerprint_distance(
                        screening[groups[candidate].indices.front()],
                        screening[groups[existing].indices.front()],
                        moves));
            }
            if (best_group == groups.size() ||
                minimum_distance > best_distance ||
                (minimum_distance == best_distance &&
                 groups[candidate].indices.size() > best_frequency)) {
                best_group = candidate;
                best_distance = minimum_distance;
                best_frequency = groups[candidate].indices.size();
            }
        }
        selected.push_back(best_group);
    }
    return selected;
}

std::vector<std::size_t> select_initial_worlds(
    const std::vector<FingerprintGroup>& groups,
    const std::vector<AlphaMu2ScreeningVector>& screening,
    const std::vector<Card>& moves,
    std::size_t count) {
    const std::vector<std::size_t> selected_groups =
        choose_group_indices(groups, screening, moves, count);
    std::vector<std::size_t> used(groups.size());
    std::vector<std::size_t> selected;
    selected.reserve(count);
    for (const std::size_t group : selected_groups) {
        selected.push_back(groups[group].indices.front());
        used[group] = 1;
    }

    // D'Hondt-style allocation approximately preserves each bucket's frequency
    // after every distinct strategic fingerprint has one representative.
    while (selected.size() < count) {
        std::size_t best_group = groups.size();
        for (const std::size_t group : selected_groups) {
            if (used[group] >= groups[group].indices.size()) continue;
            if (best_group == groups.size() ||
                groups[group].indices.size() * (used[best_group] + 1) >
                    groups[best_group].indices.size() * (used[group] + 1)) {
                best_group = group;
            }
        }
        if (best_group == groups.size()) break;
        selected.push_back(groups[best_group].indices[used[best_group]]);
        ++used[best_group];
    }
    return selected;
}

std::vector<AlphaMuWorld> gather_worlds(
    const std::vector<AlphaMuWorld>& reservoir,
    const std::vector<std::size_t>& indices) {
    std::vector<AlphaMuWorld> worlds;
    worlds.reserve(indices.size());
    for (const std::size_t index : indices) worlds.push_back(reservoir[index]);
    return worlds;
}

PolicyCheck evaluate_fixed_policy(
    Position position,
    const std::shared_ptr<const AlphaMuPolicyNode>& policy,
    const AlphaMuConfig& config,
    std::uint8_t starting_completed_tricks,
    AlphaMu2Stats& stats) {
    if (partnership_score(position, config.declarer) >= config.target_tricks) {
        return PolicyCheck {.makes_target = true};
    }
    if (is_deal_finished(position)) return {};

    // The retained policy intentionally ends with the current trick. DDS then
    // supplies the same leaf evaluation used by alpha-mu.
    if (!policy || position.completed_tricks != starting_completed_tricks) {
        ++stats.policy_dds_leaves;
        const std::uint8_t total = static_cast<std::uint8_t>(
            partnership_score(position, config.declarer) +
            double_dummy_future_tricks(position, config.declarer));
        return PolicyCheck {.makes_target = total >= config.target_tricks};
    }

    const Seat player = next_to_play(position.current_trick);
    if (policy->player != player) {
        return PolicyCheck {.unsupported_observation = true};
    }
    const Hand hand = hand_of(position.deal, player);
    if (same_side(player, config.declarer)) {
        if (policy->declarer_move == kNoCard ||
            !is_legal_play(
                position.current_trick,
                hand,
                policy->declarer_move)) {
            return PolicyCheck {.unsupported_observation = true};
        }
        play_card(position, policy->declarer_move);
        return evaluate_fixed_policy(
            position,
            policy->continuation,
            config,
            starting_completed_tricks,
            stats);
    }

    for (const Card card : cards_in_bridge_order(
             legal_plays(position.current_trick, hand))) {
        const auto branch = std::find_if(
            policy->defender_branches.begin(),
            policy->defender_branches.end(),
            [&](const AlphaMuPolicyBranch& candidate) {
                return candidate.card == card;
            });
        if (branch == policy->defender_branches.end()) {
            return PolicyCheck {.unsupported_observation = true};
        }
        Position child = position;
        play_card(child, card);
        const PolicyCheck check = evaluate_fixed_policy(
            child,
            branch->continuation,
            config,
            starting_completed_tricks,
            stats);
        if (!check.makes_target) return check;
    }
    return PolicyCheck {.makes_target = true};
}

std::size_t distance_from_active(
    std::size_t candidate,
    const std::vector<std::size_t>& active,
    const std::vector<AlphaMu2ScreeningVector>& screening,
    const std::vector<Card>& moves) {
    std::size_t distance = std::numeric_limits<std::size_t>::max();
    for (const std::size_t selected : active) {
        distance = std::min(
            distance,
            fingerprint_distance(
                screening[candidate],
                screening[selected],
                moves));
    }
    return distance;
}

std::vector<CounterexampleCandidate> find_counterexamples(
    const std::vector<AlphaMuWorld>& reservoir,
    const std::vector<std::size_t>& active,
    const AlphaMu2Result& result,
    const AlphaMuConfig& search_config,
    AlphaMu2Stats& stats) {
    std::set<std::size_t> active_set(active.begin(), active.end());
    const std::size_t chosen_index = screening_index_for_move(
        result.screening_moves,
        reservoir.front().position,
        result.search.best_move,
        search_config.optimizations.max_equivalent_cards);
    const WorldMask known_policy_wins = result.search.trick_policy
        ? result.search.trick_policy->outcome.wins
        : 0;

    std::vector<CounterexampleCandidate> candidates;
    const auto validation_start = std::chrono::steady_clock::now();
    for (std::size_t index = 0; index < reservoir.size(); ++index) {
        if (active_set.contains(index) ||
            result.screening[index].making_moves == kEmptyHand) {
            continue;
        }

        // A failure is only informative if this root fingerprint is absent or
        // the retained policy succeeds in every active representative of it.
        bool known_failure = false;
        for (std::size_t active_position = 0;
             active_position < active.size();
             ++active_position) {
            if (result.screening[active[active_position]].future_tricks ==
                    result.screening[index].future_tricks &&
                (known_policy_wins &
                 (WorldMask {1} << active_position)) == 0) {
                known_failure = true;
                break;
            }
        }
        if (known_failure) continue;

        ++stats.reserve_worlds_checked;
        const PolicyCheck check = evaluate_fixed_policy(
            reservoir[index].position,
            result.search.trick_policy,
            search_config,
            reservoir[index].position.completed_tricks,
            stats);
        if (check.makes_target) continue;

        const auto& scores = result.screening[index].future_tricks;
        const std::uint8_t best_score =
            *std::max_element(scores.begin(), scores.end());
        const std::uint8_t chosen_score = chosen_index < scores.size()
            ? scores[chosen_index]
            : 0;
        candidates.push_back(CounterexampleCandidate {
            .index = index,
            .unsupported_observation = check.unsupported_observation,
            .root_regret = static_cast<std::uint8_t>(
                best_score > chosen_score ? best_score - chosen_score : 0),
            .distance_from_active = distance_from_active(
                index,
                active,
                result.screening,
                result.screening_moves),
        });
    }
    stats.validation_ms += std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - validation_start).count();
    std::sort(
        candidates.begin(),
        candidates.end(),
        [](const CounterexampleCandidate& left,
           const CounterexampleCandidate& right) {
            if (left.unsupported_observation != right.unsupported_observation) {
                return left.unsupported_observation;
            }
            if (left.root_regret != right.root_regret) {
                return left.root_regret > right.root_regret;
            }
            if (left.distance_from_active != right.distance_from_active) {
                return left.distance_from_active > right.distance_from_active;
            }
            return left.index < right.index;
        });
    return candidates;
}

bool add_counterexample(
    std::vector<std::size_t>& active,
    std::size_t candidate,
    std::size_t maximum,
    const std::vector<AlphaMu2ScreeningVector>& screening,
    std::optional<std::size_t>& replaced) {
    if (std::find(active.begin(), active.end(), candidate) != active.end()) {
        return false;
    }
    if (active.size() < maximum) {
        active.push_back(candidate);
        return true;
    }

    std::map<std::vector<std::uint8_t>, std::size_t> counts;
    for (const std::size_t index : active) {
        ++counts[screening[index].future_tricks];
    }
    std::size_t replacement = active.size();
    std::size_t largest_count = 1;
    const auto& candidate_fingerprint = screening[candidate].future_tricks;

    // Replacing within the candidate's own duplicated bucket preserves the
    // bucket's frequency while introducing the newly observed policy behavior.
    if (counts[candidate_fingerprint] > 1) {
        replacement = static_cast<std::size_t>(std::find_if(
            active.begin(),
            active.end(),
            [&](std::size_t index) {
                return screening[index].future_tricks == candidate_fingerprint;
            }) - active.begin());
    }
    for (std::size_t position = 0; position < active.size(); ++position) {
        if (replacement != active.size()) break;
        const std::size_t count =
            counts[screening[active[position]].future_tricks];
        if (count > largest_count) {
            largest_count = count;
            replacement = position;
        }
    }
    if (replacement == active.size()) return false;
    replaced = active[replacement];
    active[replacement] = candidate;
    return true;
}

}  // namespace

AlphaMu2Result alpha_mu2_search(
    const std::vector<AlphaMuWorld>& reservoir,
    const AlphaMu2Config& config) {
    if (reservoir.empty()) {
        throw std::invalid_argument("AlphaMu2 requires at least one reservoir world");
    }
    if (config.max_world_count == 0 ||
        config.max_world_count > 64 ||
        config.initial_world_count == 0 ||
        config.initial_world_count > config.max_world_count) {
        throw std::invalid_argument(
            "AlphaMu2 world counts must satisfy 1 <= initial <= maximum <= 64");
    }
    if (config.search.target_tricks == 0 ||
        config.search.max_declarer_plies == 0) {
        throw std::invalid_argument(
            "AlphaMu2 requires a target and at least one declarer ply");
    }

    const Position& root = reservoir.front().position;
    const Seat player = next_to_play(root.current_trick);
    if (!same_side(player, config.search.declarer)) {
        throw std::invalid_argument(
            "AlphaMu2 root must be a declarer-side decision");
    }
    const Hand legal = legal_plays(
        root.current_trick,
        hand_of(root.deal, player));

    const auto total_start = std::chrono::steady_clock::now();
    AlphaMu2Result result;
    result.stats.reservoir_worlds = reservoir.size();
    result.reservoir = reservoir;
    std::size_t equivalent_screening_moves_skipped = 0;
    const Hand screening_legal = representative_move_mask(
        root,
        legal,
        config.search.optimizations.max_equivalent_cards,
        &equivalent_screening_moves_skipped);
    result.stats.equivalent_screening_moves_skipped =
        equivalent_screening_moves_skipped;
    result.screening_moves = cards_in_bridge_order(screening_legal);

    auto finish_without_screening = [&](AlphaMuResult search, bool keep_active_worlds) {
        result.search = std::move(search);
        if (keep_active_worlds) {
            result.active_reservoir_indices =
                first_reservoir_indices(reservoir, config.max_world_count);
            result.worlds = gather_worlds(reservoir, result.active_reservoir_indices);
            result.stats.initial_worlds = result.worlds.size();
            result.stats.final_worlds = result.worlds.size();
        }
        result.stats.total_ms = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - total_start).count();
        return result;
    };

    const std::uint8_t won = partnership_score(root, config.search.declarer);
    const std::uint8_t remaining = remaining_tricks(root);
    const bool target_reached = won >= config.search.target_tricks;
    const bool target_impossible =
        static_cast<std::uint16_t>(won) + remaining < config.search.target_tricks;
    if (config.search.optimizations.target_bounds &&
        (target_reached || target_impossible)) {
        AlphaMuResult search;
        const Card move = result.screening_moves.empty()
            ? kNoCard
            : result.screening_moves.front();
        const WorldMask wins = target_reached
            ? first_worlds_mask(std::min({reservoir.size(), config.max_world_count, std::size_t {64}}))
            : 0;
        search.best_move = move;
        search.front = ParetoFront {.vectors = {OutcomeVector {.wins = wins}}};
        search.root_moves.push_back(AlphaMuRootMove {
            .move = move,
            .winning_worlds = winning_world_count(search.front.vectors.front()),
            .pareto_vectors = search.front.vectors.size(),
            .front = search.front,
        });
        search.stats.target_reached_cuts = target_reached ? 1 : 0;
        search.stats.target_impossible_cuts = target_impossible ? 1 : 0;
        search.stats.completed_iterations = 1;
        return finish_without_screening(std::move(search), true);
    }

    if (config.search.optimizations.forced_moves &&
        is_single_card(screening_legal)) {
        AlphaMuResult search;
        search.best_move = screening_legal;
        search.root_moves.push_back(AlphaMuRootMove {.move = screening_legal});
        search.stats.forced_root_recommendations = 1;
        search.stats.equivalent_moves_skipped = equivalent_screening_moves_skipped;
        search.stats.max_equivalent_moves_skipped = equivalent_screening_moves_skipped;
        search.stats.completed_iterations = 1;
        return finish_without_screening(std::move(search), false);
    }

    if (config.search.optimizations.quick_trick_bounds &&
        won < config.search.target_tricks) {
        const std::uint8_t needed = static_cast<std::uint8_t>(
            config.search.target_tricks - won);
        const QuickTrickProof proof = prove_declarer_quick_tricks(
            root,
            config.search.declarer,
            needed);
        if (proof.proven) {
            AlphaMuResult search;
            const std::vector<std::size_t> active_indices =
                first_reservoir_indices(reservoir, config.max_world_count);
            const WorldMask wins = first_worlds_mask(active_indices.size());
            search.best_move = proof.first_card;
            search.front = ParetoFront {.vectors = {OutcomeVector {.wins = wins}}};
            search.root_moves.push_back(AlphaMuRootMove {
                .move = proof.first_card,
                .winning_worlds = winning_world_count(search.front.vectors.front()),
                .pareto_vectors = search.front.vectors.size(),
                .front = search.front,
            });
            search.stats.quick_trick_probes = 1;
            search.stats.quick_trick_states = proof.states_examined;
            search.stats.quick_trick_cuts = 1;
            search.stats.quick_trick_root_cuts = 1;
            search.stats.completed_iterations = 1;
            result.active_reservoir_indices = active_indices;
            result.worlds = gather_worlds(reservoir, result.active_reservoir_indices);
            result.stats.initial_worlds = result.worlds.size();
            result.stats.final_worlds = result.worlds.size();
            return finish_without_screening(std::move(search), false);
        }
    }

    AlphaMuSearchStats prescreen_claim_stats;
    if (config.search.optimizations.claim_bounds &&
        won < config.search.target_tricks) {
        const std::uint8_t needed = static_cast<std::uint8_t>(
            config.search.target_tricks - won);
        const auto claim_start = std::chrono::steady_clock::now();
        const ClaimProof proof = prove_declarer_claim(
            root,
            config.search.declarer,
            needed);
        const double claim_ms = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - claim_start).count();
        prescreen_claim_stats.claim_probes = 1;
        prescreen_claim_stats.claim_states = proof.states_examined;
        prescreen_claim_stats.claim_cache_hits = proof.cache_hits;
        prescreen_claim_stats.claim_equivalent_cards_skipped =
            proof.equivalent_cards_skipped;
        prescreen_claim_stats.claim_ms = claim_ms;
        prescreen_claim_stats.claim_budget_aborts = proof.budget_exhausted ? 1 : 0;
        if (proof.proven) {
            AlphaMuResult search;
            const std::vector<std::size_t> active_indices =
                first_reservoir_indices(reservoir, config.max_world_count);
            const WorldMask wins = first_worlds_mask(active_indices.size());
            search.best_move = proof.first_card;
            search.front = ParetoFront {.vectors = {OutcomeVector {.wins = wins}}};
            search.root_moves.push_back(AlphaMuRootMove {
                .move = proof.first_card,
                .winning_worlds = winning_world_count(search.front.vectors.front()),
                .pareto_vectors = search.front.vectors.size(),
                .front = search.front,
            });
            search.stats = prescreen_claim_stats;
            search.stats.claim_cuts = 1;
            search.stats.claim_root_cuts = 1;
            search.stats.completed_iterations = 1;
            result.active_reservoir_indices = active_indices;
            result.worlds = gather_worlds(reservoir, result.active_reservoir_indices);
            result.stats.initial_worlds = result.worlds.size();
            result.stats.final_worlds = result.worlds.size();
            return finish_without_screening(std::move(search), false);
        }
    }

    std::vector<Position> positions;
    positions.reserve(reservoir.size());
    for (const AlphaMuWorld& world : reservoir) {
        if (next_to_play(world.position.current_trick) != player ||
            legal_plays(
                world.position.current_trick,
                hand_of(world.position.deal, player)) != legal) {
            throw std::invalid_argument(
                "AlphaMu2 reservoir worlds must share the public root");
        }
        positions.push_back(world.position);
    }

    const auto screening_start = std::chrono::steady_clock::now();
    const auto dds_scores = double_dummy_move_scores_batch(
        positions,
        config.search.declarer);
    result.screening.resize(reservoir.size());
    for (std::size_t world = 0; world < reservoir.size(); ++world) {
        AlphaMu2ScreeningVector& screening = result.screening[world];
        screening.future_tricks.reserve(result.screening_moves.size());
        for (const Card move : result.screening_moves) {
            const auto score = std::find_if(
                dds_scores[world].begin(),
                dds_scores[world].end(),
                [&](const DoubleDummyMoveScore& candidate) {
                    return candidate.card == move;
                });
            if (score == dds_scores[world].end()) {
                throw std::logic_error(
                    "DDS did not return a score for every legal root card");
            }
            screening.future_tricks.push_back(score->future_tricks);
            if (partnership_score(
                    reservoir[world].position,
                    config.search.declarer) +
                    score->future_tricks >= config.search.target_tricks) {
                screening.making_moves =
                    add_card(screening.making_moves, move);
            }
        }
    }
    std::vector<FingerprintGroup> groups =
        fingerprint_groups(result.screening);
    result.stats.distinct_screening_vectors = groups.size();
    result.stats.screening_ms = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - screening_start).count();

    const auto selection_start = std::chrono::steady_clock::now();
    const std::size_t initial_count = std::min({
        config.initial_world_count,
        config.max_world_count,
        reservoir.size(),
    });
    std::vector<std::size_t> active = select_initial_worlds(
        groups,
        result.screening,
        result.screening_moves,
        initial_count);
    result.stats.initial_worlds = active.size();
    result.stats.selection_ms = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - selection_start).count();

    AlphaMuConfig search_config = config.search;
    search_config.build_trick_policy = true;
    const auto elapsed_seconds = [&]() {
        return std::chrono::duration<double>(
            std::chrono::steady_clock::now() - total_start).count();
    };
    const auto run_search = [&]() {
        AlphaMuConfig run_config = search_config;
        if (config.search.max_search_seconds > 0.0) {
            const double remaining =
                config.search.max_search_seconds - elapsed_seconds();
            if (remaining <= 0.0) {
                result.stats.stopped_by_time_limit = true;
                return false;
            }
            run_config.max_search_seconds = remaining;
            run_config.hard_time_limit = true;
        }
        const auto search_start = std::chrono::steady_clock::now();
        result.search = alpha_mu_search(
            gather_worlds(reservoir, active),
            run_config);
        const double search_ms = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - search_start).count();
        result.search.stats.claim_probes += prescreen_claim_stats.claim_probes;
        result.search.stats.claim_states += prescreen_claim_stats.claim_states;
        result.search.stats.claim_cache_hits += prescreen_claim_stats.claim_cache_hits;
        result.search.stats.claim_equivalent_cards_skipped +=
            prescreen_claim_stats.claim_equivalent_cards_skipped;
        result.search.stats.claim_budget_aborts +=
            prescreen_claim_stats.claim_budget_aborts;
        result.search.stats.claim_ms += prescreen_claim_stats.claim_ms;
        result.stats.search_ms += search_ms;
        ++result.stats.search_runs;
        result.rounds.push_back(AlphaMu2RoundTrace {
            .round = result.rounds.size(),
            .active_reservoir_indices = active,
            .search = result.search,
            .search_ms = search_ms,
        });
        if (config.search.max_search_seconds > 0.0 &&
            elapsed_seconds() >= config.search.max_search_seconds) {
            result.stats.stopped_by_time_limit = true;
        }
        return true;
    };
    if (!run_search()) {
        throw std::runtime_error(
            "AlphaMu2 time budget expired before its initial search");
    }

    for (std::size_t round = 0;
         round < config.max_refinement_rounds;
         ++round) {
        if (!result.search.trick_policy) break;
        if (result.stats.stopped_by_time_limit) break;
        const std::vector<CounterexampleCandidate> candidates =
            find_counterexamples(
                reservoir,
                active,
                result,
                search_config,
                result.stats);
        result.stats.counterexamples_found += candidates.size();
        AlphaMu2RoundTrace& round_trace = result.rounds.back();
        round_trace.candidates.reserve(candidates.size());
        for (const CounterexampleCandidate& candidate : candidates) {
            round_trace.candidates.push_back(AlphaMu2CounterexampleTrace {
                .reservoir_index = candidate.index,
                .unsupported_observation =
                    candidate.unsupported_observation,
                .root_regret = candidate.root_regret,
                .distance_from_active = candidate.distance_from_active,
            });
        }

        std::size_t added = 0;
        const std::vector<std::size_t> previous_active = active;
        const std::size_t previous_counterexample_count =
            result.counterexample_indices.size();
        for (std::size_t candidate_index = 0;
             candidate_index < candidates.size();
             ++candidate_index) {
            if (added >= config.counterexamples_per_round) break;
            const CounterexampleCandidate& candidate =
                candidates[candidate_index];
            std::optional<std::size_t> replaced;
            if (!add_counterexample(
                    active,
                    candidate.index,
                    std::min(config.max_world_count, reservoir.size()),
                    result.screening,
                    replaced)) {
                continue;
            }
            round_trace.candidates[candidate_index].selected = true;
            round_trace.candidates[candidate_index].replaced_reservoir_index =
                replaced;
            result.counterexample_indices.push_back(candidate.index);
            ++added;
        }
        if (added == 0) break;
        if (!run_search()) {
            active = previous_active;
            result.counterexample_indices.resize(
                previous_counterexample_count);
            for (AlphaMu2CounterexampleTrace& candidate :
                 round_trace.candidates) {
                candidate.selected = false;
                candidate.replaced_reservoir_index.reset();
            }
            break;
        }
        result.stats.counterexamples_added += added;
        ++result.stats.refinement_rounds;
    }

    result.active_reservoir_indices = active;
    result.worlds = gather_worlds(reservoir, active);
    result.stats.final_worlds = active.size();
    result.stats.total_ms = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - total_start).count();
    return result;
}

}  // namespace bridge
