#include "alpha_mu_internal.h"

#include "bridge/dds_solver.h"
#include "bridge/quick_tricks.h"

#include <algorithm>
#include <bit>
#include <chrono>
#include <optional>
#include <stdexcept>
#include <unordered_set>
#include <utility>

namespace bridge::alpha_mu_detail {
namespace {

struct SearchDeadlineReached {};

void check_hard_deadline(SearchContext& context) {
    if (!context.config.hard_time_limit ||
        !context.deadline.has_value() ||
        (context.stats.nodes & 0xFFU) != 0) {
        return;
    }
    if (std::chrono::steady_clock::now() >= *context.deadline) {
        throw SearchDeadlineReached {};
    }
}

ParetoFront evaluate_leaf(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask useful_worlds,
    SearchContext& context) {
    ++context.stats.leaves;
    OutcomeVector outcome;
    std::vector<Position> pending_positions;
    std::vector<std::size_t> pending_worlds;
    pending_positions.reserve(std::popcount(useful_worlds));
    pending_worlds.reserve(std::popcount(useful_worlds));
    for (std::size_t world = 0; world < worlds.size(); ++world) {
        const WorldMask world_bit = WorldMask {1} << world;
        if ((useful_worlds & world_bit) == 0) continue;

        const Position& position = worlds[world].position;
        if (is_deal_finished(position)) {
            if (tricks_won_by_declarer(position, context.config.declarer) >=
                context.config.target_tricks) {
                outcome.wins |= world_bit;
            }
        } else {
            pending_positions.push_back(position);
            pending_worlds.push_back(world);
        }
    }

    context.stats.dds_worlds += pending_positions.size();
    if (context.config.optimizations.leaf_dds_batch &&
        pending_positions.size() > 1) {
        ++context.stats.leaf_dds_batches;
        context.stats.leaf_dds_worlds += pending_positions.size();
        const std::vector<std::uint8_t> future =
            double_dummy_future_tricks_batch(
                pending_positions, context.config.declarer);
        for (std::size_t index = 0; index < pending_positions.size(); ++index) {
            const std::uint8_t total = static_cast<std::uint8_t>(
                tricks_won_by_declarer(
                    pending_positions[index], context.config.declarer) +
                future[index]);
            if (total >= context.config.target_tricks) {
                outcome.wins |= WorldMask {1} << pending_worlds[index];
            }
        }
    } else {
        for (std::size_t index = 0; index < pending_positions.size(); ++index) {
            const Position& position = pending_positions[index];
            const std::uint8_t total = static_cast<std::uint8_t>(
                tricks_won_by_declarer(position, context.config.declarer) +
                double_dummy_future_tricks(position, context.config.declarer));
            if (total >= context.config.target_tricks) {
                outcome.wins |= WorldMask {1} << pending_worlds[index];
            }
        }
    }
    return ParetoFront {.vectors = {outcome}};
}

std::optional<ParetoFront> evaluate_world_cut(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask useful_worlds,
    SearchContext& context,
    std::size_t search_depth) {
    if (!context.config.optimizations.world_cuts) return std::nullopt;

    const std::size_t count = std::popcount(useful_worlds);
    if (count > 1) return std::nullopt;

    ++context.stats.world_cuts;
    if (count == 0) {
        ++context.stats.zero_world_cuts;
        audit_line(context, search_depth, "world-cut", "no useful worlds remain");
        return zero_front();
    }

    ++context.stats.one_world_cuts;
    audit_line(
        context,
        search_depth,
        "world-cut",
        "one useful world remains; solved it directly with DDS");
    return evaluate_leaf(worlds, useful_worlds, context);
}

// These are exact score bounds. Cards already in the partial trick still
// belong to the same remaining trick, so this also works for shortened deals.
std::optional<ParetoFront> evaluate_target_bound(
    const Position& position,
    WorldMask useful_worlds,
    SearchContext& context,
    std::size_t search_depth) {
    if (!context.config.optimizations.target_bounds) return std::nullopt;

    std::uint16_t cards_until_finished = position.current_trick.card_count;
    for (const Hand hand : position.deal.hands) {
        cards_until_finished = static_cast<std::uint16_t>(
            cards_until_finished + card_count(hand));
    }
    if (cards_until_finished % 4 != 0) return std::nullopt;

    const std::uint8_t won =
        tricks_won_by_declarer(position, context.config.declarer);
    const std::uint8_t remaining = static_cast<std::uint8_t>(
        cards_until_finished / 4);
    if (won >= context.config.target_tricks) {
        ++context.stats.target_reached_cuts;
        audit_line(
            context,
            search_depth,
            "target-bound",
            "target already reached; every continuation succeeds");
        return ParetoFront {
            .vectors = {OutcomeVector {.wins = useful_worlds}},
        };
    }
    if (static_cast<std::uint16_t>(won) + remaining <
        context.config.target_tricks) {
        ++context.stats.target_impossible_cuts;
        audit_line(
            context,
            search_depth,
            "target-bound",
            "target impossible: won " + std::to_string(won) +
                " with only " + std::to_string(remaining) +
                " trick(s) remaining");
        return zero_front();
    }
    return std::nullopt;
}

struct QuickTrickBound {
    ParetoFront front;
    Card first_card {kNoCard};
};

// Proves a target from the public declaring-side cards before expanding any
// hidden-world branches. This is target-directed, like DDS QuickTricks, but
// deliberately weaker because it never reads the E/W split.
std::optional<QuickTrickBound> evaluate_quick_trick_bound(
    const Position& position,
    WorldMask useful_worlds,
    SearchContext& context,
    std::size_t search_depth) {
    if (!context.config.optimizations.quick_trick_bounds ||
        position.current_trick.card_count != 0 ||
        !same_side(player_to_act(position), context.config.declarer)) {
        return std::nullopt;
    }

    const std::uint8_t won =
        tricks_won_by_declarer(position, context.config.declarer);
    if (won >= context.config.target_tricks) return std::nullopt;

    ++context.stats.quick_trick_probes;
    const std::uint8_t needed = static_cast<std::uint8_t>(
        context.config.target_tricks - won);
    const QuickTrickProof proof =
        prove_declarer_quick_tricks(position, context.config.declarer, needed);
    context.stats.quick_trick_states += proof.states_examined;
    if (proof.budget_exhausted) {
        ++context.stats.quick_trick_budget_aborts;
    }
    if (!proof.proven) return std::nullopt;

    ++context.stats.quick_trick_cuts;
    audit_line(
        context,
        search_depth,
        "quick-tricks",
        "proved " + std::to_string(needed) +
            " consecutive declaring-side winner(s), starting with " +
            to_string(proof.first_card));
    return QuickTrickBound {
        .front = ParetoFront {
            .vectors = {OutcomeVector {.wins = useful_worlds}},
        },
        .first_card = proof.first_card,
    };
}

// This is an exact terminal proof, not a heuristic: the MAX leader has only
// trumps and every defender is void, so MAX wins every remaining trick.
std::optional<ParetoFront> evaluate_forced_trump_run(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    WorldMask useful_worlds,
    SearchContext& context,
    std::size_t search_depth) {
    if (!context.config.optimizations.forced_trump_run) {
        return std::nullopt;
    }

    const Position& public_position = worlds[first_world(active_worlds)].position;
    if (public_position.current_trick.card_count != 0 ||
        !public_position.current_trick.trump_suit.has_value()) {
        return std::nullopt;
    }

    const Seat leader = player_to_act(public_position);
    if (!same_side(leader, context.config.declarer)) {
        return std::nullopt;
    }
    const Suit trump = *public_position.current_trick.trump_suit;
    OutcomeVector outcome;
    for (std::size_t world = 0; world < worlds.size(); ++world) {
        const WorldMask bit = WorldMask {1} << world;
        if ((useful_worlds & bit) == 0) continue;

        const Position& position = worlds[world].position;
        const Hand leader_hand = hand_of(position.deal, leader);
        if (leader_hand == kEmptyHand ||
            (leader_hand & ~suit_mask(trump)) != kEmptyHand) {
            return std::nullopt;
        }
        for (const Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West}) {
            if (!same_side(seat, context.config.declarer) &&
                cards_in_suit(hand_of(position.deal, seat), trump) != kEmptyHand) {
                return std::nullopt;
            }
        }

        const std::uint8_t total = static_cast<std::uint8_t>(
            tricks_won_by_declarer(position, context.config.declarer) +
            card_count(leader_hand));
        if (total >= context.config.target_tricks) {
            outcome.wins |= bit;
        }
    }

