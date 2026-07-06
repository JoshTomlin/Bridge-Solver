#include "bridge/analysis_session.h"
#include "bridge/dds_solver.h"

#include <algorithm>
#include <bit>
#include <cctype>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <iterator>
#include <map>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace {

using namespace bridge;

constexpr std::uint64_t kReportSeed = 11565831ULL;

struct PlayedCard {
    Seat seat {};
    Card card {kNoCard};
    std::string source;
};

struct PolicyMove {
    Seat player {};
    Card card {kNoCard};
};

struct ResponseGroup {
    std::optional<PolicyMove> response;
    std::vector<const AlphaMuPolicyBranch*> branches;
};

std::optional<Seat> parse_seat(std::string text) {
    if (text.empty()) return std::nullopt;
    switch (static_cast<char>(std::toupper(text.front()))) {
        case 'N': return Seat::North;
        case 'E': return Seat::East;
        case 'S': return Seat::South;
        case 'W': return Seat::West;
        default: return std::nullopt;
    }
}

std::optional<std::optional<Suit>> parse_strain(std::string text) {
    std::transform(text.begin(), text.end(), text.begin(), [](unsigned char ch) {
        return static_cast<char>(std::toupper(ch));
    });
    if (text == "NT" || text == "N") return std::optional<Suit> {};
    const std::optional<Suit> suit =
        text.empty() ? std::nullopt : parse_suit(text.front());
    if (!suit.has_value()) return std::nullopt;
    return std::optional<std::optional<Suit>> {*suit};
}

std::optional<PolicyMove> first_policy_move(
    const std::shared_ptr<const AlphaMuPolicyNode>& node) {
    if (!node) return std::nullopt;
    if (node->declarer_move != kNoCard) {
        return PolicyMove {
            .player = node->player,
            .card = node->declarer_move,
        };
    }
    return first_policy_move(node->continuation);
}

std::vector<ResponseGroup> response_groups(
    const std::vector<AlphaMuPolicyBranch>& branches) {
    std::vector<ResponseGroup> groups;
    for (const AlphaMuPolicyBranch& branch : branches) {
        const std::optional<PolicyMove> response =
            first_policy_move(branch.continuation);
        auto group = std::find_if(
            groups.begin(),
            groups.end(),
            [&](const ResponseGroup& candidate) {
                if (candidate.response.has_value() != response.has_value()) {
                    return false;
                }
                return !response.has_value() ||
                    (candidate.response->player == response->player &&
                     candidate.response->card == response->card);
            });
        if (group == groups.end()) {
            groups.push_back(ResponseGroup {.response = response});
            group = std::prev(groups.end());
        }
        group->branches.push_back(&branch);
    }
    std::stable_sort(
        groups.begin(),
        groups.end(),
        [](const ResponseGroup& left, const ResponseGroup& right) {
            return left.branches.size() < right.branches.size();
        });
    return groups;
}

std::string card_list(const std::vector<const AlphaMuPolicyBranch*>& branches) {
    std::ostringstream output;
    for (std::size_t index = 0; index < branches.size(); ++index) {
        if (index != 0) output << ", ";
        output << to_string(branches[index]->card);
    }
    return output.str();
}

std::string policy_condition(
    const ResponseGroup& group,
    const std::vector<AlphaMuPolicyBranch>& all,
    Seat defender,
    Suit lead_suit,
    bool catch_all) {
    if (group.branches.size() == all.size()) {
        return "Whatever " + to_string(defender) + " plays";
    }

    std::vector<const AlphaMuPolicyBranch*> all_discards;
    std::vector<const AlphaMuPolicyBranch*> group_discards;
    std::vector<const AlphaMuPolicyBranch*> group_follows;
    for (const AlphaMuPolicyBranch& branch : all) {
        if (suit_of(branch.card) != lead_suit) all_discards.push_back(&branch);
    }
    for (const AlphaMuPolicyBranch* branch : group.branches) {
        (suit_of(branch->card) == lead_suit ? group_follows : group_discards)
            .push_back(branch);
    }
    if (!all_discards.empty() &&
        group_discards.size() == all_discards.size()) {
        std::string condition = "If " + to_string(defender) + " discards";
        if (!group_follows.empty()) {
            condition += " or plays " + card_list(group_follows);
        }
        return condition;
    }
    if (catch_all) {
        return "If " + to_string(defender) + " plays anything else";
    }
    return "If " + to_string(defender) + " plays " +
        card_list(group.branches);
}

