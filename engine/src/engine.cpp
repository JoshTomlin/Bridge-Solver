#include "bridge/engine.h"

#include <array>
#include <bit>
#include <cctype>
#include <cstdint>
#include <initializer_list>
#include <iomanip>
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

std::string holding_string(Hand hand, Suit suit) {
    std::ostringstream output;
    bool has_cards = false;

    for (int rank_value = static_cast<int>(Rank::Ace);
         rank_value >= static_cast<int>(Rank::Two);
         --rank_value) {
        const Card card = make_card(suit, static_cast<Rank>(rank_value));
        if (contains(hand, card)) {
            output << to_string(static_cast<Rank>(rank_value));
            has_cards = true;
        }
    }

    if (!has_cards) {
        output << '-';
    }

    return output.str();
}

std::array<std::string, 4> hand_record_lines(Hand hand) {
    return {
        holding_string(hand, Suit::Spades),
        holding_string(hand, Suit::Hearts),
        holding_string(hand, Suit::Diamonds),
        holding_string(hand, Suit::Clubs),
    };
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

bool outranks(Card challenger, Card current_winner, Suit lead_suit, std::optional<Suit> trump_suit) {
    const Suit challenger_suit = suit_of(challenger);
    const Suit winner_suit = suit_of(current_winner);

    const bool challenger_is_trump = trump_suit.has_value() && challenger_suit == *trump_suit;
    const bool winner_is_trump = trump_suit.has_value() && winner_suit == *trump_suit;

    if (challenger_is_trump != winner_is_trump) {
        return challenger_is_trump;
    }

    const bool challenger_follows = challenger_suit == lead_suit;
    const bool winner_follows = winner_suit == lead_suit;

    if (challenger_follows != winner_follows) {
        return challenger_follows;
    }

    if (challenger_suit != winner_suit) {
        return false;
    }

    return static_cast<std::uint8_t>(rank_of(challenger)) >
           static_cast<std::uint8_t>(rank_of(current_winner));
}

bool wins_against_current_trick(const Trick& trick, Card card) {
    if (trick.card_count == 0) {
        return true;
    }

    const Suit lead_suit = suit_of(trick.cards[0]);
    Card current_winner = trick.cards[0];

    for (std::uint8_t i = 1; i < trick.card_count; ++i) {
        if (outranks(trick.cards[i], current_winner, lead_suit, trick.trump_suit)) {
            current_winner = trick.cards[i];
        }
    }

    return outranks(card, current_winner, lead_suit, trick.trump_suit);
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

Hand make_hand(std::initializer_list<Card> cards) {
    Hand hand = kEmptyHand;
    for (const Card card : cards) {
        hand = add_card(hand, card);
    }
    return hand;
}

std::uint8_t card_count(Hand hand) {
    return static_cast<std::uint8_t>(std::popcount(hand));
}

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

Suit suit_of(Card card) {
    if (!is_single_card(card)) {
        throw std::invalid_argument("card must contain exactly one bit");
    }

    const auto index = static_cast<std::uint8_t>(std::countr_zero(card));
    return static_cast<Suit>(index / kRanksPerSuit);
}

Rank rank_of(Card card) {
    if (!is_single_card(card)) {
        throw std::invalid_argument("card must contain exactly one bit");
    }

    const auto index = static_cast<std::uint8_t>(std::countr_zero(card));
    return static_cast<Rank>(index % kRanksPerSuit);
}

std::optional<Suit> parse_suit(char symbol) {
    switch (static_cast<char>(std::toupper(static_cast<unsigned char>(symbol)))) {
        case 'C':
            return Suit::Clubs;
        case 'D':
            return Suit::Diamonds;
        case 'H':
            return Suit::Hearts;
        case 'S':
            return Suit::Spades;
        default:
            return std::nullopt;
    }
}

std::optional<Rank> parse_rank(char symbol) {
    switch (static_cast<char>(std::toupper(static_cast<unsigned char>(symbol)))) {
        case '2':
            return Rank::Two;
        case '3':
            return Rank::Three;
        case '4':
            return Rank::Four;
        case '5':
            return Rank::Five;
        case '6':
            return Rank::Six;
        case '7':
            return Rank::Seven;
        case '8':
            return Rank::Eight;
        case '9':
            return Rank::Nine;
        case 'T':
            return Rank::Ten;
        case 'J':
            return Rank::Jack;
        case 'Q':
            return Rank::Queen;
        case 'K':
            return Rank::King;
        case 'A':
            return Rank::Ace;
        default:
            return std::nullopt;
    }
}

std::optional<Card> parse_card(const std::string& text) {
    if (text.size() != 2) {
        return std::nullopt;
    }

    const auto suit = parse_suit(text[0]);
    const auto rank = parse_rank(text[1]);

    if (!suit.has_value() || !rank.has_value()) {
        return std::nullopt;
    }

    return make_card(*suit, *rank);
}

std::string to_string(Suit suit) {
    switch (suit) {
        case Suit::Clubs:
            return "C";
        case Suit::Diamonds:
            return "D";
        case Suit::Hearts:
            return "H";
        case Suit::Spades:
            return "S";
    }

    return "?";
}

std::string to_string(Rank rank) {
    switch (rank) {
        case Rank::Two:
            return "2";
        case Rank::Three:
            return "3";
        case Rank::Four:
            return "4";
        case Rank::Five:
            return "5";
        case Rank::Six:
            return "6";
        case Rank::Seven:
            return "7";
        case Rank::Eight:
            return "8";
        case Rank::Nine:
            return "9";
        case Rank::Ten:
            return "T";
        case Rank::Jack:
            return "J";
        case Rank::Queen:
            return "Q";
        case Rank::King:
            return "K";
        case Rank::Ace:
            return "A";
    }

    return "?";
}

std::string to_string(Seat seat) {
    switch (seat) {
        case Seat::North:
            return "North";
        case Seat::East:
            return "East";
        case Seat::South:
            return "South";
        case Seat::West:
            return "West";
    }

    return "Unknown";
}

std::string to_string(Card card) {
    if (!is_single_card(card)) {
        return "?";
    }

    return to_string(suit_of(card)) + to_string(rank_of(card));
}

std::string format_hand(Hand hand) {
    std::ostringstream output;
    bool first_suit = true;

    for (const Suit suit : {Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        if (!first_suit) {
            output << ' ';
        }

        bool has_cards = false;
        for (int rank_value = static_cast<int>(Rank::Ace);
             rank_value >= static_cast<int>(Rank::Two);
             --rank_value) {
            const Card card = make_card(suit, static_cast<Rank>(rank_value));
            if (contains(hand, card)) {
                output << to_string(static_cast<Rank>(rank_value));
                has_cards = true;
            }
        }

        if (!has_cards) {
            output << '-';
        }

        first_suit = false;
    }

    return output.str();
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

Hand hand_of(const Deal& deal, Seat seat) {
    return deal.hands[seat_index(seat)];
}

Hand& hand_of(Deal& deal, Seat seat) {
    return deal.hands[seat_index(seat)];
}

bool has_full_deal(const Deal& deal) {
    Hand all_cards = kEmptyHand;

    for (const Hand hand : deal.hands) {
        if (card_count(hand) != kRanksPerSuit) {
            return false;
        }

        if ((all_cards & hand) != 0) {
            return false;
        }

        all_cards |= hand;
    }

    return card_count(all_cards) == kDeckSize;
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
    const std::uint64_t total =
        count_constrained_hands(available_cards, kEmptyHand, kEmptyHand, constraints, target_card_count);
    if (total == 0) {
        return std::nullopt;
    }

    std::mt19937_64 rng(random_seed);
    Hand included = kEmptyHand;
    Hand excluded = kEmptyHand;
    auto ordered_cards = cards_descending(available_cards);

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

Hand legal_plays(const Trick& trick, Hand hand) {
    if (trick.card_count == 0) {
        return hand;
    }

    const Suit lead_suit = suit_of(trick.cards[0]);
    const Hand follow_suit_cards = cards_in_suit(hand, lead_suit);
    return follow_suit_cards != 0 ? follow_suit_cards : hand;
}

bool is_legal_play(const Trick& trick, Hand hand, Card card) {
    if (!is_single_card(card) || !contains(hand, card) || trick.card_count >= 4) {
        return false;
    }

    return contains(legal_plays(trick, hand), card);
}

Seat next_to_play(const Trick& trick) {
    Seat seat = trick.leader;
    for (std::uint8_t i = 0; i < trick.card_count; ++i) {
        seat = next_seat(seat);
    }
    return seat;
}

void add_card_to_trick(Trick& trick, Hand& hand, Card card) {
    if (!is_legal_play(trick, hand, card)) {
        throw std::invalid_argument("illegal card play");
    }

    hand = remove_card(hand, card);
    trick.cards[trick.card_count] = card;
    ++trick.card_count;
}

Card card_played_by(const Trick& trick, Seat seat) {
    Seat current = trick.leader;
    for (std::uint8_t i = 0; i < trick.card_count; ++i) {
        if (current == seat) {
            return trick.cards[i];
        }
        current = next_seat(current);
    }

    return kNoCard;
}

Seat winning_seat(const Trick& trick) {
    if (trick.card_count == 0) {
        throw std::invalid_argument("cannot score an empty trick");
    }

    const Suit lead_suit = suit_of(trick.cards[0]);
    Card winning_card = trick.cards[0];
    std::uint8_t winning_offset = 0;

    for (std::uint8_t i = 1; i < trick.card_count; ++i) {
        if (outranks(trick.cards[i], winning_card, lead_suit, trick.trump_suit)) {
            winning_card = trick.cards[i];
            winning_offset = i;
        }
    }

    Seat winner = trick.leader;
    for (std::uint8_t i = 0; i < winning_offset; ++i) {
        winner = next_seat(winner);
    }

    return winner;
}

std::string format_deal(const Deal& deal) {
    constexpr int kIndent = 12;
    constexpr int kColumnWidth = 24;

    const auto north = hand_record_lines(hand_of(deal, Seat::North));
    const auto west = hand_record_lines(hand_of(deal, Seat::West));
    const auto east = hand_record_lines(hand_of(deal, Seat::East));
    const auto south = hand_record_lines(hand_of(deal, Seat::South));

    std::ostringstream output;
    for (const auto& line : north) {
        output << std::string(kIndent, ' ') << line << '\n';
    }

    output << '\n';
    for (std::size_t i = 0; i < west.size(); ++i) {
        output << std::left << std::setw(kColumnWidth) << west[i] << east[i] << '\n';
    }

    output << '\n';
    for (const auto& line : south) {
        output << std::string(kIndent, ' ') << line << '\n';
    }

    return output.str();
}

bool same_side(Seat a, Seat b) {
    return seat_index(a) % 2 == seat_index(b) % 2;
}

Score score_of(const Position& position) {
    return position.score;
}

bool is_deal_finished(const Position& position) {
    return position.completed_tricks == kRanksPerSuit;
}

void play_card(Position& position, Card card) {
    add_card_to_trick(position.current_trick, hand_of(position.deal, next_to_play(position.current_trick)), card);
    position.played_cards = add_card(position.played_cards, card);

    if (position.current_trick.card_count < 4) {
        return;
    }

    const Seat winner = winning_seat(position.current_trick);
    if (same_side(winner, Seat::North)) {
        ++position.score.north_south;
    } else {
        ++position.score.east_west;
    }

    ++position.completed_tricks;
    position.current_trick = Trick {
        .leader = winner,
        .trump_suit = position.current_trick.trump_suit,
    };
}

std::string format_trick(const Trick& trick) {
    if (trick.card_count == 0) {
        return "No cards played yet.";
    }

    std::ostringstream output;
    Seat seat = trick.leader;
    for (std::uint8_t i = 0; i < trick.card_count; ++i) {
        output << to_string(seat) << ' ' << to_string(trick.cards[i]);
        if (i + 1 < trick.card_count) {
            output << ", ";
        }
        seat = next_seat(seat);
    }
    return output.str();
}

std::vector<Hand> equivalent_play_groups(const Trick& trick, Hand legal_moves, Hand hand, Hand played_cards) {
    std::vector<Hand> groups;

    for (const Suit suit : {Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        const Hand suit_legal_moves = cards_in_suit(legal_moves, suit);
        if (suit_legal_moves == 0) {
            continue;
        }

        Hand current_group = kEmptyHand;
        int previous_rank = -1;
        bool previous_wins = false;

        for (int rank_value = static_cast<int>(Rank::Ace);
             rank_value >= static_cast<int>(Rank::Two);
             --rank_value) {
            const Card card = make_card(suit, static_cast<Rank>(rank_value));
            if (!contains(suit_legal_moves, card)) {
                continue;
            }

            const bool current_wins = wins_against_current_trick(trick, card);

            if (current_group == kEmptyHand) {
                current_group = add_card(current_group, card);
                previous_rank = rank_value;
                previous_wins = current_wins;
                continue;
            }

            bool connected = true;
            for (int gap_rank = previous_rank - 1; gap_rank > rank_value; --gap_rank) {
                const Card gap_card = make_card(suit, static_cast<Rank>(gap_rank));
                if (!contains(hand, gap_card) && !contains(played_cards, gap_card)) {
                    connected = false;
                    break;
                }
            }

            if (!connected || current_wins != previous_wins) {
                groups.push_back(current_group);
                current_group = kEmptyHand;
            }

            current_group = add_card(current_group, card);
            previous_rank = rank_value;
            previous_wins = current_wins;
        }

        if (current_group != kEmptyHand) {
            groups.push_back(current_group);
        }
    }

    return groups;
}

std::string format_card_list(Hand cards) {
    const auto ordered = cards_descending(cards);
    if (ordered.empty()) {
        return "-";
    }

    std::ostringstream output;
    for (std::size_t i = 0; i < ordered.size(); ++i) {
        if (i > 0) {
            output << ' ';
        }
        output << to_string(ordered[i]);
    }
    return output.str();
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
