#include "bridge/analysis_session.h"

#include <algorithm>
#include <chrono>
#include <cctype>
#include <sstream>
#include <stdexcept>
#include <unordered_set>

namespace bridge {
namespace {

constexpr std::array<Suit, 4> kHandRecordSuits {
    Suit::Spades,
    Suit::Hearts,
    Suit::Diamonds,
    Suit::Clubs,
};

std::string trim(std::string_view text) {
    const auto first = std::find_if_not(text.begin(), text.end(), [](unsigned char c) {
        return std::isspace(c) != 0;
    });
    const auto last = std::find_if_not(text.rbegin(), text.rend(), [](unsigned char c) {
        return std::isspace(c) != 0;
    }).base();
    return first < last ? std::string(first, last) : std::string {};
}

std::vector<std::string> split_holdings(const std::string& text) {
    std::vector<std::string> fields;
    std::string current;
    for (const char symbol : text) {
        if (symbol == '.' || std::isspace(static_cast<unsigned char>(symbol)) != 0) {
            if (!current.empty()) {
                fields.push_back(current);
                current.clear();
            }
        } else {
            current += symbol;
        }
    }
    if (!current.empty()) {
        fields.push_back(current);
    }
    return fields;
}

void validate_deal(const Deal& deal) {
    const std::uint8_t cards_per_hand = card_count(hand_of(deal, Seat::North));
    if (cards_per_hand == 0 || cards_per_hand > 13) {
        throw std::invalid_argument("each hand must contain between 1 and 13 cards");
    }

    Hand all_cards = kEmptyHand;
    for (const Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West}) {
        const Hand hand = hand_of(deal, seat);
        if (card_count(hand) != cards_per_hand) {
            throw std::invalid_argument("all four hands must contain the same number of cards");
        }
        if ((all_cards & hand) != kEmptyHand) {
            throw std::invalid_argument("a card appears in more than one hand");
        }
        all_cards |= hand;
    }
}

std::string void_string(
    const std::array<std::array<bool, 4>, 4>& voids,
    Seat seat) {
    std::string result;
    for (const Suit suit : kHandRecordSuits) {
        if (voids[seat_index(seat)][static_cast<std::size_t>(suit)]) {
            result += to_string(suit);
        }
    }
    return result.empty() ? "none" : result;
}

}  // namespace

std::optional<Hand> parse_hand_record(std::string_view text) {
    const std::vector<std::string> fields = split_holdings(trim(text));
    if (fields.size() != kHandRecordSuits.size()) {
        return std::nullopt;
    }

    Hand hand = kEmptyHand;
    for (std::size_t suit_index = 0; suit_index < fields.size(); ++suit_index) {
        const std::string& holding = fields[suit_index];
        if (holding == "-") {
            continue;
        }
        for (const char symbol : holding) {
            const std::optional<Rank> rank = parse_rank(symbol);
            if (!rank.has_value()) {
                return std::nullopt;
            }
            const Card card = make_card(kHandRecordSuits[suit_index], *rank);
            if (contains(hand, card)) {
                return std::nullopt;
            }
            hand = add_card(hand, card);
        }
    }
    return hand;
}

AnalysisSession::AnalysisSession(
    Deal actual_deal,
    Seat leader,
    std::optional<Suit> trump_suit)
    : original_deal_(actual_deal),
      position_ {
          .deal = actual_deal,
          .current_trick = Trick {.leader = leader, .trump_suit = trump_suit},
          .played_cards = kFullDeck & ~(
              hand_of(actual_deal, Seat::North) |
              hand_of(actual_deal, Seat::East) |
              hand_of(actual_deal, Seat::South) |
              hand_of(actual_deal, Seat::West)),
      } {
    validate_deal(actual_deal);
    initial_position_ = position_;
    settings_.target_tricks = card_count(hand_of(actual_deal, Seat::North));
}

const Position& AnalysisSession::position() const {
    return position_;
}

const Deal& AnalysisSession::original_deal() const {
    return original_deal_;
}

const BotSettings& AnalysisSession::settings() const {
    return settings_;
}