void write_policy(
    std::ostream& output,
    const std::shared_ptr<const AlphaMuPolicyNode>& policy,
    const Position& root) {
    if (!policy || policy->declarer_move == kNoCard) {
        output << "- No retained trick policy.\n";
        return;
    }
    output << "- Play `" << to_string(policy->declarer_move) << "` from "
           << to_string(policy->player) << ".\n";

    const std::shared_ptr<const AlphaMuPolicyNode> defender =
        policy->continuation;
    if (!defender || defender->defender_branches.empty()) {
        output << "- No further declarer choice is required in this trick.\n";
        return;
    }
    const Suit lead_suit = root.current_trick.card_count > 0
        ? suit_of(root.current_trick.cards[0])
        : suit_of(policy->declarer_move);
    const std::vector<ResponseGroup> groups =
        response_groups(defender->defender_branches);
    for (std::size_t index = 0; index < groups.size(); ++index) {
        const ResponseGroup& group = groups[index];
        output << "- " << policy_condition(
            group,
            defender->defender_branches,
            defender->player,
            lead_suit,
            groups.size() > 1 && index + 1 == groups.size()) << ": ";
        if (group.response) {
            output << "play `" << to_string(group.response->card) << "` from "
                   << to_string(group.response->player) << ".";
        } else {
            output << "no further declarer choice.";
        }
        output << '\n';
    }
}

std::string fingerprint_text(
    const AlphaMu2Result& result,
    const AlphaMu2ScreeningVector& screening) {
    std::ostringstream output;
    for (std::size_t index = 0;
         index < result.screening_moves.size();
         ++index) {
        if (index != 0) output << ' ';
        output << to_string(result.screening_moves[index]) << '='
               << static_cast<int>(screening.future_tricks[index]);
        if (contains(screening.making_moves, result.screening_moves[index])) {
            output << '*';
        }
    }
    return output.str();
}

void write_fingerprints(
    std::ostream& output,
    const AlphaMu2Result& result) {
    std::map<std::vector<std::uint8_t>, std::vector<std::size_t>> groups;
    for (std::size_t index = 0; index < result.screening.size(); ++index) {
        groups[result.screening[index].future_tricks].push_back(index);
    }
    std::map<std::vector<std::uint8_t>, std::size_t> group_id;
    std::size_t id = 1;
    for (const auto& [fingerprint, indices] : groups) {
        group_id[fingerprint] = id++;
    }

    output << "| ID | DDS future tricks by root card | Reservoir weight";
    for (const AlphaMu2RoundTrace& round : result.rounds) {
        output << " | Active R" << round.round;
    }
    output << " | Representative East / West |\n";
    output << "|---:|---|---:";
    for (std::size_t round = 0; round < result.rounds.size(); ++round) {
        output << "|---:";
    }
    output << "|---|\n";

    for (const auto& [fingerprint, indices] : groups) {
        const AlphaMu2ScreeningVector& screening =
            result.screening[indices.front()];
        output << "| F" << group_id[fingerprint] << " | `"
               << fingerprint_text(result, screening) << "` | "
               << indices.size() << '/' << result.screening.size()
               << " (" << std::fixed << std::setprecision(1)
               << 100.0 * static_cast<double>(indices.size()) /
                    static_cast<double>(result.screening.size())
               << "%)";
        for (const AlphaMu2RoundTrace& round : result.rounds) {
            const std::size_t active = static_cast<std::size_t>(std::count_if(
                round.active_reservoir_indices.begin(),
                round.active_reservoir_indices.end(),
                [&](std::size_t index) {
                    return result.screening[index].future_tricks == fingerprint;
                }));
            output << " | " << active << '/'
                   << round.active_reservoir_indices.size()
                   << " (" << std::fixed << std::setprecision(1)
                   << 100.0 * static_cast<double>(active) /
                        static_cast<double>(
                            round.active_reservoir_indices.size())
                   << "%)";
        }
        const Position& representative =
            result.reservoir[indices.front()].position;
        output << " | E `" << format_hand(
            hand_of(representative.deal, Seat::East))
               << "` / W `" << format_hand(
            hand_of(representative.deal, Seat::West))
               << "` |\n";
    }
    output << "\n`*` means that root card reaches the contract target under DDS.\n";
}

