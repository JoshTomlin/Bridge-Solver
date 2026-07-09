#include "bridge/analysis_session.h"

#include <emscripten/bind.h>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <iomanip>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

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

std::string card_vector_json(const std::vector<Card>& cards) {
    std::ostringstream output;
    output << '[';
    for (std::size_t index = 0; index < cards.size(); ++index) {
        if (index != 0) output << ',';
        output << json_quote(to_string(cards[index]));
    }
    output << ']';
    return output.str();
}
std::string world_indices_json(WorldMask worlds, std::size_t world_count) {
    std::ostringstream output;
    output << '[';
    bool first = true;
    for (std::size_t world = 0; world < world_count; ++world) {
        if ((worlds & (WorldMask {1} << world)) == 0) continue;
        if (!first) output << ',';
        output << world;
        first = false;
    }
    output << ']';
    return output.str();
}

std::string mapped_world_indices_json(
    WorldMask worlds,
    const std::vector<std::size_t>& reservoir_indices) {
    std::ostringstream output;
    output << '[';
    bool first = true;
    for (std::size_t world = 0; world < reservoir_indices.size(); ++world) {
        if ((worlds & (WorldMask {1} << world)) == 0) continue;
        if (!first) output << ',';
        output << reservoir_indices[world];
        first = false;
    }
    output << ']';
    return output.str();
}
std::string policy_json(
    const std::shared_ptr<const AlphaMuPolicyNode>& node,
    std::size_t world_count) {
    if (node == nullptr) return "null";

    std::ostringstream output;
    output << "{\"player\":" << json_quote(to_string(node->player))
           << ",\"possibleWorlds\":"
           << world_indices_json(node->possible_worlds, world_count)
           << ",\"wins\":"
           << world_indices_json(node->outcome.wins, world_count)
           << ",\"move\":"
           << (node->declarer_move == kNoCard
                   ? "null"
                   : json_quote(to_string(node->declarer_move)))
           << ",\"continuation\":"
           << policy_json(node->continuation, world_count)
           << ",\"defenderBranches\":[";
    for (std::size_t index = 0;
         index < node->defender_branches.size();
         ++index) {
        if (index != 0) output << ',';
        const AlphaMuPolicyBranch& branch = node->defender_branches[index];
        output << "{\"card\":" << json_quote(to_string(branch.card))
               << ",\"possibleWorlds\":"
               << world_indices_json(branch.possible_worlds, world_count)
               << ",\"continuation\":"
               << policy_json(branch.continuation, world_count) << '}';
    }
    output << "]}";
    return output.str();
}

std::string root_moves_json(
    const std::vector<AlphaMuRootMove>& root_moves,
    std::size_t world_count) {
    std::ostringstream output;
    output << '[';
    for (std::size_t index = 0; index < root_moves.size(); ++index) {
        if (index != 0) output << ',';
        const AlphaMuRootMove& move = root_moves[index];
        output << "{\"card\":" << json_quote(to_string(move.move))
               << ",\"winningWorlds\":" << move.winning_worlds
               << ",\"paretoVectors\":" << move.pareto_vectors
               << ",\"outcomes\":[";
        for (std::size_t vector = 0; vector < move.front.vectors.size(); ++vector) {
            if (vector != 0) output << ',';
            output << world_indices_json(
                move.front.vectors[vector].wins, world_count);
        }
        output << "]}";
    }
    output << ']';
    return output.str();
}

std::string root_moves_json(
    const std::vector<AlphaMuRootMove>& root_moves,
    const std::vector<std::size_t>& reservoir_indices) {
    std::ostringstream output;
    output << '[';
    for (std::size_t index = 0; index < root_moves.size(); ++index) {
        if (index != 0) output << ',';
        const AlphaMuRootMove& move = root_moves[index];
        output << "{\"card\":" << json_quote(to_string(move.move))
               << ",\"winningWorlds\":" << move.winning_worlds
               << ",\"paretoVectors\":" << move.pareto_vectors
               << ",\"outcomes\":[";
        for (std::size_t vector = 0; vector < move.front.vectors.size(); ++vector) {
            if (vector != 0) output << ',';
            output << world_indices_json(
                move.front.vectors[vector].wins, reservoir_indices.size());
        }
        output << "],\"reservoirOutcomes\":[";
        for (std::size_t vector = 0; vector < move.front.vectors.size(); ++vector) {
            if (vector != 0) output << ',';
            output << mapped_world_indices_json(
                move.front.vectors[vector].wins, reservoir_indices);
        }
        output << "]}";
    }
    output << ']';
    return output.str();
}

