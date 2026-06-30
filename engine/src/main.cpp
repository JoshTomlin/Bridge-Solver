#include <array>
#include <bit>
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <string_view>
#include <unordered_set>
#include <vector>

#include "bridge/engine.h"
#include "interactive_cli.h"
#include "playthrough_demo.h"

namespace {

void print_alpha_mu_all_equals_demo() {
    using namespace bridge;

    constexpr std::size_t kWorldCount = 64;
    constexpr std::uint64_t kTrueSeed = 0xA11E0A1ULL;
    constexpr std::uint64_t kWorldSeed = 0x64E0A15ULL;
    const Hand north = suit_mask(Suit::Hearts);
    const Hand south = suit_mask(Suit::Spades);
    const Hand defender_cards = suit_mask(Suit::Diamonds) | suit_mask(Suit::Clubs);
    const HandSamplingConstraints constraints;
    const std::optional<Hand> true_east = sample_constrained_hand(
        defender_cards, constraints, kTrueSeed, 13);
    if (!true_east.has_value()) {
        throw std::runtime_error("failed to generate the true defender layout");
    }
    const Deal true_deal {.hands = {
        north,
        *true_east,
        south,
        defender_cards & ~*true_east,
    }};

    const auto sampling_start = std::chrono::steady_clock::now();
    std::vector<AlphaMuWorld> worlds;
    worlds.reserve(kWorldCount);
    std::unordered_set<Hand> unique_east_hands;
    for (std::size_t index = 0; index < kWorldCount; ++index) {
        const std::optional<Hand> east = sample_constrained_hand(
            defender_cards, constraints, kWorldSeed + index, 13);
        if (!east.has_value()) {
            throw std::runtime_error("failed to sample a defender world");
        }
        unique_east_hands.insert(*east);
        worlds.push_back(AlphaMuWorld {
            .position = Position {
                .deal = Deal {.hands = {
                    north,
                    *east,
                    south,
                    defender_cards & ~*east,
                }},
                .current_trick = Trick {
                    .leader = Seat::South,
                    .trump_suit = Suit::Spades,
                },
            },
        });
    }
    const double sampling_ms = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - sampling_start).count();
    const AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 13,
        .max_declarer_plies = 4,
    };

    const auto start = std::chrono::steady_clock::now();
    const AlphaMuResult result = alpha_mu_search(worlds, config);
    const double milliseconds = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - start).count();

    std::cout << "All-trumps alpha-mu demo\n";
    std::cout << "Hidden source-of-truth deal:\n" << format_deal(true_deal) << '\n';
    std::cout << "Possible East hands: " << count_constrained_hands(
        defender_cards, kEmptyHand, kEmptyHand, constraints, 13) << '\n';
    std::cout << "Sampled worlds: " << kWorldCount << " ("
              << unique_east_hands.size() << " unique) in "
              << sampling_ms << " ms\n";
    std::cout << "Contract target: 13 tricks; trump: Spades; South leads; M=4\n";
    std::cout << "Selected lead: " << to_string(result.best_move) << '\n';
    std::cout << "Worlds won: " << best_winning_world_count(result.front)
              << '/' << kWorldCount << '\n';
    std::cout << "Time: " << milliseconds << " ms\n";
    std::cout << "Stats: nodes=" << result.stats.nodes
              << " DDS-worlds=" << result.stats.dds_worlds
              << " TT-hits=" << result.stats.transposition_hits
              << " equals-skipped=" << result.stats.equivalent_moves_skipped
              << " forced-trump-cuts=" << result.stats.forced_trump_run_cuts
              << " win-cuts=" << result.stats.win_cuts
              << " completed-M=" << static_cast<int>(result.stats.completed_depth)
              << '\n';
}

bridge::Hand south_hand() {
    using namespace bridge;

    return make_hand({
        make_card(Suit::Spades, Rank::Two),
        make_card(Suit::Hearts, Rank::Ace),
        make_card(Suit::Hearts, Rank::Queen),
        make_card(Suit::Hearts, Rank::Jack),
        make_card(Suit::Hearts, Rank::Seven),
        make_card(Suit::Hearts, Rank::Six),
        make_card(Suit::Hearts, Rank::Five),
        make_card(Suit::Hearts, Rank::Four),
        make_card(Suit::Diamonds, Rank::King),
        make_card(Suit::Diamonds, Rank::Nine),
        make_card(Suit::Clubs, Rank::King),
        make_card(Suit::Clubs, Rank::Seven),
        make_card(Suit::Clubs, Rank::Four),
    });
}

bridge::Hand north_hand() {
    using namespace bridge;

    return make_hand({
        make_card(Suit::Spades, Rank::Queen),
        make_card(Suit::Spades, Rank::Eight),
        make_card(Suit::Hearts, Rank::Three),
        make_card(Suit::Hearts, Rank::Two),
        make_card(Suit::Diamonds, Rank::Queen),
        make_card(Suit::Diamonds, Rank::Jack),
        make_card(Suit::Diamonds, Rank::Seven),
        make_card(Suit::Diamonds, Rank::Five),
        make_card(Suit::Clubs, Rank::Ace),
        make_card(Suit::Clubs, Rank::Jack),
        make_card(Suit::Clubs, Rank::Eight),
        make_card(Suit::Clubs, Rank::Five),
        make_card(Suit::Clubs, Rank::Three),
    });
}