void AnalysisSession::set_settings(BotSettings settings) {
    if (settings.world_count == 0 || settings.world_count > 64) {
        throw std::invalid_argument("world count must be between 1 and 64");
    }
    if (settings.max_declarer_plies == 0 || settings.max_declarer_plies > 13) {
        throw std::invalid_argument("depth M must be between 1 and 13");
    }
    if (settings.target_tricks == 0 || settings.target_tricks > 13) {
        throw std::invalid_argument("target tricks must be between 1 and 13");
    }
    if (settings.max_search_seconds < 0.0) {
        throw std::invalid_argument("time limit cannot be negative");
    }
    settings_ = settings;
    policy_.reset();
}

HandSamplingConstraints AnalysisSession::sampling_constraints(Hand defender_cards) const {
    HandSamplingConstraints constraints;
    for (const Suit suit : kHandRecordSuits) {
        const std::size_t index = static_cast<std::size_t>(suit);
        if (voids_[seat_index(Seat::East)][index]) {
            constraints.max_lengths[index] = 0;
        }
        if (voids_[seat_index(Seat::West)][index]) {
            const std::uint8_t remaining = card_count(cards_in_suit(defender_cards, suit));
            constraints.min_lengths[index] = remaining;
            constraints.max_lengths[index] = remaining;
        }
    }
    return constraints;
}

AnalysisSession::SampledWorlds AnalysisSession::sample_worlds() {
    const Hand defender_cards =
        hand_of(position_.deal, Seat::East) | hand_of(position_.deal, Seat::West);
    const std::uint8_t east_card_count = card_count(hand_of(position_.deal, Seat::East));
    const HandSamplingConstraints constraints = sampling_constraints(defender_cards);

    SampledWorlds sampled;
    sampled.possible_deals = count_constrained_hands(
        defender_cards,
        kEmptyHand,
        kEmptyHand,
        constraints,
        east_card_count);
    if (sampled.possible_deals == 0) {
        throw std::logic_error("the public constraints admit no defender layouts");
    }

    const auto sampling_start = std::chrono::steady_clock::now();
    sampled.worlds.reserve(settings_.world_count);
    std::unordered_set<Hand> unique_east_hands;
    for (std::size_t index = 0; index < settings_.world_count; ++index) {
        const std::uint64_t seed = settings_.random_seed +
            analysis_number_ * 0x9E3779B97F4A7C15ULL + index;
        const std::optional<Hand> east = sample_constrained_hand(
            defender_cards,
            constraints,
            seed,
            east_card_count);
        if (!east.has_value()) {
            throw std::logic_error("failed to sample a defender layout");
        }
        unique_east_hands.insert(*east);

        Position sampled_position = position_;
        hand_of(sampled_position.deal, Seat::East) = *east;
        hand_of(sampled_position.deal, Seat::West) = defender_cards & ~*east;
        sampled.worlds.push_back(AlphaMuWorld {.position = sampled_position});
    }
    ++analysis_number_;
    sampled.unique_worlds = unique_east_hands.size();
    sampled.sampling_ms = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - sampling_start).count();
    return sampled;
}

AlphaMuConfig AnalysisSession::search_config(bool build_policy) const {
    return AlphaMuConfig {
        .declarer = Seat::South,
        .trump_suit = position_.current_trick.trump_suit,
        .target_tricks = settings_.target_tricks,
        .max_declarer_plies = settings_.max_declarer_plies,
        .optimizations = settings_.optimizations,
        .build_trick_policy = build_policy,
        .collect_audit_log = settings_.collect_audit_log,
        .max_search_seconds = settings_.max_search_seconds,
    };
}

SessionAnalysis AnalysisSession::analyze() {
    if (is_deal_finished(position_)) {
        throw std::logic_error("the deal is finished");
    }
    const Seat player = next_to_play(position_.current_trick);
    if (!same_side(player, Seat::South)) {
        throw std::logic_error("alpha-mu recommendations are available only for North/South");
    }

    SampledWorlds sampled = sample_worlds();
    SessionAnalysis analysis {
        .possible_deals = sampled.possible_deals,
        .unique_worlds = sampled.unique_worlds,
        .sampling_ms = sampled.sampling_ms,
    };
    const auto search_start = std::chrono::steady_clock::now();
    analysis.search = alpha_mu_search(sampled.worlds, search_config(true));
    analysis.search_ms = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - search_start).count();
    policy_ = analysis.search.trick_policy;
    return analysis;
}