std::string sampled_worlds_json(
    const std::vector<AlphaMuWorld>& worlds,
    const std::vector<std::size_t>* reservoir_indices = nullptr) {
    std::ostringstream output;
    output << '[';
    for (std::size_t index = 0; index < worlds.size(); ++index) {
        if (index != 0) output << ',';
        const Deal& deal = worlds[index].position.deal;
        output << "{\"index\":" << index;
        if (reservoir_indices != nullptr) {
            output << ",\"reservoirIndex\":" << (*reservoir_indices)[index];
        }
        output << ",\"east\":" << hand_json(hand_of(deal, Seat::East))
               << ",\"west\":" << hand_json(hand_of(deal, Seat::West))
               << '}';
    }
    output << ']';
    return output.str();
}

std::string dd_scores_json(const AnalysisSession& session) {
    const Position& position = session.position();
    if (is_deal_finished(position) ||
        !same_side(next_to_play(position.current_trick), Seat::South)) {
        return "\"scores\":{},\"best\":0";
    }

    const std::vector<DoubleDummyMoveScore> scores =
        double_dummy_move_scores(position, Seat::South);
    int best = -1;
    std::ostringstream score_json;
    score_json << "\"scores\":{";
    for (std::size_t index = 0; index < scores.size(); ++index) {
        const int total = static_cast<int>(position.score.north_south) +
            static_cast<int>(scores[index].future_tricks);
        best = std::max(best, total);
        if (index != 0) score_json << ',';
        score_json << json_quote(to_string(scores[index].card))
                   << ":{\"future\":"
                   << static_cast<int>(scores[index].future_tricks)
                   << ",\"total\":" << total << '}';
    }
    score_json << "},\"best\":" << std::max(best, 0);
    return score_json.str();
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
           << ",\"targetReachedCuts\":" << stats.target_reached_cuts
           << ",\"targetImpossibleCuts\":" << stats.target_impossible_cuts
           << ",\"quickTrickProbes\":" << stats.quick_trick_probes
           << ",\"quickTrickStates\":" << stats.quick_trick_states
           << ",\"quickTrickCuts\":" << stats.quick_trick_cuts
           << ",\"quickTrickRootCuts\":" << stats.quick_trick_root_cuts
           << ",\"quickTrickBudgetAborts\":" << stats.quick_trick_budget_aborts
           << ",\"equivalentMoves\":" << stats.equivalent_moves_skipped
           << ",\"maxEquivalentMoves\":" << stats.max_equivalent_moves_skipped
           << ",\"minEquivalentMoves\":" << stats.min_equivalent_moves_skipped
           << ",\"forcedMoveNodes\":" << stats.forced_move_nodes
           << ",\"forcedMaxNodes\":" << stats.forced_max_nodes
           << ",\"forcedMinNodes\":" << stats.forced_min_nodes
           << ",\"forcedRootMoves\":" << stats.forced_root_recommendations
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
           << ",\"engine\":\"alpha-mu\""
           << ",\"winningWorlds\":"
           << best_winning_world_count(analysis.search.front)
           << ",\"possibleDeals\":" << analysis.possible_deals
           << ",\"uniqueWorlds\":" << analysis.unique_worlds
           << ",\"samplingMs\":" << analysis.sampling_ms
           << ",\"searchMs\":" << analysis.search_ms
           << ",\"rootMoves\":"
           << root_moves_json(analysis.search.root_moves, analysis.worlds.size())
           << ",\"sampledWorlds\":"
           << sampled_worlds_json(analysis.worlds)
           << ",\"policy\":"
           << policy_json(analysis.search.trick_policy, analysis.worlds.size())
           << ",\"stats\":" << stats_json(analysis.search.stats) << '}';
    return output.str();
}

