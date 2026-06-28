#include <bit>
#include <iostream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "bridge/engine.h"

namespace {

using bridge::Card;
using bridge::Hand;
using bridge::HandSamplingConstraints;
using bridge::Rank;
using bridge::Seat;
using bridge::Suit;
using bridge::Trick;

void require(bool condition, const std::string& message) {
    if (!condition) {
        throw std::runtime_error(message);
    }
}

std::vector<Card> ordered_cards(Hand cards) {
    std::vector<Card> result;
    for (const Suit suit : {Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        for (int rank_value = static_cast<int>(Rank::Ace);
             rank_value >= static_cast<int>(Rank::Two);
             --rank_value) {
            const Card card = bridge::make_card(suit, static_cast<Rank>(rank_value));
            if (bridge::contains(cards, card)) {
                result.push_back(card);
            }
        }
    }
    return result;
}

std::uint64_t brute_force_count(
    Hand available_cards,
    const HandSamplingConstraints& constraints,
    std::uint8_t target_card_count) {
    const auto cards = ordered_cards(available_cards);
    const std::size_t n = cards.size();

    std::uint64_t total = 0;
    for (std::uint64_t mask = 0; mask < (1ULL << n); ++mask) {
        if (std::popcount(mask) != target_card_count) {
            continue;
        }

        Hand hand = bridge::kEmptyHand;
        for (std::size_t i = 0; i < n; ++i) {
            if ((mask & (1ULL << i)) != 0) {
                hand = bridge::add_card(hand, cards[i]);
            }
        }

        if (bridge::high_card_points(hand) < constraints.min_hcp) {
            continue;
        }

        bool shape_ok = true;
        for (const Suit suit : {Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades}) {
            const auto suit_count = bridge::card_count(bridge::cards_in_suit(hand, suit));
            if (suit_count < constraints.min_lengths[static_cast<std::uint8_t>(suit)] ||
                suit_count > constraints.max_lengths[static_cast<std::uint8_t>(suit)]) {
                shape_ok = false;
                break;
            }
        }

        if (shape_ok) {
            ++total;
        }
    }

    return total;
}

bridge::Deal sample_dds_deal() {
    return bridge::Deal {
        .hands = {
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Ace),
                bridge::make_card(Suit::Spades, Rank::King),
                bridge::make_card(Suit::Spades, Rank::Nine),
                bridge::make_card(Suit::Spades, Rank::Eight),
                bridge::make_card(Suit::Spades, Rank::Seven),
                bridge::make_card(Suit::Hearts, Rank::Two),
                bridge::make_card(Suit::Hearts, Rank::Three),
                bridge::make_card(Suit::Clubs, Rank::Queen),
                bridge::make_card(Suit::Clubs, Rank::Jack),
                bridge::make_card(Suit::Clubs, Rank::Four),
                bridge::make_card(Suit::Clubs, Rank::Eight),
                bridge::make_card(Suit::Clubs, Rank::Five),
                bridge::make_card(Suit::Clubs, Rank::Two),
            }),
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Spades, Rank::Jack),
                bridge::make_card(Suit::Spades, Rank::Six),
                bridge::make_card(Suit::Hearts, Rank::Ace),
                bridge::make_card(Suit::Hearts, Rank::King),
                bridge::make_card(Suit::Hearts, Rank::Ten),
                bridge::make_card(Suit::Hearts, Rank::Six),
                bridge::make_card(Suit::Diamonds, Rank::Ace),
                bridge::make_card(Suit::Diamonds, Rank::Queen),
                bridge::make_card(Suit::Diamonds, Rank::Seven),
                bridge::make_card(Suit::Clubs, Rank::Nine),
                bridge::make_card(Suit::Clubs, Rank::Six),
                bridge::make_card(Suit::Clubs, Rank::Three),
            }),
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Ten),
                bridge::make_card(Suit::Spades, Rank::Five),
                bridge::make_card(Suit::Spades, Rank::Four),
                bridge::make_card(Suit::Hearts, Rank::Queen),
                bridge::make_card(Suit::Hearts, Rank::Jack),
                bridge::make_card(Suit::Hearts, Rank::Nine),
                bridge::make_card(Suit::Diamonds, Rank::King),
                bridge::make_card(Suit::Diamonds, Rank::Jack),
                bridge::make_card(Suit::Diamonds, Rank::Nine),
                bridge::make_card(Suit::Diamonds, Rank::Four),
                bridge::make_card(Suit::Diamonds, Rank::Three),
                bridge::make_card(Suit::Clubs, Rank::Ace),
                bridge::make_card(Suit::Clubs, Rank::Ten),
            }),
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Three),
                bridge::make_card(Suit::Spades, Rank::Two),
                bridge::make_card(Suit::Hearts, Rank::Eight),
                bridge::make_card(Suit::Hearts, Rank::Seven),
                bridge::make_card(Suit::Hearts, Rank::Five),
                bridge::make_card(Suit::Hearts, Rank::Four),
                bridge::make_card(Suit::Diamonds, Rank::Ten),
                bridge::make_card(Suit::Diamonds, Rank::Eight),
                bridge::make_card(Suit::Diamonds, Rank::Six),
                bridge::make_card(Suit::Diamonds, Rank::Five),
                bridge::make_card(Suit::Diamonds, Rank::Two),
                bridge::make_card(Suit::Clubs, Rank::King),
                bridge::make_card(Suit::Clubs, Rank::Seven),
            }),
        },
    };
}