bridge::Deal sample_full_deal() {
    using namespace bridge;

    return Deal {
        .hands = {
            make_hand({
                make_card(Suit::Spades, Rank::Ace),
                make_card(Suit::Spades, Rank::King),
                make_card(Suit::Spades, Rank::Nine),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Hearts, Rank::Two),
                make_card(Suit::Hearts, Rank::Three),
                make_card(Suit::Clubs, Rank::Queen),
                make_card(Suit::Clubs, Rank::Jack),
                make_card(Suit::Clubs, Rank::Four),
                make_card(Suit::Clubs, Rank::Eight),
                make_card(Suit::Clubs, Rank::Five),
                make_card(Suit::Clubs, Rank::Two),
            }),
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Jack),
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Hearts, Rank::Ace),
                make_card(Suit::Hearts, Rank::King),
                make_card(Suit::Hearts, Rank::Ten),
                make_card(Suit::Hearts, Rank::Six),
                make_card(Suit::Diamonds, Rank::Ace),
                make_card(Suit::Diamonds, Rank::Queen),
                make_card(Suit::Diamonds, Rank::Seven),
                make_card(Suit::Clubs, Rank::Nine),
                make_card(Suit::Clubs, Rank::Six),
                make_card(Suit::Clubs, Rank::Three),
            }),
            make_hand({
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Five),
                make_card(Suit::Spades, Rank::Four),
                make_card(Suit::Hearts, Rank::Queen),
                make_card(Suit::Hearts, Rank::Jack),
                make_card(Suit::Hearts, Rank::Nine),
                make_card(Suit::Diamonds, Rank::King),
                make_card(Suit::Diamonds, Rank::Jack),
                make_card(Suit::Diamonds, Rank::Nine),
                make_card(Suit::Diamonds, Rank::Four),
                make_card(Suit::Diamonds, Rank::Three),
                make_card(Suit::Clubs, Rank::Ace),
                make_card(Suit::Clubs, Rank::Ten),
            }),
            make_hand({
                make_card(Suit::Spades, Rank::Three),
                make_card(Suit::Spades, Rank::Two),
                make_card(Suit::Hearts, Rank::Eight),
                make_card(Suit::Hearts, Rank::Seven),
                make_card(Suit::Hearts, Rank::Five),
                make_card(Suit::Hearts, Rank::Four),
                make_card(Suit::Diamonds, Rank::Ten),
                make_card(Suit::Diamonds, Rank::Eight),
                make_card(Suit::Diamonds, Rank::Six),
                make_card(Suit::Diamonds, Rank::Five),
                make_card(Suit::Diamonds, Rank::Two),
                make_card(Suit::Clubs, Rank::King),
                make_card(Suit::Clubs, Rank::Seven),
            }),
        },
    };
}

bridge::Deal swap_east_west(const bridge::Deal& deal) {
    bridge::Deal swapped = deal;
    std::swap(
        swapped.hands[bridge::seat_index(bridge::Seat::East)],
        swapped.hands[bridge::seat_index(bridge::Seat::West)]);
    return swapped;
}

std::vector<bridge::Card> ordered_cards(bridge::Hand cards) {
    using namespace bridge;

    std::vector<Card> result;
    for (const Suit suit : {Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        for (int rank_value = static_cast<int>(Rank::Ace);
             rank_value >= static_cast<int>(Rank::Two);
             --rank_value) {
            const Card card = make_card(suit, static_cast<Rank>(rank_value));
            if (contains(cards, card)) {
                result.push_back(card);
            }
        }
    }

    return result;
}

void print_dds_table(const bridge::DoubleDummyTable& table) {
    std::cout << "DDS tricks by declarer/strain\n";
    std::cout << "      C  D  S  H  NT\n";
    const std::array<std::pair<std::string, int>, 4> rows {{
        {"N", 0},
        {"S", 2},
        {"E", 1},
        {"W", 3},
    }};

    for (const auto& [label, declarer] : rows) {
        std::cout << label << "   ";
        std::cout << table.tricks[3][declarer] << "  ";
        std::cout << table.tricks[2][declarer] << "  ";
        std::cout << table.tricks[0][declarer] << "  ";
        std::cout << table.tricks[1][declarer] << "  ";
        std::cout << table.tricks[4][declarer] << "\n";
    }
}

void print_case(
    const std::string& title,
    bridge::Hand available,
    bridge::Hand included,
    bridge::Hand excluded,
    const bridge::HandSamplingConstraints& constraints) {
    using namespace bridge;

    const auto debug =
        sampling_debug_info(available, included, excluded, constraints, 13);
    const auto count =
        count_constrained_hands(available, included, excluded, constraints, 13);

    std::cout << title << "\n";
    std::cout << "Included: " << format_card_list(included) << "\n";
    std::cout << "Excluded: " << format_card_list(excluded) << "\n";
    std::cout << "Count: " << count << "\n";
    const std::uint8_t display_hcp =
        constraints.max_hcp < 37 ? constraints.max_hcp : 20;
    std::cout << "DP table (columns are exact HCP totals up to "
              << static_cast<int>(display_hcp) << ")\n";
    std::cout << format_sampling_debug_table(debug, display_hcp) << "\n";
}

void print_alpha_mu_discovery_demo() {
    using namespace bridge;

    const Hand north = make_hand({
        make_card(Suit::Spades, Rank::Ace),
        make_card(Suit::Spades, Rank::Jack),
        make_card(Suit::Spades, Rank::Ten),
    });
    const Hand south = make_hand({
        make_card(Suit::Spades, Rank::King),
        make_card(Suit::Spades, Rank::Three),
        make_card(Suit::Spades, Rank::Two),
    });
    const Deal queen_west {
        .hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Hearts, Rank::Ace),
                make_card(Suit::Hearts, Rank::King),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Nine),
                make_card(Suit::Spades, Rank::Eight),
            }),
        },
    };
    const Deal queen_east {
        .hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Hearts, Rank::Ace),
                make_card(Suit::Hearts, Rank::King),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Nine),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Seven),
            }),
        },
    };
    const std::vector<AlphaMuWorld> worlds {
        AlphaMuWorld {
            .position = Position {
                .deal = queen_west,
                .current_trick = Trick {
                    .leader = Seat::South,
                    .trump_suit = std::nullopt,
                },
            },
        },
        AlphaMuWorld {
            .position = Position {
                .deal = queen_east,
                .current_trick = Trick {
                    .leader = Seat::South,
                    .trump_suit = std::nullopt,
                },
            },
        },
    };
    const AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = std::nullopt,
        .target_tricks = 3,
        .max_declarer_plies = 2,
    };

    const auto search_start = std::chrono::steady_clock::now();
    const AlphaMuResult result = alpha_mu_search(worlds, config);
    const auto search_end = std::chrono::steady_clock::now();
    const auto search_ms =
        std::chrono::duration<double, std::milli>(search_end - search_start).count();

    std::cout << "Alpha-mu three-card discovery play\n";
    std::cout << "World 0: SQ is with West\n" << format_deal(queen_west) << "\n";
    std::cout << "World 1: SQ is singleton with East\n" << format_deal(queen_east) << "\n";
    std::cout << "Target: all three tricks; search depth: two Max moves\n";
    std::cout << "South legal moves: "
              << format_card_list(hand_of(queen_west, Seat::South)) << "\n";
    std::cout << "Root front: " << format_alpha_mu_front(result.front, worlds.size()) << "\n";
    std::cout << "Selected move: " << to_string(result.best_move) << "\n";
    std::cout << "Alpha-mu time: " << search_ms << " ms\n";
    std::cout << "Search tree\n" << alpha_mu_debug_tree(worlds, config);
}

