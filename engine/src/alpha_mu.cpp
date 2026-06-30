#include "alpha_mu_internal.h"

#include "bridge/dds_solver.h"

#include <algorithm>
#include <chrono>
#include <optional>
#include <stdexcept>
#include <unordered_set>
#include <utility>

namespace bridge::alpha_mu_detail {
namespace {

ParetoFront evaluate_leaf(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    SearchContext& context) {
    ++context.stats.leaves;
    OutcomeVector outcome;
    for (std::size_t world = 0; world < worlds.size(); ++world) {
        const WorldMask world_bit = WorldMask {1} << world;
        if ((active_worlds & world_bit) == 0) {
            continue;
        }

        ++context.stats.dds_worlds;
        const Position& position = worlds[world].position;
        const std::uint8_t total_tricks =
            tricks_won_by_declarer(position, context.config.declarer) +
            double_dummy_future_tricks(position, context.config.declarer);
        if (total_tricks >= context.config.target_tricks) {
            outcome.wins |= world_bit;
        }
    }
    return ParetoFront {.vectors = {outcome}};
}

// This is an exact terminal proof, not a heuristic: the MAX leader has only
// trumps and every defender is void, so MAX wins every remaining trick.
std::optional<ParetoFront> evaluate_forced_trump_run(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
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
        if ((active_worlds & bit) == 0) {
            continue;
        }

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
    std::uint8_t max_moves_left,
    SearchContext& context,
    Card preferred_move,
    std::ostringstream* trace,
    std::size_t trace_depth) {
    const Hand legal_moves = shared_declarer_moves(worlds, active_worlds);
    if (legal_moves == kEmptyHand) {
        return NodeEvaluation {.front = evaluate_leaf(worlds, active_worlds, context)};
    }

    ParetoFront result;
    Card best_move = kNoCard;
    std::size_t best_score = 0;
    const Position& public_position = worlds[first_world(active_worlds)].position;
    for (const Card move : representative_cards(
             public_position,
             legal_moves,
             preferred_move,
             context,
             trace_depth)) {
        trace_line(trace, trace_depth + 1, "move " + to_string(move));
        auto child_worlds = worlds;
        for (std::size_t world = 0; world < child_worlds.size(); ++world) {
            if ((active_worlds & (WorldMask {1} << world)) != 0) {
                play_card(child_worlds[world].position, move);
            }
        }

        const ParetoFront* child_alpha = result.vectors.empty() ? nullptr : &result;
        NodeEvaluation child = alpha_mu_node(
            child_worlds,
            active_worlds,
            static_cast<std::uint8_t>(max_moves_left - 1),
            context,
            child_alpha,
            trace,
            trace_depth + 2);
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
            front_wins_all_worlds(result, active_worlds)) {
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
    return NodeEvaluation {.front = std::move(result), .best_move = best_move};
}

NodeEvaluation evaluate_min_node(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    std::uint8_t max_moves_left,
    SearchContext& context,
    Card preferred_move,
    std::ostringstream* trace,
    std::size_t trace_depth) {
    const Hand possible_moves = union_of_defender_moves(worlds, active_worlds);
    if (possible_moves == kEmptyHand) {
        return NodeEvaluation {.front = evaluate_leaf(worlds, active_worlds, context)};
    }

    // A defender move constrains only worlds where it is legal. Impossible
    // worlds are neutral 1 bits while defender alternatives are intersected.
    ParetoFront result {.vectors = {OutcomeVector {.wins = active_worlds}}};
    Card first_move = kNoCard;
    std::unordered_set<NodeKey, NodeKeyHash> equivalent_children;
    for (const Card move : ordered_cards(possible_moves, preferred_move)) {
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
        if (context.config.optimizations.min_equivalent_successors) {
            const NodeKey child_key = make_node_key(
                child_worlds,
                legal_worlds,
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
                " legal=" + format_world_mask(legal_worlds, worlds.size()));
        NodeEvaluation child = alpha_mu_node(
            child_worlds,
            legal_worlds,
            max_moves_left,
            context,
            nullptr,
            trace,
            trace_depth + 2);

        const WorldMask impossible_worlds = active_worlds & ~legal_worlds;
        for (OutcomeVector& vector : child.front.vectors) {
            vector.wins |= impossible_worlds;
        }
        result = combine_min_fronts(result, child.front);
        trace_line(
            trace,
            trace_depth + 1,
            "combined " + format_front(result, worlds.size()));
    }

    trace_line(trace, trace_depth, "MIN result " + format_front(result, worlds.size()));
    return NodeEvaluation {.front = std::move(result), .best_move = first_move};
}

struct RootIteration {
    NodeEvaluation evaluation;
    std::vector<AlphaMuRootMove> root_moves;
    bool cut {};
};

RootIteration search_root_iteration(
    const std::vector<AlphaMuWorld>& worlds,
    std::uint8_t depth,
    std::optional<std::size_t> previous_score,
    SearchContext& context) {
    const WorldMask active_worlds = all_worlds_mask(worlds.size());
    const Position& root = worlds.front().position;
    const Seat turn = player_to_act(root);
    if (!same_side(turn, context.config.declarer)) {
        return RootIteration {
            .evaluation = alpha_mu_node(
                worlds, active_worlds, depth, context, nullptr, nullptr, 0),
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

    if (const std::optional<ParetoFront> forced =
            evaluate_forced_trump_run(worlds, active_worlds, context, 0);
        forced.has_value()) {
        const Card move = representative_cards(
            root, legal_moves, kNoCard, context).front();
        return RootIteration {
            .evaluation = NodeEvaluation {.front = *forced, .best_move = move},
            .root_moves = {AlphaMuRootMove {
                .move = move,
                .winning_worlds = best_winning_world_count(*forced),
                .pareto_vectors = forced->vectors.size(),
            }},
        };
    }

    const bool use_table = context.config.optimizations.transposition_table;
    const std::optional<NodeKey> root_key = use_table
        ? std::optional<NodeKey> {make_node_key(
              worlds,
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

        const ParetoFront* alpha = root_front.vectors.empty() ? nullptr : &root_front;
        NodeEvaluation child = alpha_mu_node(
            child_worlds,
            active_worlds,
            static_cast<std::uint8_t>(depth - 1),
            context,
            alpha,
            nullptr,
            0);
        const std::size_t score = best_winning_world_count(child.front);
        root_moves.push_back(AlphaMuRootMove {
            .move = move,
            .winning_worlds = score,
            .pareto_vectors = child.front.vectors.size(),
        });
        if (best_move == kNoCard || score > best_score) {
            best_move = move;
            best_score = score;
        }
        merge_max_front(root_front, child.front);

        if (context.config.optimizations.win_cut &&
            front_wins_all_worlds(root_front, active_worlds)) {
            ++context.stats.win_cuts;
            audit_line(
                context,
                0,
                "win-cut",
                "root move " + to_string(move) + " wins every sampled world");
            break;
        }

        if (context.config.optimizations.root_cut &&
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
    std::uint8_t max_moves_left,
    SearchContext& context,
    const ParetoFront* alpha,
    std::ostringstream* trace,
    std::size_t trace_depth) {
    ++context.stats.nodes;
    if (active_worlds == 0) {
        return NodeEvaluation {.front = zero_front()};
    }

    std::optional<NodeKey> key;
    Card preferred_move = kNoCard;
    const TranspositionEntry* cached_entry = nullptr;
    if (context.config.optimizations.transposition_table) {
        key = make_node_key(
            worlds,
            active_worlds,
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

    const Position& position = worlds[first_world(active_worlds)].position;
    if (const std::optional<ParetoFront> forced =
            evaluate_forced_trump_run(worlds, active_worlds, context, trace_depth);
        forced.has_value()) {
        return NodeEvaluation {.front = *forced};
    }
    if (is_deal_finished(position) || max_moves_left == 0) {
        ParetoFront leaf = evaluate_leaf(worlds, active_worlds, context);
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
    if (!is_max &&
        context.config.optimizations.early_cut &&
        alpha != nullptr &&
        !alpha->vectors.empty() &&
        cached_entry != nullptr) {
        const CachedNode* upper_bound =
            shallow_cached_node(*cached_entry, max_moves_left);
        if (upper_bound != nullptr &&
            pareto_front_is_covered_by(upper_bound->front, *alpha)) {
            ++context.stats.early_cuts;
            trace_line(trace, trace_depth, "MIN early cut");
            audit_line(
                context,
                trace_depth,
                "early-cut",
                "shallower MIN upper bound is covered by MAX alpha");
            return NodeEvaluation {.front = zero_front()};
        }
    }

    trace_line(
        trace,
        trace_depth,
        std::string(is_max ? "MAX " : "MIN ") + to_string(turn) +
            " active=" + format_world_mask(active_worlds, worlds.size()) +
            " max-moves-left=" + std::to_string(max_moves_left));

    NodeEvaluation result = is_max
        ? evaluate_max_node(
              worlds,
              active_worlds,
              max_moves_left,
              context,
              preferred_move,
              trace,
              trace_depth)
        : evaluate_min_node(
              worlds,
              active_worlds,
              max_moves_left,
              context,
              preferred_move,
              trace,
              trace_depth);

    if (key.has_value()) {
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
        RootIteration iteration =
            search_root_iteration(worlds, depth, previous_score, context);
        final_evaluation = std::move(iteration.evaluation);
        final_root_moves = std::move(iteration.root_moves);
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

    std::shared_ptr<const AlphaMuPolicyNode> trick_policy;
    if (config.build_trick_policy) {
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
    if (config.max_declarer_plies > 13) {
        throw std::invalid_argument("alpha-mu supports at most 13 Max moves");
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
    const alpha_mu_detail::NodeEvaluation evaluation = alpha_mu_detail::alpha_mu_node(
        worlds,
        alpha_mu_detail::all_worlds_mask(worlds.size()),
        config.max_declarer_plies,
        context,
        nullptr,
        &trace,
        0);
    trace << "root "
          << alpha_mu_detail::format_front(evaluation.front, worlds.size())
          << '\n';
    return trace.str();
}

}  // namespace bridge