void test_legal_plays_follow_suit() {
    Hand hand = bridge::make_hand({
        bridge::make_card(Suit::Hearts, Rank::Queen),
        bridge::make_card(Suit::Hearts, Rank::Nine),
        bridge::make_card(Suit::Spades, Rank::Ace),
    });

    Trick trick {
        .leader = Seat::North,
        .trump_suit = std::nullopt,
    };
    Hand leader_hand = bridge::make_hand({
        bridge::make_card(Suit::Hearts, Rank::Three),
    });
    bridge::add_card_to_trick(trick, leader_hand, bridge::make_card(Suit::Hearts, Rank::Three));

    const Hand legal = bridge::legal_plays(trick, hand);
    require(bridge::format_card_list(legal) == "HQ H9",
            "legal_plays should force following suit when hearts are available");
}

void test_trick_winner_with_trump() {
    Trick trick {
        .leader = Seat::East,
        .trump_suit = Suit::Hearts,
    };

    Hand east = bridge::make_hand({bridge::make_card(Suit::Diamonds, Rank::Seven)});
    Hand south = bridge::make_hand({bridge::make_card(Suit::Diamonds, Rank::King)});
    Hand west = bridge::make_hand({bridge::make_card(Suit::Diamonds, Rank::Two)});
    Hand north = bridge::make_hand({bridge::make_card(Suit::Hearts, Rank::Two)});

    bridge::add_card_to_trick(trick, east, bridge::make_card(Suit::Diamonds, Rank::Seven));
    bridge::add_card_to_trick(trick, south, bridge::make_card(Suit::Diamonds, Rank::King));
    bridge::add_card_to_trick(trick, west, bridge::make_card(Suit::Diamonds, Rank::Two));
    bridge::add_card_to_trick(trick, north, bridge::make_card(Suit::Hearts, Rank::Two));

    require(bridge::winning_seat(trick) == Seat::North,
            "ruff should win the trick over higher cards in the led suit");
}

void test_sampling_count_matches_bruteforce() {
    Hand available = bridge::make_hand({
        bridge::make_card(Suit::Hearts, Rank::Ace),
        bridge::make_card(Suit::Hearts, Rank::King),
        bridge::make_card(Suit::Hearts, Rank::Ten),
        bridge::make_card(Suit::Hearts, Rank::Nine),
        bridge::make_card(Suit::Spades, Rank::Queen),
        bridge::make_card(Suit::Spades, Rank::Jack),
        bridge::make_card(Suit::Clubs, Rank::Ace),
        bridge::make_card(Suit::Diamonds, Rank::Two),
    });

    HandSamplingConstraints constraints {};
    constraints.min_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 2;
    constraints.min_hcp = 5;

    const auto dp_count =
        bridge::count_constrained_hands(available, bridge::kEmptyHand, bridge::kEmptyHand, constraints, 4);
    const auto brute_count = brute_force_count(available, constraints, 4);

    require(dp_count == brute_count,
            "count_constrained_hands should match brute force on a small subset");
}