OptimizationBenchmark AnalysisSession::benchmark(AlphaMuOptimization optimization) {
    if (is_deal_finished(position_)) {
        throw std::logic_error("the deal is finished");
    }
    if (!same_side(next_to_play(position_.current_trick), Seat::South)) {
        throw std::logic_error("alpha-mu benchmarks are available only for North/South");
    }

    SampledWorlds sampled = sample_worlds();
    OptimizationBenchmark benchmark {
        .optimization = optimization,
        .possible_deals = sampled.possible_deals,
        .sampled_worlds = sampled.worlds.size(),
        .unique_worlds = sampled.unique_worlds,
        .sampling_ms = sampled.sampling_ms,
    };

    auto run = [&](bool enabled) {
        AlphaMuConfig config = search_config(false);
        config.collect_audit_log = false;
        set_optimization_enabled(config.optimizations, optimization, enabled);
        const auto start = std::chrono::steady_clock::now();
        AlphaMuResult result = alpha_mu_search(sampled.worlds, config);
        const double elapsed = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - start).count();
        return OptimizationBenchmarkRun {
            .search = std::move(result),
            .search_ms = elapsed,
        };
    };

    benchmark.disabled = run(false);
    benchmark.enabled = run(true);
    return benchmark;
}

std::optional<Card> AnalysisSession::policy_move() const {
    if (policy_ == nullptr ||
        policy_->player != next_to_play(position_.current_trick) ||
        policy_->declarer_move == kNoCard) {
        return std::nullopt;
    }
    return policy_->declarer_move;
}

void AnalysisSession::advance_policy(Seat player, Card card) {
    if (policy_ == nullptr || policy_->player != player) {
        policy_.reset();
        return;
    }

    if (same_side(player, Seat::South)) {
        policy_ = policy_->declarer_move == card ? policy_->continuation : nullptr;
        return;
    }

    const auto branch = std::find_if(
        policy_->defender_branches.begin(),
        policy_->defender_branches.end(),
        [&](const AlphaMuPolicyBranch& candidate) { return candidate.card == card; });
    policy_ = branch == policy_->defender_branches.end()
        ? nullptr
        : branch->continuation;
}

void AnalysisSession::play(Card card) {
    if (is_deal_finished(position_)) {
        throw std::logic_error("the deal is finished");
    }
    const Seat player = next_to_play(position_.current_trick);
    const Hand hand = hand_of(position_.deal, player);
    if (!is_legal_play(position_.current_trick, hand, card)) {
        throw std::invalid_argument("illegal play for " + to_string(player));
    }

    history_.push_back(Snapshot {
        .position = position_,
        .voids = voids_,
        .analysis_number = analysis_number_,
        .policy = policy_,
    });

    if (!same_side(player, Seat::South) && position_.current_trick.card_count > 0 &&
        suit_of(card) != suit_of(position_.current_trick.cards[0])) {
        voids_[seat_index(player)][static_cast<std::size_t>(
            suit_of(position_.current_trick.cards[0]))] = true;
    }

    const std::uint8_t completed_before = position_.completed_tricks;
    advance_policy(player, card);
    play_card(position_, card);
    if (position_.completed_tricks != completed_before) {
        policy_.reset();
    }
}

bool AnalysisSession::undo() {
    if (history_.empty()) {
        return false;
    }
    Snapshot snapshot = std::move(history_.back());
    history_.pop_back();
    position_ = std::move(snapshot.position);
    voids_ = snapshot.voids;
    analysis_number_ = snapshot.analysis_number;
    policy_ = std::move(snapshot.policy);
    return true;
}

void AnalysisSession::replay() {
    position_ = initial_position_;
    voids_ = {};
    analysis_number_ = 0;
    policy_.reset();
    history_.clear();
}

std::string AnalysisSession::public_diagram() const {
    return format_deal(Deal {.hands = {
        hand_of(position_.deal, Seat::North),
        kEmptyHand,
        hand_of(position_.deal, Seat::South),
        kEmptyHand,
    }});
}

std::string AnalysisSession::full_diagram() const {
    return format_deal(position_.deal);
}

std::string AnalysisSession::known_voids() const {
    return "East=" + void_string(voids_, Seat::East) +
        ", West=" + void_string(voids_, Seat::West);
}

}  // namespace bridge