std::string alpha_mu2_stats_json(const AlphaMu2Stats& stats) {
    std::ostringstream output;
    output << "{\"reservoirWorlds\":" << stats.reservoir_worlds
           << ",\"distinctScreeningVectors\":" << stats.distinct_screening_vectors
           << ",\"equivalentScreeningMovesSkipped\":"
           << stats.equivalent_screening_moves_skipped
           << ",\"initialWorlds\":" << stats.initial_worlds
           << ",\"finalWorlds\":" << stats.final_worlds
           << ",\"searchRuns\":" << stats.search_runs
           << ",\"refinementRounds\":" << stats.refinement_rounds
           << ",\"reserveWorldsChecked\":" << stats.reserve_worlds_checked
           << ",\"counterexamplesFound\":" << stats.counterexamples_found
           << ",\"counterexamplesAdded\":" << stats.counterexamples_added
           << ",\"policyDdsLeaves\":" << stats.policy_dds_leaves
           << ",\"stoppedByTime\":"
           << (stats.stopped_by_time_limit ? "true" : "false")
           << ",\"screeningMs\":" << stats.screening_ms
           << ",\"selectionMs\":" << stats.selection_ms
           << ",\"searchMs\":" << stats.search_ms
           << ",\"validationMs\":" << stats.validation_ms
           << ",\"totalMs\":" << stats.total_ms << '}';
    return output.str();
}

std::string size_vector_json(const std::vector<std::size_t>& values) {
    std::ostringstream output;
    output << '[';
    for (std::size_t index = 0; index < values.size(); ++index) {
        if (index != 0) output << ',';
        output << values[index];
    }
    output << ']';
    return output.str();
}

std::string alpha_mu2_screening_json(const AlphaMu2Result& result) {
    std::ostringstream output;
    output << '[';
    for (std::size_t index = 0; index < result.screening.size(); ++index) {
        if (index != 0) output << ',';
        const AlphaMu2ScreeningVector& screening = result.screening[index];
        output << "{\"reservoirIndex\":" << index
               << ",\"futureTricks\":[";
        for (std::size_t score = 0; score < screening.future_tricks.size(); ++score) {
            if (score != 0) output << ',';
            output << static_cast<int>(screening.future_tricks[score]);
        }
        output << "],\"makingMoves\":" << cards_json(screening.making_moves)
               << ",\"equivalentWorlds\":" << screening.equivalent_worlds
               << '}';
    }
    output << ']';
    return output.str();
}

std::string alpha_mu2_candidates_json(
    const std::vector<AlphaMu2CounterexampleTrace>& candidates) {
    std::ostringstream output;
    output << '[';
    for (std::size_t index = 0; index < candidates.size(); ++index) {
        if (index != 0) output << ',';
        const AlphaMu2CounterexampleTrace& candidate = candidates[index];
        output << "{\"reservoirIndex\":" << candidate.reservoir_index
               << ",\"unsupportedObservation\":"
               << (candidate.unsupported_observation ? "true" : "false")
               << ",\"rootRegret\":" << static_cast<int>(candidate.root_regret)
               << ",\"distanceFromActive\":" << candidate.distance_from_active
               << ",\"selected\":"
               << (candidate.selected ? "true" : "false")
               << ",\"replacedReservoirIndex\":";
        if (candidate.replaced_reservoir_index.has_value()) {
            output << *candidate.replaced_reservoir_index;
        } else {
            output << "null";
        }
        output << '}';
    }
    output << ']';
    return output.str();
}

std::string alpha_mu2_rounds_json(const AlphaMu2Result& result) {
    std::ostringstream output;
    output << '[';
    for (std::size_t index = 0; index < result.rounds.size(); ++index) {
        if (index != 0) output << ',';
        const AlphaMu2RoundTrace& round = result.rounds[index];
        output << "{\"round\":" << round.round
               << ",\"activeReservoirIndices\":"
               << size_vector_json(round.active_reservoir_indices)
               << ",\"searchMs\":" << round.search_ms
               << ",\"bestMove\":" << json_quote(to_string(round.search.best_move))
               << ",\"winningWorlds\":"
               << best_winning_world_count(round.search.front)
               << ",\"completedDepth\":"
               << static_cast<int>(round.search.stats.completed_depth)
               << ",\"rootMoves\":"
               << root_moves_json(
                   round.search.root_moves,
                   round.active_reservoir_indices)
               << ",\"candidates\":"
               << alpha_mu2_candidates_json(round.candidates)
               << '}';
    }
    output << ']';
    return output.str();
}

