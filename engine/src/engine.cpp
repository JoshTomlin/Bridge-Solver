#include "bridge/engine.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <random>
#include <sstream>
#include <stdexcept>
#include <unordered_map>

namespace bridge {

namespace {

struct SuitChoiceWays {
    std::array<std::array<std::uint64_t, 38>, 14> ways {};
};

struct CountCacheKey {
    Hand available_cards {};
    Hand included_cards {};
    Hand excluded_cards {};
    HandSamplingConstraints constraints {};
    std::uint8_t target_card_count {};

    bool operator==(const CountCacheKey& other) const {
        return available_cards == other.available_cards &&
               included_cards == other.included_cards &&
               excluded_cards == other.excluded_cards &&
               constraints.min_lengths == other.constraints.min_lengths &&
               constraints.max_lengths == other.constraints.max_lengths &&
               constraints.min_hcp == other.constraints.min_hcp &&
               constraints.max_hcp == other.constraints.max_hcp &&
               target_card_count == other.target_card_count;
    }
};

struct CountCacheKeyHash {
    std::size_t operator()(const CountCacheKey& key) const {
        auto mix = [](std::size_t seed, std::size_t value) {
            return seed ^ (value + 0x9e3779b9 + (seed << 6) + (seed >> 2));
        };

        std::size_t seed = 0;
        seed = mix(seed, std::hash<Hand> {}(key.available_cards));
        seed = mix(seed, std::hash<Hand> {}(key.included_cards));
        seed = mix(seed, std::hash<Hand> {}(key.excluded_cards));
        for (const auto value : key.constraints.min_lengths) {
            seed = mix(seed, std::hash<std::uint8_t> {}(value));
        }
        for (const auto value : key.constraints.max_lengths) {
            seed = mix(seed, std::hash<std::uint8_t> {}(value));
        }
        seed = mix(seed, std::hash<std::uint8_t> {}(key.constraints.min_hcp));
        seed = mix(seed, std::hash<std::uint8_t> {}(key.constraints.max_hcp));
        seed = mix(seed, std::hash<std::uint8_t> {}(key.target_card_count));
        return seed;
    }
};

constexpr std::array<Rank, 4> kHonourRanks {
    Rank::Ace,
    Rank::King,
    Rank::Queen,
    Rank::Jack,
};

SuitChoiceWays compute_suit_choice_ways(
    Suit suit,
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards);

std::uint8_t hcp_value(Rank rank) {
    switch (rank) {
        case Rank::Ace:
            return 4;
        case Rank::King:
            return 3;
        case Rank::Queen:
            return 2;
        case Rank::Jack:
            return 1;
        default:
            return 0;
    }
}

std::uint64_t choose(std::uint8_t n, std::uint8_t k) {
    if (k > n) {
        return 0;
    }

    if (k == 0 || k == n) {
        return 1;
    }

    std::uint64_t result = 1;
    const std::uint8_t effective_k = std::min(k, static_cast<std::uint8_t>(n - k));
    for (std::uint8_t i = 1; i <= effective_k; ++i) {
        result = (result * (n - effective_k + i)) / i;
    }
    return result;
}

SamplingDebugInfo build_sampling_debug_info(
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards,
    const HandSamplingConstraints& constraints,
    std::uint8_t target_card_count) {
    if ((included_cards & excluded_cards) != 0 ||
        (included_cards & ~available_cards) != 0 ||
        (excluded_cards & ~available_cards) != 0 ||
        card_count(included_cards) > target_card_count) {
        return {};
    }

    std::array<SuitChoiceWays, 4> suit_ways {};
    for (const Suit suit : {Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades}) {
        suit_ways[static_cast<std::uint8_t>(suit)] =
            compute_suit_choice_ways(suit, available_cards, included_cards, excluded_cards);
    }

    std::array<std::array<std::uint64_t, 38>, 14> dp {};
    dp[0][0] = 1;

    for (const Suit suit : {Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades}) {
        std::array<std::array<std::uint64_t, 38>, 14> next {};
        const auto& ways = suit_ways[static_cast<std::uint8_t>(suit)].ways;

        for (std::uint8_t cards_used = 0; cards_used <= target_card_count; ++cards_used) {
            for (std::uint8_t hcp = 0; hcp < dp[cards_used].size(); ++hcp) {
                const std::uint64_t base = dp[cards_used][hcp];
                if (base == 0) {
                    continue;
                }

                for (std::uint8_t length = constraints.min_lengths[static_cast<std::uint8_t>(suit)];
                     length <= constraints.max_lengths[static_cast<std::uint8_t>(suit)] &&
                     cards_used + length <= target_card_count;
                     ++length) {
                    for (std::uint8_t suit_hcp = 0; suit_hcp < ways[length].size(); ++suit_hcp) {
                        const std::uint64_t count = ways[length][suit_hcp];
                        if (count == 0) {
                            continue;
                        }

                        const std::uint8_t new_hcp =
                            std::min<std::uint8_t>(37, hcp + suit_hcp);
                        next[cards_used + length][new_hcp] += base * count;
                    }
                }
            }
        }

        dp = next;
    }

    return SamplingDebugInfo {.final_dp = dp};
}

std::vector<Card> cards_descending(Hand cards) {
    std::vector<Card> ordered;

    for (const Suit suit : {Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        for (int rank_value = static_cast<int>(Rank::Ace);
             rank_value >= static_cast<int>(Rank::Two);
             --rank_value) {
            const Card card = make_card(suit, static_cast<Rank>(rank_value));
            if (contains(cards, card)) {
                ordered.push_back(card);
            }
        }
    }

    return ordered;
}

SuitChoiceWays compute_suit_choice_ways(
    Suit suit,
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards) {
    const Hand available_suit = cards_in_suit(available_cards, suit);
    const Hand included_suit = cards_in_suit(included_cards, suit);
    const Hand excluded_suit = cards_in_suit(excluded_cards, suit);
    const Hand honour_mask =
        make_card(suit, Rank::Ace) |
        make_card(suit, Rank::King) |
        make_card(suit, Rank::Queen) |
        make_card(suit, Rank::Jack);

    const Hand available_honours = available_suit & honour_mask;
    const Hand forced_honours = included_suit & honour_mask;
    const Hand banned_honours = excluded_suit & honour_mask;
    const Hand open_honours = available_honours & ~forced_honours & ~banned_honours;

    const Hand available_spots = available_suit & ~honour_mask;
    const Hand forced_spots = included_suit & ~honour_mask;
    const Hand banned_spots = excluded_suit & ~honour_mask;
    const std::uint8_t open_spot_count =
        card_count(available_spots & ~forced_spots & ~banned_spots);
    const std::uint8_t forced_count = card_count(included_suit);
    const std::uint8_t forced_hcp = high_card_points(included_suit);
    const std::uint8_t max_available = card_count(available_suit & ~excluded_suit);

    SuitChoiceWays result {};

    for (std::uint8_t subset = 0; subset < (1u << kHonourRanks.size()); ++subset) {
        bool valid_subset = true;
        std::uint8_t subset_count = 0;
        std::uint8_t subset_hcp = 0;

        for (std::size_t i = 0; i < kHonourRanks.size(); ++i) {
            const Card honour = make_card(suit, kHonourRanks[i]);
            const bool forced = contains(forced_honours, honour);
            const bool banned = contains(banned_honours, honour);
            const bool chosen = (subset & (1u << i)) != 0;
            const bool open = contains(open_honours, honour);

            if (forced) {
                if (!chosen) {
                    valid_subset = false;
                    break;
                }
            } else if (banned || !open) {
                if (chosen) {
                    valid_subset = false;
                    break;
                }
            }

            if (chosen && open) {
                ++subset_count;
                subset_hcp += hcp_value(kHonourRanks[i]);
            }
        }

        if (!valid_subset) {
            continue;
        }

        const std::uint8_t honour_count = forced_count + subset_count;
        const std::uint8_t hcp = forced_hcp + subset_hcp;

        for (std::uint8_t length = honour_count; length <= max_available; ++length) {
            const std::uint8_t spots_needed = length - honour_count;
            const std::uint64_t ways = choose(open_spot_count, spots_needed);
            if (ways == 0) {
                continue;
            }
            result.ways[length][hcp] += ways;
        }
    }

    return result;
}

std::uint64_t count_constrained_hands_impl(
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards,
    const HandSamplingConstraints& constraints,
    std::uint8_t target_card_count) {
    static std::unordered_map<CountCacheKey, std::uint64_t, CountCacheKeyHash> cache;

    if ((included_cards & excluded_cards) != kEmptyHand ||
        ((included_cards | excluded_cards) & ~available_cards) != kEmptyHand ||
        card_count(included_cards) > target_card_count ||
        target_card_count > card_count(available_cards & ~excluded_cards) ||
        constraints.min_hcp > constraints.max_hcp) {
        return 0;
    }
    for (std::size_t suit = 0; suit < kSuitCount; ++suit) {
        if (constraints.min_lengths[suit] > constraints.max_lengths[suit]) {
            return 0;
        }
    }

    const CountCacheKey key {
        .available_cards = available_cards,
        .included_cards = included_cards,
        .excluded_cards = excluded_cards,
        .constraints = constraints,
        .target_card_count = target_card_count,
    };

    if (const auto it = cache.find(key); it != cache.end()) {
        return it->second;
    }

    const auto debug = build_sampling_debug_info(
        available_cards,
        included_cards,
        excluded_cards,
        constraints,
        target_card_count);

    std::uint64_t total = 0;
    for (std::uint8_t hcp = constraints.min_hcp;
         hcp <= constraints.max_hcp && hcp < debug.final_dp[target_card_count].size();
         ++hcp) {
        total += debug.final_dp[target_card_count][hcp];
    }

    cache.emplace(key, total);
    return total;
}

}  // namespace

std::uint8_t high_card_points(Hand hand) {
    std::uint8_t total = 0;
    for (const Suit suit : {Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades}) {
        for (const Rank rank : kHonourRanks) {
            if (contains(hand, make_card(suit, rank))) {
                total += hcp_value(rank);
            }
        }
    }
    return total;
}

AnalysisResult analyze(const AnalysisRequest& request) {
    const Hand known_cards_mask = request.declarer.hand | request.dummy.hand;
    const std::size_t known_cards = card_count(known_cards_mask);

    std::ostringstream summary;
    summary << "Known cards for " << to_string(request.declarer.seat)
            << " and " << to_string(request.dummy.seat)
            << ": " << known_cards << ". "
            << "Unseen cards remaining for opponents: "
            << (kDeckSize - known_cards)
            << ".";

    return AnalysisResult {
        .unseen_card_count = kDeckSize - known_cards,
        .summary = summary.str()
    };
}

std::uint64_t count_constrained_hands(
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards,
    const HandSamplingConstraints& constraints,
    std::uint8_t target_card_count) {
    return count_constrained_hands_impl(
        available_cards,
        included_cards,
        excluded_cards,
        constraints,
        target_card_count);
}

std::optional<Hand> sample_constrained_hand(
    Hand available_cards,
    const HandSamplingConstraints& constraints,
    std::uint64_t random_seed,
    std::uint8_t target_card_count) {
    return sample_constrained_hand(
        available_cards,
        kEmptyHand,
        kEmptyHand,
        constraints,
        random_seed,
        target_card_count);
}

std::optional<Hand> sample_constrained_hand(
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards,
    const HandSamplingConstraints& constraints,
    std::uint64_t random_seed,
    std::uint8_t target_card_count) {
    const std::uint64_t total =
        count_constrained_hands(
            available_cards,
            included_cards,
            excluded_cards,
            constraints,
            target_card_count);
    if (total == 0) {
        return std::nullopt;
    }

    std::mt19937_64 rng(random_seed);
    Hand included = included_cards;
    Hand excluded = excluded_cards;
    auto ordered_cards = cards_descending(available_cards & ~included & ~excluded);

    for (const Card card : ordered_cards) {
        const std::uint8_t selected_count = card_count(included);
        const std::uint8_t undecided_count =
            static_cast<std::uint8_t>(card_count(available_cards & ~included & ~excluded));
        const std::uint8_t cards_needed = target_card_count - selected_count;

        if (cards_needed == 0) {
            excluded = add_card(excluded, card);
            continue;
        }

        if (cards_needed == undecided_count) {
            included = add_card(included, card);
            continue;
        }

        const std::uint64_t include_count =
            count_constrained_hands(available_cards, add_card(included, card), excluded, constraints, target_card_count);
        const std::uint64_t exclude_count =
            count_constrained_hands(available_cards, included, add_card(excluded, card), constraints, target_card_count);

        if (include_count == 0 && exclude_count == 0) {
            return std::nullopt;
        }

        if (exclude_count == 0) {
            included = add_card(included, card);
            continue;
        }

        if (include_count == 0) {
            excluded = add_card(excluded, card);
            continue;
        }

        std::uniform_int_distribution<std::uint64_t> dist(1, include_count + exclude_count);
        if (dist(rng) <= include_count) {
            included = add_card(included, card);
        } else {
            excluded = add_card(excluded, card);
        }
    }

    return card_count(included) == target_card_count ? std::optional<Hand> {included} : std::nullopt;
}

SamplingDebugInfo sampling_debug_info(
    Hand available_cards,
    Hand included_cards,
    Hand excluded_cards,
    const HandSamplingConstraints& constraints,
    std::uint8_t target_card_count) {
    return build_sampling_debug_info(
        available_cards,
        included_cards,
        excluded_cards,
        constraints,
        target_card_count);
}

std::string format_sampling_debug_table(const SamplingDebugInfo& debug_info, std::uint8_t max_hcp) {
    std::ostringstream output;
    output << "cards";
    for (std::uint8_t hcp = 0; hcp <= max_hcp; ++hcp) {
        output << '\t' << static_cast<int>(hcp);
    }
    output << '\n';

    for (std::size_t cards = 0; cards < debug_info.final_dp.size(); ++cards) {
        output << cards;
        for (std::uint8_t hcp = 0; hcp <= max_hcp; ++hcp) {
            output << '\t' << debug_info.final_dp[cards][hcp];
        }
        output << '\n';
    }

    return output.str();
}

}  // namespace bridge
