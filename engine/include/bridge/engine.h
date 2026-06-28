#pragma once

#include <array>
#include <cstddef>
#include <optional>
#include <string>
#include <vector>

#include "bridge/card.h"

namespace bridge {

struct PlayerView {
    Seat seat {};
    Hand hand {kEmptyHand};
};

struct AnalysisRequest {
    PlayerView declarer;
    PlayerView dummy;
};

struct AnalysisResult {
    std::size_t unseen_card_count {};
    std::string summary;
};

struct Deal {
    std::array<Hand, 4> hands {kEmptyHand, kEmptyHand, kEmptyHand, kEmptyHand};
};

struct Trick {
    Seat leader {Seat::North};
    std::optional<Suit> trump_suit {};
    std::array<Card, 4> cards {kNoCard, kNoCard, kNoCard, kNoCard};
    std::uint8_t card_count {};
};

struct Score {
    std::uint8_t north_south {};
    std::uint8_t east_west {};
};

struct Position {
    Deal deal {};
    Trick current_trick {};
    Score score {};
    Hand played_cards {kEmptyHand};
    std::uint8_t completed_tricks {};
};

struct HandSamplingConstraints {
    std::array<std::uint8_t, 4> min_lengths {};
    std::array<std::uint8_t, 4> max_lengths {
        kRanksPerSuit,
        kRanksPerSuit,
        kRanksPerSuit,
        kRanksPerSuit,
    };
    std::uint8_t min_hcp {};
    std::uint8_t max_hcp {37};
};

struct SamplingDebugInfo {
    std::array<std::array<std::uint64_t, 38>, 14> final_dp {};
};

struct DoubleDummyTable {
    std::array<std::array<int, 4>, 5> tricks {};
};

using WorldMask = std::uint64_t;

struct AlphaMuWorld {
    Position position {};
};

struct AlphaMuConfig {
    Seat declarer {Seat::South};
    std::optional<Suit> trump_suit {};
    std::uint8_t target_tricks {};
    std::uint8_t max_declarer_plies {};
};

struct AlphaMuVector {
    WorldMask wins {};
};

struct AlphaMuFront {
    std::vector<AlphaMuVector> vectors;
};

struct AlphaMuResult {
    Card best_move {kNoCard};
    AlphaMuFront front {};
};

AnalysisResult analyze(const AnalysisRequest& request);
Hand hand_of(const Deal& deal, Seat seat);
Hand& hand_of(Deal& deal, Seat seat);
bool has_full_deal(const Deal& deal);
std::uint8_t high_card_points(Hand hand);
std::uint64_t count_constrained_hands(
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards,
    const HandSamplingConstraints& constraints,
    std::uint8_t target_card_count = kRanksPerSuit);
std::optional<Hand> sample_constrained_hand(
    Hand available_cards,
    const HandSamplingConstraints& constraints,
    std::uint64_t random_seed,
    std::uint8_t target_card_count = kRanksPerSuit);
SamplingDebugInfo sampling_debug_info(
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards,
    const HandSamplingConstraints& constraints,
    std::uint8_t target_card_count = kRanksPerSuit);
Hand legal_plays(const Trick& trick, Hand hand);
bool is_legal_play(const Trick& trick, Hand hand, Card card);
Seat next_to_play(const Trick& trick);
void add_card_to_trick(Trick& trick, Hand& hand, Card card);
Card card_played_by(const Trick& trick, Seat seat);
Seat winning_seat(const Trick& trick);
std::string format_deal(const Deal& deal);
bool same_side(Seat a, Seat b);
Score score_of(const Position& position);
bool is_deal_finished(const Position& position);
void play_card(Position& position, Card card);
std::string format_trick(const Trick& trick);
std::vector<Hand> equivalent_play_groups(const Trick& trick, Hand legal_moves, Hand hand, Hand played_cards);
std::string format_card_list(Hand cards);
std::string format_sampling_debug_table(const SamplingDebugInfo& debug_info, std::uint8_t max_hcp);
DoubleDummyTable solve_double_dummy_table(const Deal& deal);
int double_dummy_tricks(const Deal& deal, Seat declarer, std::optional<Suit> trump_suit);
AlphaMuResult alpha_mu_search(const std::vector<AlphaMuWorld>& worlds, const AlphaMuConfig& config);
std::string format_alpha_mu_front(const AlphaMuFront& front, std::size_t world_count);
std::string alpha_mu_debug_tree(const std::vector<AlphaMuWorld>& worlds, const AlphaMuConfig& config);

}  // namespace bridge