void test_sampling_count_matches_bruteforce_medium_subset() {
    Hand available = bridge::make_hand({
        bridge::make_card(Suit::Hearts, Rank::Ace),
        bridge::make_card(Suit::Hearts, Rank::King),
        bridge::make_card(Suit::Hearts, Rank::Queen),
        bridge::make_card(Suit::Hearts, Rank::Ten),
        bridge::make_card(Suit::Hearts, Rank::Nine),
        bridge::make_card(Suit::Spades, Rank::Ace),
        bridge::make_card(Suit::Spades, Rank::Queen),
        bridge::make_card(Suit::Spades, Rank::Jack),
        bridge::make_card(Suit::Diamonds, Rank::King),
        bridge::make_card(Suit::Diamonds, Rank::Ten),
        bridge::make_card(Suit::Clubs, Rank::Ace),
        bridge::make_card(Suit::Clubs, Rank::Three),
    });

    HandSamplingConstraints constraints {};
    constraints.min_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 3;
    constraints.min_hcp = 8;

    const auto dp_count =
        bridge::count_constrained_hands(available, bridge::kEmptyHand, bridge::kEmptyHand, constraints, 5);
    const auto brute_count = brute_force_count(available, constraints, 5);

    require(dp_count == brute_count,
            "count_constrained_hands should match brute force on a medium subset");
}

void test_partition_identity() {
    Hand available = bridge::make_hand({
        bridge::make_card(Suit::Hearts, Rank::Ace),
        bridge::make_card(Suit::Hearts, Rank::King),
        bridge::make_card(Suit::Hearts, Rank::Ten),
        bridge::make_card(Suit::Spades, Rank::Queen),
        bridge::make_card(Suit::Spades, Rank::Jack),
        bridge::make_card(Suit::Clubs, Rank::Ace),
    });

    HandSamplingConstraints constraints {};
    constraints.min_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 2;
    constraints.min_hcp = 4;

    const Card pivot = bridge::make_card(Suit::Hearts, Rank::Ace);
    const auto total =
        bridge::count_constrained_hands(available, bridge::kEmptyHand, bridge::kEmptyHand, constraints, 3);
    const auto included =
        bridge::count_constrained_hands(available, pivot, bridge::kEmptyHand, constraints, 3);
    const auto excluded =
        bridge::count_constrained_hands(available, bridge::kEmptyHand, pivot, constraints, 3);

    require(total == included + excluded,
            "sampling counts should satisfy include/exclude partition identity");
}

void test_sampled_hand_satisfies_constraints() {
    Hand north = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Ace),
        bridge::make_card(Suit::Spades, Rank::King),
        bridge::make_card(Suit::Spades, Rank::Nine),
        bridge::make_card(Suit::Spades, Rank::Eight),
        bridge::make_card(Suit::Spades, Rank::Seven),
        bridge::make_card(Suit::Hearts, Rank::Two),
        bridge::make_card(Suit::Hearts, Rank::Three),
        bridge::make_card(Suit::Clubs, Rank::Queen),
        bridge::make_card(Suit::Clubs, Rank::Jack),
        bridge::make_card(Suit::Clubs, Rank::Four),
        bridge::make_card(Suit::Clubs, Rank::Eight),
        bridge::make_card(Suit::Clubs, Rank::Five),
        bridge::make_card(Suit::Clubs, Rank::Two),
    });
    Hand south = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Ten),
        bridge::make_card(Suit::Spades, Rank::Five),
        bridge::make_card(Suit::Spades, Rank::Four),
        bridge::make_card(Suit::Hearts, Rank::Queen),
        bridge::make_card(Suit::Hearts, Rank::Jack),
        bridge::make_card(Suit::Hearts, Rank::Nine),
        bridge::make_card(Suit::Diamonds, Rank::King),
        bridge::make_card(Suit::Diamonds, Rank::Jack),
        bridge::make_card(Suit::Diamonds, Rank::Nine),
        bridge::make_card(Suit::Diamonds, Rank::Four),
        bridge::make_card(Suit::Diamonds, Rank::Three),
        bridge::make_card(Suit::Clubs, Rank::Ace),
        bridge::make_card(Suit::Clubs, Rank::Ten),
    });

    const Hand available = bridge::kFullDeck & ~(north | south);
    HandSamplingConstraints constraints {};
    constraints.min_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 5;
    constraints.min_hcp = 10;

    const auto sampled = bridge::sample_constrained_hand(available, constraints, 20260405);
    require(sampled.has_value(), "sample_constrained_hand should return a hand when solutions exist");
    require(bridge::card_count(*sampled) == 13, "sampled East hand must contain 13 cards");
    require(bridge::card_count(bridge::cards_in_suit(*sampled, Suit::Hearts)) >= 5,
            "sampled East hand must satisfy minimum heart length");
    require(bridge::high_card_points(*sampled) >= 10,
            "sampled East hand must satisfy minimum HCP");
}

