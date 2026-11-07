#include "bridge/plan_challenge.h"

#include "bridge/dds_solver.h"
#include "bridge/claim.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <set>
#include <stdexcept>
#include <utility>
#include <unordered_set>

namespace bridge {
namespace {

bool valid_seat(Seat seat) {
    return static_cast<int>(seat) >= 0 && static_cast<int>(seat) < 4;
}

bool valid_suit(const std::optional<Suit>& suit) {
    return !suit || (static_cast<int>(*suit) >= 0 && static_cast<int>(*suit) < 4);
}

void require(bool condition, const char* message) {
    if (!condition) throw std::invalid_argument(message);
}

std::uint8_t declarer_score(const Position& position, Seat declarer) {
    return same_side(declarer, Seat::North)
        ? position.score.north_south : position.score.east_west;
}

void validate_position(const Position& position) {
    const auto& trick = position.current_trick;
    require(valid_seat(trick.leader) && valid_suit(trick.trump_suit) &&
        trick.card_count < 4, "invalid challenger trick");
    require((position.played_cards & ~kFullDeck) == 0 &&
        position.completed_tricks <= kRanksPerSuit &&
        position.score.north_south + position.score.east_west <= kRanksPerSuit,
        "invalid challenger score or played cards");

    Hand held = kEmptyHand;
    std::array<unsigned, 4> hand_sizes {};
    for (std::size_t seat = 0; seat < 4; ++seat) {
        const Hand hand = position.deal.hands[seat];
        require((hand & ~kFullDeck) == 0 && (held & hand) == 0 &&
            (position.played_cards & hand) == 0 && card_count(hand) <= kRanksPerSuit,
            "invalid or overlapping challenger hands");
        held |= hand;
        hand_sizes[seat] = card_count(hand);
    }
    Hand trick_cards = kEmptyHand;
    Seat player = trick.leader;
    for (std::size_t i = 0; i < trick.card_count; ++i) {
        const Card card = trick.cards[i];
        require(is_single_card(card) && (card & kFullDeck) == card &&
            (card & (held | trick_cards)) == 0, "invalid challenger trick card");
        trick_cards |= card;
        ++hand_sizes[seat_index(player)];
        player = next_seat(player);
    }
    require(hand_sizes[0] <= kRanksPerSuit &&
        std::all_of(hand_sizes.begin(), hand_sizes.end(),
            [&](unsigned size) { return size == hand_sizes[0]; }),
        "challenger hand sizes disagree with its partial trick");
    require(hand_sizes[0] + position.score.north_south +
        position.score.east_west <= kRanksPerSuit,
        "challenger contains more than thirteen tricks");
}

// Exact context equality deduplicates repeated discoveries of one diagnosed
// failure, without treating a shared instruction as a shared execution state.
std::vector<std::uint64_t> witness_key(const PlanFailureWitness& witness) {
    const auto& position = witness.position;
    std::vector<std::uint64_t> key {
        static_cast<std::uint64_t>(witness.kind), witness.node, witness.card,
        witness.making_moves, witness.diagnosed_choice,
        position.deal.hands[0], position.deal.hands[1],
        position.deal.hands[2], position.deal.hands[3],
        position.played_cards, position.completed_tricks,
        position.score.north_south, position.score.east_west,
        seat_index(position.current_trick.leader),
        position.current_trick.trump_suit
            ? static_cast<std::uint64_t>(*position.current_trick.trump_suit) + 1 : 0,
        position.current_trick.card_count,
    };
    for (std::size_t i = 0; i < position.current_trick.card_count; ++i) {
        key.push_back(position.current_trick.cards[i]);
    }
    return key;
}

// A node can occur after many different histories. Equality includes every
// current-position field, including concrete remaining hands and the complete
// partial trick; instruction sharing alone never permits cached execution.
using EvaluationContext = std::array<std::uint64_t, 16>;
EvaluationContext evaluation_context(PlanNodeId node, const Position& position) {
    const auto& trick = position.current_trick;
    return {node,
        position.deal.hands[0], position.deal.hands[1],
        position.deal.hands[2], position.deal.hands[3],
        position.played_cards, position.completed_tricks,
        position.score.north_south, position.score.east_west,
        seat_index(trick.leader),
        trick.trump_suit ? static_cast<std::uint64_t>(*trick.trump_suit) + 1 : 0,
        trick.card_count, trick.cards[0], trick.cards[1], trick.cards[2], trick.cards[3]};
}
struct EvaluationContextHash {
    std::size_t operator()(const EvaluationContext& key) const {
        std::uint64_t hash = 0;
        for (const auto value : key) {
            hash ^= value + 0x9e3779b97f4a7c15ULL + (hash << 6) + (hash >> 2);
        }
        return static_cast<std::size_t>(hash);
    }
};

class PlanEvaluator {
public:
    PlanEvaluator(Position root, const PlanDag& graph,
        const AlphaMuConfig& config, const PlanEvaluationOptions& options)
        : root_(std::move(root)), graph_(graph), config_(config), options_(options),
          started_(Clock::now()) {}

