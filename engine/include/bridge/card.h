#pragma once

#include <cstdint>
#include <initializer_list>
#include <optional>
#include <string>

namespace bridge {

enum class Suit {
    Clubs,
    Diamonds,
    Hearts,
    Spades
};

enum class Seat {
    North,
    East,
    South,
    West
};

enum class Rank : std::uint8_t {
    Two,
    Three,
    Four,
    Five,
    Six,
    Seven,
    Eight,
    Nine,
    Ten,
    Jack,
    Queen,
    King,
    Ace
};

// Card and Hand intentionally use the same machine word.
// A valid Card has exactly one bit set; a Hand is any set of card bits.
using Card = std::uint64_t;
using Hand = std::uint64_t;

inline constexpr std::uint8_t kRanksPerSuit = 13;
inline constexpr std::uint8_t kSuitCount = 4;
inline constexpr std::uint8_t kDeckSize = kRanksPerSuit * kSuitCount;
inline constexpr Card kNoCard = 0;
inline constexpr Hand kEmptyHand = 0;

// Cards occupy bits C2..CA, D2..DA, H2..HA, S2..SA.
// Therefore C2 is bit 0 and SA is bit 51.
constexpr std::uint8_t to_index(Suit suit, Rank rank) {
    return static_cast<std::uint8_t>(static_cast<std::uint8_t>(suit) * kRanksPerSuit +
                                     static_cast<std::uint8_t>(rank));
}

constexpr Card make_card(Suit suit, Rank rank) {
    return Card {1} << to_index(suit, rank);
}

constexpr bool is_single_card(Card card) {
    return card != 0 && (card & (card - 1)) == 0;
}

constexpr Hand add_card(Hand hand, Card card) {
    return hand | card;
}

constexpr Hand remove_card(Hand hand, Card card) {
    return hand & ~card;
}

constexpr bool contains(Hand hand, Card card) {
    return (hand & card) != 0;
}

// Each suit is a contiguous 13-bit block, so extracting a suit is one AND.
constexpr Hand suit_mask(Suit suit) {
    return ((Hand {1} << kRanksPerSuit) - 1)
           << (static_cast<std::uint8_t>(suit) * kRanksPerSuit);
}

inline constexpr Hand kFullDeck =
    suit_mask(Suit::Clubs) |
    suit_mask(Suit::Diamonds) |
    suit_mask(Suit::Hearts) |
    suit_mask(Suit::Spades);

constexpr Hand cards_in_suit(Hand hand, Suit suit) {
    return hand & suit_mask(suit);
}

constexpr std::uint8_t seat_index(Seat seat) {
    return static_cast<std::uint8_t>(seat);
}

constexpr Seat next_seat(Seat seat) {
    return static_cast<Seat>((seat_index(seat) + 1) % 4);
}

Hand make_hand(std::initializer_list<Card> cards);
std::uint8_t card_count(Hand hand);
Suit suit_of(Card card);
Rank rank_of(Card card);
std::optional<Suit> parse_suit(char symbol);
std::optional<Rank> parse_rank(char symbol);
std::optional<Card> parse_card(const std::string& text);

std::string to_string(Suit suit);
std::string to_string(Rank rank);
std::string to_string(Seat seat);
std::string to_string(Card card);
std::string format_hand(Hand hand);

}  // namespace bridge
