#include <chrono>
#include <iostream>
#include <stdexcept>

#include "bridge/engine.h"

namespace {

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

}  // namespace

int main() {
    using namespace bridge;

    try {
        const Hand north = north_hand();
        const Hand south = south_hand();
        const Hand available = kFullDeck & ~(north | south);

        std::cout << "Fixed NS hands\n";
        std::cout << format_deal(Deal {.hands = {north, kEmptyHand, south, kEmptyHand}}) << "\n";
        std::cout << "Available East/West cards: " << static_cast<int>(card_count(available)) << "\n\n";

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
    } catch (const std::exception& error) {
        std::cerr << error.what() << "\n";
        return 1;
    }

    return 0;
}
