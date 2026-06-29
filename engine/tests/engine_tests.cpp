#include <algorithm>
#include <bit>
#include <iostream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
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

void test_card_bitmask_layout_and_operations() {
    const Card club_two = bridge::make_card(Suit::Clubs, Rank::Two);
    const Card spade_ace = bridge::make_card(Suit::Spades, Rank::Ace);

    require(club_two == 1ULL, "C2 should occupy bit zero");
    require(spade_ace == (1ULL << 51), "SA should occupy bit 51");
    require(bridge::is_single_card(club_two) && bridge::is_single_card(spade_ace),
            "one-hot card masks should be recognized as single cards");

    Hand hand = bridge::add_card(bridge::kEmptyHand, club_two);
    hand = bridge::add_card(hand, spade_ace);
    require(bridge::card_count(hand) == 2 && bridge::contains(hand, spade_ace),
            "hand OR and popcount should track cards");
    require(bridge::suit_of(spade_ace) == Suit::Spades &&
                bridge::rank_of(spade_ace) == Rank::Ace,
            "card bit index should round-trip to suit and rank");
    require(bridge::card_count(bridge::suit_mask(Suit::Hearts)) == 13,
            "a suit mask should contain exactly 13 contiguous card bits");

    hand = bridge::remove_card(hand, club_two);
    require(hand == spade_ace, "removing a card should clear only its bit");
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

void test_shortened_position_finishes_when_hands_are_empty() {
    bridge::Position position {
        .deal = bridge::Deal {
            .hands = {
                bridge::make_hand({bridge::make_card(Suit::Spades, Rank::Ace)}),
                bridge::make_hand({bridge::make_card(Suit::Spades, Rank::King)}),
                bridge::make_hand({bridge::make_card(Suit::Spades, Rank::Queen)}),
                bridge::make_hand({bridge::make_card(Suit::Spades, Rank::Jack)}),
            },
        },
        .current_trick = bridge::Trick {
            .leader = Seat::North,
            .trump_suit = std::nullopt,
        },
    };

    bridge::play_card(position, bridge::make_card(Suit::Spades, Rank::Ace));
    bridge::play_card(position, bridge::make_card(Suit::Spades, Rank::King));
    bridge::play_card(position, bridge::make_card(Suit::Spades, Rank::Queen));
    bridge::play_card(position, bridge::make_card(Suit::Spades, Rank::Jack));

    require(bridge::is_deal_finished(position),
            "a shortened position should finish after all remaining cards are played");
    require(position.completed_tricks == 1,
            "the shortened position should record its completed trick");
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

std::vector<bridge::AlphaMuWorld> two_way_guess_worlds() {
    const Hand north = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Ace),
        bridge::make_card(Suit::Spades, Rank::Jack),
        bridge::make_card(Suit::Hearts, Rank::Ace),
        bridge::make_card(Suit::Hearts, Rank::King),
        bridge::make_card(Suit::Hearts, Rank::Queen),
    });
    const Hand south = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Six),
        bridge::make_card(Suit::Diamonds, Rank::Ace),
        bridge::make_card(Suit::Diamonds, Rank::King),
        bridge::make_card(Suit::Diamonds, Rank::Queen),
        bridge::make_card(Suit::Diamonds, Rank::Jack),
    });
    const bridge::Deal queen_west {
        .hands = {
            north,
            bridge::make_hand({
                bridge::make_card(Suit::Clubs, Rank::Jack),
                bridge::make_card(Suit::Hearts, Rank::Jack),
                bridge::make_card(Suit::Hearts, Rank::Ten),
                bridge::make_card(Suit::Hearts, Rank::Nine),
                bridge::make_card(Suit::Hearts, Rank::Eight),
            }),
            south,
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Spades, Rank::Four),
                bridge::make_card(Suit::Clubs, Rank::Ace),
                bridge::make_card(Suit::Clubs, Rank::King),
                bridge::make_card(Suit::Clubs, Rank::Queen),
            }),
        },
    };
    const bridge::Deal queen_east {
        .hands = {
            north,
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Hearts, Rank::Jack),
                bridge::make_card(Suit::Hearts, Rank::Ten),
                bridge::make_card(Suit::Hearts, Rank::Nine),
                bridge::make_card(Suit::Hearts, Rank::Eight),
            }),
            south,
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Four),
                bridge::make_card(Suit::Clubs, Rank::Ace),
                bridge::make_card(Suit::Clubs, Rank::King),
                bridge::make_card(Suit::Clubs, Rank::Queen),
                bridge::make_card(Suit::Clubs, Rank::Jack),
            }),
        },
    };

    auto after_low_spade = [](bridge::Deal deal) {
        bridge::Position position {
            .deal = deal,
            .current_trick = bridge::Trick {
                .leader = Seat::South,
                .trump_suit = std::nullopt,
            },
        };
        bridge::play_card(position, bridge::make_card(Suit::Spades, Rank::Six));
        bridge::play_card(position, bridge::make_card(Suit::Spades, Rank::Four));
        return bridge::AlphaMuWorld {.position = position};
    };

    return {after_low_spade(queen_west), after_low_spade(queen_east)};
}

