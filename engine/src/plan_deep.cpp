#include "bridge/plan_deep.h"
#include "bridge/plan_proof.h"
#include "alpha_mu_internal.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <limits>
#include <map>
#include <stdexcept>
#include <utility>

namespace bridge {
namespace {
using namespace alpha_mu_detail;
using Clock = std::chrono::steady_clock;
using Key = std::vector<std::uint64_t>;
using Branches = std::vector<std::pair<Card, PlanNodeId>>;
struct AccumulateTime {
    double& milliseconds;
    Clock::time_point start {Clock::now()};
    ~AccumulateTime() {
        milliseconds += std::chrono::duration<double, std::milli>(Clock::now() - start).count();
    }
};
void require(bool condition, const char* message) {
    if (!condition) throw std::invalid_argument(message);
}
bool valid_seat(Seat seat) {
    return seat == Seat::North || seat == Seat::East || seat == Seat::South || seat == Seat::West;
}
bool valid_suit(const std::optional<Suit>& suit) {
    return !suit || *suit == Suit::Clubs || *suit == Suit::Diamonds ||
        *suit == Suit::Hearts || *suit == Suit::Spades;
}

// The public proof routines infer the unknown pool from known hands and played
// cards. Validate that every layout accounts for the same full deck before
// permitting any public proof to stand for the entire information set.
void validate_position(const Position& position) {
    const auto& trick = position.current_trick;
    require(valid_seat(trick.leader) && valid_suit(trick.trump_suit) && trick.card_count < 4,
        "invalid deep-plan root trick");
    require((position.played_cards & ~kFullDeck) == 0 &&
        position.completed_tricks <= kRanksPerSuit &&
        position.score.north_south + position.score.east_west <= kRanksPerSuit,
        "invalid deep-plan root score or played cards");
    Hand held = kEmptyHand;
    std::array<unsigned, 4> hand_sizes {};
    for (std::size_t seat = 0; seat < 4; ++seat) {
        const auto hand = position.deal.hands[seat];
        require((hand & ~kFullDeck) == 0 && (hand & held) == 0 &&
            (hand & position.played_cards) == 0 && card_count(hand) <= kRanksPerSuit,
            "invalid or overlapping deep-plan root hands");
        held |= hand;
        hand_sizes[seat] = card_count(hand);
    }
    require((held | position.played_cards) == kFullDeck,
        "deep-plan root must account for every card");
    Hand trick_cards = kEmptyHand;
    Seat player = trick.leader;
    for (std::size_t i = 0; i < trick.cards.size(); ++i) {
        const Card card = trick.cards[i];
        if (i >= trick.card_count) {
            require(card == kNoCard, "deep-plan root has an unused trick card");
            continue;
        }
        require(is_single_card(card) && (card & kFullDeck) == card &&
            (card & (held | trick_cards)) == 0 && contains(position.played_cards, card),
            "invalid deep-plan root trick card");
        auto prefix = trick;
        prefix.card_count = static_cast<std::uint8_t>(i);
        require(is_legal_play(prefix, hand_of(position.deal, player) | card, card),
            "deep-plan root trick contains a revoke");
        trick_cards |= card;
        ++hand_sizes[seat_index(player)];
        player = next_seat(player);
    }
    require(hand_sizes[0] <= kRanksPerSuit &&
        std::all_of(hand_sizes.begin(), hand_sizes.end(),
            [&](unsigned size) { return size == hand_sizes[0]; }),
        "deep-plan root hand sizes disagree with its partial trick");
    require(hand_sizes[0] + position.score.north_south + position.score.east_west <= kRanksPerSuit &&
        hand_sizes[0] + position.completed_tricks <= kRanksPerSuit,
        "deep-plan root contains more than thirteen tricks");
}

double ms(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}
struct Choice { WorldMask wins {}; std::vector<WorldMask> children; };
void add_choice(std::vector<Choice>& choices, Choice candidate) {
    for (const auto& old : choices) if ((old.wins | candidate.wins) == old.wins) return;
    std::erase_if(choices, [&](const auto& old) { return (old.wins | candidate.wins) == candidate.wins; });
    choices.push_back(std::move(candidate));
}

class Builder {
public:
    Builder(AlphaMuConfig config, const PlanDeepOptions& options)
        : config_(std::move(config)), options_(options), context_{.config = config_}, started_(Clock::now()) {
        if (!std::isfinite(options.seconds) || options.seconds <= 0 || !options.max_nodes ||
            options.max_nodes >= kNoPlanNode || !options.max_contexts ||
            options.seconds >= std::chrono::duration<double>(Clock::time_point::max() - started_).count()) {
            throw std::invalid_argument("invalid deep-plan construction budget");
        }
        require(valid_seat(config_.declarer) && valid_suit(config_.trump_suit) &&
            config_.target_tricks <= kRanksPerSuit && config_.max_declarer_plies <= kMaxDeclarerPlies &&
            (!options_.max_stored_declarer_plies || *options_.max_stored_declarer_plies <= kMaxDeclarerPlies) &&
            std::isfinite(config_.max_search_seconds) && config_.max_search_seconds >= 0 &&
            std::isfinite(config_.weighted_score_tolerance) && config_.weighted_score_tolerance >= 0,
            "invalid deep-plan search configuration");
        config_.hard_time_limit = true;
        config_.build_trick_policy = false;
        context_.deadline = started_ + std::chrono::duration_cast<Clock::duration>(std::chrono::duration<double>(options.seconds));
        overall_deadline_ = *context_.deadline;
        result_.graph.declarer = config_.declarer;
        result_.graph.target_tricks = config_.target_tricks;
        result_.graph.completed_m = 0;
        result_.graph.variable_horizon = true;
        result_.graph.nodes.emplace_back(); // Always available unresolved result.
        instructions_[{static_cast<std::uint64_t>(PlanNodeKind::Frontier)}] = 0;
    }

