#include <algorithm>
#include <bit>
#include <iostream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "bridge/analysis_session.h"
#include "bridge/engine.h"
#include "bridge/quick_tricks.h"

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

void test_hand_record_parser() {
    const std::optional<Hand> hand = bridge::parse_hand_record("AJ32.A.-.-");
    require(hand.has_value(), "SHDC hand record should parse");
    require(bridge::format_hand(*hand) == "AJ32 A - -",
            "parsed hand record should preserve SHDC holdings");
    require(!bridge::parse_hand_record("AJ32.A.-").has_value(),
            "a hand record must contain four suits");
    require(!bridge::parse_hand_record("AA.-.-.-").has_value(),
            "duplicate cards in one holding must be rejected");
}

void test_analysis_session_tracks_public_play() {
    const bridge::Deal deal {.hands = {
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Ace),
            bridge::make_card(Suit::Hearts, Rank::Ace),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Hearts, Rank::Three),
            bridge::make_card(Suit::Hearts, Rank::Two),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::King),
            bridge::make_card(Suit::Spades, Rank::Two),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Queen),
            bridge::make_card(Suit::Spades, Rank::Three),
        }),
    }};
    bridge::AnalysisSession session(deal, Seat::North, std::nullopt);
    bridge::BotSettings settings = session.settings();
    settings.world_count = 6;
    settings.max_declarer_plies = 2;
    settings.target_tricks = 1;
    settings.optimizations.quick_trick_bounds = false;
    session.set_settings(settings);

    const bridge::SessionAnalysis analysis = session.analyze();
    require(analysis.possible_deals == 6,
            "four hidden defender cards should have six two-card East layouts");
    require(analysis.worlds.size() == settings.world_count,
            "session analysis should retain the sampled worlds for explanation UIs");
    require(analysis.search.best_move != bridge::kNoCard,
            "interactive analysis should recommend a card");
    const bridge::OptimizationBenchmark benchmark =
        session.benchmark(bridge::AlphaMuOptimization::MaxEquivalentCards);
    require(
        bridge::best_winning_world_count(benchmark.disabled.search.front) ==
            bridge::best_winning_world_count(benchmark.enabled.search.front),
        "same-world optimization benchmark should preserve the search score");
    session.play(bridge::make_card(Suit::Spades, Rank::Ace));
    session.play(bridge::make_card(Suit::Hearts, Rank::Two));
    require(session.known_voids().find("East=S") != std::string::npos,
            "failing to follow suit should persist East's spade void");
    require(session.undo(), "undo should restore the position before East's card");
    require(session.known_voids().find("East=none") != std::string::npos,
            "undo should restore inferred void information");
    require(bridge::next_to_play(session.position().current_trick) == Seat::East,
            "undo should restore the player to act");
    session.replay();
    require(session.position().current_trick.card_count == 0 &&
                bridge::next_to_play(session.position().current_trick) == Seat::North,
            "replay should restore the entered starting position");
}

void test_analysis_session_returns_forced_move_without_sampling() {
    const bridge::Deal deal {.hands = {
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Ace),
            bridge::make_card(Suit::Hearts, Rank::Ace),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Two),
            bridge::make_card(Suit::Hearts, Rank::Two),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::King),
            bridge::make_card(Suit::Hearts, Rank::King),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Three),
            bridge::make_card(Suit::Hearts, Rank::Three),
        }),
    }};

    bridge::AnalysisSession session(deal, Seat::West, std::nullopt);
    session.play(bridge::make_card(Suit::Spades, Rank::Three));
    bridge::BotSettings settings = session.settings();
    settings.world_count = 64;
    settings.max_declarer_plies = 10;
    settings.target_tricks = 1;
    session.set_settings(settings);

    const bridge::SessionAnalysis forced = session.analyze();
    require(forced.search.best_move ==
                bridge::make_card(Suit::Spades, Rank::Ace),
            "a forced follow should return the only legal card");
    require(forced.worlds.empty() && forced.sampling_ms == 0.0 &&
                forced.search.stats.dds_worlds == 0,
            "a forced root recommendation should skip sampling and DDS");
    require(forced.search.stats.forced_root_recommendations == 1 &&
                forced.search.root_moves.size() == 1,
            "forced root recommendations should be explicit in the result");

    bridge::AnalysisSession reference_session(deal, Seat::West, std::nullopt);
    reference_session.play(bridge::make_card(Suit::Spades, Rank::Three));
    settings.world_count = 4;
    settings.max_declarer_plies = 1;
    settings.optimizations.forced_moves = false;
    reference_session.set_settings(settings);
    const bridge::SessionAnalysis reference = reference_session.analyze();
    require(reference.worlds.size() == settings.world_count &&
                reference.search.best_move == forced.search.best_move,
            "disabling forced moves should restore sampling without changing the card");
}