    ++context.stats.forced_trump_run_cuts;
    audit_line(
        context,
        search_depth,
        "forced-trump",
        "proved the remaining trump run without child nodes or DDS");
    return ParetoFront {.vectors = {outcome}};
}

NodeEvaluation evaluate_max_node(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    WorldMask useful_worlds,
    std::uint8_t max_moves_left,
    SearchContext& context,
    const std::vector<Card>& moves,
    const AlphaBounds& alpha_bounds,
    std::ostringstream* trace,
    std::size_t trace_depth) {
    if (moves.empty()) {
        return NodeEvaluation {.front = evaluate_leaf(worlds, useful_worlds, context)};
    }

    ParetoFront result;
    Card best_move = kNoCard;
    std::size_t best_score = 0;
    bool pruned = false;
    for (const Card move : moves) {
        trace_line(trace, trace_depth + 1, "move " + to_string(move));
        auto child_worlds = worlds;
        for (std::size_t world = 0; world < child_worlds.size(); ++world) {
            if ((active_worlds & (WorldMask {1} << world)) != 0) {
                play_card(child_worlds[world].position, move);
            }
        }

        AlphaBounds child_bounds = alpha_bounds;
        if (!result.vectors.empty()) {
            child_bounds.push_back(AlphaBound {
                .front = &result,
                .useful_worlds = useful_worlds,
            });
        }
        NodeEvaluation child = alpha_mu_node(
            child_worlds,
            active_worlds,
            useful_worlds,
            static_cast<std::uint8_t>(max_moves_left - 1),
            context,
            child_bounds,
            trace,
            trace_depth + 2);
        pruned = pruned || child.pruned;
        const std::size_t score = best_winning_world_count(child.front);
        if (best_move == kNoCard || score > best_score) {
            best_move = move;
            best_score = score;
        }

        trace_line(
            trace,
            trace_depth + 1,
            "front " + format_front(child.front, worlds.size()));
        merge_max_front(result, child.front);

        // A binary vector cannot improve beyond winning every active world.
        if (context.config.optimizations.win_cut &&
            front_wins_all_worlds(result, useful_worlds)) {
            ++context.stats.win_cuts;
            trace_line(trace, trace_depth + 1, "cut on win");
            audit_line(
                context,
                trace_depth,
                "win-cut",
                "MAX move " + to_string(move) + " wins every active world");
            break;
        }
    }

    if (result.vectors.empty()) {
        result = zero_front();
    }
    trace_line(trace, trace_depth, "MAX result " + format_front(result, worlds.size()));
    return NodeEvaluation {
        .front = std::move(result),
        .best_move = best_move,
        .pruned = pruned,
    };
}

NodeEvaluation evaluate_min_node(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    WorldMask useful_worlds,
    std::uint8_t max_moves_left,
    SearchContext& context,
    Card preferred_move,
    const AlphaBounds& alpha_bounds,
    std::ostringstream* trace,
    std::size_t trace_depth) {
    const Hand possible_moves = union_of_defender_moves(worlds, useful_worlds);
    if (possible_moves == kEmptyHand) {
        return NodeEvaluation {.front = evaluate_leaf(worlds, useful_worlds, context)};
    }

    // A defender move constrains only worlds where it is legal. Impossible
    // useful worlds are neutral 1 bits while alternatives are intersected.
    // Proven-useless worlds stay zero and no longer generate defender moves.
    WorldMask current_useful = useful_worlds;
    ParetoFront result {.vectors = {OutcomeVector {.wins = current_useful}}};
    Card first_move = kNoCard;
    bool pruned = false;
    std::unordered_set<NodeKey, NodeKeyHash> equivalent_children;
    for (const Card move : ordered_cards(possible_moves, preferred_move)) {
        auto child_worlds = worlds;
        WorldMask legal_active_worlds = 0;
        WorldMask legal_useful_worlds = 0;
        for (std::size_t world = 0; world < child_worlds.size(); ++world) {
            const WorldMask world_bit = WorldMask {1} << world;
            if ((active_worlds & world_bit) == 0) {
                continue;
            }

            Position& position = child_worlds[world].position;
            const Seat player = player_to_act(position);
            if (is_legal_play(position.current_trick, hand_of(position.deal, player), move)) {
                play_card(position, move);
                legal_active_worlds |= world_bit;
                if ((current_useful & world_bit) != 0) {
                    legal_useful_worlds |= world_bit;
                }
            }
        }

        if (legal_useful_worlds == 0) {
            continue;
        }
        if (context.config.optimizations.min_equivalent_successors) {
            const NodeKey child_key = make_node_key(
                child_worlds,
                legal_active_worlds,
                legal_useful_worlds,
                context.config.optimizations.canonical_transposition_keys);
            if (!equivalent_children.insert(child_key).second) {
                ++context.stats.equivalent_moves_skipped;
                ++context.stats.min_equivalent_moves_skipped;
                audit_line(
                    context,
                    trace_depth,
                    "min-equals",
                    "skipped " + to_string(move) +
                        " because its observable successor is already searched");
                continue;
            }
        }
        if (first_move == kNoCard) {
            first_move = move;
        }

        trace_line(
            trace,
            trace_depth + 1,
            "move " + to_string(move) +
                " legal=" + format_world_mask(legal_active_worlds, worlds.size()) +
                " useful=" + format_world_mask(legal_useful_worlds, worlds.size()));
        NodeEvaluation child = alpha_mu_node(
            child_worlds,
            legal_active_worlds,
            legal_useful_worlds,
            max_moves_left,
            context,
            alpha_bounds,
            trace,
            trace_depth + 2);
        pruned = pruned || child.pruned;

        const WorldMask impossible_worlds = current_useful & ~legal_active_worlds;
        for (OutcomeVector& vector : child.front.vectors) {
            vector.wins |= impossible_worlds;
        }
        result = combine_min_fronts(result, child.front);
        trace_line(
            trace,
            trace_depth + 1,
            "combined " + format_front(result, worlds.size()));

        if (context.config.optimizations.useful_worlds) {
            const WorldMask reduced =
                current_useful & worlds_with_possible_win(result);
            const std::uint64_t removed = std::popcount(current_useful) -
                std::popcount(reduced);
            if (removed > 0) {
                context.stats.useful_worlds_removed += removed;
                audit_line(
                    context,
                    trace_depth,
                    "useful-worlds",
                    "removed " + std::to_string(removed) +
                        " world(s) proved lost by the current MIN front");
            }
            current_useful = reduced;
        }

        if (context.config.optimizations.deep_alpha_cut &&
            front_is_covered_by_alpha(result, active_worlds, alpha_bounds)) {
            ++context.stats.deep_alpha_cuts;
            audit_line(
                context,
                trace_depth,
                "deep-alpha",
                "current MIN front is covered by an ancestor MAX front");
            return NodeEvaluation {
                .front = zero_front(),
                .best_move = first_move,
                .pruned = true,
            };
        }

        if (const std::optional<ParetoFront> cut =
                evaluate_world_cut(worlds, current_useful, context, trace_depth);
            cut.has_value()) {
            return NodeEvaluation {.front = *cut, .best_move = first_move};
        }
    }

    trace_line(trace, trace_depth, "MIN result " + format_front(result, worlds.size()));
    return NodeEvaluation {
        .front = std::move(result),
        .best_move = first_move,
        .pruned = pruned,
    };
}

struct RootIteration {
    NodeEvaluation evaluation;
    std::vector<AlphaMuRootMove> root_moves;
    bool cut {};
    bool terminal_depth_independent_bound {};
};

RootIteration search_root_iteration(
    const std::vector<AlphaMuWorld>& worlds,
    std::uint8_t depth,
    std::optional<std::size_t> previous_score,
    SearchContext& context) {
    const WorldMask active_worlds = all_worlds_mask(worlds.size());
    const AlphaBounds no_bounds;
    const Position& root = worlds.front().position;
    const Seat turn = player_to_act(root);
    if (!same_side(turn, context.config.declarer)) {
        return RootIteration {
            .evaluation = alpha_mu_node(
                worlds,
                active_worlds,
                active_worlds,
                depth,
                context,
                no_bounds,
                nullptr,
                0),
        };
    }

    ++context.stats.nodes;
    const Hand legal_moves = shared_declarer_moves(worlds, active_worlds);
    if (legal_moves == kEmptyHand || depth == 0 || is_deal_finished(root)) {
        return RootIteration {
            .evaluation = NodeEvaluation {
                .front = evaluate_leaf(worlds, active_worlds, context),
            },
        };
    }

    if (const std::optional<ParetoFront> bound =
            evaluate_target_bound(root, active_worlds, context, 0);
        bound.has_value()) {
        const std::vector<Card> moves = representative_cards(
            root, legal_moves, kNoCard, context);
        std::vector<AlphaMuRootMove> root_moves;
        root_moves.reserve(moves.size());
        const std::size_t score = best_winning_world_count(*bound);
        for (const Card move : moves) {
            root_moves.push_back(AlphaMuRootMove {
                .move = move,
                .winning_worlds = score,
                .pareto_vectors = bound->vectors.size(),
                .front = *bound,
            });
        }
        return RootIteration {
            .evaluation = NodeEvaluation {
                .front = *bound,
                .best_move = moves.front(),
            },
            .root_moves = std::move(root_moves),
            .terminal_depth_independent_bound = true,
        };
    }

    if (const std::optional<QuickTrickBound> bound =
            evaluate_quick_trick_bound(root, active_worlds, context, 0);
        bound.has_value()) {
        ++context.stats.quick_trick_root_cuts;
        return RootIteration {
            .evaluation = NodeEvaluation {
                .front = bound->front,
                .best_move = bound->first_card,
            },
            .root_moves = {AlphaMuRootMove {
                .move = bound->first_card,
                .winning_worlds = worlds.size(),
                .pareto_vectors = bound->front.vectors.size(),
                .front = bound->front,
            }},
            .terminal_depth_independent_bound = true,
        };
    }

    if (const std::optional<ParetoFront> forced =
            evaluate_forced_trump_run(
                worlds, active_worlds, active_worlds, context, 0);
        forced.has_value()) {
        const Card move = representative_cards(
            root, legal_moves, kNoCard, context).front();
        return RootIteration {
            .evaluation = NodeEvaluation {.front = *forced, .best_move = move},
            .root_moves = {AlphaMuRootMove {
                .move = move,
                .winning_worlds = best_winning_world_count(*forced),
                .pareto_vectors = forced->vectors.size(),
                .front = *forced,
            }},
        };
    }

    const bool use_table = context.config.optimizations.transposition_table;
    const std::optional<NodeKey> root_key = use_table
        ? std::optional<NodeKey> {make_node_key(
              worlds,
              active_worlds,
              active_worlds,
              context.config.optimizations.canonical_transposition_keys)}
        : std::nullopt;
    Card preferred_move = kNoCard;
    if (root_key.has_value()) {
        ++context.stats.transposition_probes;
        const auto found = context.table.find(*root_key);
        if (found != context.table.end()) {
            preferred_move = found->second.move_hint;
        }
    }

    ParetoFront root_front;
    std::vector<AlphaMuRootMove> root_moves;
    Card best_move = kNoCard;
    std::size_t best_score = 0;
    bool cut = false;
    for (const Card move : representative_cards(
             root, legal_moves, preferred_move, context)) {
        auto child_worlds = worlds;
        for (AlphaMuWorld& world : child_worlds) {
            play_card(world.position, move);
        }

        AlphaBounds child_bounds;
        if (!context.config.compare_all_root_moves &&
            !root_front.vectors.empty()) {
            child_bounds.push_back(AlphaBound {
                .front = &root_front,
                .useful_worlds = active_worlds,
            });
        }
        NodeEvaluation child = alpha_mu_node(
            child_worlds,
            active_worlds,
            active_worlds,
            static_cast<std::uint8_t>(depth - 1),
            context,
            child_bounds,
            nullptr,
            0);
        const std::size_t score = best_winning_world_count(child.front);
        root_moves.push_back(AlphaMuRootMove {
            .move = move,
            .winning_worlds = score,
            .pareto_vectors = child.front.vectors.size(),
            .front = child.front,
        });
        if (best_move == kNoCard || score > best_score) {
            best_move = move;
            best_score = score;
        }
        merge_max_front(root_front, child.front);

        if (!context.config.compare_all_root_moves &&
            context.config.optimizations.win_cut &&
            front_wins_all_worlds(root_front, active_worlds)) {
            ++context.stats.win_cuts;
            audit_line(
                context,
                0,
                "win-cut",
                "root move " + to_string(move) + " wins every sampled world");
            break;
        }

        if (!context.config.compare_all_root_moves &&
            context.config.optimizations.root_cut &&
            previous_score.has_value() &&
            best_winning_world_count(root_front) >= *previous_score) {
            ++context.stats.root_cuts;
            audit_line(
                context,
                0,
                "root-cut",
                "depth " + std::to_string(depth) +
                    " reached previous iteration score " +
                    std::to_string(*previous_score));
            cut = true;
            break;
        }
    }

    if (root_front.vectors.empty()) {
        root_front = zero_front();
    }
    if (root_key.has_value()) {
        TranspositionEntry& entry = context.table[*root_key];
        entry.move_hint = best_move;
        if (!cut) {
            entry.by_depth[depth] = CachedNode {
                .front = root_front,
                .best_move = best_move,
            };
            ++context.stats.transposition_stores;
        }
    }

    return RootIteration {
        .evaluation = NodeEvaluation {
            .front = std::move(root_front),
            .best_move = best_move,
        },
        .root_moves = std::move(root_moves),
        .cut = cut,
    };
}

}  // namespace

