#include "bridge/analysis_session.h"

#include <emscripten/bind.h>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <iomanip>
#include <limits>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>

namespace bridge {
namespace {

std::string json_escape(std::string_view text) {
    std::ostringstream output;
    for (const unsigned char character : text) {
        switch (character) {
            case '"': output << "\\\""; break;
            case '\\': output << "\\\\"; break;
            case '\n': output << "\\n"; break;
            case '\r': output << "\\r"; break;
            case '\t': output << "\\t"; break;
            default:
                if (character < 0x20) {
                    output << "\\u" << std::hex << std::setw(4)
                           << std::setfill('0') << static_cast<int>(character)
                           << std::dec;
                } else {
                    output << static_cast<char>(character);
                }
        }
    }
    return output.str();
}

std::string json_quote(std::string_view text) {
    return "\"" + json_escape(text) + "\"";
}

Seat parse_seat_name(std::string_view text) {
    if (text == "N" || text == "North") return Seat::North;
    if (text == "E" || text == "East") return Seat::East;
    if (text == "S" || text == "South") return Seat::South;
    if (text == "W" || text == "West") return Seat::West;
    throw std::invalid_argument("leader must be North, East, South, or West");
}

std::optional<Suit> parse_trump_name(std::string_view text) {
    if (text == "NT" || text == "None") return std::nullopt;
    if (text == "S") return Suit::Spades;
    if (text == "H") return Suit::Hearts;
    if (text == "D") return Suit::Diamonds;
    if (text == "C") return Suit::Clubs;
    throw std::invalid_argument("trump must be S, H, D, C, or NT");
}

Hand parse_card_list(std::string text, std::string_view label) {
    for (char& character : text) {
        if (character == ',' || character == ';') character = ' ';
    }
    std::istringstream input(text);
    std::string token;
    Hand cards = kEmptyHand;
    while (input >> token) {
        if (token == "-") continue;
        const std::optional<Card> card = parse_card(token);
        if (!card.has_value()) {
            throw std::invalid_argument(
                std::string(label) + " contains invalid card '" + token + "'");
        }
        cards = add_card(cards, *card);
    }
    return cards;
}

std::uint8_t restriction_number(
    const emscripten::val& value,
    const char* property,
    std::uint8_t fallback) {
    const emscripten::val item = value[property];
    if (item.isUndefined() || item.isNull()) return fallback;
    const int number = item.as<int>();
    if (number < 0 || number > 255) {
        throw std::invalid_argument(std::string(property) + " is outside the valid range");
    }
    return static_cast<std::uint8_t>(number);
}

SeatRestrictions parse_seat_restrictions(
    const emscripten::val& value,
    std::string_view label) {
    SeatRestrictions result;
    if (value.isUndefined() || value.isNull()) return result;

    const emscripten::val required = value["required"];
    const emscripten::val forbidden = value["forbidden"];
    result.required_cards = parse_card_list(
        required.isUndefined() ? "" : required.as<std::string>(),
        std::string(label) + " required cards");
    result.forbidden_cards = parse_card_list(
        forbidden.isUndefined() ? "" : forbidden.as<std::string>(),
        std::string(label) + " forbidden cards");

    const std::array<std::pair<Suit, const char*>, 4> suits {{
        {Suit::Spades, "S"},
        {Suit::Hearts, "H"},
        {Suit::Diamonds, "D"},
        {Suit::Clubs, "C"},
    }};
    for (const auto& [suit, name] : suits) {
        const std::size_t index = static_cast<std::size_t>(suit);
        const std::string min_name = std::string("min") + name;
        const std::string max_name = std::string("max") + name;
        result.hand.min_lengths[index] = restriction_number(
            value, min_name.c_str(), 0);
        result.hand.max_lengths[index] = restriction_number(
            value, max_name.c_str(), kRanksPerSuit);
    }
    result.hand.min_hcp = restriction_number(value, "minHcp", 0);
    result.hand.max_hcp = restriction_number(value, "maxHcp", 37);
    return result;
}

std::string holding(Hand hand, Suit suit) {
    std::string result;
    for (int rank = static_cast<int>(Rank::Ace);
         rank >= static_cast<int>(Rank::Two);
         --rank) {
        const Card card = make_card(suit, static_cast<Rank>(rank));
        if (contains(hand, card)) result += to_string(rank_of(card));
    }
    return result.empty() ? "-" : result;
}

std::string hand_json(Hand hand) {
    std::ostringstream output;
    output << "{\"record\":" << json_quote(format_hand(hand))
           << ",\"S\":" << json_quote(holding(hand, Suit::Spades))
           << ",\"H\":" << json_quote(holding(hand, Suit::Hearts))
           << ",\"D\":" << json_quote(holding(hand, Suit::Diamonds))
           << ",\"C\":" << json_quote(holding(hand, Suit::Clubs)) << '}';
    return output.str();
}

std::string cards_json(Hand cards) {
    std::ostringstream output;
    output << '[';
    bool first = true;
    for (const Suit suit : {Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        for (int rank = static_cast<int>(Rank::Ace);
             rank >= static_cast<int>(Rank::Two);
             --rank) {
            const Card card = make_card(suit, static_cast<Rank>(rank));
            if (!contains(cards, card)) continue;
            if (!first) output << ',';
            output << json_quote(to_string(card));
            first = false;
        }
    }
    output << ']';
    return output.str();
}

std::string state_json(const AnalysisSession& session) {
    const Position& position = session.position();
    const bool finished = is_deal_finished(position);
    std::ostringstream output;
    output << "{\"turn\":"
           << (finished ? "null" : json_quote(to_string(next_to_play(position.current_trick))))
           << ",\"finished\":" << (finished ? "true" : "false")
           << ",\"completedTricks\":" << static_cast<int>(position.completed_tricks)
           << ",\"score\":{\"ns\":" << static_cast<int>(position.score.north_south)
           << ",\"ew\":" << static_cast<int>(position.score.east_west) << "}"
           << ",\"hands\":{\"North\":" << hand_json(hand_of(position.deal, Seat::North))
           << ",\"East\":" << hand_json(hand_of(position.deal, Seat::East))
           << ",\"South\":" << hand_json(hand_of(position.deal, Seat::South))
           << ",\"West\":" << hand_json(hand_of(position.deal, Seat::West)) << "}"
           << ",\"knownVoids\":" << json_quote(session.known_voids())
           << ",\"legalCards\":";
    if (finished) {
        output << "[]";
    } else {
        const Seat player = next_to_play(position.current_trick);
        output << cards_json(legal_plays(
            position.current_trick, hand_of(position.deal, player)));
    }

    output << ",\"trick\":[";
    for (std::uint8_t index = 0; index < position.current_trick.card_count; ++index) {
        if (index != 0) output << ',';
        Seat player = position.current_trick.leader;
        for (std::uint8_t step = 0; step < index; ++step) player = next_seat(player);
        output << "{\"seat\":" << json_quote(to_string(player))
               << ",\"card\":" << json_quote(to_string(position.current_trick.cards[index]))
               << '}';
    }
    output << "]}";
    return output.str();
}

std::string stats_json(const AlphaMuSearchStats& stats) {
    std::ostringstream output;
    output << "{\"nodes\":" << stats.nodes
           << ",\"leaves\":" << stats.leaves
           << ",\"ddsWorlds\":" << stats.dds_worlds
           << ",\"ttProbes\":" << stats.transposition_probes
           << ",\"ttHits\":" << stats.transposition_hits
           << ",\"ttStores\":" << stats.transposition_stores
           << ",\"earlyCuts\":" << stats.early_cuts
           << ",\"usefulWorldsRemoved\":" << stats.useful_worlds_removed
           << ",\"worldCuts\":" << stats.world_cuts
           << ",\"zeroWorldCuts\":" << stats.zero_world_cuts
           << ",\"oneWorldCuts\":" << stats.one_world_cuts
           << ",\"emptyEntrySearches\":" << stats.empty_entry_searches
           << ",\"deepAlphaCuts\":" << stats.deep_alpha_cuts
           << ",\"rootCuts\":" << stats.root_cuts
           << ",\"winCuts\":" << stats.win_cuts
           << ",\"equivalentMoves\":" << stats.equivalent_moves_skipped
           << ",\"maxEquivalentMoves\":" << stats.max_equivalent_moves_skipped
           << ",\"minEquivalentMoves\":" << stats.min_equivalent_moves_skipped
           << ",\"forcedTrumpCuts\":" << stats.forced_trump_run_cuts
           << ",\"leafDdsBatches\":" << stats.leaf_dds_batches
           << ",\"leafDdsWorlds\":" << stats.leaf_dds_worlds
           << ",\"completedIterations\":" << static_cast<int>(stats.completed_iterations)
           << ",\"completedDepth\":" << static_cast<int>(stats.completed_depth)
           << ",\"stoppedByTime\":"
           << (stats.stopped_by_time_limit ? "true" : "false")
           << ",\"lastIterationMs\":" << stats.last_iteration_ms
           << ",\"projectedNextIterationMs\":" << stats.projected_next_iteration_ms
           << ",\"treeMs\":" << stats.tree_search_ms
           << ",\"policyMs\":" << stats.policy_build_ms << '}';
    return output.str();
}

std::string analysis_json(const SessionAnalysis& analysis) {
    std::ostringstream output;
    output << "{\"bestMove\":" << json_quote(to_string(analysis.search.best_move))
           << ",\"winningWorlds\":"
           << best_winning_world_count(analysis.search.front)
           << ",\"possibleDeals\":" << analysis.possible_deals
           << ",\"uniqueWorlds\":" << analysis.unique_worlds
           << ",\"samplingMs\":" << analysis.sampling_ms
           << ",\"searchMs\":" << analysis.search_ms
           << ",\"rootMoves\":[";
    for (std::size_t index = 0; index < analysis.search.root_moves.size(); ++index) {
        if (index != 0) output << ',';
        const AlphaMuRootMove& move = analysis.search.root_moves[index];
        output << "{\"card\":" << json_quote(to_string(move.move))
               << ",\"winningWorlds\":" << move.winning_worlds
               << ",\"paretoVectors\":" << move.pareto_vectors << '}';
    }
    output << "],\"stats\":" << stats_json(analysis.search.stats) << '}';
    return output.str();
}

Card choose_dds_defender_card(const Position& position) {
    const Seat player = next_to_play(position.current_trick);
    const Hand legal = legal_plays(position.current_trick, hand_of(position.deal, player));
    Card best = kNoCard;
    std::uint8_t minimum = std::numeric_limits<std::uint8_t>::max();
    for (const Suit suit : {Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        for (int rank = static_cast<int>(Rank::Two);
             rank <= static_cast<int>(Rank::Ace);
             ++rank) {
            const Card card = make_card(suit, static_cast<Rank>(rank));
            if (!contains(legal, card)) continue;
            Position child = position;
            play_card(child, card);
            const std::uint8_t tricks = static_cast<std::uint8_t>(
                child.score.north_south + double_dummy_future_tricks(child, Seat::South));
            if (best == kNoCard || tricks < minimum) {
                best = card;
                minimum = tricks;
            }
        }
    }
    return best;
}

std::string error_json(const std::exception& error) {
    return "{\"ok\":false,\"error\":" + json_quote(error.what()) + '}';
}

}  // namespace

class BrowserBridgeEngine {
public:
    std::string create_session(
        const std::string& north,
        const std::string& east,
        const std::string& south,
        const std::string& west,
        const std::string& leader,
        const std::string& trump) {
        try {
            Deal deal;
            const std::array<std::string, 4> records {north, east, south, west};
            for (const Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West}) {
                const std::optional<Hand> hand = parse_hand_record(records[seat_index(seat)]);
                if (!hand.has_value()) {
                    throw std::invalid_argument(
                        to_string(seat) + " hand must contain four SHDC holdings");
                }
                hand_of(deal, seat) = *hand;
            }
            session_ = std::make_unique<AnalysisSession>(
                deal, parse_seat_name(leader), parse_trump_name(trump));
            return "{\"ok\":true,\"possibleDeals\":" +
                std::to_string(session_->possible_deals()) +
                ",\"state\":" + state_json(*session_) + '}';
        } catch (const std::exception& error) {
            session_.reset();
            return error_json(error);
        }
    }

    std::string set_restrictions(
        const emscripten::val& east,
        const emscripten::val& west) {
        try {
            require_session();
            DefenderRestrictions restrictions {
                .east = parse_seat_restrictions(east, "East"),
                .west = parse_seat_restrictions(west, "West"),
            };
            session_->set_defender_restrictions(std::move(restrictions));
            return "{\"ok\":true,\"possibleDeals\":" +
                std::to_string(session_->possible_deals()) +
                ",\"state\":" + state_json(*session_) + '}';
        } catch (const std::exception& error) {
            return error_json(error);
        }
    }

    std::string state() const {
        try {
            require_session();
            return "{\"ok\":true,\"state\":" + state_json(*session_) + '}';
        } catch (const std::exception& error) {
            return error_json(error);
        }
    }

    std::string analyze(
        std::size_t worlds,
        std::uint8_t depth,
        std::uint8_t target,
        const std::string& seed,
        double max_seconds) {
        try {
            require_session();
            BotSettings settings = session_->settings();
            settings.world_count = worlds;
            settings.max_declarer_plies = depth;
            settings.target_tricks = target;
            settings.random_seed = std::stoull(seed);
            settings.max_search_seconds = max_seconds;
            session_->set_settings(settings);
            const SessionAnalysis result = session_->analyze();
            return "{\"ok\":true,\"analysis\":" + analysis_json(result) +
                ",\"state\":" + state_json(*session_) + '}';
        } catch (const std::exception& error) {
            return error_json(error);
        }
    }

    std::string play(const std::string& card_text) {
        try {
            require_session();
            const std::optional<Card> card = parse_card(card_text);
            if (!card.has_value()) throw std::invalid_argument("invalid card name");
            session_->play(*card);
            return "{\"ok\":true,\"state\":" + state_json(*session_) + '}';
        } catch (const std::exception& error) {
            return error_json(error);
        }
    }

    std::string undo() {
        try {
            require_session();
            const bool changed = session_->undo();
            return "{\"ok\":true,\"changed\":" +
                std::string(changed ? "true" : "false") +
                ",\"state\":" + state_json(*session_) + '}';
        } catch (const std::exception& error) {
            return error_json(error);
        }
    }

    std::string replay() {
        try {
            require_session();
            session_->replay();
            return "{\"ok\":true,\"state\":" + state_json(*session_) + '}';
        } catch (const std::exception& error) {
            return error_json(error);
        }
    }

    std::string policy_move() const {
        try {
            require_session();
            const std::optional<Card> move = session_->policy_move();
            return "{\"ok\":true,\"card\":" +
                (move.has_value() ? json_quote(to_string(*move)) : "null") + '}';
        } catch (const std::exception& error) {
            return error_json(error);
        }
    }

    std::string dds_move() const {
        try {
            require_session();
            const Position& position = session_->position();
            if (is_deal_finished(position)) throw std::logic_error("the deal is finished");
            if (same_side(next_to_play(position.current_trick), Seat::South)) {
                throw std::logic_error("DDS defender move requested on declarer's turn");
            }
            return "{\"ok\":true,\"card\":" +
                json_quote(to_string(choose_dds_defender_card(position))) + '}';
        } catch (const std::exception& error) {
            return error_json(error);
        }
    }

private:
    void require_session() const {
        if (session_ == nullptr) throw std::logic_error("no deal is loaded");
    }

    std::unique_ptr<AnalysisSession> session_;
};

}  // namespace bridge

EMSCRIPTEN_BINDINGS(bridge_solver_browser) {
    emscripten::class_<bridge::BrowserBridgeEngine>("BridgeEngine")
        .constructor<>()
        .function("createSession", &bridge::BrowserBridgeEngine::create_session)
        .function("setRestrictions", &bridge::BrowserBridgeEngine::set_restrictions)
        .function("state", &bridge::BrowserBridgeEngine::state)
        .function("analyze", &bridge::BrowserBridgeEngine::analyze)
        .function("play", &bridge::BrowserBridgeEngine::play)
        .function("undo", &bridge::BrowserBridgeEngine::undo)
        .function("replay", &bridge::BrowserBridgeEngine::replay)
        .function("policyMove", &bridge::BrowserBridgeEngine::policy_move)
        .function("ddsMove", &bridge::BrowserBridgeEngine::dds_move);
}
