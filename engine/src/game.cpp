#include "bridge/game.h"

#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace bridge {
namespace {

std::string holding_string(Hand hand, Suit suit) {
    std::string result;
    for (int rank_value = static_cast<int>(Rank::Ace);
         rank_value >= static_cast<int>(Rank::Two);
         --rank_value) {
        const Rank rank = static_cast<Rank>(rank_value);
        if (contains(hand, make_card(suit, rank))) {
            result += to_string(rank);
        }
    }
    return result.empty() ? "-" : result;
}

std::array<std::string, 4> hand_record_lines(Hand hand) {
    return {
        holding_string(hand, Suit::Spades),
        holding_string(hand, Suit::Hearts),
        holding_string(hand, Suit::Diamonds),
        holding_string(hand, Suit::Clubs),
    };
}

bool outranks(
    Card challenger,
    Card current_winner,
    Suit lead_suit,
    std::optional<Suit> trump_suit) {
    const Suit challenger_suit = suit_of(challenger);
    const Suit winner_suit = suit_of(current_winner);

    if (challenger_suit != winner_suit) {
        if (trump_suit.has_value()) {
            if (challenger_suit == *trump_suit) {
                return true;
            }
            if (winner_suit == *trump_suit) {
                return false;
            }
        }
        return challenger_suit == lead_suit && winner_suit != lead_suit;
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

std::vector<Card> cards_descending(Hand cards) {
    std::vector<Card> ordered;
    ordered.reserve(card_count(cards));
    for (int bit = kDeckSize - 1; bit >= 0; --bit) {
        const Card card = Card {1} << bit;
        if (contains(cards, card)) {
            ordered.push_back(card);
        }
    }
    return ordered;
}

}  // namespace

Hand hand_of(const Deal& deal, Seat seat) {
    return deal.hands[seat_index(seat)];
}

Hand& hand_of(Deal& deal, Seat seat) {
    return deal.hands[seat_index(seat)];
}

bool has_full_deal(const Deal& deal) {
    Hand all_cards = kEmptyHand;
    for (const Hand hand : deal.hands) {
        if (card_count(hand) != kRanksPerSuit || (all_cards & hand) != 0) {
            return false;
        }
        all_cards |= hand;
    }
    return all_cards == kFullDeck;
}

Hand legal_plays(const Trick& trick, Hand hand) {
    if (trick.card_count == 0) {
        return hand;
    }

    const Suit lead_suit = suit_of(trick.cards[0]);
    const Hand cards_that_follow_suit = cards_in_suit(hand, lead_suit);
    return cards_that_follow_suit != kEmptyHand ? cards_that_follow_suit : hand;
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

bool same_side(Seat a, Seat b) {
    return seat_index(a) % 2 == seat_index(b) % 2;
}

Score score_of(const Position& position) {
    return position.score;
}

bool is_deal_finished(const Position& position) {
    if (position.current_trick.card_count != 0) {
        return false;
    }
    for (const Hand hand : position.deal.hands) {
        if (hand != kEmptyHand) {
            return false;
        }
    }
    return true;
}

void play_card(Position& position, Card card) {
    const Seat player = next_to_play(position.current_trick);
    add_card_to_trick(position.current_trick, hand_of(position.deal, player), card);
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

std::vector<Hand> equivalent_play_groups(
    const Trick& trick,
    Hand legal_moves,
    Hand hand,
    Hand played_cards) {
    std::vector<Hand> groups;

    for (const Suit suit : {Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        const Hand suit_legal_moves = cards_in_suit(legal_moves, suit);
        if (suit_legal_moves == kEmptyHand) {
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

}  // namespace bridge