void test_analysis_session_autoplays_one_equivalent_class() {
    const bridge::Deal deal {.hands = {
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Nine),
            bridge::make_card(Suit::Spades, Rank::Eight),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Two),
            bridge::make_card(Suit::Hearts, Rank::Two),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Hearts, Rank::Ace),
            bridge::make_card(Suit::Hearts, Rank::King),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Three),
            bridge::make_card(Suit::Hearts, Rank::Three),
        }),
    }};
    bridge::AnalysisSession session(deal, Seat::North, std::nullopt);
    bridge::BotSettings settings = session.settings();
    settings.world_count = 64;
    settings.max_declarer_plies = 10;
    settings.target_tricks = 1;
    session.set_settings(settings);

    const bridge::SessionAnalysis analysis = session.analyze();
    require(analysis.search.best_move ==
                bridge::make_card(Suit::Spades, Rank::Nine) &&
                analysis.worlds.empty(),
            "touching equivalent cards should produce an instant representative");
    require(analysis.search.stats.forced_root_recommendations == 1 &&
                analysis.search.stats.max_equivalent_moves_skipped == 1,
            "the forced root should report the equivalent card it skipped");

    bridge::AnalysisSession reference_session(deal, Seat::North, std::nullopt);
    settings.world_count = 4;
    settings.max_declarer_plies = 1;
    settings.optimizations.max_equivalent_cards = false;
    reference_session.set_settings(settings);
    const bridge::SessionAnalysis reference = reference_session.analyze();
    require(reference.worlds.size() == settings.world_count &&
                reference.search.stats.forced_root_recommendations == 0,
            "disabling MAX equivalents should restore normal world sampling");
}

void test_alpha_mu_collapses_forced_internal_nodes() {
    const bridge::Deal deal {.hands = {
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Ace),
            bridge::make_card(Suit::Hearts, Rank::Ace),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Two),
            bridge::make_card(Suit::Hearts, Rank::Two),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Nine),
            bridge::make_card(Suit::Spades, Rank::Eight),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Three),
            bridge::make_card(Suit::Hearts, Rank::Three),
        }),
    }};
    bridge::AnalysisSession session(deal, Seat::West, std::nullopt);
    session.play(bridge::make_card(Suit::Spades, Rank::Three));
    const std::vector<bridge::AlphaMuWorld> worlds {
        bridge::AlphaMuWorld {.position = session.position()},
    };

    bridge::AlphaMuConfig forced_config {
        .declarer = Seat::South,
        .trump_suit = std::nullopt,
        .target_tricks = 2,
        .max_declarer_plies = 2,
        .optimizations = bridge::disabled_alpha_mu_optimizations(),
    };
    forced_config.optimizations.forced_moves = true;
    forced_config.optimizations.max_equivalent_cards = true;
    const bridge::AlphaMuResult forced =
        bridge::alpha_mu_search(worlds, forced_config);

    bridge::AlphaMuConfig reference_config = forced_config;
    reference_config.optimizations.forced_moves = false;
    const bridge::AlphaMuResult reference =
        bridge::alpha_mu_search(worlds, reference_config);

    require(forced.best_move == reference.best_move &&
                forced.front.vectors.size() == reference.front.vectors.size() &&
                forced.front.vectors.front().wins ==
                    reference.front.vectors.front().wins,
            "forced-node collapse must preserve the exact search result");
    require(forced.stats.forced_min_nodes > 0 &&
                forced.stats.forced_max_nodes > 0 &&
                forced.stats.max_equivalent_moves_skipped > 0 &&
                reference.stats.forced_move_nodes == 0,
            "forced equivalent MAX and physical MIN nodes should be counted");
}

void test_alpha_mu_skips_touching_equal_cards() {
    const bridge::Deal deal {.hands = {
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Ace),
            bridge::make_card(Suit::Spades, Rank::King),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Queen),
            bridge::make_card(Suit::Spades, Rank::Jack),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Ten),
            bridge::make_card(Suit::Spades, Rank::Nine),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Eight),
            bridge::make_card(Suit::Spades, Rank::Seven),
        }),
    }};
    const std::vector<bridge::AlphaMuWorld> worlds {
        bridge::AlphaMuWorld {
            .position = bridge::Position {
                .deal = deal,
                .current_trick = bridge::Trick {
                    .leader = Seat::North,
                    .trump_suit = Suit::Spades,
                },
                .played_cards = bridge::kFullDeck & ~(
                    deal.hands[0] | deal.hands[1] | deal.hands[2] | deal.hands[3]),
            },
        },
    };
    bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 2,
        .max_declarer_plies = 2,
        .collect_audit_log = true,
    };
    config.optimizations.root_cut = false;
    config.optimizations.quick_trick_bounds = false;
    const bridge::AlphaMuResult result = bridge::alpha_mu_search(worlds, config);
    require(result.root_moves.size() == 1 &&
                result.root_moves.front().move ==
                    bridge::make_card(Suit::Spades, Rank::Ace),
            "touching SA and SK should be represented by only SA at the root");
    require(result.stats.equivalent_moves_skipped > 0,
            "search statistics should report skipped equivalent cards");
    require(result.audit_log.find("[max-equals]") != std::string::npos,
            "optimization audit should name the equivalent-card shortcut");

    bridge::AlphaMuConfig unmerged_config = config;
    unmerged_config.optimizations.max_equivalent_cards = false;
    unmerged_config.optimizations.win_cut = false;
    const bridge::AlphaMuResult unmerged =
        bridge::alpha_mu_search(worlds, unmerged_config);
    require(unmerged.root_moves.size() == 2 &&
                unmerged.stats.max_equivalent_moves_skipped == 0,
            "disabling MAX equivalents should search both touching cards");
}