std::vector<bridge::AlphaMuWorld> discovery_play_worlds() {
    const Hand north = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Ace),
        bridge::make_card(Suit::Spades, Rank::Jack),
        bridge::make_card(Suit::Spades, Rank::Ten),
    });
    const Hand south = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::King),
        bridge::make_card(Suit::Spades, Rank::Three),
        bridge::make_card(Suit::Spades, Rank::Two),
    });
    const bridge::Deal queen_west {
        .hands = {
            north,
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Seven),
                bridge::make_card(Suit::Hearts, Rank::Ace),
                bridge::make_card(Suit::Hearts, Rank::King),
            }),
            south,
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Spades, Rank::Nine),
                bridge::make_card(Suit::Spades, Rank::Eight),
            }),
        },
    };
    const bridge::Deal queen_east {
        .hands = {
            north,
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Hearts, Rank::Ace),
                bridge::make_card(Suit::Hearts, Rank::King),
            }),
            south,
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Nine),
                bridge::make_card(Suit::Spades, Rank::Eight),
                bridge::make_card(Suit::Spades, Rank::Seven),
            }),
        },
    };

    auto make_world = [](bridge::Deal deal) {
        return bridge::AlphaMuWorld {
            .position = bridge::Position {
                .deal = deal,
                .current_trick = bridge::Trick {
                    .leader = Seat::South,
                    .trump_suit = std::nullopt,
                },
            },
        };
    };
    return {make_world(queen_west), make_world(queen_east)};
}

std::vector<bridge::AlphaMuWorld> example_one_worlds() {
    const Hand north = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Ace),
        bridge::make_card(Suit::Spades, Rank::Jack),
        bridge::make_card(Suit::Spades, Rank::Three),
        bridge::make_card(Suit::Spades, Rank::Two),
        bridge::make_card(Suit::Hearts, Rank::Ace),
    });
    const Hand south = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::King),
        bridge::make_card(Suit::Spades, Rank::Nine),
        bridge::make_card(Suit::Spades, Rank::Five),
        bridge::make_card(Suit::Spades, Rank::Four),
        bridge::make_card(Suit::Hearts, Rank::King),
    });
    const std::vector<std::pair<Hand, Hand>> east_west {
        {
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Seven),
                bridge::make_card(Suit::Diamonds, Rank::Two),
                bridge::make_card(Suit::Diamonds, Rank::Three),
                bridge::make_card(Suit::Clubs, Rank::Two),
                bridge::make_card(Suit::Clubs, Rank::Three),
            }),
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Spades, Rank::Ten),
                bridge::make_card(Suit::Spades, Rank::Eight),
                bridge::make_card(Suit::Spades, Rank::Six),
                bridge::make_card(Suit::Hearts, Rank::Two),
            }),
        },
        {
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Eight),
                bridge::make_card(Suit::Spades, Rank::Seven),
                bridge::make_card(Suit::Diamonds, Rank::Three),
                bridge::make_card(Suit::Clubs, Rank::Two),
                bridge::make_card(Suit::Clubs, Rank::Three),
            }),
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Spades, Rank::Ten),
                bridge::make_card(Suit::Spades, Rank::Six),
                bridge::make_card(Suit::Hearts, Rank::Two),
                bridge::make_card(Suit::Diamonds, Rank::Two),
            }),
        },
        {
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Eight),
                bridge::make_card(Suit::Spades, Rank::Seven),
                bridge::make_card(Suit::Spades, Rank::Six),
                bridge::make_card(Suit::Diamonds, Rank::Three),
                bridge::make_card(Suit::Clubs, Rank::Three),
            }),
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Spades, Rank::Ten),
                bridge::make_card(Suit::Hearts, Rank::Two),
                bridge::make_card(Suit::Diamonds, Rank::Two),
                bridge::make_card(Suit::Clubs, Rank::Two),
            }),
        },
        {
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Spades, Rank::Ten),
                bridge::make_card(Suit::Spades, Rank::Eight),
                bridge::make_card(Suit::Spades, Rank::Seven),
                bridge::make_card(Suit::Diamonds, Rank::Three),
            }),
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Six),
                bridge::make_card(Suit::Hearts, Rank::Two),
                bridge::make_card(Suit::Diamonds, Rank::Two),
                bridge::make_card(Suit::Clubs, Rank::Two),
                bridge::make_card(Suit::Clubs, Rank::Three),
            }),
        },
    };

    std::vector<bridge::AlphaMuWorld> worlds;
    for (const auto& [east, west] : east_west) {
        worlds.push_back(bridge::AlphaMuWorld {
            .position = bridge::Position {
                .deal = bridge::Deal {.hands = {north, east, south, west}},
                .current_trick = bridge::Trick {
                    .leader = Seat::North,
                    .trump_suit = Suit::Spades,
                },
            },
        });
    }
    return worlds;
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