    PlanEvaluation run() {
        require(options_.max_witnesses > 0 && options_.max_frontiers > 0 && options_.max_nodes > 0 &&
            std::isfinite(options_.max_seconds) && options_.max_seconds >= 0.0,
            "invalid plan evaluation budget");
        require(!options_.mine_partial_plan || options_.frontier_mode == PlanFrontierMode::Dds,
            "partial-plan mining requires DDS frontier evaluation");
        require(valid_seat(config_.declarer) && valid_suit(config_.trump_suit) &&
            config_.target_tricks <= kRanksPerSuit &&
            config_.declarer == graph_.declarer &&
            config_.target_tricks == graph_.target_tricks &&
            config_.trump_suit == root_.current_trick.trump_suit,
            "plan evaluation metadata mismatch");
        validate_position(root_);
        (void)measure_plan_dag(graph_); // Full validation once, before traversal.
        path_.reserve(kDeckSize);
        visit(root_, graph_.root);
        result_.complete = !stopped_;
        result_.survives_horizon = result_.complete && result_.failures.empty() &&
            result_.unresolved_frontiers.empty() && result_.coverage_gaps == 0;
        result_.proven_contract = result_.survives_horizon && result_.frontier_survivors == 0;
        return std::move(result_);
    }

private:
    using Clock = std::chrono::steady_clock;

    bool time_available() {
        if (stopped_) return false;
        if (options_.max_seconds > 0.0 &&
            std::chrono::duration<double>(Clock::now() - started_).count() >=
                options_.max_seconds) {
            stopped_ = true;
            return false;
        }
        return true;
    }

    bool branch_available() {
        if (!time_available()) return false;
        if (result_.failures.size() >= options_.max_witnesses) {
            stopped_ = true;
            return false;
        }
        if (result_.unresolved_frontiers.size() >= options_.max_frontiers) {
            stopped_ = true;
            return false;
        }
        return true;
    }

    void diagnose(PlanFailureWitness& witness) {
        if (!options_.diagnose_losses) return;
        Position position = root_;
        PlanNodeId node_id = graph_.root;
        for (std::size_t i = 0; i < witness.path.size(); ++i) {
            if (!time_available()) return;
            const auto& step = witness.path[i];
            const auto& node = graph_.nodes[node_id];
            if (node.kind == PlanNodeKind::Frontier ||
                step.player != next_to_play(position.current_trick) ||
                !is_legal_play(position.current_trick,
                    hand_of(position.deal, step.player), step.card)) return;
            if (same_side(step.player, config_.declarer)) {
                ++result_.dds_calls;
                const auto scores = double_dummy_move_scores(position, config_.declarer);
                Hand making = kEmptyHand;
                for (const auto& score : scores) {
                    if (declarer_score(position, config_.declarer) +
                        score.future_tricks >= config_.target_tricks) {
                        making |= score.card;
                    }
                }
                const bool selected_scored = std::any_of(scores.begin(), scores.end(),
                    [&](const auto& score) { return score.card == step.card; });
                if (making != kEmptyHand && selected_scored && !contains(making, step.card)) {
                    witness.position = position;
                    witness.node = node_id;
                    witness.card = step.card;
                    witness.making_moves = making;
                    witness.diagnosed_choice = true;
                    witness.path.resize(i + 1);
                    (void)time_available();
                    return;
                }
                if (!time_available()) return;
            }
            const auto next = advance_plan_dag(graph_, node_id, step.player, step.card);
            if (!next) return;
            play_card(position, step.card);
            node_id = *next;
        }
    }

