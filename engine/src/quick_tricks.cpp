#include "bridge/quick_tricks.h"

#include <algorithm>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <unordered_set>
#include <vector>

namespace bridge {
namespace {

// This is an optimization, not the main search. Giving up is always safe and
// prevents a difficult negative proof from becoming more expensive than the
// alpha-mu work it was meant to avoid.
constexpr std::uint64_t kQuickTrickStateBudget = 100'000;

Seat partner_of(Seat seat) {
    return static_cast<Seat>((seat_index(seat) + 2) % 4);
}

Card highest_card(Hand cards, Suit suit) {
    for (int rank = static_cast<int>(Rank::Ace);
         rank >= static_cast<int>(Rank::Two);
         --rank) {
        const Card card = make_card(suit, static_cast<Rank>(rank));
        if (contains(cards, card)) return card;
    }
    return kNoCard;
}

Hand force_one_defender_card(Hand defender_pool, Suit suit) {
    // At least one defender must follow while the combined pool contains this
    // suit. Removing the lowest card is the adversarial choice: any blocking
    // honour is retained for as long as a legal hidden split permits.
    for (int rank = static_cast<int>(Rank::Two);
         rank <= static_cast<int>(Rank::Ace);
         ++rank) {
        const Card card = make_card(suit, static_cast<Rank>(rank));
        if (contains(defender_pool, card)) {
            return remove_card(defender_pool, card);
        }
    }
    return defender_pool;
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

struct CashingState {
    Hand declarer_hand {};
    Hand dummy_hand {};
    Hand defender_pool {};
    Seat leader {Seat::South};
};

struct FailedState {
    Hand declarer_hand {};
    Hand dummy_hand {};
    Hand defender_pool {};
    std::uint8_t leader {};
    std::uint8_t tricks_needed {};

    bool operator==(const FailedState&) const = default;
};

struct FailedStateHash {
    std::size_t operator()(const FailedState& state) const {
        std::uint64_t hash = state.declarer_hand;
        hash ^= std::rotl(state.dummy_hand, 23);
        hash ^= std::rotl(state.defender_pool, 41);
        hash ^= static_cast<std::uint64_t>(state.leader) << 3;
        hash ^= static_cast<std::uint64_t>(state.tricks_needed) << 11;
        return static_cast<std::size_t>(hash);
    }
};

class CashingSearch {
public:
    CashingSearch(
        Seat declarer,
        std::optional<Suit> trump_suit)
        : declarer_(declarer),
          trump_suit_(trump_suit) {}

    bool prove(
        const CashingState& state,
        std::uint8_t tricks_needed,
        Card& first_card) {
        return can_cash(state, tricks_needed, &first_card);
    }

    std::uint64_t states_examined() const {
        return states_examined_;
    }

    bool budget_exhausted() const {
        return budget_exhausted_;
    }

private:
    Hand hand_for(const CashingState& state, Seat seat) const {
        return seat == declarer_ ? state.declarer_hand : state.dummy_hand;
    }

    void set_hand(CashingState& state, Seat seat, Hand hand) const {
        if (seat == declarer_) {
            state.declarer_hand = hand;
        } else {
            state.dummy_hand = hand;
        }
    }

    bool suit_is_safe_to_cash(const CashingState& state, Suit suit) const {
        if (!trump_suit_.has_value() || suit == *trump_suit_) return true;

        // With no knowledge of the split, any outstanding defender trump may
        // be in the hand void in this side suit. Refusing the suit is
        // conservative; drawing trumps is left for a future stronger bound.
        return cards_in_suit(state.defender_pool, *trump_suit_) == kEmptyHand;
    }

    bool can_cash(
        const CashingState& state,
        std::uint8_t tricks_needed,
        Card* selected_card) {
        if (tricks_needed == 0) return true;
        if (budget_exhausted_) return false;
        if (++states_examined_ > kQuickTrickStateBudget) {
            budget_exhausted_ = true;
            return false;
        }
        if (std::min(
                card_count(state.declarer_hand),
                card_count(state.dummy_hand)) < tricks_needed) {
            return false;
        }

        const FailedState failed_key {
            .declarer_hand = state.declarer_hand,
            .dummy_hand = state.dummy_hand,
            .defender_pool = state.defender_pool,
            .leader = seat_index(state.leader),
            .tricks_needed = tricks_needed,
        };
        if (failed_.contains(failed_key)) return false;

        const Seat partner = partner_of(state.leader);
        const Hand leader_hand = hand_for(state, state.leader);
        const Hand partner_hand = hand_for(state, partner);
        const Hand remaining_cards =
            state.declarer_hand | state.dummy_hand | state.defender_pool;

        for (const Suit suit : {
                 Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
            const Hand leads = cards_in_suit(leader_hand, suit);
            if (leads == kEmptyHand || !suit_is_safe_to_cash(state, suit)) continue;

            const Card top = highest_card(remaining_cards, suit);
            if (contains(partner_hand, top)) {
                // Leading any card in the suit transfers the lead to partner's
                // absolute top card. Declarer controls both cards.
                for (const Card lead : cards_in_bridge_order(leads)) {
                    CashingState child = state;
                    set_hand(
                        child,
                        state.leader,
                        remove_card(leader_hand, lead));
                    set_hand(
                        child,
                        partner,
                        remove_card(partner_hand, top));
                    child.defender_pool =
                        force_one_defender_card(child.defender_pool, suit);
                    child.leader = partner;
                    if (can_cash(child, tricks_needed - 1, nullptr)) {
                        if (selected_card != nullptr) *selected_card = lead;
                        return true;
                    }
                }
                continue;
            }

            if (!contains(leader_hand, top)) continue;

            // If the leader owns the absolute top card, that exact card must
            // be led. Partner must follow suit when possible and may otherwise
            // choose any discard; search those choices as entry management.
            Hand partner_replies = cards_in_suit(partner_hand, suit);
            if (partner_replies == kEmptyHand) partner_replies = partner_hand;
            for (const Card reply : cards_in_bridge_order(partner_replies)) {
                CashingState child = state;
                set_hand(
                    child,
                    state.leader,
                    remove_card(leader_hand, top));
                set_hand(
                    child,
                    partner,
                    remove_card(partner_hand, reply));
                child.defender_pool =
                    force_one_defender_card(child.defender_pool, suit);
                if (can_cash(child, tricks_needed - 1, nullptr)) {
                    if (selected_card != nullptr) *selected_card = top;
                    return true;
                }
            }
        }

        if (!budget_exhausted_) failed_.insert(failed_key);
        return false;
    }

    Seat declarer_;
    std::optional<Suit> trump_suit_;
    std::uint64_t states_examined_ {};
    bool budget_exhausted_ {};
    std::unordered_set<FailedState, FailedStateHash> failed_;
};

}  // namespace

QuickTrickProof prove_declarer_quick_tricks(
    const Position& position,
    Seat declarer,
    std::uint8_t required_tricks) {
    if (required_tricks == 0) {
        return QuickTrickProof {.proven = true};
    }
    if (position.current_trick.card_count != 0) return {};

    const Seat leader = next_to_play(position.current_trick);
    if (!same_side(leader, declarer)) return {};

    const Seat dummy = partner_of(declarer);
    const Hand declarer_hand = hand_of(position.deal, declarer);
    const Hand dummy_hand = hand_of(position.deal, dummy);

    // Everything not held by declarer/dummy and not already played is the
    // combined defender pool. Crucially, E/W's individual hands are not read.
    const Hand defender_pool =
        kFullDeck & ~(declarer_hand | dummy_hand | position.played_cards);
    CashingSearch search(
        declarer,
        position.current_trick.trump_suit);
    Card first_card = kNoCard;
    const bool proven = search.prove(
        CashingState {
            .declarer_hand = declarer_hand,
            .dummy_hand = dummy_hand,
            .defender_pool = defender_pool,
            .leader = leader,
        },
        required_tricks,
        first_card);
    return QuickTrickProof {
        .proven = proven,
        .first_card = first_card,
        .states_examined = search.states_examined(),
        .budget_exhausted = search.budget_exhausted(),
    };
}

}  // namespace bridge
