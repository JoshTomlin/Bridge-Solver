#include "bridge/alpha_mu.h"

#include "bridge/dds_solver.h"

#include <algorithm>
#include <bit>
#include <sstream>
#include <stdexcept>
#include <utility>

namespace bridge {

bool outcome_dominates(const OutcomeVector& a, const OutcomeVector& b) {
    return a.wins != b.wins && (a.wins | b.wins) == a.wins;
}

std::size_t winning_world_count(const OutcomeVector& outcome) {
    return static_cast<std::size_t>(std::popcount(outcome.wins));
}

std::size_t best_winning_world_count(const ParetoFront& front) {
    std::size_t best = 0;
    for (const OutcomeVector& outcome : front.vectors) {
        best = std::max(best, winning_world_count(outcome));
    }
    return best;
}

bool add_to_pareto_front(ParetoFront& front, OutcomeVector candidate) {
    for (const OutcomeVector& existing : front.vectors) {
        if (existing.wins == candidate.wins || outcome_dominates(existing, candidate)) {
            return false;
        }
    }

    std::erase_if(front.vectors, [&](const OutcomeVector& existing) {
        return outcome_dominates(candidate, existing);
    });
    front.vectors.push_back(candidate);
    return true;
}

ParetoFront combine_max_fronts(const std::vector<ParetoFront>& child_fronts) {
    ParetoFront result;
    for (const ParetoFront& child : child_fronts) {
        for (const OutcomeVector& vector : child.vectors) {
            add_to_pareto_front(result, vector);
        }
    }

    if (result.vectors.empty()) {
        result.vectors.push_back(OutcomeVector {});
    }
    return result;
}

ParetoFront combine_min_fronts(const ParetoFront& left, const ParetoFront& right) {
    ParetoFront result;
    for (const OutcomeVector& lhs : left.vectors) {
        for (const OutcomeVector& rhs : right.vectors) {
            add_to_pareto_front(result, OutcomeVector {.wins = lhs.wins & rhs.wins});
        }
    }

    if (result.vectors.empty()) {
        result.vectors.push_back(OutcomeVector {});
    }
    return result;
}

namespace {

ParetoFront zero_front() {
    return ParetoFront {.vectors = {OutcomeVector {}}};
}

WorldMask all_worlds_mask(std::size_t world_count) {
    return world_count == 64
        ? ~WorldMask {0}
        : (WorldMask {1} << world_count) - 1;
}

std::size_t first_world(WorldMask active_worlds) {
    return static_cast<std::size_t>(std::countr_zero(active_worlds));
}

std::vector<Card> ordered_cards(Hand cards) {
    std::vector<Card> result;
    for (const Suit suit : {Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        for (int rank = static_cast<int>(Rank::Ace);
             rank >= static_cast<int>(Rank::Two);
             --rank) {
            const Card card = make_card(suit, static_cast<Rank>(rank));
            if (contains(cards, card)) {
                result.push_back(card);
            }
        }
    }
    return result;
}

std::string format_world_mask(WorldMask mask, std::size_t world_count) {
    std::string result;
    result.reserve(world_count + 2);
    result.push_back('[');
    for (std::size_t world = 0; world < world_count; ++world) {
        result.push_back((mask & (WorldMask {1} << world)) != 0 ? '1' : '0');
    }
    result.push_back(']');
    return result;
}

std::string format_front(const ParetoFront& front, std::size_t world_count) {
    std::ostringstream output;
    for (std::size_t index = 0; index < front.vectors.size(); ++index) {
        if (index > 0) {
            output << ' ';
        }
        output << format_world_mask(front.vectors[index].wins, world_count);
    }
    return output.str();
}

void trace_line(std::ostringstream* trace, std::size_t depth, const std::string& text) {
    if (trace != nullptr) {
        *trace << std::string(depth * 2, ' ') << text << '\n';
    }
}

Seat player_to_act(const Position& position) {
    return next_to_play(position.current_trick);
}

std::uint8_t tricks_won_by_declarer(const Position& position, Seat declarer) {
    return same_side(declarer, Seat::North)
        ? position.score.north_south
        : position.score.east_west;
}

void validate_worlds(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config) {
    if (worlds.empty() || worlds.size() > 64) {
        throw std::invalid_argument("alpha-mu requires between 1 and 64 worlds");
    }

    const Position& public_position = worlds.front().position;
    const Seat turn = player_to_act(public_position);
    for (const AlphaMuWorld& world : worlds) {
        const Position& position = world.position;
        if (player_to_act(position) != turn ||
            position.current_trick.leader != public_position.current_trick.leader ||
            position.current_trick.card_count != public_position.current_trick.card_count ||
            position.current_trick.cards != public_position.current_trick.cards ||
            position.current_trick.trump_suit != config.trump_suit ||
            position.score.north_south != public_position.score.north_south ||
            position.score.east_west != public_position.score.east_west ||
            position.completed_tricks != public_position.completed_tricks ||
            position.played_cards != public_position.played_cards) {
            throw std::invalid_argument("alpha-mu worlds must share one public position");
        }

        for (const Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West}) {
            if (same_side(seat, config.declarer) &&
                hand_of(position.deal, seat) != hand_of(public_position.deal, seat)) {
                throw std::invalid_argument(
                    "alpha-mu worlds must share declarer and dummy cards");
            }
        }
    }
}

ParetoFront evaluate_leaf(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    const AlphaMuConfig& config) {
    OutcomeVector outcome;
    for (std::size_t world = 0; world < worlds.size(); ++world) {
        const WorldMask world_bit = WorldMask {1} << world;
        if ((active_worlds & world_bit) == 0) {
            continue;
        }

        const Position& position = worlds[world].position;
        const std::uint8_t total_tricks =
            tricks_won_by_declarer(position, config.declarer) +
            double_dummy_future_tricks(position, config.declarer);
        if (total_tricks >= config.target_tricks) {
            outcome.wins |= world_bit;
        }
    }
    return ParetoFront {.vectors = {outcome}};
}

Hand shared_declarer_moves(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds) {
    Hand shared = kFullDeck;
    for (std::size_t world = 0; world < worlds.size(); ++world) {
        const WorldMask world_bit = WorldMask {1} << world;
        if ((active_worlds & world_bit) == 0) {
            continue;
        }

        const Position& position = worlds[world].position;
        const Seat player = player_to_act(position);
        shared &= legal_plays(position.current_trick, hand_of(position.deal, player));
    }
    return shared;
}

Hand union_of_defender_moves(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds) {
    Hand result = kEmptyHand;
    for (std::size_t world = 0; world < worlds.size(); ++world) {
        const WorldMask world_bit = WorldMask {1} << world;
        if ((active_worlds & world_bit) == 0) {
            continue;
        }

        const Position& position = worlds[world].position;
        const Seat player = player_to_act(position);
        result |= legal_plays(position.current_trick, hand_of(position.deal, player));
    }
    return result;
}

ParetoFront alpha_mu_node(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    const AlphaMuConfig& config,
    std::uint8_t max_moves_left,
    std::ostringstream* trace,
    std::size_t trace_depth);

ParetoFront evaluate_max_node(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    const AlphaMuConfig& config,
    std::uint8_t max_moves_left,
    std::ostringstream* trace,
    std::size_t trace_depth) {
    const Hand legal_moves = shared_declarer_moves(worlds, active_worlds);
    if (legal_moves == kEmptyHand) {
        return evaluate_leaf(worlds, active_worlds, config);
    }

    std::vector<ParetoFront> child_fronts;
    for (const Card move : ordered_cards(legal_moves)) {
        trace_line(trace, trace_depth + 1, "move " + to_string(move));
        auto child_worlds = worlds;
        for (std::size_t world = 0; world < child_worlds.size(); ++world) {
            if ((active_worlds & (WorldMask {1} << world)) != 0) {
                play_card(child_worlds[world].position, move);
            }
        }

        child_fronts.push_back(alpha_mu_node(
            child_worlds,
            active_worlds,
            config,
            static_cast<std::uint8_t>(max_moves_left - 1),
            trace,
            trace_depth + 2));
        trace_line(
            trace,
            trace_depth + 1,
            "front " + format_front(child_fronts.back(), worlds.size()));
    }

    ParetoFront result = combine_max_fronts(child_fronts);
    trace_line(trace, trace_depth, "MAX result " + format_front(result, worlds.size()));
    return result;
}

ParetoFront evaluate_min_node(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    const AlphaMuConfig& config,
    std::uint8_t max_moves_left,
    std::ostringstream* trace,
    std::size_t trace_depth) {
    const Hand possible_moves = union_of_defender_moves(worlds, active_worlds);
    if (possible_moves == kEmptyHand) {
        return evaluate_leaf(worlds, active_worlds, config);
    }

    // All worlds start as neutral wins. A defender move constrains only worlds
    // where that card is legal; impossible worlds remain 1 for the intersection.
    ParetoFront result {.vectors = {OutcomeVector {.wins = active_worlds}}};
    for (const Card move : ordered_cards(possible_moves)) {
        auto child_worlds = worlds;
        WorldMask legal_worlds = 0;
        for (std::size_t world = 0; world < child_worlds.size(); ++world) {
            const WorldMask world_bit = WorldMask {1} << world;
            if ((active_worlds & world_bit) == 0) {
                continue;
            }

            Position& position = child_worlds[world].position;
            const Seat player = player_to_act(position);
            if (is_legal_play(position.current_trick, hand_of(position.deal, player), move)) {
                play_card(position, move);
                legal_worlds |= world_bit;
            }
        }

        if (legal_worlds == 0) {
            continue;
        }

        trace_line(
            trace,
            trace_depth + 1,
            "move " + to_string(move) +
                " legal=" + format_world_mask(legal_worlds, worlds.size()));
        ParetoFront child = alpha_mu_node(
            child_worlds,
            legal_worlds,
            config,
            max_moves_left,
            trace,
            trace_depth + 2);

        const WorldMask impossible_worlds = active_worlds & ~legal_worlds;
        for (OutcomeVector& vector : child.vectors) {
            vector.wins |= impossible_worlds;
        }
        result = combine_min_fronts(result, child);
        trace_line(
            trace,
            trace_depth + 1,
            "combined " + format_front(result, worlds.size()));
    }

    trace_line(trace, trace_depth, "MIN result " + format_front(result, worlds.size()));
    return result;
}

ParetoFront alpha_mu_node(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    const AlphaMuConfig& config,
    std::uint8_t max_moves_left,
    std::ostringstream* trace,
    std::size_t trace_depth) {
    if (active_worlds == 0) {
        return zero_front();
    }

    const Position& position = worlds[first_world(active_worlds)].position;
    if (is_deal_finished(position) || max_moves_left == 0) {
        ParetoFront leaf = evaluate_leaf(worlds, active_worlds, config);
        trace_line(
            trace,
            trace_depth,
            "leaf active=" + format_world_mask(active_worlds, worlds.size()) +
                " -> " + format_front(leaf, worlds.size()));
        return leaf;
    }

    const Seat turn = player_to_act(position);
    for (std::size_t world = 0; world < worlds.size(); ++world) {
        if ((active_worlds & (WorldMask {1} << world)) != 0 &&
            player_to_act(worlds[world].position) != turn) {
            throw std::invalid_argument("active alpha-mu worlds disagree on player to act");
        }
    }

    const bool is_max = same_side(turn, config.declarer);
    trace_line(
        trace,
        trace_depth,
        std::string(is_max ? "MAX " : "MIN ") + to_string(turn) +
            " active=" + format_world_mask(active_worlds, worlds.size()) +
            " max-moves-left=" + std::to_string(max_moves_left));

    return is_max
        ? evaluate_max_node(
              worlds, active_worlds, config, max_moves_left, trace, trace_depth)
        : evaluate_min_node(
              worlds, active_worlds, config, max_moves_left, trace, trace_depth);
}

}  // namespace

AlphaMuResult alpha_mu_search(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config) {
    validate_worlds(worlds, config);

    const WorldMask active_worlds = all_worlds_mask(worlds.size());
    const Position& root = worlds.front().position;
    if (config.max_declarer_plies == 0 || is_deal_finished(root)) {
        return AlphaMuResult {
            .best_move = kNoCard,
            .front = evaluate_leaf(worlds, active_worlds, config),
        };
    }

    const Seat turn = player_to_act(root);
    if (!same_side(turn, config.declarer)) {
        return AlphaMuResult {
            .best_move = kNoCard,
            .front = alpha_mu_node(
                worlds, active_worlds, config, config.max_declarer_plies, nullptr, 0),
        };
    }

    const Hand legal_moves = shared_declarer_moves(worlds, active_worlds);
    if (legal_moves == kEmptyHand) {
        return AlphaMuResult {
            .best_move = kNoCard,
            .front = evaluate_leaf(worlds, active_worlds, config),
        };
    }

    Card best_move = kNoCard;
    std::size_t best_score = 0;
    std::vector<ParetoFront> move_fronts;
    for (const Card move : ordered_cards(legal_moves)) {
        auto child_worlds = worlds;
        for (AlphaMuWorld& world : child_worlds) {
            play_card(world.position, move);
        }

        ParetoFront front = alpha_mu_node(
            child_worlds,
            active_worlds,
            config,
            static_cast<std::uint8_t>(config.max_declarer_plies - 1),
            nullptr,
            0);
        const std::size_t score = best_winning_world_count(front);
        if (best_move == kNoCard || score > best_score) {
            best_move = move;
            best_score = score;
        }
        move_fronts.push_back(std::move(front));
    }

    return AlphaMuResult {
        .best_move = best_move,
        .front = combine_max_fronts(move_fronts),
    };
}

std::string format_alpha_mu_front(const ParetoFront& front, std::size_t world_count) {
    if (world_count > 64) {
        throw std::invalid_argument("alpha-mu fronts support at most 64 worlds");
    }
    return format_front(front, world_count);
}

std::string alpha_mu_debug_tree(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config) {
    validate_worlds(worlds, config);

    std::ostringstream trace;
    const ParetoFront front = alpha_mu_node(
        worlds,
        all_worlds_mask(worlds.size()),
        config,
        config.max_declarer_plies,
        &trace,
        0);
    trace << "root " << format_front(front, worlds.size()) << '\n';
    return trace.str();
}

}  // namespace bridge