void write_rounds(
    std::ostream& output,
    const AlphaMu2Result& result,
    const Position& root) {
    std::map<std::vector<std::uint8_t>, std::size_t> group_id;
    for (const AlphaMu2ScreeningVector& screening : result.screening) {
        group_id.try_emplace(screening.future_tricks, 0);
    }
    std::size_t next_group = 1;
    for (auto& [fingerprint, id] : group_id) {
        id = next_group++;
    }

    for (const AlphaMu2RoundTrace& round : result.rounds) {
        output << "\n#### Search R" << round.round << "\n\n";
        output << "Active worlds: " << round.active_reservoir_indices.size()
               << ". Best move: `" << to_string(round.search.best_move)
               << "`. Search: " << std::fixed << std::setprecision(1)
               << round.search_ms << " ms. Completed M="
               << static_cast<int>(round.search.stats.completed_depth)
               << ". Nodes=" << round.search.stats.nodes << ".\n\n";
        output << "**Proposed trick policy**\n\n";
        write_policy(output, round.search.trick_policy, root);

        output << "\n**Root alpha-mu results**\n\n";
        for (const AlphaMuRootMove& move : round.search.root_moves) {
            output << "- `" << to_string(move.move) << "`: "
                   << move.winning_worlds << '/'
                   << round.active_reservoir_indices.size()
                   << " active worlds, " << move.pareto_vectors
                   << " Pareto vector(s).\n";
        }

        output << "\n**Counterexample candidates**\n\n";
        if (round.candidates.empty()) {
            output << "None.\n";
            continue;
        }
        output << "| World | Fingerprint | Why it failed | Root regret | Distance | Decision | East / West |\n";
        output << "|---:|---:|---|---:|---:|---|---|\n";
        for (const AlphaMu2CounterexampleTrace& candidate : round.candidates) {
            const Position& world =
                result.reservoir[candidate.reservoir_index].position;
            output << "| " << candidate.reservoir_index + 1
                   << " | F" << group_id[
                       result.screening[candidate.reservoir_index].future_tricks]
                   << " | "
                   << (candidate.unsupported_observation
                           ? "unseen defender observation"
                           : "fixed policy missed target")
                   << " | " << static_cast<int>(candidate.root_regret)
                   << " | " << candidate.distance_from_active << " | ";
            if (candidate.selected) {
                output << "**selected**";
                if (candidate.replaced_reservoir_index) {
                    output << "; replaced world "
                           << *candidate.replaced_reservoir_index + 1;
                }
            } else {
                output << "not selected";
            }
            output << " | E `" << format_hand(
                hand_of(world.deal, Seat::East))
                   << "` / W `" << format_hand(
                hand_of(world.deal, Seat::West))
                   << "` |\n";
        }
    }
}

void write_analysis(
    std::ostream& output,
    const AlphaMu2SessionAnalysis& analysis,
    const Position& root,
    std::size_t decision) {
    const AlphaMu2Result& result = analysis.search;
    output << "\n### AlphaMu2 decision " << decision << "\n\n";
    output << "Turn: " << to_string(next_to_play(root.current_trick))
           << ". Possible constrained deals: " << analysis.possible_deals
           << ". Reservoir: " << result.stats.reservoir_worlds
           << " (" << analysis.unique_reservoir_worlds << " unique). "
           << "Distinct DDS fingerprints: "
           << result.stats.distinct_screening_vectors << ".\n\n";
    output << "Timing: sample " << std::fixed << std::setprecision(1)
           << analysis.sampling_ms << " ms; screen "
           << result.stats.screening_ms << " ms; selection "
           << result.stats.selection_ms << " ms; alpha-mu "
           << result.stats.search_ms << " ms; policy validation "
           << result.stats.validation_ms << " ms; total "
           << result.stats.total_ms << " ms.\n\n";
    write_fingerprints(output, result);
    write_rounds(output, result, root);
}