void print_alpha_mu_guess_demo() {
    using namespace bridge;

    const Hand north = make_hand({
        make_card(Suit::Spades, Rank::Ace),
        make_card(Suit::Spades, Rank::Jack),
        make_card(Suit::Hearts, Rank::Ace),
        make_card(Suit::Hearts, Rank::King),
        make_card(Suit::Hearts, Rank::Queen),
    });
    const Hand south = make_hand({
        make_card(Suit::Spades, Rank::Six),
        make_card(Suit::Diamonds, Rank::Ace),
        make_card(Suit::Diamonds, Rank::King),
        make_card(Suit::Diamonds, Rank::Queen),
        make_card(Suit::Diamonds, Rank::Jack),
    });
    const Deal queen_west {
        .hands = {
            north,
            make_hand({
                make_card(Suit::Clubs, Rank::Jack),
                make_card(Suit::Hearts, Rank::Jack),
                make_card(Suit::Hearts, Rank::Ten),
                make_card(Suit::Hearts, Rank::Nine),
                make_card(Suit::Hearts, Rank::Eight),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Four),
                make_card(Suit::Clubs, Rank::Ace),
                make_card(Suit::Clubs, Rank::King),
                make_card(Suit::Clubs, Rank::Queen),
            }),
        },
    };
    const Deal queen_east {
        .hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Hearts, Rank::Jack),
                make_card(Suit::Hearts, Rank::Ten),
                make_card(Suit::Hearts, Rank::Nine),
                make_card(Suit::Hearts, Rank::Eight),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Four),
                make_card(Suit::Clubs, Rank::Ace),
                make_card(Suit::Clubs, Rank::King),
                make_card(Suit::Clubs, Rank::Queen),
                make_card(Suit::Clubs, Rank::Jack),
            }),
        },
    };

    auto after_low_spade = [](Deal deal) {
        Position position {
            .deal = deal,
            .current_trick = Trick {
                .leader = Seat::South,
                .trump_suit = std::nullopt,
            },
        };
        play_card(position, make_card(Suit::Spades, Rank::Six));
        play_card(position, make_card(Suit::Spades, Rank::Four));
        return AlphaMuWorld {.position = position};
    };

    const std::vector<AlphaMuWorld> worlds {
        after_low_spade(queen_west),
        after_low_spade(queen_east),
    };

    const AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = std::nullopt,
        .target_tricks = 5,
        .max_declarer_plies = 1,
    };

    const Hand root_legal =
        legal_plays(worlds.front().position.current_trick,
                    hand_of(worlds.front().position.deal, Seat::North));
    const auto search_start = std::chrono::steady_clock::now();
    const AlphaMuResult result = alpha_mu_search(worlds, config);
    const auto search_end = std::chrono::steady_clock::now();
    const auto search_ms =
        std::chrono::duration<double, std::milli>(search_end - search_start).count();

    std::cout << "Alpha-mu five-card two-way guess\n";
    std::cout << "South has led S6 and West has followed S4. North must play.\n";
    std::cout << "World 0: SQ is West\n" << format_deal(queen_west) << "\n";
    std::cout << "World 1: SQ is East\n" << format_deal(queen_east) << "\n";
    std::cout << "Target: all five tricks; search depth: one Max move\n";
    std::cout << "North legal moves: " << format_card_list(root_legal) << "\n";
    std::cout << "Root front: " << format_alpha_mu_front(result.front, worlds.size()) << "\n";
    std::cout << "Selected move: " << to_string(result.best_move)
              << " (both guesses win one of two equally weighted worlds)\n";
    std::cout << "Alpha-mu time: " << search_ms << " ms\n";
    std::cout << "Search tree\n" << alpha_mu_debug_tree(worlds, config);
}

