#include "bridge/card.h"

#include <bit>
#include <cctype>
#include <sstream>
#include <stdexcept>

namespace bridge {

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
            const Rank rank = static_cast<Rank>(rank_value);
            if (contains(hand, make_card(suit, rank))) {
                output << to_string(rank);
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

}  // namespace bridge
