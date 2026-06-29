#include "bridge/dds_solver.h"

#include "dll.h"

#include <mutex>
#include <stdexcept>

namespace bridge {
namespace {

constexpr int kDdsNotrump = 4;

constexpr int dds_trump(std::optional<Suit> trump_suit) {
    if (!trump_suit.has_value()) {
        return kDdsNotrump;
    }

    switch (*trump_suit) {
        case Suit::Spades:
            return 0;
        case Suit::Hearts:
            return 1;
        case Suit::Diamonds:
            return 2;
        case Suit::Clubs:
            return 3;
    }
    return kDdsNotrump;
}

constexpr int dds_suit(Suit suit) {
    switch (suit) {
        case Suit::Spades:
            return 0;
        case Suit::Hearts:
            return 1;
        case Suit::Diamonds:
            return 2;
        case Suit::Clubs:
            return 3;
    }
    return 3;
}

constexpr int dds_rank(Rank rank) {
    return static_cast<int>(rank) + 2;
}

unsigned int dds_holding(Hand hand, Suit suit) {
    unsigned int result = 0;
    for (int rank_value = static_cast<int>(Rank::Ace);
         rank_value >= static_cast<int>(Rank::Two);
         --rank_value) {
        const Card card = make_card(suit, static_cast<Rank>(rank_value));
        if (contains(hand, card)) {
            result |= (1u << rank_value) << 2;
        }
    }
    return result;
}

ddTableDeal to_dds_table_deal(const Deal& deal) {
    ddTableDeal table {};
    for (const Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West}) {
        const Hand hand = hand_of(deal, seat);
        table.cards[seat_index(seat)][0] = dds_holding(hand, Suit::Spades);
        table.cards[seat_index(seat)][1] = dds_holding(hand, Suit::Hearts);
        table.cards[seat_index(seat)][2] = dds_holding(hand, Suit::Diamonds);
        table.cards[seat_index(seat)][3] = dds_holding(hand, Suit::Clubs);
    }
    return table;
}

deal to_dds_deal(const Position& position) {
    deal result {};
    result.trump = dds_trump(position.current_trick.trump_suit);
    result.first = seat_index(position.current_trick.leader);

    for (const Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West}) {
        const Hand hand = hand_of(position.deal, seat);
        result.remainCards[seat_index(seat)][0] = dds_holding(hand, Suit::Spades);
        result.remainCards[seat_index(seat)][1] = dds_holding(hand, Suit::Hearts);
        result.remainCards[seat_index(seat)][2] = dds_holding(hand, Suit::Diamonds);
        result.remainCards[seat_index(seat)][3] = dds_holding(hand, Suit::Clubs);
    }

    for (std::uint8_t i = 0; i < position.current_trick.card_count; ++i) {
        result.currentTrickSuit[i] = dds_suit(suit_of(position.current_trick.cards[i]));
        result.currentTrickRank[i] = dds_rank(rank_of(position.current_trick.cards[i]));
    }
    return result;
}

void throw_dds_error(int code) {
    char message[80] {};
    ErrorMessage(code, message);
    throw std::runtime_error(message);
}

void ensure_dds_initialized() {
    static std::once_flag init_flag;
    std::call_once(init_flag, []() {
        SetMaxThreads(0);
    });
}

}  // namespace

DoubleDummyTable solve_double_dummy_table(const Deal& deal) {
    if (!has_full_deal(deal)) {
        throw std::invalid_argument("double dummy solver requires a complete 52-card deal");
    }

    ensure_dds_initialized();

    ddTableResults result {};
    const int code = CalcDDtable(to_dds_table_deal(deal), &result);
    if (code != RETURN_NO_FAULT) {
        throw_dds_error(code);
    }

    DoubleDummyTable table {};
    for (int strain = 0; strain < 5; ++strain) {
        for (int declarer = 0; declarer < 4; ++declarer) {
            table.tricks[strain][declarer] = result.resTable[strain][declarer];
        }
    }
    return table;
}

int double_dummy_tricks(const Deal& deal, Seat declarer, std::optional<Suit> trump_suit) {
    const DoubleDummyTable table = solve_double_dummy_table(deal);
    return table.tricks[dds_trump(trump_suit)][seat_index(declarer)];
}

std::uint8_t double_dummy_future_tricks(const Position& position, Seat declarer) {
    if (is_deal_finished(position)) {
        return 0;
    }

    ensure_dds_initialized();

    futureTricks future {};
    const int code = SolveBoard(to_dds_deal(position), -1, 1, 1, &future, 0);
    if (code != RETURN_NO_FAULT) {
        throw_dds_error(code);
    }

    std::uint16_t remaining_cards = 0;
    for (const Hand hand : position.deal.hands) {
        remaining_cards += card_count(hand);
    }
    const std::uint8_t remaining_tricks =
        static_cast<std::uint8_t>((remaining_cards + 3) / 4);

    // DDS scores the side to play. Alpha-mu always scores declarer's side.
    const bool declarer_side_to_play =
        same_side(next_to_play(position.current_trick), declarer);
    return declarer_side_to_play
        ? static_cast<std::uint8_t>(future.score[0])
        : static_cast<std::uint8_t>(remaining_tricks - future.score[0]);
}

}  // namespace bridge