void print_alpha_mu_spade_64_world_demo() {
    using namespace bridge;

    constexpr std::size_t kWorldCount = 64;
    constexpr std::uint64_t kFirstSeed = 0xA1B2C3D4ULL;

    const Hand north = make_hand({
        make_card(Suit::Spades, Rank::Ace),
        make_card(Suit::Spades, Rank::Jack),
        make_card(Suit::Spades, Rank::Three),
        make_card(Suit::Spades, Rank::Two),
        make_card(Suit::Hearts, Rank::Ace),
    });
    const Hand south = make_hand({
        make_card(Suit::Spades, Rank::King),
        make_card(Suit::Spades, Rank::Nine),
        make_card(Suit::Spades, Rank::Five),
        make_card(Suit::Spades, Rank::Four),
        make_card(Suit::Hearts, Rank::King),
    });
    const Hand defender_cards = make_hand({
        make_card(Suit::Spades, Rank::Queen),
        make_card(Suit::Spades, Rank::Ten),
        make_card(Suit::Spades, Rank::Eight),
        make_card(Suit::Spades, Rank::Seven),
        make_card(Suit::Spades, Rank::Six),
        make_card(Suit::Hearts, Rank::Two),
        make_card(Suit::Diamonds, Rank::Three),
        make_card(Suit::Diamonds, Rank::Two),
        make_card(Suit::Clubs, Rank::Three),
        make_card(Suit::Clubs, Rank::Two),
    });

    const HandSamplingConstraints constraints;
    const auto sampling_start = std::chrono::steady_clock::now();
    const std::uint64_t possible_east_hands = count_constrained_hands(
        defender_cards,
        kEmptyHand,
        kEmptyHand,
        constraints,
        5);

    std::vector<AlphaMuWorld> worlds;
    worlds.reserve(kWorldCount);
    std::array<std::size_t, 6> east_spade_lengths {};
    for (std::size_t index = 0; index < kWorldCount; ++index) {
        const std::optional<Hand> east = sample_constrained_hand(
            defender_cards,
            constraints,
            kFirstSeed + index,
            5);
        if (!east.has_value()) {
            throw std::runtime_error("failed to sample a defender hand");
        }

        const Hand west = defender_cards & ~*east;
        ++east_spade_lengths[card_count(cards_in_suit(*east, Suit::Spades))];
        worlds.push_back(AlphaMuWorld {
            .position = Position {
                .deal = Deal {.hands = {north, *east, south, west}},
                .current_trick = Trick {
                    .leader = Seat::North,
                    .trump_suit = Suit::Spades,
                },
            },
        });
    }
    const auto sampling_end = std::chrono::steady_clock::now();
    const double sampling_ms =
        std::chrono::duration<double, std::milli>(sampling_end - sampling_start).count();

    const AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 4,
        .max_declarer_plies = 10,
    };

    std::cout << "Alpha-mu five-card AJ32 A opposite K954 K, 64 sampled worlds\n";
    std::cout << "North: " << format_hand(north) << "\n";
    std::cout << "South: " << format_hand(south) << "\n";
    std::cout << "Possible East hands: " << possible_east_hands << "\n";
    std::cout << "Sampling: " << sampling_ms << " ms (seed " << kFirstSeed << ")\n";
    std::cout << "East spade lengths:";
    for (std::size_t length = 0; length < east_spade_lengths.size(); ++length) {
        std::cout << ' ' << length << '=' << east_spade_lengths[length];
    }
    std::cout << "\nTarget: 4 tricks; North leads; M=10\n";

    const auto evaluation_start = std::chrono::steady_clock::now();
    const AlphaMuResult result = alpha_mu_search(worlds, config);
    const auto evaluation_end = std::chrono::steady_clock::now();
    const double evaluation_ms =
        std::chrono::duration<double, std::milli>(evaluation_end - evaluation_start).count();

    std::cout << "Final-iteration root moves:\n";
    for (const AlphaMuRootMove& move : result.root_moves) {
        std::cout << "  " << to_string(move.move) << ": "
                  << move.winning_worlds << '/' << kWorldCount
                  << " worlds, " << move.pareto_vectors << " vector(s)\n";
    }
    std::cout << "Selected lead: " << to_string(result.best_move) << " ("
              << best_winning_world_count(result.front) << '/' << kWorldCount << ")\n";
    std::cout << "Evaluation: " << evaluation_ms << " ms\n";
    std::cout << "Search stats: nodes=" << result.stats.nodes
              << " leaves=" << result.stats.leaves
              << " DDS-worlds=" << result.stats.dds_worlds
              << " TT-hits=" << result.stats.transposition_hits
              << " early-cuts=" << result.stats.early_cuts
              << " root-cuts=" << result.stats.root_cuts
              << " equals-skipped=" << result.stats.equivalent_moves_skipped
              << " completed-M=" << static_cast<int>(result.stats.completed_depth)
              << "\n";
}

void print_alpha_mu_spade_combination_demo() {
    using namespace bridge;

    const Hand north = make_hand({
        make_card(Suit::Spades, Rank::Ace),
        make_card(Suit::Spades, Rank::Jack),
        make_card(Suit::Spades, Rank::Three),
        make_card(Suit::Spades, Rank::Two),
        make_card(Suit::Hearts, Rank::Ace),
        make_card(Suit::Hearts, Rank::Two),
    });
    const Hand south = make_hand({
        make_card(Suit::Spades, Rank::King),
        make_card(Suit::Spades, Rank::Nine),
        make_card(Suit::Spades, Rank::Five),
        make_card(Suit::Spades, Rank::Four),
        make_card(Suit::Hearts, Rank::King),
        make_card(Suit::Hearts, Rank::Three),
    });
    const std::vector<Deal> deals {
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Diamonds, Rank::King),
                make_card(Suit::Clubs, Rank::Ace),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Diamonds, Rank::Ace),
                make_card(Suit::Diamonds, Rank::Queen),
                make_card(Suit::Clubs, Rank::King),
                make_card(Suit::Clubs, Rank::Queen),
                make_card(Suit::Clubs, Rank::Jack),
            }),
        }},
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Diamonds, Rank::King),
                make_card(Suit::Clubs, Rank::Queen),
                make_card(Suit::Clubs, Rank::Jack),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Diamonds, Rank::Ace),
                make_card(Suit::Diamonds, Rank::Queen),
                make_card(Suit::Clubs, Rank::Ace),
                make_card(Suit::Clubs, Rank::King),
            }),
        }},
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Diamonds, Rank::Ace),
                make_card(Suit::Diamonds, Rank::Queen),
                make_card(Suit::Clubs, Rank::Ace),
                make_card(Suit::Clubs, Rank::King),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Diamonds, Rank::King),
                make_card(Suit::Clubs, Rank::Queen),
                make_card(Suit::Clubs, Rank::Jack),
            }),
        }},
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Diamonds, Rank::Ace),
                make_card(Suit::Diamonds, Rank::Queen),
                make_card(Suit::Clubs, Rank::King),
                make_card(Suit::Clubs, Rank::Queen),
                make_card(Suit::Clubs, Rank::Jack),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Diamonds, Rank::King),
                make_card(Suit::Clubs, Rank::Ace),
            }),
        }},
    };

    std::vector<AlphaMuWorld> worlds;
    for (const Deal& deal : deals) {
        worlds.push_back(AlphaMuWorld {
            .position = Position {
                .deal = deal,
                .current_trick = Trick {
                    .leader = Seat::South,
                    .trump_suit = Suit::Spades,
                },
            },
        });
    }
    const AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 5,
        .max_declarer_plies = 2,
    };

    std::cout << "Alpha-mu six-card spade combination\n";
    std::cout << "Target: five tricks in spades; depth: two Max moves\n";
    for (std::size_t index = 0; index < deals.size(); ++index) {
        std::cout << "World " << index << "\n" << format_deal(deals[index]) << "\n";
    }

    std::array<int, 4> double_dummy_max {};
    for (std::uint8_t target = 1; target <= 6; ++target) {
        AlphaMuConfig leaf_config = config;
        leaf_config.target_tricks = target;
        leaf_config.max_declarer_plies = 0;
        const AlphaMuResult leaf = alpha_mu_search(worlds, leaf_config);
        const WorldMask wins = leaf.front.vectors.front().wins;
        for (std::size_t index = 0; index < worlds.size(); ++index) {
            if ((wins & (WorldMask {1} << index)) != 0) {
                double_dummy_max[index] = target;
            }
        }
    }
    std::cout << "Double-dummy maximum tricks:";
    for (std::size_t index = 0; index < double_dummy_max.size(); ++index) {
        std::cout << " w" << index << '=' << double_dummy_max[index];
    }
    std::cout << "\n";

    const Hand leads = hand_of(deals.front(), Seat::South);
    for (const Card card : ordered_cards(leads)) {
        auto child_worlds = worlds;
        for (AlphaMuWorld& world : child_worlds) {
            play_card(world.position, card);
        }
        AlphaMuConfig child_config = config;
        --child_config.max_declarer_plies;

        const auto start = std::chrono::steady_clock::now();
        const AlphaMuResult child = alpha_mu_search(child_worlds, child_config);
        const auto end = std::chrono::steady_clock::now();
        const auto milliseconds =
            std::chrono::duration<double, std::milli>(end - start).count();
        std::cout << to_string(card) << " -> "
                  << format_alpha_mu_front(child.front, worlds.size())
                  << " (" << milliseconds << " ms)\n";
    }

    const auto start = std::chrono::steady_clock::now();
    const AlphaMuResult result = alpha_mu_search(worlds, config);
    const auto end = std::chrono::steady_clock::now();
    const auto milliseconds =
        std::chrono::duration<double, std::milli>(end - start).count();
    std::cout << "Root front: " << format_alpha_mu_front(result.front, worlds.size()) << "\n";
    std::cout << "Selected lead: " << to_string(result.best_move) << "\n";
    std::cout << "Total search time: " << milliseconds << " ms\n";
}