NodeEvaluation alpha_mu_node(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    WorldMask useful_worlds,
    std::uint8_t max_moves_left,
    SearchContext& context,
    const AlphaBounds& alpha_bounds,
    std::ostringstream* trace,
    std::size_t trace_depth) {
    ++context.stats.nodes;
    check_hard_deadline(context);
    if (active_worlds == 0) {
        return NodeEvaluation {.front = zero_front()};
    }
    useful_worlds &= active_worlds;

    const Position& position = worlds[first_world(active_worlds)].position;
    if (const std::optional<ParetoFront> bound =
            evaluate_target_bound(
                position, useful_worlds, context, trace_depth);
        bound.has_value()) {
        return NodeEvaluation {.front = *bound};
    }
    if (const std::optional<QuickTrickBound> bound =
            evaluate_quick_trick_bound(
                position, useful_worlds, context, trace_depth);
        bound.has_value()) {
        return NodeEvaluation {
            .front = bound->front,
            .best_move = bound->first_card,
        };
    }

    std::optional<NodeKey> key;
    Card preferred_move = kNoCard;
    const TranspositionEntry* cached_entry = nullptr;
    if (context.config.optimizations.transposition_table) {
        key = make_node_key(
            worlds,
            active_worlds,
            useful_worlds,
            context.config.optimizations.canonical_transposition_keys);
        ++context.stats.transposition_probes;
        const auto found = context.table.find(*key);
        if (found != context.table.end()) {
            cached_entry = &found->second;
            preferred_move = cached_entry->move_hint;
            const auto& exact = cached_entry->by_depth[max_moves_left];
            if (exact.has_value()) {
                ++context.stats.transposition_hits;
                trace_line(trace, trace_depth, "transposition hit");
                audit_line(
                    context,
                    trace_depth,
                    "tt",
                    "reused exact depth-" + std::to_string(max_moves_left) + " front");
                return NodeEvaluation {
                    .front = exact->front,
                    .best_move = exact->best_move,
                };
            }
        }
    }

    if (const std::optional<ParetoFront> cut =
            evaluate_world_cut(worlds, useful_worlds, context, trace_depth);
        cut.has_value()) {
        if (key.has_value()) {
            context.table[*key].by_depth[max_moves_left] = CachedNode {.front = *cut};
            ++context.stats.transposition_stores;
        }
        return NodeEvaluation {.front = *cut};
    }
    if (const std::optional<ParetoFront> forced =
            evaluate_forced_trump_run(
                worlds, active_worlds, useful_worlds, context, trace_depth);
        forced.has_value()) {
        return NodeEvaluation {.front = *forced};
    }
    if (is_deal_finished(position) || max_moves_left == 0) {
        ParetoFront leaf = evaluate_leaf(worlds, useful_worlds, context);
        trace_line(
            trace,
            trace_depth,
            "leaf active=" + format_world_mask(active_worlds, worlds.size()) +
                " -> " + format_front(leaf, worlds.size()));
        if (key.has_value()) {
            TranspositionEntry& entry = context.table[*key];
            entry.by_depth[max_moves_left] = CachedNode {.front = leaf};
            ++context.stats.transposition_stores;
        }
        return NodeEvaluation {.front = std::move(leaf)};
    }

    const Seat turn = player_to_act(position);
    for (std::size_t world = 0; world < worlds.size(); ++world) {
        if ((active_worlds & (WorldMask {1} << world)) != 0 &&
            player_to_act(worlds[world].position) != turn) {
            throw std::invalid_argument("active alpha-mu worlds disagree on player to act");
        }
    }
    const bool is_max = same_side(turn, context.config.declarer);

    // Empty Entry exists to manufacture a missing optimistic MIN bound for an
    // alpha test. Filling every missing interior entry would be correct but
    // usually slower than the search it is intended to avoid.
    if (!is_max &&
        !alpha_bounds.empty() &&
        context.config.optimizations.empty_entry &&
        key.has_value() &&
        max_moves_left > 0 &&
        (cached_entry == nullptr ||
         shallow_cached_node(*cached_entry, max_moves_left) == nullptr)) {
        ++context.stats.empty_entry_searches;
        audit_line(
            context,
            trace_depth,
            "empty-entry",
            "filled missing depth-" + std::to_string(max_moves_left - 1) +
                " interior front");
        const AlphaBounds no_bounds;
        (void) alpha_mu_node(
            worlds,
            active_worlds,
            useful_worlds,
            static_cast<std::uint8_t>(max_moves_left - 1),
            context,
            no_bounds,
            nullptr,
            trace_depth);
        const auto refreshed = context.table.find(*key);
        cached_entry = refreshed == context.table.end() ? nullptr : &refreshed->second;
        if (cached_entry != nullptr) preferred_move = cached_entry->move_hint;
    }
    if (!is_max &&
        context.config.optimizations.early_cut &&
        !alpha_bounds.empty() &&
        cached_entry != nullptr) {
        const CachedNode* upper_bound =
            shallow_cached_node(*cached_entry, max_moves_left);
        if (upper_bound != nullptr &&
            front_is_covered_by_alpha(
                upper_bound->front, active_worlds, alpha_bounds)) {
            ++context.stats.early_cuts;
            trace_line(trace, trace_depth, "MIN early cut");
            audit_line(
                context,
                trace_depth,
                "early-cut",
                "shallower MIN upper bound is covered by an ancestor MAX front");
            return NodeEvaluation {.front = zero_front(), .pruned = true};
        }
    }

    if (!is_max &&
        context.config.optimizations.useful_worlds &&
        cached_entry != nullptr) {
        const CachedNode* upper_bound =
            shallow_cached_node(*cached_entry, max_moves_left);
        if (upper_bound != nullptr) {
            const WorldMask reduced =
                useful_worlds & worlds_with_possible_win(upper_bound->front);
            const std::uint64_t removed = std::popcount(useful_worlds) -
                std::popcount(reduced);
            if (removed > 0) {
                context.stats.useful_worlds_removed += removed;
                audit_line(
                    context,
                    trace_depth,
                    "useful-worlds",
                    "removed " + std::to_string(removed) +
                        " world(s) proved lost by a shallower MIN front");
            }
            useful_worlds = reduced;
        }
    }
    if (const std::optional<ParetoFront> cut =
            evaluate_world_cut(worlds, useful_worlds, context, trace_depth);
        cut.has_value()) {
        if (key.has_value()) {
            context.table[*key].by_depth[max_moves_left] = CachedNode {.front = *cut};
            ++context.stats.transposition_stores;
        }
        return NodeEvaluation {.front = *cut};
    }

    std::vector<Card> max_moves;
    Hand min_moves = kEmptyHand;
    if (is_max) {
        max_moves = representative_cards(
            position,
            shared_declarer_moves(worlds, active_worlds),
            preferred_move,
            context,
            trace_depth);
    } else {
        min_moves = union_of_defender_moves(worlds, useful_worlds);
    }

    if (context.config.optimizations.forced_moves) {
        const bool forced_max = is_max && max_moves.size() == 1;
        const bool forced_min = !is_max && is_single_card(min_moves);
        if (forced_max || forced_min) {
            const Card move = forced_max ? max_moves.front() : min_moves;
            auto child_worlds = worlds;
            WorldMask child_active_worlds = 0;
            WorldMask child_useful_worlds = 0;

            for (std::size_t world = 0; world < child_worlds.size(); ++world) {
                const WorldMask bit = WorldMask {1} << world;
                if ((active_worlds & bit) == 0) {
                    continue;
                }

                Position& child = child_worlds[world].position;
                if (is_max || is_legal_play(
                        child.current_trick,
                        hand_of(child.deal, player_to_act(child)),
                        move)) {
                    play_card(child, move);
                    child_active_worlds |= bit;
                    if ((useful_worlds & bit) != 0) {
                        child_useful_worlds |= bit;
                    }
                }
            }

            ++context.stats.forced_move_nodes;
            if (is_max) {
                ++context.stats.forced_max_nodes;
            } else {
                ++context.stats.forced_min_nodes;
            }
            trace_line(
                trace,
                trace_depth,
                std::string(is_max ? "MAX" : "MIN") +
                    " forced " + to_string(move));
            audit_line(
                context,
                trace_depth,
                "forced-moves",
                std::string(is_max ? "MAX " : "MIN ") +
                    to_string(turn) + " has only " + to_string(move));

            NodeEvaluation result = alpha_mu_node(
                child_worlds,
                child_active_worlds,
                child_useful_worlds,
                is_max
                    ? static_cast<std::uint8_t>(max_moves_left - 1)
                    : max_moves_left,
                context,
                alpha_bounds,
                trace,
                trace_depth + 1);
            if (!is_max) {
                const WorldMask impossible_worlds =
                    useful_worlds & ~child_active_worlds;
                for (OutcomeVector& vector : result.front.vectors) {
                    vector.wins |= impossible_worlds;
                }
            }
            result.best_move = move;

            if (key.has_value() && (alpha_bounds.empty() || !result.pruned)) {
                TranspositionEntry& entry = context.table[*key];
                entry.by_depth[max_moves_left] = CachedNode {
                    .front = result.front,
                    .best_move = move,
                };
                entry.move_hint = move;
                ++context.stats.transposition_stores;
            }
            return result;
        }
    }

    trace_line(
        trace,
        trace_depth,
        std::string(is_max ? "MAX " : "MIN ") + to_string(turn) +
            " active=" + format_world_mask(active_worlds, worlds.size()) +
            " useful=" + format_world_mask(useful_worlds, worlds.size()) +
            " max-moves-left=" + std::to_string(max_moves_left));

    NodeEvaluation result = is_max
        ? evaluate_max_node(
              worlds,
              active_worlds,
              useful_worlds,
              max_moves_left,
              context,
              max_moves,
              alpha_bounds,
              trace,
              trace_depth)
        : evaluate_min_node(
              worlds,
              active_worlds,
              useful_worlds,
              max_moves_left,
              context,
              preferred_move,
              alpha_bounds,
              trace,
              trace_depth);

    if (key.has_value() && (alpha_bounds.empty() || !result.pruned)) {
        TranspositionEntry& entry = context.table[*key];
        entry.by_depth[max_moves_left] = CachedNode {
            .front = result.front,
            .best_move = result.best_move,
        };
        if (result.best_move != kNoCard) {
            entry.move_hint = result.best_move;
        }
        ++context.stats.transposition_stores;
    }
    return result;
}