void test_alpha_mu_all_equal_suits_are_trivial() {
    const bridge::Deal deal {.hands = {
        bridge::suit_mask(Suit::Hearts),
        bridge::suit_mask(Suit::Diamonds),
        bridge::suit_mask(Suit::Spades),
        bridge::suit_mask(Suit::Clubs),
    }};
    const std::vector<bridge::AlphaMuWorld> worlds {
        bridge::AlphaMuWorld {
            .position = bridge::Position {
                .deal = deal,
                .current_trick = bridge::Trick {
                    .leader = Seat::South,
                    .trump_suit = Suit::Spades,
                },
            },
        },
    };
    bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 13,
        .max_declarer_plies = 3,
    };
    config.optimizations.quick_trick_bounds = false;

    const bridge::AlphaMuResult result = bridge::alpha_mu_search(worlds, config);
    require(result.best_move == bridge::make_card(Suit::Spades, Rank::Ace),
            "all-equals position should represent South's trumps with SA");
    require(bridge::best_winning_world_count(result.front) == 1,
            "South should make all thirteen tricks in the all-equals world");
    require(result.root_moves.size() == 1 &&
                result.stats.equivalent_moves_skipped >= 36,
            "touching thirteen-card suits should collapse aggressively");
    require(result.stats.forced_trump_run_cuts == 3 &&
                result.stats.dds_worlds == 0,
            "each iterative depth should prove the trump run without DDS");

    bridge::AlphaMuConfig unforced_config = config;
    unforced_config.max_declarer_plies = 1;
    unforced_config.optimizations.iterative_deepening = false;
    unforced_config.optimizations.forced_trump_run = false;
    const bridge::AlphaMuResult unforced =
        bridge::alpha_mu_search(worlds, unforced_config);
    require(unforced.stats.forced_trump_run_cuts == 0 &&
                unforced.stats.dds_worlds > 0,
            "disabling the forced-run proof should fall through to normal search");
}

void test_alpha_mu_cuts_max_node_on_all_winning_vector() {
    const bridge::Deal deal {.hands = {
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Ace),
            bridge::make_card(Suit::Hearts, Rank::Two),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Two),
            bridge::make_card(Suit::Hearts, Rank::Three),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::King),
            bridge::make_card(Suit::Hearts, Rank::Four),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Queen),
            bridge::make_card(Suit::Hearts, Rank::Five),
        }),
    }};
    const std::vector<bridge::AlphaMuWorld> worlds {
        bridge::AlphaMuWorld {
            .position = bridge::Position {
                .deal = deal,
                .current_trick = bridge::Trick {
                    .leader = Seat::North,
                    .trump_suit = std::nullopt,
                },
                .played_cards = bridge::kFullDeck & ~(
                    deal.hands[0] | deal.hands[1] | deal.hands[2] | deal.hands[3]),
            },
        },
    };
    bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = std::nullopt,
        .target_tricks = 1,
        .max_declarer_plies = 1,
    };
    config.optimizations.root_cut = false;
    config.optimizations.quick_trick_bounds = false;

    const bridge::AlphaMuResult result = bridge::alpha_mu_search(worlds, config);
    require(result.best_move == bridge::make_card(Suit::Spades, Rank::Ace),
            "SA should prove the one-trick target immediately");
    require(result.root_moves.size() == 1 && result.stats.win_cuts == 1,
            "an all-winning vector should cut the remaining MAX moves");

    bridge::AlphaMuConfig uncut_config = config;
    uncut_config.optimizations.win_cut = false;
    const bridge::AlphaMuResult uncut = bridge::alpha_mu_search(worlds, uncut_config);
    require(uncut.root_moves.size() > 1 && uncut.stats.win_cuts == 0,
            "disabling win-cut should search the remaining root moves");
}

void test_alpha_mu_optimization_controls() {
    bridge::AlphaMuOptimizations optimizations = bridge::disabled_alpha_mu_optimizations();
    for (const bridge::AlphaMuOptimization optimization : {
             bridge::AlphaMuOptimization::IterativeDeepening,
             bridge::AlphaMuOptimization::TranspositionTable,
             bridge::AlphaMuOptimization::CanonicalTranspositionKeys,
             bridge::AlphaMuOptimization::MaxEquivalentCards,
             bridge::AlphaMuOptimization::MinEquivalentSuccessors,
             bridge::AlphaMuOptimization::EarlyCut,
             bridge::AlphaMuOptimization::UsefulWorlds,
             bridge::AlphaMuOptimization::WorldCuts,
             bridge::AlphaMuOptimization::EmptyEntry,
             bridge::AlphaMuOptimization::DeepAlphaCut,
             bridge::AlphaMuOptimization::RootCut,
             bridge::AlphaMuOptimization::WinCut,
             bridge::AlphaMuOptimization::TargetBounds,
             bridge::AlphaMuOptimization::QuickTrickBounds,
             bridge::AlphaMuOptimization::ForcedMoves,
             bridge::AlphaMuOptimization::ForcedTrumpRun,
             bridge::AlphaMuOptimization::LeafDdsBatch}) {
        require(!bridge::optimization_enabled(optimizations, optimization),
                "disabled optimization set should contain no enabled shortcuts");
        bridge::set_optimization_enabled(optimizations, optimization, true);
        require(bridge::optimization_enabled(optimizations, optimization),
                "named optimization setter should enable the requested shortcut");
        require(bridge::parse_alpha_mu_optimization(
                    bridge::to_string(optimization)) == optimization,
                "optimization names should parse back to their enum values");
        bridge::set_optimization_enabled(optimizations, optimization, false);
    }
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

void test_sampled_hand_respects_forced_cards() {
    const Hand available = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Ace),
        bridge::make_card(Suit::Spades, Rank::Queen),
        bridge::make_card(Suit::Hearts, Rank::Ace),
        bridge::make_card(Suit::Hearts, Rank::Jack),
        bridge::make_card(Suit::Diamonds, Rank::King),
        bridge::make_card(Suit::Clubs, Rank::Two),
    });
    const Card required = bridge::make_card(Suit::Hearts, Rank::Ace);
    const Card forbidden = bridge::make_card(Suit::Spades, Rank::Queen);
    HandSamplingConstraints constraints {};
    constraints.min_hcp = 5;

    for (std::uint64_t seed = 1; seed <= 20; ++seed) {
        const auto sampled = bridge::sample_constrained_hand(
            available,
            required,
            forbidden,
            constraints,
            seed,
            3);
        require(sampled.has_value(), "forced-card sampling should find a valid hand");
        require(bridge::contains(*sampled, required),
                "every sampled hand must contain its required cards");
        require(!bridge::contains(*sampled, forbidden),
                "no sampled hand may contain a forbidden card");
    }
}

