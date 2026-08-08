#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "bridge/alpha_mu2.h"
#include "bridge/defender.h"
#include "bridge/engine.h"

namespace bridge {

// Parses four suit holdings in SHDC order, for example "AJ32.A.-.-".
std::optional<Hand> parse_hand_record(std::string_view text);

struct BotSettings {
    std::size_t world_count {30};
    std::uint8_t max_declarer_plies {2};
    std::uint8_t target_tricks {1};
    std::uint64_t random_seed {0xB07B07ULL};
    double max_search_seconds {30.0};
    AlphaMuOptimizations optimizations {};
    bool collect_audit_log {false};
    bool compare_all_root_moves {false};
};

struct SeatRestrictions {
    Hand required_cards {kEmptyHand};
    Hand forbidden_cards {kEmptyHand};
    HandSamplingConstraints hand;
};

struct DefenderRestrictions {
    SeatRestrictions east;
    SeatRestrictions west;
};

struct SessionAnalysis {
    AlphaMuResult search;
    std::vector<AlphaMuWorld> worlds;
    std::uint64_t possible_deals {};
    std::size_t unique_worlds {};
    double sampling_ms {};
    double search_ms {};
};

struct AlphaMu2SessionSettings {
    std::size_t reservoir_world_count {256};
    std::size_t initial_active_worlds {30};
    std::size_t max_active_worlds {64};
    std::size_t max_refinement_rounds {2};
    std::size_t counterexamples_per_round {3};
    std::size_t adversarial_world_count {64};
    std::size_t persistent_challenge_limit {32};
    double critical_weighted_tolerance {0.005};
    bool persist_challenge_worlds {true};
};

struct AlphaMu2SessionAnalysis {
    AlphaMu2Result search;
    std::uint64_t possible_deals {};
    std::size_t unique_reservoir_worlds {};
    std::size_t adversarial_worlds {};
    std::size_t persistent_worlds_reused {};
    std::size_t persistent_worlds_retained {};
    double sampling_ms {};
};

struct OptimizationBenchmarkRun {
    AlphaMuResult search;
    double search_ms {};
};

struct OptimizationBenchmark {
    AlphaMuOptimization optimization {AlphaMuOptimization::TranspositionTable};
    std::uint64_t possible_deals {};
    std::size_t sampled_worlds {};
    std::size_t unique_worlds {};
    double sampling_ms {};
    OptimizationBenchmarkRun disabled;
    OptimizationBenchmarkRun enabled;
};

class AnalysisSession {
public:
    AnalysisSession(Deal actual_deal, Seat leader, std::optional<Suit> trump_suit);

    const Position& position() const;
    const Deal& original_deal() const;
    const BotSettings& settings() const;
    void set_settings(BotSettings settings);
    const DefenderRestrictions& defender_restrictions() const;
    void set_defender_restrictions(DefenderRestrictions restrictions);
    std::uint64_t possible_deals() const;

    SessionAnalysis analyze();
    AlphaMu2SessionAnalysis analyze2(
        AlphaMu2SessionSettings settings = {});
    OptimizationBenchmark benchmark(AlphaMuOptimization optimization);
    std::optional<Card> policy_move() const;
    DefenderDecision defender_move(
        std::string_view hold_order = "SHDC") const;
    void play(Card card);
    bool undo();
    void replay();

    std::string public_diagram() const;
    std::string full_diagram() const;
    std::string known_voids() const;

private:
    using VoidTable = std::array<std::array<bool, 4>, 4>;

    struct Snapshot {
        Position position;
        VoidTable voids;
        std::uint64_t analysis_number {};
        std::shared_ptr<const AlphaMuPolicyNode> policy;
        std::vector<AlphaMuWorld> challenge_worlds;
    };

    struct SampledWorlds {
        std::vector<AlphaMuWorld> worlds;
        std::uint64_t possible_deals {};
        std::size_t unique_worlds {};
        double sampling_ms {};
    };

    struct SamplingRequest {
        Hand available_cards {kEmptyHand};
        Hand included_cards {kEmptyHand};
        Hand excluded_cards {kEmptyHand};
        HandSamplingConstraints constraints;
        std::uint8_t target_card_count {};
    };

    SeatRestrictions remaining_restrictions(Seat seat, Hand defender_cards) const;
    SamplingRequest sampling_request() const;
    SampledWorlds sample_worlds(std::size_t world_count);
    bool sampling_request_accepts(Hand east_hand) const;
    std::vector<AlphaMuWorld> generate_adversarial_worlds(
        const std::vector<AlphaMuWorld>& probability_worlds,
        std::size_t maximum) const;
    void advance_challenge_worlds(Card card);
    AlphaMuConfig search_config(bool build_policy) const;
    void advance_policy(Seat player, Card card);

    Deal original_deal_ {};
    Position initial_position_ {};
    Position position_ {};
    BotSettings settings_ {};
    DefenderRestrictions restrictions_ {};
    VoidTable voids_ {};
    std::uint64_t analysis_number_ {};
    std::shared_ptr<const AlphaMuPolicyNode> policy_;
    std::vector<AlphaMuWorld> challenge_worlds_;
    std::vector<Snapshot> history_;
};

}  // namespace bridge