std::string analysis2_json(const AlphaMu2SessionAnalysis& analysis) {
    const AlphaMu2Result& result = analysis.search;
    const AlphaMuResult& search = result.search;
    std::ostringstream output;
    output << "{\"bestMove\":" << json_quote(to_string(search.best_move))
           << ",\"engine\":\"alpha-mu2\""
           << ",\"winningWorlds\":" << best_winning_world_count(search.front)
           << ",\"possibleDeals\":" << analysis.possible_deals
           << ",\"uniqueWorlds\":" << analysis.unique_reservoir_worlds
           << ",\"uniqueReservoirWorlds\":"
           << analysis.unique_reservoir_worlds
           << ",\"samplingMs\":" << analysis.sampling_ms
           << ",\"searchMs\":" << result.stats.total_ms
           << ",\"rootMoves\":"
           << root_moves_json(search.root_moves, result.worlds.size())
           << ",\"sampledWorlds\":"
           << sampled_worlds_json(
               result.worlds,
               &result.active_reservoir_indices)
           << ",\"policy\":"
           << policy_json(search.trick_policy, result.worlds.size())
           << ",\"stats\":" << stats_json(search.stats)
           << ",\"alphaMu2\":{\"stats\":"
           << alpha_mu2_stats_json(result.stats)
           << ",\"screeningMoves\":"
           << card_vector_json(result.screening_moves)
           << ",\"screening\":"
           << alpha_mu2_screening_json(result)
           << ",\"activeReservoirIndices\":"
           << size_vector_json(result.active_reservoir_indices)
           << ",\"counterexampleIndices\":"
           << size_vector_json(result.counterexample_indices)
           << ",\"reservoirWorlds\":"
           << sampled_worlds_json(result.reservoir)
           << ",\"rounds\":"
           << alpha_mu2_rounds_json(result)
           << "}}";
    return output.str();
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
            settings.compare_all_root_moves = true;
            session_->set_settings(settings);
            const SessionAnalysis result = session_->analyze();
            return "{\"ok\":true,\"analysis\":" + analysis_json(result) +
                ",\"state\":" + state_json(*session_) + '}';
        } catch (const std::exception& error) {
            return error_json(error);
        }
    }

    std::string analyze2(
        std::size_t reservoir_worlds,
        std::size_t initial_worlds,
        std::size_t max_worlds,
        std::size_t refinement_rounds,
        std::size_t counterexamples_per_round,
        std::uint8_t depth,
        std::uint8_t target,
        const std::string& seed,
        double max_seconds) {
        try {
            require_session();
            BotSettings settings = session_->settings();
            settings.world_count = max_worlds;
            settings.max_declarer_plies = depth;
            settings.target_tricks = target;
            settings.random_seed = std::stoull(seed);
            settings.max_search_seconds = max_seconds;
            settings.compare_all_root_moves = true;
            session_->set_settings(settings);
            const AlphaMu2SessionAnalysis result = session_->analyze2(
                AlphaMu2SessionSettings {
                    .reservoir_world_count = reservoir_worlds,
                    .initial_active_worlds = initial_worlds,
                    .max_active_worlds = max_worlds,
                    .max_refinement_rounds = refinement_rounds,
                    .counterexamples_per_round = counterexamples_per_round,
                });
            return "{\"ok\":true,\"analysis\":" + analysis2_json(result) +
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

    std::string dds_move(const std::string& hold_order) const {
        try {
            require_session();
            const Position& position = session_->position();
            if (is_deal_finished(position)) throw std::logic_error("the deal is finished");
            if (same_side(next_to_play(position.current_trick), Seat::South)) {
                throw std::logic_error("DDS defender move requested on declarer's turn");
            }
            return "{\"ok\":true,\"card\":" +
                json_quote(to_string(choose_double_dummy_defender_card(
                    position, Seat::South, hold_order))) + '}';
        } catch (const std::exception& error) {
            return error_json(error);
        }
    }

    std::string dd_scores() const {
        try {
            require_session();
            return "{\"ok\":true," + dd_scores_json(*session_) + '}';
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
        .function("analyze2", &bridge::BrowserBridgeEngine::analyze2)
        .function("play", &bridge::BrowserBridgeEngine::play)
        .function("undo", &bridge::BrowserBridgeEngine::undo)
        .function("replay", &bridge::BrowserBridgeEngine::replay)
        .function("policyMove", &bridge::BrowserBridgeEngine::policy_move)
        .function("ddsMove", &bridge::BrowserBridgeEngine::dds_move)
        .function("ddScores", &bridge::BrowserBridgeEngine::dd_scores);
}