void test_analysis_session_combines_defender_restrictions() {
    bridge::Deal deal;
    bridge::hand_of(deal, Seat::North) = *bridge::parse_hand_record("A.A.-.-");
    bridge::hand_of(deal, Seat::East) = *bridge::parse_hand_record("Q.J.-.-");
    bridge::hand_of(deal, Seat::South) = *bridge::parse_hand_record("K.K.-.-");
    bridge::hand_of(deal, Seat::West) = *bridge::parse_hand_record("J.Q.-.-");

    bridge::AnalysisSession session(deal, Seat::East, std::nullopt);
    bridge::DefenderRestrictions restrictions;
    restrictions.east.required_cards = bridge::make_card(Suit::Spades, Rank::Queen);
    restrictions.east.hand.min_lengths[static_cast<std::size_t>(Suit::Spades)] = 1;
    restrictions.east.hand.max_lengths[static_cast<std::size_t>(Suit::Spades)] = 1;
    restrictions.east.hand.min_hcp = 3;
    restrictions.east.hand.max_hcp = 3;
    restrictions.west.required_cards = bridge::make_card(Suit::Hearts, Rank::Queen);
    restrictions.west.hand.min_lengths[static_cast<std::size_t>(Suit::Hearts)] = 1;
    restrictions.west.hand.max_lengths[static_cast<std::size_t>(Suit::Hearts)] = 1;

    session.set_defender_restrictions(restrictions);
    require(session.possible_deals() == 1,
            "East and West restrictions should compile to one compatible layout");

    session.play(bridge::make_card(Suit::Spades, Rank::Queen));
    require(session.possible_deals() == 1,
            "initial restrictions should be reduced after a restricted card is played");

    restrictions.east.required_cards = bridge::make_card(Suit::Hearts, Rank::Queen);
    bool rejected = false;
    try {
        bridge::AnalysisSession invalid_session(deal, Seat::East, std::nullopt);
        invalid_session.set_defender_restrictions(restrictions);
    } catch (const std::invalid_argument&) {
        rejected = true;
    }
    require(rejected, "restrictions that contradict the true deal must be rejected");
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

    const bridge::Position north_to_play {
        .deal = deal,
        .current_trick = Trick {.leader = Seat::North},
    };
    const bridge::Position east_to_play {
        .deal = deal,
        .current_trick = Trick {.leader = Seat::East, .trump_suit = Suit::Spades},
    };
    const std::vector<std::uint8_t> batch =
        bridge::double_dummy_future_tricks_batch(
            {north_to_play, east_to_play}, Seat::South);
    require(batch.size() == 2 &&
                batch[0] == bridge::double_dummy_future_tricks(
                    north_to_play, Seat::South) &&
                batch[1] == bridge::double_dummy_future_tricks(
                    east_to_play, Seat::South),
            "batched DDS leaves should exactly match scalar DDS results");
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

std::vector<bridge::AlphaMuWorld> two_to_one_count_worlds() {
    const Hand north = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Jack),
        bridge::make_card(Suit::Spades, Rank::Ten),
    });
    const Hand south = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::King),
        bridge::make_card(Suit::Spades, Rank::Six),
    });

    auto make_world = [&](Hand east, Hand west) {
        return bridge::AlphaMuWorld {
            .position = bridge::Position {
                .deal = bridge::Deal {.hands = {north, east, south, west}},
                .current_trick = bridge::Trick {
                    .leader = Seat::North,
                    .trump_suit = std::nullopt,
                },
            },
        };
    };

    return {
        make_world(
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Spades, Rank::Four),
            }),
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Five),
                bridge::make_card(Suit::Spades, Rank::Three),
            })),
        make_world(
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Spades, Rank::Five),
            }),
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Four),
                bridge::make_card(Suit::Spades, Rank::Three),
            })),
        make_world(
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Five),
                bridge::make_card(Suit::Spades, Rank::Four),
            }),
            bridge::make_hand({
                bridge::make_card(Suit::Spades, Rank::Queen),
                bridge::make_card(Suit::Spades, Rank::Three),
            })),
    };
}

