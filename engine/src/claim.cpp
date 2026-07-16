#include "bridge/claim.h"

#include <algorithm>
#include <array>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <unordered_set>
#include <vector>

namespace bridge {
namespace {

// This is a bound/shortcut, not the main solver. If proof is expensive, it
// gives up and alpha-mu continues normally.
constexpr std::uint64_t kClaimStateBudget = 250'000;

Seat partner_of(Seat seat) {
    return static_cast<Seat>((seat_index(seat) + 2) % 4);
}

std::vector<Card> cards_in_bridge_order(Hand cards) {
    std::vector<Card> result;
    result.reserve(card_count(cards));
    for (const Suit suit : {
             Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        for (int rank = static_cast<int>(Rank::Ace);
             rank >= static_cast<int>(Rank::Two);
             --rank) {
            const Card card = make_card(suit, static_cast<Rank>(rank));
            if (contains(cards, card)) result.push_back(card);
        }
    }
    return result;
}

std::uint8_t rank_value(Card card) {
    return static_cast<std::uint8_t>(rank_of(card));
}

bool outranks(Card challenger, Card current, std::optional<Suit> trump_suit) {
    const Suit challenger_suit = suit_of(challenger);
    const Suit current_suit = suit_of(current);
    if (challenger_suit == current_suit) {
        return rank_value(challenger) > rank_value(current);
    }
    if (trump_suit.has_value()) {
        if (challenger_suit == *trump_suit) return true;
        if (current_suit == *trump_suit) return false;
    }
    return false;
}

Card trick_winner(Card lead, Card follow, std::optional<Suit> trump_suit) {
    return outranks(follow, lead, trump_suit) ? follow : lead;
}

struct CombinedDefender {
    // Maximum number of rounds one defender can still follow in each suit.
    std::array<std::uint8_t, 4> max_rounds {};

    // Number of early rounds where both defenders are forced to follow.
    std::array<std::uint8_t, 4> min_rounds {};

    std::array<int, 4> highest_rank {-1, -1, -1, -1};
};

CombinedDefender make_combined_defender(Hand defender_pool) {
    const std::uint8_t cards_per_defender =
        static_cast<std::uint8_t>(card_count(defender_pool) / 2);
    CombinedDefender result;
    for (const Suit suit : {
             Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades}) {
        const std::size_t index = static_cast<std::size_t>(suit);
        const Hand suit_cards = cards_in_suit(defender_pool, suit);
        const std::uint8_t total = card_count(suit_cards);
        result.max_rounds[index] = std::min(total, cards_per_defender);
        result.min_rounds[index] = total > cards_per_defender
            ? static_cast<std::uint8_t>(total - cards_per_defender)
            : 0;
        for (int rank = static_cast<int>(Rank::Ace);
             rank >= static_cast<int>(Rank::Two);
             --rank) {
            if (contains(suit_cards, make_card(suit, static_cast<Rank>(rank)))) {
                result.highest_rank[index] = rank;
                break;
            }
        }
    }
    return result;
}

struct ClaimState {
    Hand declarer_hand {};
    Hand dummy_hand {};
    Seat leader {Seat::South};
    std::array<std::uint8_t, 4> rounds_led {};
};

struct FailedState {
    Hand declarer_hand {};
    Hand dummy_hand {};
    std::uint8_t leader {};
    std::array<std::uint8_t, 4> rounds_led {};
    std::uint8_t tricks_needed {};

    bool operator==(const FailedState&) const = default;
};

struct FailedStateHash {
    std::size_t operator()(const FailedState& state) const {
        std::uint64_t hash = state.declarer_hand;
        hash ^= std::rotl(state.dummy_hand, 19);
        hash ^= static_cast<std::uint64_t>(state.leader) << 3;
        hash ^= static_cast<std::uint64_t>(state.tricks_needed) << 11;
        for (std::size_t index = 0; index < state.rounds_led.size(); ++index) {
            hash ^= static_cast<std::uint64_t>(state.rounds_led[index])
                << (16 + index * 8);
        }
        return static_cast<std::size_t>(hash);
    }
};

class ClaimSearch {
public:
    ClaimSearch(
        Seat declarer,
        std::optional<Suit> trump_suit,
        CombinedDefender defender)
        : declarer_(declarer),
          dummy_(partner_of(declarer)),
          trump_suit_(trump_suit),
          defender_(defender) {}

    bool prove(ClaimState state, std::uint8_t tricks_needed, Card& first_card) {
        return can_claim(state, tricks_needed, &first_card);
    }

    std::uint64_t states_examined() const {
        return states_examined_;
    }

    std::uint64_t cache_hits() const {
        return cache_hits_;
    }

    bool budget_exhausted() const {
        return budget_exhausted_;
    }

private:
    Hand hand_for(const ClaimState& state, Seat seat) const {
        return seat == declarer_ ? state.declarer_hand : state.dummy_hand;
    }

    void set_hand(ClaimState& state, Seat seat, Hand hand) const {
        if (seat == declarer_) {
            state.declarer_hand = hand;
        } else {
            state.dummy_hand = hand;
        }
    }

    bool trumps_drawn(const ClaimState& state) const {
        if (!trump_suit_.has_value()) return true;
        const std::size_t index = static_cast<std::size_t>(*trump_suit_);
        return state.rounds_led[index] >= defender_.max_rounds[index];
    }

    bool both_defenders_must_follow(const ClaimState& state, Suit suit) const {
        const std::size_t index = static_cast<std::size_t>(suit);
        return state.rounds_led[index] < defender_.min_rounds[index];
    }

    bool defenders_out_of(const ClaimState& state, Suit suit) const {
        const std::size_t index = static_cast<std::size_t>(suit);
        return state.rounds_led[index] >= defender_.max_rounds[index];
    }

    bool trick_is_unbeatable(
        const ClaimState& state,
        Card lead,
        Card follow) const {
        const Suit lead_suit = suit_of(lead);
        const Card winner = trick_winner(lead, follow, trump_suit_);
        const Suit winner_suit = suit_of(winner);
        const bool winner_is_trump =
            trump_suit_.has_value() && winner_suit == *trump_suit_;

        if (trump_suit_.has_value() &&
            !winner_is_trump &&
            !trumps_drawn(state) &&
            !both_defenders_must_follow(state, lead_suit)) {
            return false;
        }

        if (winner_is_trump && lead_suit != winner_suit &&
            (trumps_drawn(state) ||
             both_defenders_must_follow(state, lead_suit))) {
            return true;
        }

        if (defenders_out_of(state, winner_suit)) return true;

        const int defender_high =
            defender_.highest_rank[static_cast<std::size_t>(winner_suit)];
        return static_cast<int>(rank_value(winner)) > defender_high;
    }

    bool can_claim(
        const ClaimState& state,
        std::uint8_t tricks_needed,
        Card* selected_card) {
        if (tricks_needed == 0) return true;
        if (budget_exhausted_) return false;
        if (++states_examined_ > kClaimStateBudget) {
            budget_exhausted_ = true;
            return false;
        }
        if (std::min(card_count(state.declarer_hand), card_count(state.dummy_hand)) <
            tricks_needed) {
            return false;
        }

        const FailedState failed_key {
            .declarer_hand = state.declarer_hand,
            .dummy_hand = state.dummy_hand,
            .leader = seat_index(state.leader),
            .rounds_led = state.rounds_led,
            .tricks_needed = tricks_needed,
        };
        if (failed_.contains(failed_key)) {
            ++cache_hits_;
            return false;
        }

        const Seat follower = partner_of(state.leader);
        const Hand leader_hand = hand_for(state, state.leader);
        const Hand follower_hand = hand_for(state, follower);

        for (const Card lead : cards_in_bridge_order(leader_hand)) {
            const Suit lead_suit = suit_of(lead);
            Hand replies = cards_in_suit(follower_hand, lead_suit);
            if (replies == kEmptyHand) replies = follower_hand;

            for (const Card follow : cards_in_bridge_order(replies)) {
                if (!trick_is_unbeatable(state, lead, follow)) continue;

                ClaimState child = state;
                set_hand(child, state.leader, remove_card(leader_hand, lead));
                set_hand(child, follower, remove_card(follower_hand, follow));
                ++child.rounds_led[static_cast<std::size_t>(lead_suit)];
                const Card winner = trick_winner(lead, follow, trump_suit_);
                child.leader = winner == lead ? state.leader : follower;

                if (can_claim(child, tricks_needed - 1, nullptr)) {
                    if (selected_card != nullptr) *selected_card = lead;
                    return true;
                }
            }
        }

        if (!budget_exhausted_) failed_.insert(failed_key);
        return false;
    }

    Seat declarer_;
    Seat dummy_;
    std::optional<Suit> trump_suit_;
    CombinedDefender defender_;
    std::uint64_t states_examined_ {};
    std::uint64_t cache_hits_ {};
    bool budget_exhausted_ {};
    std::unordered_set<FailedState, FailedStateHash> failed_;
};

}  // namespace

ClaimProof prove_declarer_claim(
    const Position& position,
    Seat declarer,
    std::uint8_t required_tricks) {
    if (required_tricks == 0) {
        return ClaimProof {.proven = true};
    }
    if (position.current_trick.card_count != 0) return {};

    const Seat leader = next_to_play(position.current_trick);
    if (!same_side(leader, declarer)) return {};

    Hand defender_pool = kEmptyHand;
    for (const Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West}) {
        if (!same_side(seat, declarer)) {
            defender_pool |= hand_of(position.deal, seat);
        }
    }
    if (card_count(defender_pool) % 2 != 0) return {};

    ClaimSearch search(
        declarer,
        position.current_trick.trump_suit,
        make_combined_defender(defender_pool));
    Card first_card = kNoCard;
    const bool proven = search.prove(
        ClaimState {
            .declarer_hand = hand_of(position.deal, declarer),
            .dummy_hand = hand_of(position.deal, partner_of(declarer)),
            .leader = leader,
        },
        required_tricks,
        first_card);

    return ClaimProof {
        .proven = proven,
        .first_card = first_card,
        .tricks_claimed = proven ? required_tricks : std::uint8_t {0},
        .states_examined = search.states_examined(),
        .cache_hits = search.cache_hits(),
        .budget_exhausted = search.budget_exhausted(),
    };
}

}  // namespace bridge