void test_real_world_exact_shape_count() {
    Hand south = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Two),
        bridge::make_card(Suit::Hearts, Rank::Ace),
        bridge::make_card(Suit::Hearts, Rank::Queen),
        bridge::make_card(Suit::Hearts, Rank::Jack),
        bridge::make_card(Suit::Hearts, Rank::Seven),
        bridge::make_card(Suit::Hearts, Rank::Six),
        bridge::make_card(Suit::Hearts, Rank::Five),
        bridge::make_card(Suit::Hearts, Rank::Four),
        bridge::make_card(Suit::Diamonds, Rank::King),
        bridge::make_card(Suit::Diamonds, Rank::Nine),
        bridge::make_card(Suit::Clubs, Rank::King),
        bridge::make_card(Suit::Clubs, Rank::Seven),
        bridge::make_card(Suit::Clubs, Rank::Four),
    });
    Hand north = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Queen),
        bridge::make_card(Suit::Spades, Rank::Eight),
        bridge::make_card(Suit::Hearts, Rank::Three),
        bridge::make_card(Suit::Hearts, Rank::Two),
        bridge::make_card(Suit::Diamonds, Rank::Queen),
        bridge::make_card(Suit::Diamonds, Rank::Jack),
        bridge::make_card(Suit::Diamonds, Rank::Seven),
        bridge::make_card(Suit::Diamonds, Rank::Five),
        bridge::make_card(Suit::Clubs, Rank::Ace),
        bridge::make_card(Suit::Clubs, Rank::Jack),
        bridge::make_card(Suit::Clubs, Rank::Eight),
        bridge::make_card(Suit::Clubs, Rank::Five),
        bridge::make_card(Suit::Clubs, Rank::Three),
    });

    const Hand available = bridge::kFullDeck & ~(north | south);
    const Hand included = bridge::make_hand({
        bridge::make_card(Suit::Clubs, Rank::Queen),
        bridge::make_card(Suit::Hearts, Rank::King),
    });
    const Hand excluded = bridge::make_hand({
        bridge::make_card(Suit::Clubs, Rank::Ten),
        bridge::make_card(Suit::Clubs, Rank::Nine),
        bridge::make_card(Suit::Clubs, Rank::Six),
        bridge::make_card(Suit::Clubs, Rank::Two),
    });

    HandSamplingConstraints constraints {};
    constraints.min_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 3;
    constraints.max_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 3;
    constraints.min_lengths[static_cast<std::uint8_t>(Suit::Clubs)] = 1;
    constraints.max_lengths[static_cast<std::uint8_t>(Suit::Clubs)] = 1;

    const auto count =
        bridge::count_constrained_hands(available, included, excluded, constraints, 13);
    require(count == 72930,
            "real-world East singleton CQ and exact Kxx hearts count should be 72,930");
}

void test_real_world_small_hearts_count() {
    Hand south = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Two),
        bridge::make_card(Suit::Hearts, Rank::Ace),
        bridge::make_card(Suit::Hearts, Rank::Queen),
        bridge::make_card(Suit::Hearts, Rank::Jack),
        bridge::make_card(Suit::Hearts, Rank::Seven),
        bridge::make_card(Suit::Hearts, Rank::Six),
        bridge::make_card(Suit::Hearts, Rank::Five),
        bridge::make_card(Suit::Hearts, Rank::Four),
        bridge::make_card(Suit::Diamonds, Rank::King),
        bridge::make_card(Suit::Diamonds, Rank::Nine),
        bridge::make_card(Suit::Clubs, Rank::King),
        bridge::make_card(Suit::Clubs, Rank::Seven),
        bridge::make_card(Suit::Clubs, Rank::Four),
    });
    Hand north = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Queen),
        bridge::make_card(Suit::Spades, Rank::Eight),
        bridge::make_card(Suit::Hearts, Rank::Three),
        bridge::make_card(Suit::Hearts, Rank::Two),
        bridge::make_card(Suit::Diamonds, Rank::Queen),
        bridge::make_card(Suit::Diamonds, Rank::Jack),
        bridge::make_card(Suit::Diamonds, Rank::Seven),
        bridge::make_card(Suit::Diamonds, Rank::Five),
        bridge::make_card(Suit::Clubs, Rank::Ace),
        bridge::make_card(Suit::Clubs, Rank::Jack),
        bridge::make_card(Suit::Clubs, Rank::Eight),
        bridge::make_card(Suit::Clubs, Rank::Five),
        bridge::make_card(Suit::Clubs, Rank::Three),
    });

    const Hand available = bridge::kFullDeck & ~(north | south);
    const Hand included = bridge::make_hand({
        bridge::make_card(Suit::Clubs, Rank::Queen),
    });
    const Hand excluded = bridge::make_hand({
        bridge::make_card(Suit::Hearts, Rank::King),
        bridge::make_card(Suit::Clubs, Rank::Ten),
        bridge::make_card(Suit::Clubs, Rank::Nine),
        bridge::make_card(Suit::Clubs, Rank::Six),
        bridge::make_card(Suit::Clubs, Rank::Two),
    });

    HandSamplingConstraints constraints {};
    constraints.min_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 2;
    constraints.max_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 3;
    constraints.min_lengths[static_cast<std::uint8_t>(Suit::Clubs)] = 1;
    constraints.max_lengths[static_cast<std::uint8_t>(Suit::Clubs)] = 1;

    const auto count =
        bridge::count_constrained_hands(available, included, excluded, constraints, 13);
    require(count == 82654,
            "real-world East singleton CQ and exactly two or three small hearts count should be 82,654");
}