std::vector<bridge::AlphaMuWorld> exact_four_card_spade_worlds() {
    const Hand north = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::Ace),
        bridge::make_card(Suit::Spades, Rank::Jack),
        bridge::make_card(Suit::Spades, Rank::Ten),
        bridge::make_card(Suit::Spades, Rank::Nine),
    });
    const Hand south = bridge::make_hand({
        bridge::make_card(Suit::Spades, Rank::King),
        bridge::make_card(Suit::Spades, Rank::Eight),
        bridge::make_card(Suit::Spades, Rank::Seven),
        bridge::make_card(Suit::Spades, Rank::Six),
    });
    const Hand fixed_east = bridge::make_hand({
        bridge::make_card(Suit::Clubs, Rank::Jack),
        bridge::make_card(Suit::Clubs, Rank::Nine),
    });
    const Hand variable = bridge::make_hand({
        bridge::make_card(Suit::Hearts, Rank::Nine),
        bridge::make_card(Suit::Spades, Rank::Queen),
        bridge::make_card(Suit::Spades, Rank::Five),
        bridge::make_card(Suit::Spades, Rank::Four),
        bridge::make_card(Suit::Spades, Rank::Three),
        bridge::make_card(Suit::Spades, Rank::Two),
    });
    const std::vector<Card> cards = ordered_cards(variable);
    std::vector<bridge::AlphaMuWorld> worlds;
    for (std::size_t first = 0; first < cards.size(); ++first) {
        for (std::size_t second = first + 1; second < cards.size(); ++second) {
            const Hand selected = bridge::make_hand({cards[first], cards[second]});
            const Hand east = fixed_east | selected;
            const Hand west = variable & ~selected;
            const Hand remaining = north | east | south | west;
            worlds.push_back(bridge::AlphaMuWorld {
                .position = bridge::Position {
                    .deal = bridge::Deal {.hands = {north, east, south, west}},
                    .current_trick = bridge::Trick {
                        .leader = Seat::South,
                        .trump_suit = std::nullopt,
                    },
                    .score = bridge::Score {.north_south = 9},
                    .played_cards = bridge::kFullDeck & ~remaining,
                    .completed_tricks = 9,
                },
            });
        }
    }
    return worlds;
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

    const ParetoFront candidate {.vectors = {
        OutcomeVector {.wins = 0b0011},
        OutcomeVector {.wins = 0b0100},
    }};
    const ParetoFront bound {.vectors = {OutcomeVector {.wins = 0b0111}}};
    require(bridge::pareto_front_is_covered_by(candidate, bound),
            "a front should be covered when every vector is dominated by the bound");
    require(!bridge::pareto_front_is_covered_by(bound, candidate),
            "front coverage should preserve the direction of the alpha bound");
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

void test_alpha_mu_retains_globally_selected_trick_response() {
    const auto worlds = two_to_one_count_worlds();
    const bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = std::nullopt,
        .target_tricks = 2,
        .max_declarer_plies = 2,
        .build_trick_policy = true,
    };

    const bridge::AlphaMuResult result = bridge::alpha_mu_search(worlds, config);
    require(result.best_move == bridge::make_card(Suit::Spades, Rank::Jack),
            "the two-to-one count strategy should begin with SJ");
    require(result.trick_policy != nullptr &&
                result.trick_policy->declarer_move == result.best_move,
            "alpha-mu should expose the selected root strategy");

    const auto east_node = result.trick_policy->continuation;
    require(east_node != nullptr && east_node->player == Seat::East,
            "the trick strategy should branch on East's card");
    const Card east_four = bridge::make_card(Suit::Spades, Rank::Four);
    const auto branch = std::find_if(
        east_node->defender_branches.begin(),
        east_node->defender_branches.end(),
        [&](const bridge::AlphaMuPolicyBranch& candidate) {
            return candidate.card == east_four;
        });
    require(branch != east_node->defender_branches.end() &&
                branch->possible_worlds == 0b101,
            "E4 should retain the queen-East and queen-West worlds where E4 exists");
    require(branch->continuation != nullptr &&
                branch->continuation->player == Seat::South &&
                branch->continuation->declarer_move ==
                    bridge::make_card(Suit::Spades, Rank::Six),
            "the globally selected two-to-one strategy must play S6 after E4");
}

void test_alpha_mu_exact_four_card_spade_distribution() {
    const auto worlds = exact_four_card_spade_worlds();
    bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = std::nullopt,
        .target_tricks = 13,
        .max_declarer_plies = 4,
    };
    config.optimizations.root_cut = false;
    // Search every root card so a win cut cannot masquerade as equivalence.
    config.optimizations.win_cut = false;
    const bridge::AlphaMuResult result = bridge::alpha_mu_search(worlds, config);
    const auto score_for = [&](Card card) {
        const auto move = std::find_if(
            result.root_moves.begin(),
            result.root_moves.end(),
            [&](const bridge::AlphaMuRootMove& candidate) {
                return candidate.move == card;
            });
        require(move != result.root_moves.end(), "expected spade move was not evaluated");
        return move->winning_worlds;
    };
    require(result.best_move == bridge::make_card(Suit::Spades, Rank::Eight),
            "the first-round finesse should be optimal at M=4");
    require(score_for(bridge::make_card(Suit::Spades, Rank::King)) == 7,
            "SK should win only the layouts resolved without a later entry guess");
    require(score_for(bridge::make_card(Suit::Spades, Rank::Eight)) == 10,
            "S8 should win every queen-West layout");
    require(result.stats.useful_worlds_removed > 0 &&
                result.stats.world_cuts > 0,
            "the mixed-layout ending should remove proven losses and reach world cuts");
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

    bridge::AlphaMuConfig comparison_config = config;
    comparison_config.compare_all_root_moves = true;
    const auto comparison = bridge::alpha_mu_search(worlds, comparison_config);
    require(comparison.root_moves.size() > 1 &&
                std::all_of(
                    comparison.root_moves.begin(),
                    comparison.root_moves.end(),
                    [](const bridge::AlphaMuRootMove& move) {
                        return !move.front.vectors.empty();
                    }),
            "full root comparison should retain an exact front for every candidate card");
}

