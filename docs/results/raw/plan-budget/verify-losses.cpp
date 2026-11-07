// Standalone audit of exported loss paths, independent of the plan evaluator.
// Link against the native bridge_engine and DDS libraries. Input TSV columns:
// label, East's remaining-hand mask, and the recorded public card path.
#include "bridge/analysis_session.h"
#include "bridge/dds_solver.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>

using namespace bridge;
Position root(Hand east) {
    Position position;
    const char* records[] = {"K87.AQ54.7654.32", "65432.JT98763.A.-",
        "AQJT9.K2.K.AKQ65", "-.-.QJT9832.JT9874"};
    for (unsigned i = 0; i < 4; ++i) position.deal.hands[i] = parse_hand_record(records[i]).value();
    position.current_trick.leader = Seat::West;
    position.current_trick.trump_suit = Suit::Spades;
    for (const char* card : {"D2", "D4", "DA", "DK", "S2"}) play_card(position, parse_card(card).value());
    const auto unknown = hand_of(position.deal, Seat::East) | hand_of(position.deal, Seat::West);
    if ((east & ~unknown) || cards_in_suit(east, Suit::Diamonds) || card_count(east) != 11)
        throw std::runtime_error("layout violates the constrained oracle");
    hand_of(position.deal, Seat::East) = east;
    hand_of(position.deal, Seat::West) = unknown & ~east;
    return position;
}
int main(int argc, char** argv) {
    try {
        if (argc != 2) throw std::runtime_error("expected loss-path TSV");
        std::ifstream input(argv[1]);
        if (!input) throw std::runtime_error("could not read loss paths");
        std::cout << "label,root_dd_total,endpoint_dd_total,first_bad_player,first_bad_card,making_alternatives\n";
        std::string line;
        unsigned checked = 0;
        while (std::getline(input, line)) {
            std::istringstream record(line);
            std::string label, mask, path;
            std::getline(record, label, '\t'); std::getline(record, mask, '\t'); std::getline(record, path);
            auto position = root(std::stoull(mask, nullptr, 0));
            const int initial = position.score.north_south + double_dummy_future_tricks(position, Seat::South);
            if (initial < 12) throw std::runtime_error("reported challenger is not makeable at root");
            std::string first_player, first_card, alternatives;
            std::istringstream plays(path);
            std::string step;
            while (plays >> step) {
                const auto separator = step.find(':');
                const auto player = next_to_play(position.current_trick);
                if (separator == std::string::npos || step.substr(0, separator) != to_string(player))
                    throw std::runtime_error("wrong player in exported path");
                const auto card = parse_card(step.substr(separator + 1)).value();
                if (!is_legal_play(position.current_trick, hand_of(position.deal, player), card))
                    throw std::runtime_error("illegal exported play");
                if (first_card.empty() && same_side(player, Seat::South)) {
                    Hand making = 0;
                    bool selected_makes = false;
                    for (const auto& score : double_dummy_move_scores(position, Seat::South)) {
                        const bool makes = position.score.north_south + score.future_tricks >= 12;
                        if (makes) making |= score.card;
                        if (score.card == card) selected_makes = makes;
                    }
                    if (making && !selected_makes) {
                        first_player = to_string(player); first_card = to_string(card);
                        for (unsigned bit = 0; bit < kDeckSize; ++bit) if (contains(making, Card{1} << bit)) {
                            if (!alternatives.empty()) alternatives += ' ';
                            alternatives += to_string(Card{1} << bit);
                        }
                    }
                }
                play_card(position, card);
            }
            const int final = position.score.north_south + double_dummy_future_tricks(position, Seat::South);
            if (final >= 12 || first_card.empty()) throw std::runtime_error("exported path does not expose a losing choice");
            std::cout << label << ',' << initial << ',' << final << ',' << first_player << ','
                << first_card << ',' << alternatives << '\n';
            ++checked;
        }
        if (!checked) throw std::runtime_error("no witnesses checked");
        std::cerr << "Independently verified " << checked << " legal root-makeable loss paths\n";
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n'; return 1;
    }
}
