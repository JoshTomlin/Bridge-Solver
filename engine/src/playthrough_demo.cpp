#include "playthrough_demo.h"

#include "bridge/engine.h"

#include <algorithm>
#include <array>
#include <bit>
#include <chrono>
#include <iostream>
#include <limits>
#include <memory>
#include <optional>
#include <random>
#include <stdexcept>
#include <string>
#include <unordered_set>
#include <vector>

namespace bridge::demo {
namespace {

constexpr std::size_t kWorldCount = 64;
constexpr std::uint8_t kContractTricks = 12;
constexpr std::uint64_t kTrueDealSeed = 0x6E6F727468ULL;
constexpr std::uint64_t kWorldSeed = 0x776F726C6473ULL;
constexpr std::uint64_t kSeedStep = 0x9E3779B97F4A7C15ULL;

using VoidTable = std::array<std::array<bool, 4>, 4>;

struct SampleBatch {
    std::vector<AlphaMuWorld> worlds;
    std::uint64_t possible_deals {};
    std::size_t unique_samples {};
    std::size_t queen_east {};
    std::size_t queen_west {};
    double milliseconds {};
};

Hand north_hand_for_example_two() {
    return make_hand({
        make_card(Suit::Spades, Rank::Ace),
        make_card(Suit::Spades, Rank::Jack),
        make_card(Suit::Spades, Rank::Ten),
        make_card(Suit::Spades, Rank::Nine),
        make_card(Suit::Hearts, Rank::Ace),
        make_card(Suit::Hearts, Rank::King),
        make_card(Suit::Hearts, Rank::Queen),
        make_card(Suit::Diamonds, Rank::Ace),
        make_card(Suit::Diamonds, Rank::King),
        make_card(Suit::Diamonds, Rank::Queen),
        make_card(Suit::Clubs, Rank::Four),
        make_card(Suit::Clubs, Rank::Three),
        make_card(Suit::Clubs, Rank::Two),
    });
}

Hand south_hand_for_example_two() {
    return make_hand({
        make_card(Suit::Spades, Rank::King),
        make_card(Suit::Spades, Rank::Eight),
        make_card(Suit::Spades, Rank::Seven),
        make_card(Suit::Spades, Rank::Six),
        make_card(Suit::Hearts, Rank::Four),
        make_card(Suit::Hearts, Rank::Three),
        make_card(Suit::Hearts, Rank::Two),
        make_card(Suit::Diamonds, Rank::Four),
        make_card(Suit::Diamonds, Rank::Three),
        make_card(Suit::Diamonds, Rank::Two),
        make_card(Suit::Clubs, Rank::Ace),
        make_card(Suit::Clubs, Rank::King),
        make_card(Suit::Clubs, Rank::Queen),
    });
}

std::vector<Card> ordered_cards(Hand cards) {
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
    return result;
}

Card random_card(Hand cards, std::mt19937_64& rng) {
    const std::vector<Card> choices = ordered_cards(cards);
    if (choices.empty()) {
        throw std::invalid_argument("cannot choose from an empty card set");
    }
    std::uniform_int_distribution<std::size_t> distribution(0, choices.size() - 1);
    return choices[distribution(rng)];
}

std::uint8_t declarer_tricks(const Position& position) {
    return position.score.north_south;
}

void wait_for_step(bool enabled) {
    if (!enabled) {
        return;
    }
    std::cout << "Press Enter for the next card..." << std::flush;
    std::string line;
    std::getline(std::cin, line);
}

void observe_void(
    const Trick& trick,
    Seat player,
    Card card,
    VoidTable& voids) {
    if (same_side(player, Seat::South) || trick.card_count == 0) {
        return;
    }

    const Suit lead_suit = suit_of(trick.cards[0]);
    if (suit_of(card) != lead_suit) {
        voids[seat_index(player)][static_cast<std::size_t>(lead_suit)] = true;
    }
}

std::string void_suits(const VoidTable& voids, Seat seat) {
    std::string result;
    for (const Suit suit : {Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        if (voids[seat_index(seat)][static_cast<std::size_t>(suit)]) {
            result += to_string(suit);
        }
    }
    return result.empty() ? "none" : result;
}

Deal generate_true_deal(std::uint64_t true_deal_seed) {
    const Hand north = north_hand_for_example_two();
    const Hand south = south_hand_for_example_two();
    const Hand defender_cards = kFullDeck & ~(north | south);
    const HandSamplingConstraints constraints;
    const std::optional<Hand> east = sample_constrained_hand(
        defender_cards,
        constraints,
        true_deal_seed,
        13);
    if (!east.has_value()) {
        throw std::runtime_error("failed to generate the true defender layout");
    }

    return Deal {.hands = {
        north,
        *east,
        south,
        defender_cards & ~*east,
    }};
}

HandSamplingConstraints posterior_constraints(
    Hand defender_cards,
    const VoidTable& voids) {
    HandSamplingConstraints constraints;
    for (const Suit suit : {Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades}) {
        const std::size_t index = static_cast<std::size_t>(suit);
        const bool east_void = voids[seat_index(Seat::East)][index];
        const bool west_void = voids[seat_index(Seat::West)][index];

        if (east_void) {
            constraints.max_lengths[index] = 0;
        }
        if (west_void) {
            const std::uint8_t remaining = card_count(cards_in_suit(defender_cards, suit));
            constraints.min_lengths[index] = remaining;
            constraints.max_lengths[index] = remaining;
        }
    }
    return constraints;
}

SampleBatch sample_public_worlds(
    const Position& public_position,
    const VoidTable& voids,
    std::uint8_t east_cards_remaining,
    std::size_t decision_number,
    std::uint64_t world_seed) {
    const auto start = std::chrono::steady_clock::now();
    const Hand north = hand_of(public_position.deal, Seat::North);
    const Hand south = hand_of(public_position.deal, Seat::South);
    const Hand defender_cards = kFullDeck & ~(public_position.played_cards | north | south);
    const HandSamplingConstraints constraints = posterior_constraints(defender_cards, voids);

    SampleBatch batch;
    batch.possible_deals = count_constrained_hands(
        defender_cards,
        kEmptyHand,
        kEmptyHand,
        constraints,
        east_cards_remaining);
    if (batch.possible_deals == 0) {
        throw std::runtime_error("public information produced no possible defender deals");
    }

    batch.worlds.reserve(kWorldCount);
    std::unordered_set<Hand> unique_east_hands;
    const Card spade_queen = make_card(Suit::Spades, Rank::Queen);
    for (std::size_t world = 0; world < kWorldCount; ++world) {
        const std::uint64_t seed =
            world_seed + decision_number * kSeedStep + world;
        const std::optional<Hand> east = sample_constrained_hand(
            defender_cards,
            constraints,
            seed,
            east_cards_remaining);
        if (!east.has_value()) {
            throw std::runtime_error("failed to sample a public-information world");
        }

        unique_east_hands.insert(*east);
        const Hand west = defender_cards & ~*east;
        if (contains(*east, spade_queen)) {
            ++batch.queen_east;
        } else if (contains(west, spade_queen)) {
            ++batch.queen_west;
        }

        Position sampled_position = public_position;
        hand_of(sampled_position.deal, Seat::East) = *east;
        hand_of(sampled_position.deal, Seat::West) = west;
        batch.worlds.push_back(AlphaMuWorld {.position = sampled_position});
    }

    batch.unique_samples = unique_east_hands.size();
    const auto end = std::chrono::steady_clock::now();
    batch.milliseconds =
        std::chrono::duration<double, std::milli>(end - start).count();
    return batch;
}

AlphaMuResult choose_alpha_mu_strategy(
    const Position& actual_position,
    const SampleBatch& samples,
    std::uint8_t target_tricks,
    std::uint8_t search_depth,
    double max_search_seconds) {
    const Seat player = next_to_play(actual_position.current_trick);
    const Hand legal = legal_plays(
        actual_position.current_trick,
        hand_of(actual_position.deal, player));
    const AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = std::nullopt,
        .target_tricks = target_tricks,
        .max_declarer_plies = search_depth,
        .build_trick_policy = true,
        .max_search_seconds = max_search_seconds,
    };

    const auto start = std::chrono::steady_clock::now();
    const AlphaMuResult result = alpha_mu_search(samples.worlds, config);
    const auto end = std::chrono::steady_clock::now();

    std::cout << "Alpha-mu final-iteration root moves:\n";
    for (const AlphaMuRootMove& move : result.root_moves) {
        std::cout << "  " << to_string(move.move) << ": "
                  << move.winning_worlds << '/' << kWorldCount
                  << " worlds, " << move.pareto_vectors << " vector(s)\n";
    }
    const std::size_t legal_count = card_count(legal);
    if (result.root_moves.size() < legal_count) {
        std::cout << "  " << (legal_count - result.root_moves.size())
                  << " root move(s) skipped by the root cut.\n";
    }

    const double milliseconds =
        std::chrono::duration<double, std::milli>(end - start).count();
    std::cout << "Alpha-mu chooses " << to_string(result.best_move)
              << " with " << best_winning_world_count(result.front)
              << '/' << kWorldCount << " worlds in " << milliseconds << " ms.\n";
    std::cout << "Search stats: nodes=" << result.stats.nodes
              << " DDS-worlds=" << result.stats.dds_worlds
              << " TT-hits=" << result.stats.transposition_hits
              << " early-cuts=" << result.stats.early_cuts
              << " deep-alpha-cuts=" << result.stats.deep_alpha_cuts
              << " useful-removed=" << result.stats.useful_worlds_removed
              << " world-cuts=" << result.stats.world_cuts
              << " empty-entry=" << result.stats.empty_entry_searches
              << " root-cuts=" << result.stats.root_cuts
              << " equals-skipped=" << result.stats.equivalent_moves_skipped
              << " (MAX=" << result.stats.max_equivalent_moves_skipped
              << ", MIN=" << result.stats.min_equivalent_moves_skipped << ')'
              << " forced-trump-cuts=" << result.stats.forced_trump_run_cuts
              << " win-cuts=" << result.stats.win_cuts
              << " target-bounds="
              << result.stats.target_reached_cuts +
                     result.stats.target_impossible_cuts
              << " DDS-batches=" << result.stats.leaf_dds_batches
              << " completed-M=" << static_cast<int>(result.stats.completed_depth);
    if (result.stats.stopped_by_time_limit) {
        std::cout << " (soft time limit reached)";
    }
    std::cout << "\n";
    return result;
}

void accumulate_search_stats(
    AlphaMuSearchStats& total,
    const AlphaMuSearchStats& current) {
    total.nodes += current.nodes;
    total.leaves += current.leaves;
    total.dds_worlds += current.dds_worlds;
    total.transposition_probes += current.transposition_probes;
    total.transposition_hits += current.transposition_hits;
    total.transposition_stores += current.transposition_stores;
    total.early_cuts += current.early_cuts;
    total.useful_worlds_removed += current.useful_worlds_removed;
    total.world_cuts += current.world_cuts;
    total.zero_world_cuts += current.zero_world_cuts;
    total.one_world_cuts += current.one_world_cuts;
    total.empty_entry_searches += current.empty_entry_searches;
    total.deep_alpha_cuts += current.deep_alpha_cuts;
    total.root_cuts += current.root_cuts;
    total.equivalent_moves_skipped += current.equivalent_moves_skipped;
    total.max_equivalent_moves_skipped += current.max_equivalent_moves_skipped;
    total.min_equivalent_moves_skipped += current.min_equivalent_moves_skipped;
    total.forced_move_nodes += current.forced_move_nodes;
    total.forced_max_nodes += current.forced_max_nodes;
    total.forced_min_nodes += current.forced_min_nodes;
    total.forced_root_recommendations += current.forced_root_recommendations;
    total.forced_trump_run_cuts += current.forced_trump_run_cuts;
    total.win_cuts += current.win_cuts;
    total.target_reached_cuts += current.target_reached_cuts;
    total.target_impossible_cuts += current.target_impossible_cuts;
    total.leaf_dds_batches += current.leaf_dds_batches;
    total.leaf_dds_worlds += current.leaf_dds_worlds;
    total.tree_search_ms += current.tree_search_ms;
    total.policy_build_ms += current.policy_build_ms;
}

const AlphaMuPolicyBranch* policy_branch_for_card(
    const AlphaMuPolicyNode& policy,
    Card card) {
    const auto found = std::find_if(
        policy.defender_branches.begin(),
        policy.defender_branches.end(),
        [&](const AlphaMuPolicyBranch& branch) { return branch.card == card; });
    return found == policy.defender_branches.end() ? nullptr : &*found;
}

Card choose_double_dummy_defender_card(
    const Position& position,
    std::uint8_t& predicted_declarer_tricks) {
    const Seat player = next_to_play(position.current_trick);
    const Hand hand = hand_of(position.deal, player);
    Hand legal = legal_plays(position.current_trick, hand);

    const bool is_lead = position.current_trick.card_count == 0;
    const bool is_discard = !is_lead &&
        cards_in_suit(hand, suit_of(position.current_trick.cards[0])) == kEmptyHand;
    if (is_lead || is_discard) {
        const Hand non_spades = legal & ~suit_mask(Suit::Spades);
        if (non_spades != kEmptyHand) {
            legal = non_spades;
        }
    }
    std::uint8_t minimum = std::numeric_limits<std::uint8_t>::max();
    std::vector<Card> best_cards;

    for (const Card card : ordered_cards(legal)) {
        Position child = position;
        play_card(child, card);
        const std::uint8_t total = static_cast<std::uint8_t>(
            declarer_tricks(child) + double_dummy_future_tricks(child, Seat::South));
        if (total < minimum) {
            minimum = total;
            best_cards = {card};
        } else if (total == minimum) {
            best_cards.push_back(card);
        }
    }

    predicted_declarer_tricks = minimum;
    Card lowest = best_cards.front();
    for (const Card card : best_cards) {
        if (static_cast<std::uint8_t>(rank_of(card)) <
            static_cast<std::uint8_t>(rank_of(lowest))) {
            lowest = card;
        }
    }
    return lowest;
}

void print_public_state(const Position& position, const VoidTable& voids) {
    std::cout << "Score NS " << static_cast<int>(position.score.north_south)
              << " - EW " << static_cast<int>(position.score.east_west) << "\n";
    std::cout << "North remaining: " << format_hand(hand_of(position.deal, Seat::North)) << "\n";
    std::cout << "South remaining: " << format_hand(hand_of(position.deal, Seat::South)) << "\n";
    std::cout << "Known voids: East=" << void_suits(voids, Seat::East)
              << ", West=" << void_suits(voids, Seat::West) << "\n";
    std::cout << "Current trick: " << format_trick(position.current_trick) << "\n";
}

void report_completed_trick(const Position& position, std::uint8_t previous_completed) {
    if (position.completed_tricks != previous_completed) {
        std::cout << "Trick complete. "
                  << to_string(position.current_trick.leader) << " won. ";
        std::cout << "Score NS " << static_cast<int>(position.score.north_south)
                  << " - EW " << static_cast<int>(position.score.east_west) << "\n";
    }
}

}  // namespace

void run_alpha_mu_playthrough_with_seed(
    bool pause_between_cards,
    std::uint8_t target_tricks,
    std::uint8_t search_depth,
    double max_search_seconds,
    std::uint64_t true_deal_seed) {
    const auto simulation_start = std::chrono::steady_clock::now();
    if (target_tricks < kContractTricks || target_tricks > 13) {
        throw std::invalid_argument("playthrough target must be 12 or 13 tricks");
    }
    if (search_depth == 0 || search_depth > kMaxDeclarerPlies) {
        throw std::invalid_argument("playthrough depth must be between 1 and 26");
    }
    if (max_search_seconds < 0.0) {
        throw std::invalid_argument("playthrough time limit cannot be negative");
    }
    const Deal true_deal = generate_true_deal(true_deal_seed);
    Position actual_position {
        .deal = true_deal,
        .current_trick = Trick {
            .leader = Seat::West,
            .trump_suit = std::nullopt,
        },
    };
    VoidTable voids {};
    std::array<std::uint8_t, 4> cards_remaining {13, 13, 13, 13};
    const std::uint64_t world_seed = kWorldSeed ^ true_deal_seed;
    std::mt19937_64 defender_rng(true_deal_seed ^ kWorldSeed);
    AlphaMuSearchStats search_totals;
    std::array<std::uint64_t, kMaxDeclarerPlies + 1> completed_depth_counts {};
    std::size_t search_count = 0;
    double sampling_milliseconds = 0.0;
    const std::string contract = target_tricks == 13 ? "7NT" : "6NT";

    std::cout << "Example 2: " << contract << ", declarer needs "
              << static_cast<int>(target_tricks) << " tricks\n";
    std::cout << "True defender deal seed: " << true_deal_seed
              << " (hidden until the end)\n";
    std::cout << "North: " << format_hand(hand_of(true_deal, Seat::North)) << "\n";
    std::cout << "South: " << format_hand(hand_of(true_deal, Seat::South)) << "\n";
    std::cout << "Alpha-mu: " << kWorldCount << " worlds, M="
              << static_cast<int>(search_depth) << ", target="
              << static_cast<int>(target_tricks) << ", soft limit="
              << max_search_seconds << " s/search\n\n";
    std::cout << "Defender policy: never lead or discard a spade unless forced.\n\n";

    Hand opening_choices = hand_of(actual_position.deal, Seat::West) &
        ~suit_mask(Suit::Spades);
    if (opening_choices == kEmptyHand) {
        opening_choices = hand_of(actual_position.deal, Seat::West);
    }
    const Card opening_lead = random_card(opening_choices, defender_rng);
    play_card(actual_position, opening_lead);
    --cards_remaining[seat_index(Seat::West)];
    std::cout << "West makes the random non-spade opening lead: "
              << to_string(opening_lead) << "\n";
    wait_for_step(pause_between_cards);

    std::size_t decision_number = 0;
    std::shared_ptr<const AlphaMuPolicyNode> trick_policy;
    while (!is_deal_finished(actual_position)) {
        const Seat player = next_to_play(actual_position.current_trick);
        const std::uint8_t previous_completed = actual_position.completed_tricks;
        std::cout << "\n========================================\n";
        std::cout << "Trick " << static_cast<int>(actual_position.completed_tricks + 1)
                  << ", " << to_string(player) << " to play\n";
        print_public_state(actual_position, voids);

        Card chosen = kNoCard;
        if (same_side(player, Seat::South)) {
            if (trick_policy == nullptr) {
                SampleBatch samples = sample_public_worlds(
                    actual_position,
                    voids,
                    cards_remaining[seat_index(Seat::East)],
                    decision_number++,
                    world_seed);
                std::cout << "Posterior deals: " << samples.possible_deals
                          << "; sampled " << kWorldCount
                          << " (" << samples.unique_samples << " unique) in "
                           << samples.milliseconds << " ms\n";
                sampling_milliseconds += samples.milliseconds;

                const Card spade_queen = make_card(Suit::Spades, Rank::Queen);
                if (contains(actual_position.played_cards, spade_queen)) {
                    std::cout << "SQ has already been played.\n";
                } else {
                    std::cout << "Sampled SQ location: East " << samples.queen_east
                              << ", West " << samples.queen_west << "\n";
                }
                AlphaMuResult result = choose_alpha_mu_strategy(
                    actual_position,
                    samples,
                    target_tricks,
                    search_depth,
                    max_search_seconds);
                ++search_count;
                accumulate_search_stats(search_totals, result.stats);
                ++completed_depth_counts[result.stats.completed_depth];
                trick_policy = std::move(result.trick_policy);
            } else {
                std::cout << "Following the strategy selected earlier in this trick.\n";
            }

            if (trick_policy == nullptr || trick_policy->player != player ||
                trick_policy->declarer_move == kNoCard) {
                throw std::logic_error("alpha-mu trick policy has no declarer response");
            }
            chosen = trick_policy->declarer_move;
            std::cout << to_string(player) << " follows the trick policy with "
                      << to_string(chosen) << ".\n";
            trick_policy = trick_policy->continuation;
        } else {
            std::uint8_t predicted = 0;
            chosen = choose_double_dummy_defender_card(
                actual_position,
                predicted);
            std::cout << to_string(player) << " chooses " << to_string(chosen)
                      << " by DDS, forecasting " << static_cast<int>(predicted)
                      << " total declarer tricks.\n";
            observe_void(actual_position.current_trick, player, chosen, voids);

            if (trick_policy != nullptr) {
                if (trick_policy->player != player) {
                    throw std::logic_error("alpha-mu trick policy disagrees on defender turn");
                }
                const AlphaMuPolicyBranch* branch =
                    policy_branch_for_card(*trick_policy, chosen);
                if (branch == nullptr) {
                    std::cout << "The observed defender card was absent from the sampled "
                                 "worlds; the trick policy is invalidated.\n";
                    trick_policy.reset();
                } else {
                    std::cout << "Policy observation retains "
                              << std::popcount(branch->possible_worlds)
                              << '/' << kWorldCount << " sampled worlds.\n";
                    trick_policy = branch->continuation;
                }
            }
        }

        play_card(actual_position, chosen);
        --cards_remaining[seat_index(player)];
        report_completed_trick(actual_position, previous_completed);
        if (actual_position.completed_tricks != previous_completed) {
            trick_policy.reset();
        }
        wait_for_step(pause_between_cards);
    }

    std::cout << "\n========================================\n";
    std::cout << "Final score: NS " << static_cast<int>(actual_position.score.north_south)
              << " - EW " << static_cast<int>(actual_position.score.east_west) << "\n";
    std::cout << contract
              << (actual_position.score.north_south >= target_tricks
                      ? " made.\n"
                      : " defeated.\n");
    std::cout << "Alpha-mu target " << static_cast<int>(target_tricks)
              << (actual_position.score.north_south >= target_tricks
                      ? " was reached.\n"
                      : " was not reached.\n");
    std::cout << "\nHidden source-of-truth deal:\n" << format_deal(true_deal);
    const Card spade_queen = make_card(Suit::Spades, Rank::Queen);
    const Seat queen_seat = contains(hand_of(true_deal, Seat::East), spade_queen)
        ? Seat::East
        : Seat::West;
    std::cout << "SQ was with " << to_string(queen_seat) << ".\n";
    std::cout << "Aggregate search stats: searches=" << search_count
              << " nodes=" << search_totals.nodes
              << " DDS-worlds=" << search_totals.dds_worlds
              << " TT-hits=" << search_totals.transposition_hits
              << " early-cuts=" << search_totals.early_cuts
              << " deep-alpha-cuts=" << search_totals.deep_alpha_cuts
              << " useful-removed=" << search_totals.useful_worlds_removed
              << " world-cuts=" << search_totals.world_cuts
              << " empty-entry=" << search_totals.empty_entry_searches
              << " root-cuts=" << search_totals.root_cuts
              << " equals-skipped=" << search_totals.equivalent_moves_skipped
              << " (MAX=" << search_totals.max_equivalent_moves_skipped
              << ", MIN=" << search_totals.min_equivalent_moves_skipped << ')'
              << " forced-moves="
              << search_totals.forced_move_nodes +
                     search_totals.forced_root_recommendations
              << " win-cuts=" << search_totals.win_cuts
              << " DDS-batches=" << search_totals.leaf_dds_batches
              << " (" << search_totals.leaf_dds_worlds << " worlds)\n";
    std::cout << "Completed-M histogram:";
    for (std::size_t depth = 0; depth < completed_depth_counts.size(); ++depth) {
        if (completed_depth_counts[depth] != 0) {
            std::cout << " M" << depth << '=' << completed_depth_counts[depth];
        }
    }
    std::cout << "\nSearch timing: sampling=" << sampling_milliseconds
              << " ms tree=" << search_totals.tree_search_ms
              << " ms policy=" << search_totals.policy_build_ms << " ms\n";
    const auto simulation_end = std::chrono::steady_clock::now();
    const double simulation_seconds =
        std::chrono::duration<double>(simulation_end - simulation_start).count();
    std::cout << "Total simulation time: " << simulation_seconds << " seconds.\n";
}

void run_alpha_mu_playthrough(
    bool pause_between_cards,
    std::uint8_t target_tricks,
    std::uint8_t search_depth,
    double max_search_seconds) {
    run_alpha_mu_playthrough_with_seed(
        pause_between_cards,
        target_tricks,
        search_depth,
        max_search_seconds,
        kTrueDealSeed);
}

void run_alpha_mu_batch(
    std::size_t run_count,
    std::uint8_t target_tricks,
    std::uint8_t search_depth,
    double max_search_seconds) {
    for (std::size_t run = 0; run < run_count; ++run) {
        const std::uint64_t seed = kTrueDealSeed + run * kSeedStep;
        std::cout << "\n############################################################\n";
        std::cout << "BATCH RUN " << (run + 1) << '/' << run_count << "\n";
        std::cout << "############################################################\n\n";
        run_alpha_mu_playthrough_with_seed(
            false,
            target_tricks,
            search_depth,
            max_search_seconds,
            seed);
    }
}

}  // namespace bridge::demo