void test_alpha_mu_optimizations_match_reference_search() {
    const auto worlds = example_one_worlds();
    bridge::AlphaMuConfig optimized_config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 4,
        .max_declarer_plies = 3,
    };
    bridge::AlphaMuConfig reference_config = optimized_config;
    reference_config.optimizations = bridge::disabled_alpha_mu_optimizations();

    const bridge::AlphaMuResult optimized =
        bridge::alpha_mu_search(worlds, optimized_config);
    const bridge::AlphaMuResult reference =
        bridge::alpha_mu_search(worlds, reference_config);

    require(optimized.best_move == reference.best_move,
            "optimized alpha-mu should choose the same move as reference search");
    require(bridge::best_winning_world_count(optimized.front) ==
                bridge::best_winning_world_count(reference.front),
            "optimized alpha-mu should preserve the reference winning-world score");
    require(optimized.stats.completed_iterations == 3,
            "M=3 iterative deepening should complete three iterations");
    require(optimized.stats.transposition_probes > 0 &&
                optimized.stats.transposition_stores > 0,
            "optimized search should exercise its transposition table");
    require(optimized.stats.early_cuts + optimized.stats.root_cuts +
                optimized.stats.win_cuts > 0,
            "Example 1 at M=3 should exercise at least one search cut");
    require(reference.stats.completed_iterations == 1 &&
                reference.stats.transposition_probes == 0 &&
                reference.stats.early_cuts == 0 &&
                reference.stats.useful_worlds_removed == 0 &&
                reference.stats.world_cuts == 0 &&
                reference.stats.empty_entry_searches == 0 &&
                reference.stats.deep_alpha_cuts == 0 &&
                reference.stats.root_cuts == 0 &&
                reference.stats.equivalent_moves_skipped == 0 &&
                reference.stats.forced_trump_run_cuts == 0 &&
                reference.stats.win_cuts == 0 &&
                reference.stats.leaf_dds_batches == 0,
            "reference search should execute without optimization shortcuts");
}

void test_alpha_mu_world_cut_and_leaf_batch_counters() {
    const auto all_worlds = example_one_worlds();
    bridge::AlphaMuConfig leaf_config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 4,
        .max_declarer_plies = 0,
    };
    leaf_config.optimizations.iterative_deepening = false;
    const bridge::AlphaMuResult batched =
        bridge::alpha_mu_search(all_worlds, leaf_config);
    require(batched.stats.leaf_dds_batches == 1 &&
                batched.stats.leaf_dds_worlds == all_worlds.size(),
            "a multi-world DDS leaf should use one observable DDS batch");

    bridge::AlphaMuConfig scalar_config = leaf_config;
    scalar_config.optimizations.leaf_dds_batch = false;
    const bridge::AlphaMuResult scalar =
        bridge::alpha_mu_search(all_worlds, scalar_config);
    require(batched.front.vectors.size() == 1 &&
                scalar.front.vectors.size() == 1 &&
                batched.front.vectors.front().wins ==
                    scalar.front.vectors.front().wins &&
                scalar.stats.leaf_dds_batches == 0,
            "batched and scalar alpha-mu leaves should have identical outcomes");

    bridge::AlphaMuConfig cut_config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 4,
        .max_declarer_plies = 2,
    };
    cut_config.optimizations.iterative_deepening = false;
    cut_config.optimizations.forced_trump_run = false;
    const bridge::AlphaMuResult cut =
        bridge::alpha_mu_search({all_worlds.front()}, cut_config);
    require(cut.stats.one_world_cuts > 0 && cut.stats.world_cuts > 0,
            "one useful world should stop recursion with the paper's DDS world cut");
}

void test_second_paper_cuts_are_observable() {
    const bridge::Deal deal {.hands = {
        *bridge::parse_hand_record("AJ32.A.-.-"),
        *bridge::parse_hand_record("QT8.2.3.-"),
        *bridge::parse_hand_record("K954.K.-.-"),
        *bridge::parse_hand_record("76.-.2.32"),
    }};
    bridge::AnalysisSession enabled_session(deal, Seat::North, Suit::Spades);
    bridge::BotSettings settings = enabled_session.settings();
    settings.world_count = 8;
    settings.max_declarer_plies = 6;
    settings.target_tricks = 4;
    settings.max_search_seconds = 0.0;
    settings.optimizations.root_cut = false;
    settings.optimizations.win_cut = false;
    enabled_session.set_settings(settings);
    bridge::AnalysisSession disabled_session(deal, Seat::North, Suit::Spades);
    settings.optimizations.empty_entry = false;
    disabled_session.set_settings(settings);
    const bridge::SessionAnalysis empty_entry_enabled = enabled_session.analyze();
    const bridge::SessionAnalysis empty_entry_disabled = disabled_session.analyze();
    require(empty_entry_enabled.search.stats.empty_entry_searches > 0 &&
                empty_entry_disabled.search.stats.empty_entry_searches == 0,
            "the empty-entry switch should expose avoided missing-bound searches");
    require(bridge::best_winning_world_count(empty_entry_enabled.search.front) ==
                bridge::best_winning_world_count(empty_entry_disabled.search.front),
            "empty-entry searches must preserve the winning-world score");

    settings.world_count = 4;
    settings.max_declarer_plies = 4;
    settings.optimizations.empty_entry = true;
    settings.optimizations.early_cut = false;
    bridge::AnalysisSession deep_session(deal, Seat::North, Suit::Spades);
    deep_session.set_settings(settings);
    const bridge::OptimizationBenchmark deep_alpha =
        deep_session.benchmark(bridge::AlphaMuOptimization::DeepAlphaCut);
    require(deep_alpha.enabled.search.stats.deep_alpha_cuts > 0 &&
                deep_alpha.disabled.search.stats.deep_alpha_cuts == 0,
            "the deep-alpha switch should expose dominated interior MIN fronts");
    require(bridge::best_winning_world_count(deep_alpha.enabled.search.front) ==
                bridge::best_winning_world_count(deep_alpha.disabled.search.front),
            "deep alpha cuts must preserve the winning-world score");
}