void print_alpha_mu_four_world_ending_demo() {
    using namespace bridge;

    const Hand north = make_hand({
        make_card(Suit::Spades, Rank::Ace),
        make_card(Suit::Spades, Rank::Jack),
        make_card(Suit::Spades, Rank::Three),
        make_card(Suit::Spades, Rank::Two),
    });
    const Hand south = make_hand({
        make_card(Suit::Spades, Rank::King),
        make_card(Suit::Spades, Rank::Nine),
        make_card(Suit::Spades, Rank::Five),
        make_card(Suit::Spades, Rank::Four),
    });
    const std::vector<Deal> deals {
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Seven),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Hearts, Rank::Ace),
                make_card(Suit::Hearts, Rank::King),
                make_card(Suit::Hearts, Rank::Queen),
            }),
        }},
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Hearts, Rank::Ace),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Hearts, Rank::King),
                make_card(Suit::Hearts, Rank::Queen),
            }),
        }},
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Hearts, Rank::Ace),
                make_card(Suit::Hearts, Rank::King),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Hearts, Rank::Queen),
            }),
        }},
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Hearts, Rank::Ace),
                make_card(Suit::Hearts, Rank::King),
                make_card(Suit::Hearts, Rank::Queen),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Six),
            }),
        }},
    };

    std::vector<AlphaMuWorld> worlds;
    for (const Deal& deal : deals) {
        worlds.push_back(AlphaMuWorld {
            .position = Position {
                .deal = deal,
                .current_trick = Trick {
                    .leader = Seat::South,
                    .trump_suit = Suit::Spades,
                },
            },
        });
    }
    const AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 3,
        .max_declarer_plies = 2,
    };

    std::cout << "Alpha-mu four-world, four-card ending\n";
    std::cout << "Target: three tricks in spades; depth: two Max moves\n";
    for (std::size_t index = 0; index < deals.size(); ++index) {
        std::cout << "World " << index << "\n" << format_deal(deals[index]) << "\n";
    }

    std::array<int, 4> double_dummy_max {};
    for (std::uint8_t target = 1; target <= 4; ++target) {
        AlphaMuConfig leaf_config = config;
        leaf_config.target_tricks = target;
        leaf_config.max_declarer_plies = 0;
        const WorldMask wins =
            alpha_mu_search(worlds, leaf_config).front.vectors.front().wins;
        for (std::size_t index = 0; index < worlds.size(); ++index) {
            if ((wins & (WorldMask {1} << index)) != 0) {
                double_dummy_max[index] = target;
            }
        }
    }
    std::cout << "Double-dummy maximum tricks:";
    for (std::size_t index = 0; index < double_dummy_max.size(); ++index) {
        std::cout << " w" << index << '=' << double_dummy_max[index];
    }
    std::cout << "\n";

    for (const Card card : ordered_cards(south)) {
        auto child_worlds = worlds;
        for (AlphaMuWorld& world : child_worlds) {
            play_card(world.position, card);
        }
        AlphaMuConfig child_config = config;
        --child_config.max_declarer_plies;
        const AlphaMuResult child = alpha_mu_search(child_worlds, child_config);
        std::cout << to_string(card) << " -> "
                  << format_alpha_mu_front(child.front, worlds.size()) << "\n";
    }

    const auto start = std::chrono::steady_clock::now();
    const AlphaMuResult result = alpha_mu_search(worlds, config);
    const auto end = std::chrono::steady_clock::now();
    const auto milliseconds =
        std::chrono::duration<double, std::milli>(end - start).count();
    std::cout << "Root front: " << format_alpha_mu_front(result.front, worlds.size()) << "\n";
    std::cout << "Selected lead: " << to_string(result.best_move) << "\n";
    std::cout << "Total search time: " << milliseconds << " ms\n";
}