void test_pareto_front_removes_dominated_outcomes() {
    using bridge::OutcomeVector;
    using bridge::ParetoFront;

    require(bridge::outcome_dominates(OutcomeVector {.wins = 0b0011},
                                      OutcomeVector {.wins = 0b0001}),
            "a strict superset of winning worlds should dominate");
    require(!bridge::outcome_dominates(OutcomeVector {.wins = 0b0011},
                                       OutcomeVector {.wins = 0b0011}),
            "an equal outcome is a duplicate, not strict dominance");

    ParetoFront front;
    require(bridge::add_to_pareto_front(front, OutcomeVector {.wins = 0b0001}),
            "the first outcome should be inserted");
    require(bridge::add_to_pareto_front(front, OutcomeVector {.wins = 0b0010}),
            "incomparable outcomes should both be retained");
    require(!bridge::add_to_pareto_front(front, OutcomeVector {.wins = 0b0001}),
            "duplicate outcomes should not be inserted");
    require(bridge::add_to_pareto_front(front, OutcomeVector {.wins = 0b0011}),
            "a dominating outcome should be inserted");
    require(front.vectors.size() == 1 && front.vectors.front().wins == 0b0011,
            "inserting a dominating outcome should remove both dominated outcomes");
    require(bridge::winning_world_count(front.vectors.front()) == 2 &&
                bridge::best_winning_world_count(front) == 2,
            "front scoring should count winning world bits");
}