    PlanDeepResult run(const std::vector<AlphaMuWorld>& worlds) {
        for (const auto& world : worlds) validate_position(world.position);
        validate_worlds(worlds, config_);
        const auto all = all_worlds_mask(worlds.size());
        require((config_.critical_worlds & ~all) == 0,
            "deep-plan critical worlds contain an invalid world index");
        double total_weight = 0;
        for (double weight : config_.world_weights) total_weight += weight;
        require(std::isfinite(total_weight), "deep-plan world weights overflow their total");
        const auto proof = terminal(worlds, all, false);
        if (available() && proof != PlanProofKind::None) {
            result_.graph.root = leaf(proof);
            result_.selected_wins = plan_proof_is_win(proof) ? all : 0;
            result_.value_complete = true;
            result_.graph.completed_m = config_.max_declarer_plies;
            context_.stats.completed_depth = config_.max_declarer_plies;
            if (options_.max_stored_declarer_plies && !result_.budget_exhausted) {
                result_.completed_storage_plies = *options_.max_stored_declarer_plies;
                result_.storage_passes = 1;
                result_.storage_horizon_complete = true;
            }
        } else if (available()) {
            const auto search_start = Clock::now();
            std::optional<ParetoFront> value;
            std::uint8_t completed = 0;
            bool value_limited = false;
            const bool iterative = config_.optimizations.iterative_deepening && config_.max_declarer_plies > 0;
            // Optional iterative mode retains the deepest completed value and
            // reserves half of the same overall budget for its instructions.
            if (iterative) context_.deadline = started_ +
                std::chrono::duration_cast<Clock::duration>(std::chrono::duration<double>(options_.seconds / 2));
            try {
                for (unsigned depth = iterative ? 1 : config_.max_declarer_plies; depth <= config_.max_declarer_plies; ++depth) {
                    value = value_at(worlds, all, static_cast<std::uint8_t>(depth));
                    completed = static_cast<std::uint8_t>(depth);
                    context_.stats.completed_depth = completed;
                    result_.graph.completed_m = completed;
                    ++context_.stats.completed_iterations;
                    if (depth == config_.max_declarer_plies) break;
                }
            } catch (const SearchDeadlineReached&) { value_limited = true; }
            result_.value_ms = ms(search_start);
            context_.deadline = overall_deadline_; // Never remove or extend it.
            if (value && available()) {
                    const auto selected = std::max_element(value->vectors.begin(), value->vectors.end(), [&](const auto& a, const auto& b) {
                        return alpha_mu_score_better(alpha_mu_outcome_score(b, config_.world_weights, config_.critical_worlds, all),
                            alpha_mu_outcome_score(a, config_.world_weights, config_.critical_worlds, all), config_.weighted_score_tolerance);
                    });
                    if (selected == value->vectors.end()) throw std::logic_error("empty deep-plan search front");
                    result_.selected_wins = selected->wins;
                    result_.value_complete = completed == config_.max_declarer_plies;
                    result_.graph.completed_m = completed;
                    const auto build_start = Clock::now();
                    if (options_.max_stored_declarer_plies) {
                        // Publish only a complete storage-depth pass. A later
                        // DFS can consume the budget in one subtree without
                        // replacing the previous broad, usable instructions.
                        const auto bound = std::min(completed, *options_.max_stored_declarer_plies);
                        for (unsigned stored = 0; stored <= bound; ++stored) {
                            const auto candidate = build(worlds, all, completed, selected->wins,
                                static_cast<std::uint8_t>(stored));
                            if (result_.budget_exhausted) break;
                            result_.graph.root = candidate;
                            result_.completed_storage_plies = static_cast<std::uint8_t>(stored);
                            ++result_.storage_passes;
                            result_.storage_horizon_complete = stored == *options_.max_stored_declarer_plies;
                        }
                    } else {
                        result_.graph.root = build(worlds, all, completed, selected->wins, completed);
                    }
                    result_.construction_ms = ms(build_start);
            }
            if (value_limited) {
                result_.budget_exhausted = true;
                if (result_.stop_reason == "none") result_.stop_reason = "value_depth_budget";
            }
        }
        compact();
        measure_plan_dag(result_.graph);
        result_.search_stats = context_.stats;
        result_.search_stats.tree_search_ms = result_.value_ms;
        result_.search_stats.policy_build_ms = result_.construction_ms;
        result_.total_ms = ms(started_);
        return std::move(result_);
    }

private:
    bool available() {
        if (result_.budget_exhausted || Clock::now() >= overall_deadline_) {
            if (!result_.budget_exhausted) result_.stop_reason = "time";
            result_.budget_exhausted = true;
            return false;
        }
        return true;
    }
    PlanProofKind terminal(const std::vector<AlphaMuWorld>& worlds, WorldMask active, bool allow_dds_loss) {
        const AccumulateTime timing {result_.terminal_ms};
        PlanProofKind reason = PlanProofKind::None;
        for (std::size_t i = 0; i < worlds.size(); ++i) {
            if (!(active & (WorldMask{1} << i))) continue;
            if (!available()) return PlanProofKind::None;
            PlanProofResult proof;
            const auto& p = worlds[i].position;
            if (same_side(player_to_act(p), config_.declarer)) {
                // These methods inspect only public state. Keep their cache
                // separate from layout-dependent defence/DDS conclusions.
                Key public_key {p.played_cards, p.completed_tricks, p.score.north_south, p.score.east_west,
                    seat_index(p.current_trick.leader), p.current_trick.card_count};
                for (Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West})
                    if (same_side(seat, config_.declarer)) public_key.push_back(hand_of(p.deal, seat));
                for (std::size_t j = 0; j < p.current_trick.card_count; ++j) public_key.push_back(p.current_trick.cards[j]);
                if (const auto cached = public_proofs_.find(public_key); cached != public_proofs_.end()) {
                    proof = cached->second; proof.states = 0; ++result_.public_proof_cache_hits;
                } else {
                    ++result_.proof_probes;
                    proof = prove_plan_terminal(p, config_, false);
                    if (available() && public_proofs_.size() < options_.max_contexts) public_proofs_.emplace(std::move(public_key), proof);
                }
                if (proof.kind == PlanProofKind::None && allow_dds_loss && available()) {
                    ++result_.proof_probes;
                    if (recheck_plan_proof(PlanProofKind::DdsLoss, p, config_)) proof.kind = PlanProofKind::DdsLoss;
                }
            } else {
                ++result_.proof_probes;
                proof = prove_plan_terminal(p, config_, allow_dds_loss);
            }
            result_.proof_states += proof.states;
            if (!available() || proof.kind == PlanProofKind::None) return PlanProofKind::None;
            // Known declaring hands, score and combined defender pool agree
            // across this information set. A public win covers every member.
            if (proof.win && proof.public_information) return proof.kind;
            if (proof.win) return PlanProofKind::None;
            if (reason == PlanProofKind::None) reason = proof.kind;
            else if (reason != proof.kind) reason = PlanProofKind::DdsLoss;
        }
        return reason;
    }
    ParetoFront value_at(const std::vector<AlphaMuWorld>& worlds, WorldMask active, std::uint8_t m) {
        const AccumulateTime timing {result_.value_probe_ms};
        ++result_.value_probes;
        if (!available() || Clock::now() >= *context_.deadline) throw SearchDeadlineReached{};
        return alpha_mu_node(worlds, active, active, m, context_, {}, nullptr, 0).front;
    }
    Key context_key(const std::vector<AlphaMuWorld>& worlds, WorldMask active, std::uint8_t m,
        WorldMask wins, std::uint8_t stored) {
        Key key {active, m, wins, stored};
        for (std::size_t i = 0; i < worlds.size(); ++i) {
            if (!(active & (WorldMask{1} << i))) continue;
            const auto& p = worlds[i].position;
            key.push_back(i);
            for (Hand hand : p.deal.hands) key.push_back(hand);
            key.push_back(p.played_cards); key.push_back(p.completed_tricks);
            key.push_back(p.score.north_south); key.push_back(p.score.east_west);
            key.push_back(seat_index(p.current_trick.leader));
            key.push_back(p.current_trick.trump_suit ? static_cast<std::uint64_t>(*p.current_trick.trump_suit) + 1 : 0);
            key.push_back(p.current_trick.card_count);
            for (std::size_t j = 0; j < p.current_trick.card_count; ++j) key.push_back(p.current_trick.cards[j]);
        }
        return key;
    }
    PlanNodeId intern(PlanTreeNode node, Branches branches = {}) {
        Key key {static_cast<std::uint64_t>(node.kind)};
        if (node.kind == PlanNodeKind::WinProof || node.kind == PlanNodeKind::LossProof) key.push_back(static_cast<std::uint64_t>(node.proof));
        if (node.kind == PlanNodeKind::Play) { key.push_back(seat_index(node.player)); key.push_back(node.card); key.push_back(node.next); }
        if (node.kind == PlanNodeKind::Observe) {
            key.push_back(seat_index(node.player));
            std::sort(branches.begin(), branches.end());
            for (auto [card, child] : branches) { key.push_back(card); key.push_back(child); }
        }
        if (const auto it = instructions_.find(key); it != instructions_.end()) return it->second;
        if (result_.graph.nodes.size() >= options_.max_nodes) {
            result_.budget_exhausted = true; result_.stop_reason = "nodes"; return 0;
        }
        if (branches.size() >= std::numeric_limits<std::uint32_t>::max() - result_.graph.edges.size()) {
            result_.budget_exhausted = true; return 0;
        }
        const auto id = static_cast<PlanNodeId>(result_.graph.nodes.size());
        if (node.kind == PlanNodeKind::Observe) {
            node.first_edge = static_cast<std::uint32_t>(result_.graph.edges.size());
            node.edge_count = static_cast<std::uint32_t>(branches.size());
            for (auto [card, child] : branches) result_.graph.edges.push_back({card, child});
        }
        result_.graph.nodes.push_back(node); instructions_.emplace(std::move(key), id);
        return id;
    }
    PlanNodeId leaf(PlanProofKind proof) {
        PlanTreeNode node;
        node.kind = plan_proof_is_win(proof) ? PlanNodeKind::WinProof : PlanNodeKind::LossProof;
        node.proof = proof;
        return intern(node);
    }
    PlanNodeId build(const std::vector<AlphaMuWorld>& worlds, WorldMask active, std::uint8_t m,
        WorldMask wins, std::uint8_t stored) {
        if (!available()) return 0;
        auto key = context_key(worlds, active, m, wins, stored);
        if (const auto it = contexts_.find(key); it != contexts_.end()) { ++result_.context_hits; return it->second; }
        PlanNodeId id = 0;
        try {
            const auto proof = terminal(worlds, active, wins == 0);
            if (!available()) return 0;
            if (proof != PlanProofKind::None) return leaf(proof);
            else {
                const auto& p = worlds[first_world(active)].position;
                const auto player = player_to_act(p);
                // Search and storage horizons stop instructions independently.
                // Both still allow the final defensive responses after all
                // declaring cards are gone, and both check proofs first.
                Hand declaring_cards = 0;
                for (Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West})
                    if (same_side(seat, config_.declarer)) declaring_cards |= hand_of(p.deal, seat);
                if ((m == 0 || stored == 0) &&
                    (declaring_cards != 0 || same_side(player, config_.declarer))) return 0;
                if (result_.contexts >= options_.max_contexts) {
                    result_.budget_exhausted = true; result_.stop_reason = "contexts"; return 0;
                }
                ++result_.contexts;
                if (same_side(player, config_.declarer)) {
                    if (m == 0) return 0;
                    bool found = false;
                    for (Card move : representative_cards(p, shared_declarer_moves(worlds, active), kNoCard, context_)) {
                        auto child = worlds;
                        for (std::size_t i = 0; i < worlds.size(); ++i) if (active & (WorldMask{1} << i)) play_card(child[i].position, move);
                        const auto front = value_at(child, active, m - 1);
                        if (!available()) return 0;
                        if (std::none_of(front.vectors.begin(), front.vectors.end(), [&](auto value) { return value.wins == wins; })) continue;
                        const auto next = build(child, active, m - 1, wins, stored - 1);
                        id = intern({.kind = PlanNodeKind::Play, .player = player, .card = move, .next = next});
                        found = true; break;
                    }
                    if (!found) throw std::logic_error("deep plan could not reconstruct MAX outcome");
                } else {
                    struct Child { Card card; WorldMask active; std::vector<AlphaMuWorld> worlds; ParetoFront front; };
                    std::vector<Child> children;
                    for (Card move : ordered_cards(union_of_defender_moves(worlds, active))) {
                        Child child {move, 0, worlds, {}};
                        for (std::size_t i = 0; i < worlds.size(); ++i) {
                            if (!(active & (WorldMask{1} << i)) || !is_legal_play(p.current_trick, hand_of(worlds[i].position.deal, player), move)) continue;
                            child.active |= WorldMask{1} << i; play_card(child.worlds[i].position, move);
                        }
                        if (!child.active) continue;
                        child.front = value_at(child.worlds, child.active, m);
                        children.push_back(std::move(child));
                    }
                    std::vector<Choice> choices {{active, {}}};
                    for (const auto& child : children) {
                        std::vector<Choice> combined;
                        for (const auto& old : choices) for (auto outcome : child.front.vectors) {
                            if (!available()) return 0;
                            Choice candidate = old;
                            candidate.wins &= outcome.wins | (active & ~child.active);
                            candidate.children.push_back(outcome.wins); add_choice(combined, std::move(candidate));
                        }
                        choices = std::move(combined);
                    }
                    const auto selected = std::find_if(choices.begin(), choices.end(), [&](const auto& choice) { return choice.wins == wins; });
                    if (selected == choices.end()) throw std::logic_error("deep plan could not reconstruct MIN outcome");
                    Branches branches;
                    for (std::size_t i = 0; i < children.size(); ++i) {
                        const auto& child = children[i];
                        branches.emplace_back(child.card, build(child.worlds, child.active, m, selected->children[i], stored));
                    }
                    id = intern({.kind = PlanNodeKind::Observe, .player = player}, std::move(branches));
                }
            }
        } catch (const SearchDeadlineReached&) {
            result_.budget_exhausted = true;
            if (result_.stop_reason == "none") result_.stop_reason = "time";
            return 0;
        }
        contexts_.emplace(std::move(key), id);
        return id;
    }
    void compact() {
        auto& graph = result_.graph;
        std::vector<bool> used(graph.nodes.size()); used[graph.root] = true;
        for (std::size_t i = graph.nodes.size(); i-- > 0;) if (used[i]) {
            const auto& node = graph.nodes[i];
            if (node.kind == PlanNodeKind::Play) used[node.next] = true;
            if (node.kind == PlanNodeKind::Observe) for (std::size_t j = 0; j < node.edge_count; ++j) used[graph.edges[node.first_edge + j].next] = true;
        }
        std::vector<PlanNodeId> remap(graph.nodes.size());
        std::vector<PlanTreeNode> nodes;
        std::vector<PlanTreeEdge> edges;
        for (std::size_t i = 0; i < graph.nodes.size(); ++i) if (used[i]) {
            auto node = graph.nodes[i]; remap[i] = static_cast<PlanNodeId>(nodes.size());
            if (node.kind == PlanNodeKind::Play) node.next = remap[node.next];
            if (node.kind == PlanNodeKind::Observe) {
                node.first_edge = static_cast<std::uint32_t>(edges.size());
                for (std::size_t j = 0; j < node.edge_count; ++j) {
                    const auto& edge = graph.edges[graph.nodes[i].first_edge + j]; edges.push_back({edge.observation, remap[edge.next]});
                }
            }
            nodes.push_back(node);
        }
        graph.root = remap[graph.root]; graph.nodes = std::move(nodes); graph.edges = std::move(edges);
    }

    AlphaMuConfig config_;
    PlanDeepOptions options_;
    SearchContext context_;
    Clock::time_point started_;
    Clock::time_point overall_deadline_;
    PlanDeepResult result_;
    std::map<Key, PlanNodeId> contexts_, instructions_;
    std::map<Key, PlanProofResult> public_proofs_;
};
}
PlanDeepResult build_deep_plan(const std::vector<AlphaMuWorld>& worlds, AlphaMuConfig config, const PlanDeepOptions& options) {
    return Builder(std::move(config), options).run(worlds);
}
} // namespace bridge
