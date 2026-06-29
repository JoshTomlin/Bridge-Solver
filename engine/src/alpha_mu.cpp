#include "bridge/alpha_mu.h"

#include "bridge/dds_solver.h"

#include <algorithm>
#include <array>
#include <bit>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <unordered_map>
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

bool pareto_front_is_covered_by(
    const ParetoFront& candidate,
    const ParetoFront& bound) {
    for (const OutcomeVector& candidate_vector : candidate.vectors) {
        bool covered = false;
        for (const OutcomeVector& bound_vector : bound.vectors) {
            if ((bound_vector.wins | candidate_vector.wins) == bound_vector.wins) {
                covered = true;
                break;
            }
        }
        if (!covered) {
            return false;
        }
    }
    return true;
}

namespace {

ParetoFront zero_front() {
    return ParetoFront {.vectors = {OutcomeVector {}}};
}

struct NodeKey {
    std::uint64_t first {};
    std::uint64_t second {};

    bool operator==(const NodeKey&) const = default;
};

struct NodeKeyHash {
    std::size_t operator()(const NodeKey& key) const {
        return static_cast<std::size_t>(key.first ^ std::rotl(key.second, 23));
    }
};

struct CachedNode {
    ParetoFront front;
    Card best_move {kNoCard};
};

struct TranspositionEntry {
    std::array<std::optional<CachedNode>, 14> by_depth;
    Card move_hint {kNoCard};
};

struct SearchContext {
    const AlphaMuConfig& config;
    AlphaMuSearchStats stats;
    std::unordered_map<NodeKey, TranspositionEntry, NodeKeyHash> table;
};

struct NodeEvaluation {
    ParetoFront front;
    Card best_move {kNoCard};
};

struct PolicyChoice {
    OutcomeVector outcome;
    std::vector<OutcomeVector> child_outcomes;
};

void hash_value(NodeKey& key, std::uint64_t value) {
    key.first ^= value + 0x9E3779B97F4A7C15ULL +
        (key.first << 6) + (key.first >> 2);
    value ^= value >> 30;
    value *= 0xBF58476D1CE4E5B9ULL;
    value ^= value >> 27;
    value *= 0x94D049BB133111EBULL;
    value ^= value >> 31;
    key.second = std::rotl(key.second, 17) ^ value;
}

NodeKey make_node_key(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds) {
    NodeKey key {
        .first = 0x243F6A8885A308D3ULL,
        .second = 0x13198A2E03707344ULL,
    };
    hash_value(key, active_worlds);

    for (std::size_t world = 0; world < worlds.size(); ++world) {
        const WorldMask bit = WorldMask {1} << world;
        if ((active_worlds & bit) == 0) {
            continue;
        }

        const Position& position = worlds[world].position;
        hash_value(key, world);
        for (const Hand hand : position.deal.hands) {
            hash_value(key, hand);
        }
        hash_value(key, seat_index(position.current_trick.leader));
        hash_value(
            key,
            position.current_trick.trump_suit.has_value()
                ? static_cast<std::uint64_t>(*position.current_trick.trump_suit) + 1
                : 0);
        hash_value(key, position.current_trick.card_count);
        for (const Card card : position.current_trick.cards) {
            hash_value(key, card);
        }
        hash_value(key, position.score.north_south);
        hash_value(key, position.score.east_west);
        hash_value(key, position.played_cards);
        hash_value(key, position.completed_tricks);
    }
    return key;
}

void merge_max_front(ParetoFront& destination, const ParetoFront& source) {
    for (const OutcomeVector& vector : source.vectors) {
        add_to_pareto_front(destination, vector);
    }
}

WorldMask all_worlds_mask(std::size_t world_count) {
    return world_count == 64
        ? ~WorldMask {0}
        : (WorldMask {1} << world_count) - 1;
}

std::size_t first_world(WorldMask active_worlds) {
    return static_cast<std::size_t>(std::countr_zero(active_worlds));
}

std::vector<Card> ordered_cards(Hand cards, Card preferred = kNoCard) {
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

    const auto preferred_position = std::find(result.begin(), result.end(), preferred);
    if (preferred_position != result.end()) {
        std::rotate(result.begin(), preferred_position, preferred_position + 1);
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

const CachedNode* shallow_cached_node(
    const TranspositionEntry& entry,
    std::uint8_t depth) {
    for (int candidate = static_cast<int>(depth) - 1; candidate >= 0; --candidate) {
        if (entry.by_depth[static_cast<std::size_t>(candidate)].has_value()) {
            return &*entry.by_depth[static_cast<std::size_t>(candidate)];
        }
    }
    return nullptr;
}

NodeEvaluation alpha_mu_node(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    std::uint8_t max_moves_left,
    SearchContext& context,
    const ParetoFront* alpha,
    std::ostringstream* trace,
    std::size_t trace_depth);

std::shared_ptr<const AlphaMuPolicyNode> build_policy_for_outcome(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    std::uint8_t max_moves_left,
    OutcomeVector target,
    std::uint8_t starting_completed_tricks,
    SearchContext& context);

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
    for (const Card move : ordered_cards(legal_moves, preferred_move)) {
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

    // A move constrains only worlds where it is legal. Impossible worlds are
    // neutral 1 bits when defender alternatives are intersected.
    ParetoFront result {.vectors = {OutcomeVector {.wins = active_worlds}}};
    Card first_move = kNoCard;
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
    if (context.config.use_transposition_table) {
        key = make_node_key(worlds, active_worlds);
        ++context.stats.transposition_probes;
        const auto found = context.table.find(*key);
        if (found != context.table.end()) {
            cached_entry = &found->second;
            preferred_move = cached_entry->move_hint;
            const auto& exact = cached_entry->by_depth[max_moves_left];
            if (exact.has_value()) {
                ++context.stats.transposition_hits;
                trace_line(trace, trace_depth, "transposition hit");
                return NodeEvaluation {
                    .front = exact->front,
                    .best_move = exact->best_move,
                };
            }
        }
    }

    const Position& position = worlds[first_world(active_worlds)].position;
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
        context.config.use_early_cut &&
        alpha != nullptr &&
        !alpha->vectors.empty() &&
        cached_entry != nullptr) {
        const CachedNode* upper_bound =
            shallow_cached_node(*cached_entry, max_moves_left);
        if (upper_bound != nullptr &&
            pareto_front_is_covered_by(upper_bound->front, *alpha)) {
            ++context.stats.early_cuts;
            trace_line(trace, trace_depth, "MIN early cut");
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

struct DefenderPolicyBranch {
    Card card {kNoCard};
    WorldMask legal_worlds {};
    std::vector<AlphaMuWorld> child_worlds;
    ParetoFront child_front;
};

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
        for (const Card move : ordered_cards(legal_moves)) {
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

void accumulate_stats(AlphaMuSearchStats& destination, const AlphaMuSearchStats& source) {
    destination.nodes += source.nodes;
    destination.leaves += source.leaves;
    destination.dds_worlds += source.dds_worlds;
    destination.transposition_probes += source.transposition_probes;
    destination.transposition_hits += source.transposition_hits;
    destination.transposition_stores += source.transposition_stores;
    destination.early_cuts += source.early_cuts;
    destination.root_cuts += source.root_cuts;
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

    const std::optional<NodeKey> root_key = context.config.use_transposition_table
        ? std::optional<NodeKey> {make_node_key(worlds, active_worlds)}
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
    for (const Card move : ordered_cards(legal_moves, preferred_move)) {
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

        if (context.config.use_root_cut &&
            previous_score.has_value() &&
            best_winning_world_count(root_front) >= *previous_score) {
            ++context.stats.root_cuts;
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

AlphaMuResult alpha_mu_search(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config) {
    validate_worlds(worlds, config);
    if (config.max_declarer_plies > 13) {
        throw std::invalid_argument("alpha-mu supports at most 13 Max moves");
    }

    SearchContext context {.config = config};
    NodeEvaluation final_evaluation;
    std::vector<AlphaMuRootMove> final_root_moves;
    std::optional<std::size_t> previous_score;
    const std::uint8_t first_depth =
        config.use_iterative_deepening && config.max_declarer_plies > 0
            ? 1
            : config.max_declarer_plies;

    for (std::uint8_t depth = first_depth;
         depth <= config.max_declarer_plies;
         ++depth) {
        RootIteration iteration =
            search_root_iteration(worlds, depth, previous_score, context);
        final_evaluation = std::move(iteration.evaluation);
        final_root_moves = std::move(iteration.root_moves);
        previous_score = best_winning_world_count(final_evaluation.front);
        ++context.stats.completed_iterations;
        if (depth == config.max_declarer_plies) {
            break;
        }
    }

    std::shared_ptr<const AlphaMuPolicyNode> trick_policy;
    if (config.build_trick_policy) {
        SearchContext policy_context {.config = config};
        trick_policy = build_trick_policy(
            worlds,
            config,
            final_evaluation.best_move,
            policy_context);
        accumulate_stats(context.stats, policy_context.stats);
    }

    return AlphaMuResult {
        .best_move = final_evaluation.best_move,
        .front = std::move(final_evaluation.front),
        .root_moves = std::move(final_root_moves),
        .trick_policy = std::move(trick_policy),
        .stats = context.stats,
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

    SearchContext context {.config = config};
    std::ostringstream trace;
    const NodeEvaluation evaluation = alpha_mu_node(
        worlds,
        all_worlds_mask(worlds.size()),
        config.max_declarer_plies,
        context,
        nullptr,
        &trace,
        0);
    trace << "root " << format_front(evaluation.front, worlds.size()) << '\n';
    return trace.str();
}

}  // namespace bridge