void test_alpha_mu_soft_time_limit_stops_between_iterations() {
    const auto worlds = example_one_worlds();
    const bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 4,
        .max_declarer_plies = 3,
        .max_search_seconds = 1e-12,
    };

    const bridge::AlphaMuResult result = bridge::alpha_mu_search(worlds, config);
    require(result.stats.stopped_by_time_limit,
            "a tiny soft budget should stop iterative deepening");
    require(result.stats.completed_depth == 1 &&
                result.stats.completed_iterations == 1,
            "the current M should finish before the next iteration is declined");
    require(result.best_move != bridge::kNoCard,
            "the last completed iteration must still return a move");
}

void test_alpha_mu_target_bounds_cut_impossible_contract() {
    const bridge::Deal deal {.hands = {
        bridge::remove_card(
            bridge::suit_mask(Suit::Hearts),
            bridge::make_card(Suit::Hearts, Rank::Two)),
        bridge::remove_card(
            bridge::suit_mask(Suit::Diamonds),
            bridge::make_card(Suit::Diamonds, Rank::Two)),
        bridge::remove_card(
            bridge::suit_mask(Suit::Spades),
            bridge::make_card(Suit::Spades, Rank::Two)),
        bridge::remove_card(
            bridge::suit_mask(Suit::Clubs),
            bridge::make_card(Suit::Clubs, Rank::Two)),
    }};
    const std::vector<bridge::AlphaMuWorld> worlds {
        bridge::AlphaMuWorld {
            .position = bridge::Position {
                .deal = deal,
                .current_trick = bridge::Trick {.leader = Seat::South},
                .score = bridge::Score {.north_south = 0, .east_west = 1},
                .played_cards = bridge::kFullDeck & ~(
                    deal.hands[0] | deal.hands[1] | deal.hands[2] | deal.hands[3]),
                .completed_tricks = 1,
            },
        },
    };
    bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .target_tricks = 13,
        .max_declarer_plies = bridge::kMaxDeclarerPlies,
        .collect_audit_log = true,
    };

    const bridge::AlphaMuResult bounded = bridge::alpha_mu_search(worlds, config);
    require(bridge::best_winning_world_count(bounded.front) == 0 &&
                bounded.stats.target_impossible_cuts == 1 &&
                bounded.stats.dds_worlds == 0 &&
                bounded.stats.nodes == 1 &&
                bounded.stats.completed_depth == 1,
            "after losing one trick, a 13-trick target should fail without DDS");
    require(bounded.audit_log.find("[target-bound]") != std::string::npos,
            "the impossible-target proof should be visible in the audit log");

    config.optimizations.target_bounds = false;
    config.optimizations.iterative_deepening = false;
    config.max_declarer_plies = 1;
    config.collect_audit_log = false;
    const bridge::AlphaMuResult unbounded = bridge::alpha_mu_search(worlds, config);
    require(bridge::best_winning_world_count(unbounded.front) == 0 &&
                unbounded.stats.target_impossible_cuts == 0 &&
                unbounded.stats.dds_worlds > 0,
            "disabling target bounds should preserve the result but require DDS");
}

void test_quick_tricks_proves_thirteen_running_winners() {
    const bridge::Deal deal {.hands = {
        bridge::suit_mask(Suit::Spades),
        bridge::suit_mask(Suit::Diamonds),
        bridge::suit_mask(Suit::Hearts),
        bridge::suit_mask(Suit::Clubs),
    }};
    const bridge::Position position {
        .deal = deal,
        .current_trick = bridge::Trick {.leader = Seat::North},
    };

    const bridge::QuickTrickProof proof =
        bridge::prove_declarer_quick_tricks(position, Seat::South, 13);
    require(proof.proven &&
                proof.first_card == bridge::make_card(Suit::Spades, Rank::Ace) &&
                !proof.budget_exhausted,
            "the public two-hand proof should recognize thirteen running spades");

    const std::vector<bridge::AlphaMuWorld> worlds {
        bridge::AlphaMuWorld {.position = position},
    };
    bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .target_tricks = 13,
        .max_declarer_plies = bridge::kMaxDeclarerPlies,
        .collect_audit_log = true,
    };
    const bridge::AlphaMuResult bounded =
        bridge::alpha_mu_search(worlds, config);
    require(bounded.best_move == proof.first_card &&
                bridge::best_winning_world_count(bounded.front) == 1 &&
                bounded.stats.quick_trick_root_cuts == 1 &&
                bounded.stats.dds_worlds == 0 &&
                bounded.stats.nodes == 1 &&
                bounded.stats.completed_depth == 1,
            "quick tricks should end iterative alpha-mu before DDS or card expansion");
    require(bounded.audit_log.find("[quick-tricks]") != std::string::npos,
            "the quick-trick proof should be visible in the audit log");

    config.optimizations.quick_trick_bounds = false;
    config.optimizations.iterative_deepening = false;
    config.max_declarer_plies = 1;
    config.collect_audit_log = false;
    const bridge::AlphaMuResult unbounded =
        bridge::alpha_mu_search(worlds, config);
    require(bridge::best_winning_world_count(unbounded.front) == 1 &&
                unbounded.stats.quick_trick_cuts == 0 &&
                unbounded.stats.dds_worlds > 0,
            "disabling quick tricks should preserve the result and restore DDS work");
}