void print_example_one_demo() {
    using namespace bridge;

    const Hand north = make_hand({
        make_card(Suit::Spades, Rank::Ace),
        make_card(Suit::Spades, Rank::Jack),
        make_card(Suit::Spades, Rank::Three),
        make_card(Suit::Spades, Rank::Two),
        make_card(Suit::Hearts, Rank::Ace),
    });
    const Hand south = make_hand({
        make_card(Suit::Spades, Rank::King),
        make_card(Suit::Spades, Rank::Nine),
        make_card(Suit::Spades, Rank::Five),
        make_card(Suit::Spades, Rank::Four),
        make_card(Suit::Hearts, Rank::King),
    });
    const std::vector<Deal> deals {
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Diamonds, Rank::Two),
                make_card(Suit::Diamonds, Rank::Three),
                make_card(Suit::Clubs, Rank::Two),
                make_card(Suit::Clubs, Rank::Three),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Hearts, Rank::Two),
            }),
        }},
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Diamonds, Rank::Three),
                make_card(Suit::Clubs, Rank::Two),
                make_card(Suit::Clubs, Rank::Three),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Hearts, Rank::Two),
                make_card(Suit::Diamonds, Rank::Two),
            }),
        }},
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Diamonds, Rank::Three),
                make_card(Suit::Clubs, Rank::Three),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Hearts, Rank::Two),
                make_card(Suit::Diamonds, Rank::Two),
                make_card(Suit::Clubs, Rank::Two),
            }),
        }},
        Deal {.hands = {
            north,
            make_hand({
                make_card(Suit::Spades, Rank::Queen),
                make_card(Suit::Spades, Rank::Ten),
                make_card(Suit::Spades, Rank::Eight),
                make_card(Suit::Spades, Rank::Seven),
                make_card(Suit::Diamonds, Rank::Three),
            }),
            south,
            make_hand({
                make_card(Suit::Spades, Rank::Six),
                make_card(Suit::Hearts, Rank::Two),
                make_card(Suit::Diamonds, Rank::Two),
                make_card(Suit::Clubs, Rank::Two),
                make_card(Suit::Clubs, Rank::Three),
            }),
        }},
    };

    std::vector<AlphaMuWorld> worlds;
    for (const Deal& deal : deals) {
        worlds.push_back(AlphaMuWorld {
            .position = Position {
                .deal = deal,
                .current_trick = Trick {
                    .leader = Seat::North,
                    .trump_suit = Suit::Spades,
                },
            },
        });
    }

    std::cout << "Example 1: Classic Suit Combination\n";
    for (std::size_t index = 0; index < deals.size(); ++index) {
        std::cout << "World " << index << "\n" << format_deal(deals[index]) << "\n";
    }

    AlphaMuConfig leaf_config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 4,
        .max_declarer_plies = 0,
    };
    std::array<int, 4> double_dummy_max {};
    for (std::uint8_t target = 1; target <= 5; ++target) {
        leaf_config.target_tricks = target;
        const WorldMask wins =
            alpha_mu_search(worlds, leaf_config).front.vectors.front().wins;
        for (std::size_t index = 0; index < worlds.size(); ++index) {
            if ((wins & (WorldMask {1} << index)) != 0) {
                double_dummy_max[index] = target;
            }
        }
    }
    std::cout << "Double-dummy maximum tricks:";
    for (std::size_t index = 0; index < double_dummy_max.size(); ++index) {
        std::cout << " w" << index << '=' << double_dummy_max[index];
    }
    std::cout << "\n";

    for (std::uint8_t depth = 1; depth <= 3; ++depth) {
        const AlphaMuConfig config {
            .declarer = Seat::South,
            .trump_suit = Suit::Spades,
            .target_tricks = 4,
            .max_declarer_plies = depth,
        };
        std::cout << "M=" << static_cast<int>(depth) << "\n";
        for (const Card card : ordered_cards(north)) {
            auto child_worlds = worlds;
            for (AlphaMuWorld& world : child_worlds) {
                play_card(world.position, card);
            }
            AlphaMuConfig child_config = config;
            --child_config.max_declarer_plies;
            const AlphaMuFront front =
                alpha_mu_search(child_worlds, child_config).front;
            std::cout << "  " << to_string(card) << " -> "
                      << format_alpha_mu_front(front, worlds.size()) << "\n";
        }
        const auto start = std::chrono::steady_clock::now();
        const AlphaMuResult result = alpha_mu_search(worlds, config);
        const auto end = std::chrono::steady_clock::now();
        std::cout << "  root " << format_alpha_mu_front(result.front, worlds.size())
                  << "; selected " << to_string(result.best_move)
                  << "; time "
                  << std::chrono::duration<double, std::milli>(end - start).count()
                  << " ms\n"
                  << "  stats: nodes=" << result.stats.nodes
                  << " leaves=" << result.stats.leaves
                  << " DDS-worlds=" << result.stats.dds_worlds
                  << " TT-hits=" << result.stats.transposition_hits
                  << " early-cuts=" << result.stats.early_cuts
                  << " root-cuts=" << result.stats.root_cuts
                  << " iterations=" << static_cast<int>(result.stats.completed_iterations)
                  << "\n";
    }
}

}  // namespace