void test_max_and_min_front_combinations() {
    using bridge::OutcomeVector;
    using bridge::ParetoFront;

    const ParetoFront max_result = bridge::combine_max_fronts({
        ParetoFront {.vectors = {OutcomeVector {.wins = 0b0011}}},
        ParetoFront {.vectors = {OutcomeVector {.wins = 0b0101}}},
        ParetoFront {.vectors = {OutcomeVector {.wins = 0b0111}}},
    });
    require(max_result.vectors.size() == 1 && max_result.vectors.front().wins == 0b0111,
            "MAX should union alternatives and Pareto-prune dominated strategies");

    const ParetoFront left {.vectors = {
        OutcomeVector {.wins = 0b0011},
        OutcomeVector {.wins = 0b1100},
    }};
    const ParetoFront right {.vectors = {
        OutcomeVector {.wins = 0b0101},
        OutcomeVector {.wins = 0b1010},
    }};
    const ParetoFront min_result = bridge::combine_min_fronts(left, right);

    require(min_result.vectors.size() == 4,
            "MIN should retain all four incomparable response combinations");
    for (const bridge::WorldMask expected : {0b0001ULL, 0b0010ULL, 0b0100ULL, 0b1000ULL}) {
        const bool found = std::any_of(
            min_result.vectors.begin(),
            min_result.vectors.end(),
            [expected](const OutcomeVector& outcome) { return outcome.wins == expected; });
        require(found, "MIN should form the Cartesian product using vector intersection");
    }
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

void test_alpha_mu_preserves_two_way_guess() {
    const auto worlds = two_way_guess_worlds();
    const bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = std::nullopt,
        .target_tricks = 5,
        .max_declarer_plies = 1,
    };

    const auto result = bridge::alpha_mu_search(worlds, config);
    bool wins_only_queen_west = false;
    bool wins_only_queen_east = false;
    bool leaks_hidden_information = false;
    for (const bridge::AlphaMuVector& vector : result.front.vectors) {
        wins_only_queen_west |= vector.wins == 0b01;
        wins_only_queen_east |= vector.wins == 0b10;
        leaks_hidden_information |= vector.wins == 0b11;
    }

    require(wins_only_queen_west && wins_only_queen_east,
            "the two legal guesses should produce separate Pareto vectors");
    require(!leaks_hidden_information,
            "alpha-mu must not choose a different guess using hidden world information");
    require(result.best_move == bridge::make_card(Suit::Spades, Rank::Ace),
            "equal-probability guesses should use deterministic descending-card tie breaking");

    const std::string trace = bridge::alpha_mu_debug_tree(worlds, config);
    require(trace.find("move SA") != std::string::npos &&
                trace.find("move SJ") != std::string::npos,
            "the debug tree should show both sides of the two-way guess");

    bridge::AlphaMuConfig four_trick_config = config;
    four_trick_config.target_tricks = 4;
    const auto four_trick_result = bridge::alpha_mu_search(worlds, four_trick_config);
    require(four_trick_result.front.vectors.size() == 1 &&
                four_trick_result.front.vectors.front().wins == 0b11,
            "duplicate winning vectors should collapse to one Pareto vector");
}

void test_alpha_mu_finds_spade_discovery_play() {
    const auto worlds = discovery_play_worlds();
    const bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = std::nullopt,
        .target_tricks = 3,
        .max_declarer_plies = 2,
    };

    const auto result = bridge::alpha_mu_search(worlds, config);
    require(result.best_move == bridge::make_card(Suit::Spades, Rank::King),
            "cashing SK should be the discovery play that handles both queen layouts");
    require(result.front.vectors.size() == 1 &&
                result.front.vectors.front().wins == 0b11,
            "the discovery play should guarantee all three tricks in both worlds");
}

void test_alpha_mu_example_one_classic_combination() {
    const auto worlds = example_one_worlds();
    const bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 4,
        .max_declarer_plies = 3,
    };

    const auto result = bridge::alpha_mu_search(worlds, config);
    require(result.best_move == bridge::make_card(Suit::Spades, Rank::Ace),
            "Example 1 should select SA when North is on lead");
    require(result.front.vectors.size() == 1 &&
                result.front.vectors.front().wins == 0b1111,
            "Example 1 should preserve four tricks in all four worlds");
}

}  // namespace

int main() {
    try {
        test_card_bitmask_layout_and_operations();
        test_legal_plays_follow_suit();
        test_trick_winner_with_trump();
        test_shortened_position_finishes_when_hands_are_empty();
        test_sampling_count_matches_bruteforce();
        test_sampling_count_matches_bruteforce_medium_subset();
        test_partition_identity();
        test_sampled_hand_satisfies_constraints();
        test_real_world_exact_shape_count();
        test_real_world_small_hearts_count();
        test_double_dummy_wrapper_smoke();
        test_pareto_front_removes_dominated_outcomes();
        test_max_and_min_front_combinations();
        test_alpha_mu_leaf_front_uses_world_bits();
        test_alpha_mu_one_ply_returns_legal_declarer_move();
        test_alpha_mu_preserves_two_way_guess();
        test_alpha_mu_finds_spade_discovery_play();
        test_alpha_mu_example_one_classic_combination();
    } catch (const std::exception& error) {
        std::cerr << "Test failure: " << error.what() << "\n";
        return 1;
    }

    std::cout << "All bridge engine tests passed.\n";
    return 0;
}