void test_quick_tricks_does_not_assume_a_safe_side_suit() {
    const bridge::Deal deal {.hands = {
        bridge::make_hand({
            bridge::make_card(Suit::Clubs, Rank::Ace),
            bridge::make_card(Suit::Clubs, Rank::King),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Two),
            bridge::make_card(Suit::Diamonds, Rank::Two),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Hearts, Rank::Ace),
            bridge::make_card(Suit::Hearts, Rank::King),
        }),
        bridge::make_hand({
            bridge::make_card(Suit::Spades, Rank::Three),
            bridge::make_card(Suit::Diamonds, Rank::Three),
        }),
    }};
    const bridge::Position trump_position {
        .deal = deal,
        .current_trick = bridge::Trick {
            .leader = Seat::North,
            .trump_suit = Suit::Spades,
        },
        .played_cards = bridge::kFullDeck & ~(
            deal.hands[0] | deal.hands[1] | deal.hands[2] | deal.hands[3]),
    };
    const bridge::QuickTrickProof unsafe =
        bridge::prove_declarer_quick_tricks(
            trump_position, Seat::South, 1);
    require(!unsafe.proven,
            "a side-suit ace is not layout-independent while defenders hold trumps");

    bridge::Position no_trump_position = trump_position;
    no_trump_position.current_trick.trump_suit.reset();
    const bridge::QuickTrickProof safe =
        bridge::prove_declarer_quick_tricks(
            no_trump_position, Seat::South, 2);
    require(safe.proven &&
                safe.first_card == bridge::make_card(Suit::Clubs, Rank::Ace),
            "the same two top clubs should be a safe no-trump cashing run");
}

void test_alpha_mu_supports_full_26_ply_ceiling() {
    const bridge::Deal deal {.hands = {
        bridge::make_hand({bridge::make_card(Suit::Spades, Rank::Ace)}),
        bridge::make_hand({bridge::make_card(Suit::Spades, Rank::Two)}),
        bridge::make_hand({bridge::make_card(Suit::Spades, Rank::King)}),
        bridge::make_hand({bridge::make_card(Suit::Spades, Rank::Queen)}),
    }};
    const std::vector<bridge::AlphaMuWorld> worlds {
        bridge::AlphaMuWorld {
            .position = bridge::Position {
                .deal = deal,
                .current_trick = bridge::Trick {.leader = Seat::North},
                .played_cards = bridge::kFullDeck & ~(
                    deal.hands[0] | deal.hands[1] | deal.hands[2] | deal.hands[3]),
            },
        },
    };
    bridge::AlphaMuConfig config {
        .declarer = Seat::South,
        .target_tricks = 1,
        .max_declarer_plies = bridge::kMaxDeclarerPlies,
    };
    config.optimizations.iterative_deepening = false;

    const bridge::AlphaMuResult result = bridge::alpha_mu_search(worlds, config);
    require(result.best_move == bridge::make_card(Suit::Spades, Rank::Ace) &&
                bridge::best_winning_world_count(result.front) == 1,
            "M=26 should search a simple ending to its winning terminal state");
    require(result.stats.completed_depth == bridge::kMaxDeclarerPlies,
            "the transposition table should safely store the M=26 root result");
}

}  // namespace

int main() {
    try {
        test_hand_record_parser();
        test_analysis_session_tracks_public_play();
        test_alpha_mu_skips_touching_equal_cards();
        test_alpha_mu_all_equal_suits_are_trivial();
        test_alpha_mu_cuts_max_node_on_all_winning_vector();
        test_alpha_mu_optimization_controls();
        test_analysis_session_returns_forced_move_without_sampling();
        test_analysis_session_autoplays_one_equivalent_class();
        test_alpha_mu_collapses_forced_internal_nodes();
        test_card_bitmask_layout_and_operations();
        test_legal_plays_follow_suit();
        test_trick_winner_with_trump();
        test_shortened_position_finishes_when_hands_are_empty();
        test_sampling_count_matches_bruteforce();
        test_sampling_count_matches_bruteforce_medium_subset();
        test_partition_identity();
        test_sampled_hand_satisfies_constraints();
        test_sampled_hand_respects_forced_cards();
        test_analysis_session_combines_defender_restrictions();
        test_real_world_exact_shape_count();
        test_real_world_small_hearts_count();
        test_double_dummy_wrapper_smoke();
        test_pareto_front_removes_dominated_outcomes();
        test_max_and_min_front_combinations();
        test_alpha_mu_leaf_front_uses_world_bits();
        test_alpha_mu_one_ply_returns_legal_declarer_move();
        test_alpha_mu_preserves_two_way_guess();
        test_alpha_mu_finds_spade_discovery_play();
        test_alpha_mu_retains_globally_selected_trick_response();
        test_alpha_mu_exact_four_card_spade_distribution();
        test_alpha_mu_example_one_classic_combination();
        test_alpha_mu_optimizations_match_reference_search();
        test_alpha_mu_world_cut_and_leaf_batch_counters();
        test_second_paper_cuts_are_observable();
        test_alpha_mu_soft_time_limit_stops_between_iterations();
        test_alpha_mu_target_bounds_cut_impossible_contract();
        test_quick_tricks_proves_thirteen_running_winners();
        test_quick_tricks_does_not_assume_a_safe_side_suit();
        test_alpha_mu_supports_full_26_ply_ceiling();
    } catch (const std::exception& error) {
        std::cerr << "Test failure: " << error.what() << "\n";
        return 1;
    }

    std::cout << "All bridge engine tests passed.\n";
    return 0;
}