void test_double_dummy_wrapper_smoke() {
    const bridge::Deal deal = sample_dds_deal();

    const auto table = bridge::solve_double_dummy_table(deal);
    require(table.tricks[4][static_cast<std::uint8_t>(Seat::North)] >= 0 &&
            table.tricks[4][static_cast<std::uint8_t>(Seat::North)] <= 13,
            "DDS notrump result for North should be in the trick range 0..13");
    require(table.tricks[0][static_cast<std::uint8_t>(Seat::South)] ==
                bridge::double_dummy_tricks(deal, Seat::South, Suit::Spades),
            "double_dummy_tricks should match the table wrapper for spades");
    require(table.tricks[4][static_cast<std::uint8_t>(Seat::East)] ==
                bridge::double_dummy_tricks(deal, Seat::East, std::nullopt),
            "double_dummy_tricks should match the table wrapper for notrump");
}

void test_alpha_mu_leaf_front_uses_world_bits() {
    const bridge::Position position {
        .deal = sample_dds_deal(),
        .current_trick = bridge::Trick {
            .leader = Seat::West,
            .trump_suit = Suit::Spades,
        },
    };

    const std::vector<bridge::AlphaMuWorld> worlds {
        bridge::AlphaMuWorld {.position = position},
        bridge::AlphaMuWorld {.position = position},
    };
    const bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 9,
        .max_declarer_plies = 0,
    };

    const auto result = bridge::alpha_mu_search(worlds, config);
    require(result.best_move == bridge::kNoCard,
            "depth-zero alpha-mu search should not suggest a move");
    require(result.front.vectors.size() == 1,
            "depth-zero alpha-mu search should return a single leaf vector");
    require(result.front.vectors.front().wins == 0b11,
            "identical winning worlds should both be marked in the alpha-mu leaf front");
}

void test_alpha_mu_one_ply_returns_legal_declarer_move() {
    bridge::Position position {
        .deal = sample_dds_deal(),
        .current_trick = bridge::Trick {
            .leader = Seat::West,
            .trump_suit = Suit::Spades,
        },
    };

    bridge::add_card_to_trick(
        position.current_trick,
        bridge::hand_of(position.deal, Seat::West),
        bridge::make_card(Suit::Clubs, Rank::King));
    position.played_cards = bridge::add_card(position.played_cards, bridge::make_card(Suit::Clubs, Rank::King));

    const std::vector<bridge::AlphaMuWorld> worlds {
        bridge::AlphaMuWorld {.position = position},
    };
    const bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 9,
        .max_declarer_plies = 1,
    };

    const auto result = bridge::alpha_mu_search(worlds, config);
    const Hand north_legal =
        bridge::legal_plays(position.current_trick, bridge::hand_of(position.deal, Seat::North));
    require(result.best_move != bridge::kNoCard,
            "one-ply alpha-mu search should suggest a declarer-side move");
    require(bridge::contains(north_legal, result.best_move),
            "alpha-mu should return a legal move for the side to play");
}

}  // namespace

int main() {
    try {
        test_legal_plays_follow_suit();
        test_trick_winner_with_trump();
        test_sampling_count_matches_bruteforce();
        test_sampling_count_matches_bruteforce_medium_subset();
        test_partition_identity();
        test_sampled_hand_satisfies_constraints();
        test_real_world_exact_shape_count();
        test_real_world_small_hearts_count();
        test_double_dummy_wrapper_smoke();
        test_alpha_mu_leaf_front_uses_world_bits();
        test_alpha_mu_one_ply_returns_legal_declarer_move();
    } catch (const std::exception& error) {
        std::cerr << "Test failure: " << error.what() << "\n";
        return 1;
    }

    std::cout << "All bridge engine tests passed.\n";
    return 0;
}