    void failure(PlanFailureKind kind, PlanNodeId node,
        const Position& position, Card card = kNoCard,
        std::optional<PlanFrontierReason> frontier_reason = std::nullopt) {
        // A duplicate diagnostic is still a failed execution. Count events,
        // not stored witnesses, when deciding whether a subtree can be cached.
        ++failure_events_;
        if (kind == PlanFailureKind::MissingObservation) ++result_.coverage_gaps;
        else if (kind == PlanFailureKind::DdLoss) ++result_.dd_losses;
        else ++result_.illegal_instructions;
        PlanFailureWitness witness {
            .kind = kind,
            .node = node,
            .position = position,
            .card = card,
            .path = path_,
            .frontier_reason = frontier_reason,
        };
        if (kind == PlanFailureKind::MissingObservation && options_.mine_partial_plan) {
            if (result_.coverage_gap_witnesses.size() < options_.max_partial_witnesses) {
                result_.coverage_gap_witnesses.push_back(std::move(witness));
            }
            return;
        }
        if (kind == PlanFailureKind::DdLoss) diagnose(witness);
        if (seen_.insert(witness_key(witness)).second) {
            result_.failures.push_back(std::move(witness));
        }
    }

    void dd_frontier(const Position& position, PlanNodeId id, PlanFrontierReason reason) {
        if (!time_available()) return;
        ++result_.dds_calls;
        const auto future = double_dummy_future_tricks(position, config_.declarer);
        if (declarer_score(position, config_.declarer) + future >= config_.target_tricks) {
            ++result_.frontier_survivors;
            if (options_.mine_partial_plan &&
                result_.dd_feasible_frontier_witnesses.size() < options_.max_partial_witnesses) {
                result_.dd_feasible_frontier_witnesses.push_back({id, position, path_, reason});
            }
        } else {
            failure(PlanFailureKind::DdLoss, id, position, kNoCard, reason);
        }
        (void)time_available();
    }

    void visit(Position position, PlanNodeId id) {
        if (!branch_available()) return;
        std::optional<EvaluationContext> key;
        if (options_.max_cached_contexts) {
            key = evaluation_context(id, position);
            if (successful_.contains(*key)) {
                if (!time_available()) return;
                ++result_.cache_hits;
                return;
            }
        }
        if (result_.visited_nodes >= options_.max_nodes) {
            stopped_ = true;
            return;
        }
        ++result_.visited_nodes;
        const auto failures_before = failure_events_;
        const auto unresolved_before = result_.unresolved_frontiers.size();
        visit_uncached(std::move(position), id);
        if (key && time_available() && failures_before == failure_events_ &&
            unresolved_before == result_.unresolved_frontiers.size() &&
            successful_.size() < options_.max_cached_contexts) {
            // DDS success is safe to reuse only as horizon survival. Its
            // original frontier_survivors increment stays in the result, so
            // reusing it cannot upgrade a run into a full-contract proof.
            successful_.insert(std::move(*key));
        }
    }