int main(int argc, char** argv) {
    using namespace bridge;

    try {
        if (argc > 1 && std::string_view(argv[1]) == "--alpha-mu-all-equals-demo") {
            print_alpha_mu_all_equals_demo();
            return 0;
        }
        if (argc > 1 && std::string_view(argv[1]) == "--interactive") {
            bridge::cli::run_interactive(std::cin, std::cout);
            return 0;
        }
        if (argc > 1 && std::string_view(argv[1]) == "--alpha-mu-demo") {
            print_alpha_mu_discovery_demo();
            return 0;
        }
        if (argc > 1 && std::string_view(argv[1]) == "--alpha-mu-guess-demo") {
            print_alpha_mu_guess_demo();
            return 0;
        }
        if (argc > 1 && std::string_view(argv[1]) == "--alpha-mu-spade-demo") {
            print_alpha_mu_spade_combination_demo();
            return 0;
        }
        if (argc > 1 && std::string_view(argv[1]) == "--alpha-mu-spade-64-demo") {
            print_alpha_mu_spade_64_world_demo();
            return 0;
        }
        if (argc > 1 && std::string_view(argv[1]) == "--alpha-mu-playthrough") {
            bool auto_run = false;
            bool batch_ten = false;
            std::optional<std::uint64_t> true_deal_seed;
            std::uint8_t target_tricks = 12;
            std::uint8_t search_depth = bridge::kMaxDeclarerPlies;
            double max_search_seconds = 5.0;
            for (int index = 2; index < argc; ++index) {
                const std::string_view option(argv[index]);
                if (option == "--auto") {
                    auto_run = true;
                } else if (option == "--batch-10") {
                    batch_ten = true;
                    auto_run = true;
                } else if (option == "--target-13") {
                    target_tricks = 13;
                } else if (option == "--depth-3") {
                    search_depth = 3;
                } else if (option == "--depth-4") {
                    search_depth = 4;
                } else if (option == "--max-depth") {
                    if (index + 1 >= argc) {
                        throw std::invalid_argument("--max-depth requires an integer value");
                    }
                    const unsigned long requested_depth = std::stoul(argv[++index]);
                    if (requested_depth == 0 ||
                        requested_depth > bridge::kMaxDeclarerPlies) {
                        throw std::invalid_argument("--max-depth must be between 1 and 26");
                    }
                    search_depth = static_cast<std::uint8_t>(requested_depth);
                } else if (option == "--time-limit") {
                    if (index + 1 >= argc) {
                        throw std::invalid_argument("--time-limit requires seconds");
                    }
                    max_search_seconds = std::stod(argv[++index]);
                } else if (option == "--seed") {
                    if (index + 1 >= argc) {
                        throw std::invalid_argument("--seed requires an integer value");
                    }
                    true_deal_seed = std::stoull(argv[++index]);
                    auto_run = true;
                } else {
                    throw std::invalid_argument("unknown playthrough option");
                }
            }
            if (batch_ten) {
                if (true_deal_seed.has_value()) {
                    throw std::invalid_argument("--seed cannot be combined with --batch-10");
                }
                bridge::demo::run_alpha_mu_batch(
                    10, target_tricks, search_depth, max_search_seconds);
            } else if (true_deal_seed.has_value()) {
                bridge::demo::run_alpha_mu_playthrough_with_seed(
                    !auto_run,
                    target_tricks,
                    search_depth,
                    max_search_seconds,
                    *true_deal_seed);
            } else {
                bridge::demo::run_alpha_mu_playthrough(
                    !auto_run,
                    target_tricks,
                    search_depth,
                    max_search_seconds);
            }
            return 0;
        }
        if (argc > 1 && std::string_view(argv[1]) == "--alpha-mu-four-world-demo") {
            print_alpha_mu_four_world_ending_demo();
            return 0;
        }
        if (argc > 1 && std::string_view(argv[1]) == "--example-1") {
            print_example_one_demo();
            return 0;
        }

        const Hand north = north_hand();
        const Hand south = south_hand();
        const Hand available = kFullDeck & ~(north | south);
        const Deal dds_deal = sample_full_deal();
        const auto dds_start = std::chrono::steady_clock::now();
        const auto dds_table = solve_double_dummy_table(dds_deal);
        const auto dds_end = std::chrono::steady_clock::now();
        const auto dds_ms =
            std::chrono::duration<double, std::milli>(dds_end - dds_start).count();

        std::cout << "Fixed NS hands\n";
        std::cout << format_deal(Deal {.hands = {north, kEmptyHand, south, kEmptyHand}}) << "\n";
        std::cout << "Available East/West cards: " << static_cast<int>(card_count(available)) << "\n\n";
        std::cout << "Sample full deal for DDS\n";
        std::cout << format_deal(dds_deal) << "\n";
        print_dds_table(dds_table);
        std::cout << "DDS solve time: " << dds_ms << " ms\n";
        std::cout << "\n";

        HandSamplingConstraints case_one {};
        case_one.min_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 3;
        case_one.max_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 3;
        case_one.min_lengths[static_cast<std::uint8_t>(Suit::Clubs)] = 1;
        case_one.max_lengths[static_cast<std::uint8_t>(Suit::Clubs)] = 1;
        print_case(
            "Case 1: East has singleton CQ and exactly Kxx in hearts",
            available,
            make_hand({
                make_card(Suit::Clubs, Rank::Queen),
                make_card(Suit::Hearts, Rank::King),
            }),
            make_hand({
                make_card(Suit::Clubs, Rank::Ten),
                make_card(Suit::Clubs, Rank::Nine),
                make_card(Suit::Clubs, Rank::Six),
                make_card(Suit::Clubs, Rank::Two),
            }),
            case_one);

        HandSamplingConstraints case_two {};
        case_two.min_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 2;
        case_two.max_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 3;
        case_two.min_lengths[static_cast<std::uint8_t>(Suit::Clubs)] = 1;
        case_two.max_lengths[static_cast<std::uint8_t>(Suit::Clubs)] = 1;
        print_case(
            "Case 2: East has singleton CQ and exactly two or three small hearts",
            available,
            make_hand({
                make_card(Suit::Clubs, Rank::Queen),
            }),
            make_hand({
                make_card(Suit::Hearts, Rank::King),
                make_card(Suit::Clubs, Rank::Ten),
                make_card(Suit::Clubs, Rank::Nine),
                make_card(Suit::Clubs, Rank::Six),
                make_card(Suit::Clubs, Rank::Two),
            }),
            case_two);

        HandSamplingConstraints case_three {};
        case_three.min_hcp = 11;
        case_three.max_hcp = 11;
        const auto exact_eleven = count_constrained_hands(
            kFullDeck,
            kEmptyHand,
            kEmptyHand,
            case_three,
            13);
        HandSamplingConstraints any_hand {};
        const auto total_hands = count_constrained_hands(
            kFullDeck,
            kEmptyHand,
            kEmptyHand,
            any_hand,
            13);
        std::cout << "Case 3: Random 13-card hand with exactly 11 HCP\n";
        std::cout << "Count: " << exact_eleven << "\n";
        std::cout << "Total 13-card hands: " << total_hands << "\n";
        std::cout << "Probability: "
                  << static_cast<double>(exact_eleven) / static_cast<double>(total_hands)
                  << "\n";
        std::cout << "DP table (columns are exact HCP totals)\n";
        std::cout << format_sampling_debug_table(
            sampling_debug_info(kFullDeck, kEmptyHand, kEmptyHand, case_three, 13),
            20);

        HandSamplingConstraints case_four {};
        case_four.min_lengths[static_cast<std::uint8_t>(Suit::Spades)] = 5;
        case_four.max_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 2;
        case_four.min_hcp = 20;
        const auto count_case_four = count_constrained_hands(
            kFullDeck,
            kEmptyHand,
            kEmptyHand,
            case_four,
            13);
        const auto sampled_case_four = sample_constrained_hand(
            kFullDeck,
            case_four,
            20260405,
            13);
        std::cout << "\nCase 4: Random 13-card hand with 20+ HCP, 5+ spades, at most 2 hearts\n";
        std::cout << "Count: " << count_case_four << "\n";
        std::cout << "Probability: "
                  << static_cast<double>(count_case_four) / static_cast<double>(total_hands)
                  << "\n";
        if (sampled_case_four.has_value()) {
            std::cout << "Sampled hand: " << format_hand(*sampled_case_four) << "\n";
            std::cout << "HCP: " << static_cast<int>(high_card_points(*sampled_case_four)) << "\n";
            std::cout << "Spades: "
                      << static_cast<int>(card_count(cards_in_suit(*sampled_case_four, Suit::Spades))) << "\n";
            std::cout << "Hearts: "
                      << static_cast<int>(card_count(cards_in_suit(*sampled_case_four, Suit::Hearts))) << "\n";
        } else {
            std::cout << "No sampled hand found.\n";
        }

        HandSamplingConstraints case_five {};
        case_five.min_lengths[static_cast<std::uint8_t>(Suit::Spades)] = 5;
        case_five.max_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 4;
        case_five.max_lengths[static_cast<std::uint8_t>(Suit::Diamonds)] = 4;
        case_five.max_lengths[static_cast<std::uint8_t>(Suit::Clubs)] = 4;
        case_five.min_hcp = 12;

        const auto count_start = std::chrono::steady_clock::now();
        const auto count_case_five = count_constrained_hands(
            kFullDeck,
            kEmptyHand,
            kEmptyHand,
            case_five,
            13);
        const auto count_end = std::chrono::steady_clock::now();

        const auto first_sample_start = std::chrono::steady_clock::now();
        const auto first_sample = sample_constrained_hand(
            kFullDeck,
            case_five,
            20260406,
            13);
        const auto first_sample_end = std::chrono::steady_clock::now();

        std::size_t valid_samples = 0;
        const auto thousand_samples_start = std::chrono::steady_clock::now();
        for (std::uint64_t seed = 1; seed <= 1000; ++seed) {
            const auto sampled = sample_constrained_hand(kFullDeck, case_five, seed, 13);
            if (!sampled.has_value()) {
                continue;
            }

            const auto spade_count =
                card_count(cards_in_suit(*sampled, Suit::Spades));
            const auto heart_count =
                card_count(cards_in_suit(*sampled, Suit::Hearts));
            const auto diamond_count =
                card_count(cards_in_suit(*sampled, Suit::Diamonds));
            const auto club_count =
                card_count(cards_in_suit(*sampled, Suit::Clubs));

            if (spade_count >= 5 &&
                heart_count < 5 &&
                diamond_count < 5 &&
                club_count < 5 &&
                high_card_points(*sampled) >= 12) {
                ++valid_samples;
            }
        }
        const auto thousand_samples_end = std::chrono::steady_clock::now();

        const auto count_ms = std::chrono::duration<double, std::milli>(count_end - count_start).count();
        const auto first_sample_ms =
            std::chrono::duration<double, std::milli>(first_sample_end - first_sample_start).count();
        const auto thousand_samples_ms =
            std::chrono::duration<double, std::milli>(thousand_samples_end - thousand_samples_start).count();

        std::cout << "\nCase 5: Benchmark 1000 samples with 5+ spades, 12+ HCP, and <5 cards in every other suit\n";
        std::cout << "Count: " << count_case_five << "\n";
        std::cout << "Count step: " << count_ms << " ms\n";
        std::cout << "First sample step: " << first_sample_ms << " ms\n";
        std::cout << "1000 sample step: " << thousand_samples_ms << " ms\n";
        std::cout << "Average per sampled hand: " << (thousand_samples_ms / 1000.0) << " ms\n";
        std::cout << "Valid sampled hands checked: " << valid_samples << " / 1000\n";
        if (first_sample.has_value()) {
            std::cout << "Example sampled hand: " << format_hand(*first_sample) << "\n";
        }

        HandSamplingConstraints singleton_cq_constraints {};
        singleton_cq_constraints.min_lengths[static_cast<std::uint8_t>(Suit::Clubs)] = 1;
        singleton_cq_constraints.max_lengths[static_cast<std::uint8_t>(Suit::Clubs)] = 1;
        const Hand singleton_cq_included = make_hand({
            make_card(Suit::Clubs, Rank::Queen),
        });
        const Hand singleton_cq_excluded = make_hand({
            make_card(Suit::Clubs, Rank::Ten),
            make_card(Suit::Clubs, Rank::Nine),
            make_card(Suit::Clubs, Rank::Six),
            make_card(Suit::Clubs, Rank::Two),
        });

        HandSamplingConstraints kxx_constraints = singleton_cq_constraints;
        kxx_constraints.min_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 3;
        kxx_constraints.max_lengths[static_cast<std::uint8_t>(Suit::Hearts)] = 3;
        const Hand kxx_included = add_card(singleton_cq_included, make_card(Suit::Hearts, Rank::King));

        const auto singleton_cq_total = count_constrained_hands(
            available,
            singleton_cq_included,
            singleton_cq_excluded,
            singleton_cq_constraints,
            13);
        const auto singleton_cq_kxx = count_constrained_hands(
            available,
            kxx_included,
            singleton_cq_excluded,
            kxx_constraints,
            13);

        constexpr std::uint64_t kUniformitySamples = 100000;
        std::uint64_t observed_kxx = 0;
        const auto uniformity_start = std::chrono::steady_clock::now();
        for (std::uint64_t seed = 1; seed <= kUniformitySamples; ++seed) {
            const auto sampled = sample_constrained_hand(
                available,
                singleton_cq_constraints,
                9000000 + seed,
                13);
            if (!sampled.has_value()) {
                continue;
            }

            const bool has_hk = contains(*sampled, make_card(Suit::Hearts, Rank::King));
            const auto heart_count = card_count(cards_in_suit(*sampled, Suit::Hearts));
            if (has_hk && heart_count == 3) {
                ++observed_kxx;
            }
        }
        const auto uniformity_end = std::chrono::steady_clock::now();
        const auto uniformity_ms =
            std::chrono::duration<double, std::milli>(uniformity_end - uniformity_start).count();

        std::cout << "\nCase 6: Empirical uniformity check under singleton CQ only\n";
        std::cout << "Base count (singleton CQ): " << singleton_cq_total << "\n";
        std::cout << "Theoretical Kxx-heart count: " << singleton_cq_kxx << "\n";
        std::cout << "Theoretical probability: "
                  << static_cast<double>(singleton_cq_kxx) / static_cast<double>(singleton_cq_total)
                  << "\n";
        std::cout << "Sample count: " << kUniformitySamples << "\n";
        std::cout << "Observed Kxx-heart hits: " << observed_kxx << "\n";
        std::cout << "Observed probability: "
                  << static_cast<double>(observed_kxx) / static_cast<double>(kUniformitySamples)
                  << "\n";
        std::cout << "Sampling time: " << uniformity_ms << " ms\n";
        std::cout << "\n";
        print_alpha_mu_discovery_demo();
    } catch (const std::exception& error) {
        std::cerr << error.what() << "\n";
        return 1;
    }

    return 0;
}
