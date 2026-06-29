#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "bridge/card.h"

namespace bridge {

// A Deal contains the cards that have not yet been played.
struct Deal {
    std::array<Hand, 4> hands {kEmptyHand, kEmptyHand, kEmptyHand, kEmptyHand};
};

// Cards are stored in play order, beginning with leader.
struct Trick {
    Seat leader {Seat::North};
    std::optional<Suit> trump_suit {};
    std::array<Card, 4> cards {kNoCard, kNoCard, kNoCard, kNoCard};
    std::uint8_t card_count {};
};

struct Score {
    std::uint8_t north_south {};
    std::uint8_t east_west {};
};

// Position is the complete public game state plus the remaining deal for one world.
struct Position {
    Deal deal {};
    Trick current_trick {};
    Score score {};
    Hand played_cards {kEmptyHand};
    std::uint8_t completed_tricks {};
};

Hand hand_of(const Deal& deal, Seat seat);
Hand& hand_of(Deal& deal, Seat seat);
bool has_full_deal(const Deal& deal);

// Returns a bitmask of every legal card. Following suit is enforced here.
Hand legal_plays(const Trick& trick, Hand hand);
bool is_legal_play(const Trick& trick, Hand hand, Card card);
Seat next_to_play(const Trick& trick);
void add_card_to_trick(Trick& trick, Hand& hand, Card card);
Card card_played_by(const Trick& trick, Seat seat);
Seat winning_seat(const Trick& trick);

bool same_side(Seat a, Seat b);
Score score_of(const Position& position);
bool is_deal_finished(const Position& position);
// Applies one legal card and, after card four, scores and resets the trick.
void play_card(Position& position, Card card);

std::vector<Hand> equivalent_play_groups(
    const Trick& trick,
    Hand legal_moves,
    Hand hand,
    Hand played_cards);

std::string format_deal(const Deal& deal);
std::string format_trick(const Trick& trick);
std::string format_card_list(Hand cards);

}  // namespace bridge