    void visit_uncached(Position position, PlanNodeId id) {
        // These precede Frontier: a terminal position needs no DDS call, and
        // reaching the target succeeds even if no further instruction exists.
        if (declarer_score(position, config_.declarer) >= config_.target_tricks) return;
        if (is_deal_finished(position)) {
            failure(PlanFailureKind::DdLoss, id, position);
            return;
        }
        const auto& node = graph_.nodes[id];
        if (node.kind == PlanNodeKind::WinProof || node.kind == PlanNodeKind::LossProof) {
            ++result_.checked_proofs;
            if (node.proof == PlanProofKind::DdsLoss) ++result_.dds_calls;
            const bool proved = recheck_plan_proof(node.proof, position, config_);
            if (!time_available()) return;
            if (!proved) {
                ++result_.rejected_proofs;
                if (options_.mine_partial_plan) {
                    dd_frontier(position, id, PlanFrontierReason::RejectedProof);
                } else {
                    result_.unresolved_frontiers.push_back(
                        {id, position, path_, PlanFrontierReason::RejectedProof});
                }
            } else if (node.kind == PlanNodeKind::WinProof) {
                ++result_.public_claims;
            } else {
                failure(PlanFailureKind::DdLoss, id, position);
            }
            return;
        }
        if (node.kind == PlanNodeKind::Frontier) {
            if (!time_available()) return;
            if (options_.frontier_mode != PlanFrontierMode::Dds) {
                bool proven = false;
                if (options_.frontier_mode == PlanFrontierMode::PublicClaim) {
                    proven = prove_declarer_claim(position, config_.declarer,
                        static_cast<std::uint8_t>(config_.target_tricks -
                            declarer_score(position, config_.declarer))).proven;
                }
                if (proven) ++result_.public_claims;
                else result_.unresolved_frontiers.push_back({id, position, path_});
                (void)time_available();
                return;
            }
            dd_frontier(position, id, PlanFrontierReason::StoredFrontier);
            return;
        }

        const Seat player = next_to_play(position.current_trick);
        const bool declarer_turn = same_side(player, config_.declarer);
        const Hand legal = legal_plays(position.current_trick, hand_of(position.deal, player));
        if (node.player != player ||
            (declarer_turn ? node.kind != PlanNodeKind::Play : node.kind != PlanNodeKind::Observe)) {
            failure(PlanFailureKind::IllegalInstruction, id, position);
            return;
        }
        if (node.kind == PlanNodeKind::Play) {
            path_.push_back({player, node.card});
            if (!contains(legal, node.card)) {
                failure(PlanFailureKind::IllegalInstruction, id, position, node.card);
            } else {
                play_card(position, node.card);
                visit(std::move(position), node.next);
            }
            path_.pop_back();
            return;
        }

        // Exact cards, including touching equivalents, are observations of the
        // stored program. DDS never chooses or substitutes a declarer action.
        for (int bit = kDeckSize - 1; bit >= 0; --bit) {
            const Card card = Card {1} << bit;
            if (!contains(legal, card)) continue;
            if (!branch_available()) return;
            path_.push_back({player, card});
            const auto child_id = advance_plan_dag(graph_, id, player, card);
            if (!child_id) {
                failure(PlanFailureKind::MissingObservation, id, position, card,
                    PlanFrontierReason::MissingObservation);
                if (options_.mine_partial_plan) {
                    // The observed defensive play has happened. Store/check
                    // that resulting position; never ask DDS to choose the
                    // next declarer instruction for the frozen program.
                    Position child = position;
                    play_card(child, card);
                    dd_frontier(child, id, PlanFrontierReason::MissingObservation);
                }
            } else {
                Position child = position;
                play_card(child, card);
                visit(std::move(child), *child_id);
            }
            path_.pop_back();
            if (stopped_) return;
        }
    }

    Position root_;
    const PlanDag& graph_;
    const AlphaMuConfig& config_;
    const PlanEvaluationOptions& options_;
    Clock::time_point started_;
    PlanEvaluation result_;
    bool stopped_ {};
    std::size_t failure_events_ {};
    std::vector<AlphaMuPolicyStep> path_;
    std::set<std::vector<std::uint64_t>> seen_;
    std::unordered_set<EvaluationContext, EvaluationContextHash> successful_;
};

} // namespace

PlanEvaluation evaluate_plan_dag(Position position, const PlanDag& graph,
    const AlphaMuConfig& config, const PlanEvaluationOptions& options) {
    return PlanEvaluator(std::move(position), graph, config, options).run();
}

} // namespace bridge