AlphaMuResult run_search(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config) {
    SearchContext context {.config = config};
    const auto search_start = std::chrono::steady_clock::now();
    if (config.hard_time_limit && config.max_search_seconds > 0.0) {
        context.deadline = search_start +
            std::chrono::duration_cast<std::chrono::steady_clock::duration>(
                std::chrono::duration<double>(config.max_search_seconds));
    }
    NodeEvaluation final_evaluation;
    std::vector<AlphaMuRootMove> final_root_moves;
    std::optional<std::size_t> previous_score;
    std::optional<double> previous_iteration_seconds;
    const std::uint8_t first_depth =
        config.optimizations.iterative_deepening && config.max_declarer_plies > 0
            ? 1
            : config.max_declarer_plies;

    for (std::uint8_t depth = first_depth;
         depth <= config.max_declarer_plies;
         ++depth) {
        const auto iteration_start = std::chrono::steady_clock::now();
        audit_line(
            context,
            0,
            "iteration",
            "starting M=" + std::to_string(depth));
        std::optional<RootIteration> iteration;
        try {
            iteration.emplace(
                search_root_iteration(
                    worlds,
                    depth,
                    previous_score,
                    context));
        } catch (const SearchDeadlineReached&) {
            context.stats.stopped_by_time_limit = true;
            audit_line(
                context,
                0,
                "iteration",
                "hard deadline interrupted M=" + std::to_string(depth) +
                    "; retained completed M=" +
                    std::to_string(context.stats.completed_depth));
            break;
        }
        const bool terminal_depth_independent_bound =
            iteration->terminal_depth_independent_bound;
        final_evaluation = std::move(iteration->evaluation);
        final_root_moves = std::move(iteration->root_moves);
        previous_score = best_winning_world_count(final_evaluation.front);
        ++context.stats.completed_iterations;
        context.stats.completed_depth = depth;
        const double iteration_seconds = std::chrono::duration<double>(
            std::chrono::steady_clock::now() - iteration_start).count();
        context.stats.last_iteration_ms = iteration_seconds * 1000.0;
        audit_line(
            context,
            0,
            "iteration",
            "completed M=" + std::to_string(depth) +
                " with best score " + std::to_string(*previous_score));
        if (terminal_depth_independent_bound) {
            audit_line(
                context,
                0,
                "iteration",
                "terminal bound is depth-independent; stopped iterative deepening");
            break;
        }
        if (depth == config.max_declarer_plies) {
            break;
        }
        if (config.optimizations.iterative_deepening && config.max_search_seconds > 0.0) {
            const double elapsed_seconds = std::chrono::duration<double>(
                std::chrono::steady_clock::now() - search_start).count();
            double projected_next_seconds = iteration_seconds;
            if (previous_iteration_seconds.has_value() &&
                *previous_iteration_seconds > 0.0) {
                const double measured_growth = std::max(
                    1.0,
                    iteration_seconds / *previous_iteration_seconds);
                projected_next_seconds = iteration_seconds * measured_growth;
            }
            context.stats.projected_next_iteration_ms =
                projected_next_seconds * 1000.0;
            if (elapsed_seconds >= config.max_search_seconds ||
                elapsed_seconds + projected_next_seconds >= config.max_search_seconds) {
                context.stats.stopped_by_time_limit = true;
                audit_line(
                    context,
                    0,
                    "iteration",
                    "declined the next M: elapsed=" +
                        std::to_string(elapsed_seconds) + "s projected-next=" +
                        std::to_string(projected_next_seconds) + "s");
                break;
            }
        }
        previous_iteration_seconds = iteration_seconds;
    }
    context.stats.tree_search_ms = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - search_start).count();
    if (context.stats.completed_iterations == 0) {
        throw std::runtime_error(
            "alpha-mu hard deadline expired before M=1 completed");
    }

    std::shared_ptr<const AlphaMuPolicyNode> trick_policy;
    if (config.build_trick_policy) {
        // Policy reconstruction mostly reuses exact table entries. Give it a
        // short grace period rather than interrupting the policy we must play.
        context.deadline.reset();
        const auto policy_start = std::chrono::steady_clock::now();
        AlphaMuConfig policy_config = config;
        policy_config.max_declarer_plies = context.stats.completed_depth;
        if (config.collect_audit_log) {
            context.audit << "[policy] reconstruction optimization events\n";
        }
        // Policy reconstruction asks for fronts from the search we just ran.
        // Reusing the same table avoids repeating the entire completed M.
        trick_policy = build_trick_policy(
            worlds,
            policy_config,
            final_evaluation.best_move,
            context);
        context.stats.policy_build_ms = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - policy_start).count();
    }

    return AlphaMuResult {
        .best_move = final_evaluation.best_move,
        .front = std::move(final_evaluation.front),
        .root_moves = std::move(final_root_moves),
        .trick_policy = std::move(trick_policy),
        .stats = context.stats,
        .audit_log = context.audit.str(),
    };
}

}  // namespace bridge::alpha_mu_detail