Card first_legal_card(const Position& position) {
    const Seat player = next_to_play(position.current_trick);
    const Hand legal = legal_plays(
        position.current_trick,
        hand_of(position.deal, player));
    for (const Suit suit : {
             Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        for (int rank = static_cast<int>(Rank::Ace);
             rank >= static_cast<int>(Rank::Two);
             --rank) {
            const Card card = make_card(suit, static_cast<Rank>(rank));
            if (contains(legal, card)) return card;
        }
    }
    return kNoCard;
}

void write_played_trick(
    std::ostream& output,
    const std::vector<PlayedCard>& plays,
    Seat winner,
    const Score& score) {
    output << "\n**Actual play:** ";
    for (std::size_t index = 0; index < plays.size(); ++index) {
        if (index != 0) output << ", ";
        output << to_string(plays[index].seat) << " `"
               << to_string(plays[index].card) << "` ("
               << plays[index].source << ')';
    }
    output << ". Winner: " << to_string(winner)
           << ". Score: NS " << static_cast<int>(score.north_south)
           << ", EW " << static_cast<int>(score.east_west) << ".\n\n";
}

void run_report(
    std::ostream& output,
    Deal deal,
    Seat leader,
    std::optional<Suit> trump,
    std::uint8_t target,
    double time_limit,
    std::uint8_t max_depth) {
    AnalysisSession session(deal, leader, trump);
    BotSettings bot = session.settings();
    bot.max_declarer_plies = max_depth;
    bot.target_tricks = target;
    bot.random_seed = kReportSeed;
    bot.max_search_seconds = time_limit;
    session.set_settings(bot);

    output << "# AlphaMu2 playthrough\n\n";
    output << "Target: " << static_cast<int>(target) << " tricks in "
           << (trump ? to_string(*trump) : "NT")
           << ". Opening leader: " << to_string(leader)
           << ". Reservoir seed: " << kReportSeed
           << ". Maximum M: " << static_cast<int>(max_depth)
           << ". Total AlphaMu2 budget per decision: " << time_limit
           << " seconds.\n\n";
    output << "```text\n" << format_deal(deal) << "```\n";

    std::size_t trick_number = 1;
    while (!is_deal_finished(session.position())) {
        output << "\n## Trick " << trick_number << "\n";
        const std::uint8_t starting_completed =
            session.position().completed_tricks;
        const Seat trick_leader =
            session.position().current_trick.leader;
        const std::optional<Suit> trick_trump =
            session.position().current_trick.trump_suit;
        std::vector<PlayedCard> plays;
        std::size_t decision = 0;

        while (!is_deal_finished(session.position()) &&
               session.position().completed_tricks == starting_completed) {
            const Seat player =
                next_to_play(session.position().current_trick);
            Card card = kNoCard;
            std::string source;
            if (!same_side(player, Seat::South)) {
                card = choose_double_dummy_defender_card(
                    session.position(),
                    Seat::South,
                    "SHDC");
                source = "DDS defence";
            } else if (const std::optional<Card> retained =
                           session.policy_move()) {
                card = *retained;
                source = "retained AlphaMu2 policy";
            } else {
                const Position root = session.position();
                const AlphaMu2SessionAnalysis analysis = session.analyze2({
                    .reservoir_world_count = 256,
                    .initial_active_worlds = 30,
                    .max_active_worlds = 30,
                    .max_refinement_rounds = 2,
                    .counterexamples_per_round = 3,
                });
                ++decision;
                write_analysis(output, analysis, root, decision);
                card = analysis.search.search.best_move;
                source = decision == 1
                    ? "AlphaMu2"
                    : "AlphaMu2 re-analysis";
            }
            if (card == kNoCard) card = first_legal_card(session.position());
            plays.push_back(PlayedCard {
                .seat = player,
                .card = card,
                .source = source,
            });
            session.play(card);
        }

        Trick played {
            .leader = trick_leader,
            .trump_suit = trick_trump,
        };
        for (const PlayedCard& play : plays) {
            played.cards[played.card_count++] = play.card;
        }
        write_played_trick(
            output,
            plays,
            winning_seat(played),
            session.position().score);
        output.flush();
        ++trick_number;
    }

    output << "\n## Result\n\nNS "
           << static_cast<int>(session.position().score.north_south)
           << " - EW "
           << static_cast<int>(session.position().score.east_west)
           << ". Contract "
           << (session.position().score.north_south >= target
                   ? "made"
                   : "failed")
           << ".\n";
}

}  // namespace

int main(int argc, char** argv) {
    try {
        if (argc < 10 || argc > 11) {
            std::cerr
                << "Usage: bridge_alpha_mu2_report NORTH EAST SOUTH WEST "
                   "TRUMP TARGET LEADER SECONDS MAX_M [OUTPUT.md]\n";
            return 2;
        }

        Deal deal;
        for (std::size_t index = 0; index < 4; ++index) {
            const std::optional<Hand> hand = parse_hand_record(argv[index + 1]);
            if (!hand) throw std::invalid_argument("invalid SHDC hand record");
            deal.hands[index] = *hand;
        }
        if (!has_full_deal(deal)) {
            throw std::invalid_argument(
                "the four records must form one complete deal");
        }
        const auto strain = parse_strain(argv[5]);
        const auto leader = parse_seat(argv[7]);
        if (!strain || !leader) {
            throw std::invalid_argument("invalid trump strain or leader");
        }
        const int target = std::stoi(argv[6]);
        const double seconds = std::stod(argv[8]);
        const int max_depth = std::stoi(argv[9]);
        if (target < 1 || target > 13 || seconds < 0.0 ||
            max_depth < 1 || max_depth > kMaxDeclarerPlies) {
            throw std::invalid_argument(
                "target, time limit, or maximum M is out of range");
        }

        if (argc == 11) {
            std::ofstream file(argv[10]);
            if (!file) throw std::runtime_error("could not open report file");
            run_report(
                file,
                deal,
                *leader,
                *strain,
                static_cast<std::uint8_t>(target),
                seconds,
                static_cast<std::uint8_t>(max_depth));
        } else {
            run_report(
                std::cout,
                deal,
                *leader,
                *strain,
                static_cast<std::uint8_t>(target),
                seconds,
                static_cast<std::uint8_t>(max_depth));
        }
    } catch (const std::exception& error) {
        std::cerr << "Report error: " << error.what() << '\n';
        return 1;
    }
    return 0;
}