namespace bridge {

AlphaMuResult alpha_mu_search(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config) {
    alpha_mu_detail::validate_worlds(worlds, config);
    if (config.max_declarer_plies > kMaxDeclarerPlies) {
        throw std::invalid_argument("alpha-mu supports at most 26 Max moves");
    }
    return alpha_mu_detail::run_search(worlds, config);
}

std::string format_alpha_mu_front(const ParetoFront& front, std::size_t world_count) {
    if (world_count > 64) {
        throw std::invalid_argument("alpha-mu fronts support at most 64 worlds");
    }
    return alpha_mu_detail::format_front(front, world_count);
}

std::string alpha_mu_debug_tree(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config) {
    alpha_mu_detail::validate_worlds(worlds, config);

    alpha_mu_detail::SearchContext context {.config = config};
    std::ostringstream trace;
    const WorldMask active_worlds =
        alpha_mu_detail::all_worlds_mask(worlds.size());
    const alpha_mu_detail::AlphaBounds no_bounds;
    const alpha_mu_detail::NodeEvaluation evaluation = alpha_mu_detail::alpha_mu_node(
        worlds,
        active_worlds,
        active_worlds,
        config.max_declarer_plies,
        context,
        no_bounds,
        &trace,
        0);
    trace << "root "
          << alpha_mu_detail::format_front(evaluation.front, worlds.size())
          << '\n';
    return trace.str();
}

}  // namespace bridge
