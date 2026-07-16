#include "interactive_cli.h"

#include "bridge/analysis_session.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cctype>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>

namespace bridge::cli {
namespace {

constexpr std::array<AlphaMuOptimization, 18> kOptimizations {
    AlphaMuOptimization::IterativeDeepening,
    AlphaMuOptimization::TranspositionTable,
    AlphaMuOptimization::CanonicalTranspositionKeys,
    AlphaMuOptimization::MaxEquivalentCards,
    AlphaMuOptimization::MinEquivalentSuccessors,
    AlphaMuOptimization::EarlyCut,
    AlphaMuOptimization::UsefulWorlds,
    AlphaMuOptimization::WorldCuts,
    AlphaMuOptimization::EmptyEntry,
    AlphaMuOptimization::DeepAlphaCut,
    AlphaMuOptimization::RootCut,
    AlphaMuOptimization::WinCut,
    AlphaMuOptimization::TargetBounds,
    AlphaMuOptimization::QuickTrickBounds,
    AlphaMuOptimization::ClaimBounds,
    AlphaMuOptimization::ForcedMoves,
    AlphaMuOptimization::ForcedTrumpRun,
    AlphaMuOptimization::LeafDdsBatch,
};

std::string lower(std::string text) {
    std::transform(text.begin(), text.end(), text.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return text;
}

bool prompt(
    std::istream& input,
    std::ostream& output,
    const std::string& label,
    std::string& value) {
    output << label << std::flush;
    return static_cast<bool>(std::getline(input, value));
}

std::optional<Seat> parse_seat(std::string text) {
    text = lower(text);
    if (text == "n" || text == "north") return Seat::North;
    if (text == "e" || text == "east") return Seat::East;
    if (text == "s" || text == "south") return Seat::South;
    if (text == "w" || text == "west") return Seat::West;
    return std::nullopt;
}

bool parse_trump(std::string text, std::optional<Suit>& trump) {
    text = lower(text);
    if (text == "nt" || text == "n" || text == "none") {
        trump = std::nullopt;
        return true;
    }
    if (text.size() != 1) return false;
    trump = parse_suit(text[0]);
    return trump.has_value();
}

std::optional<unsigned long long> parse_number(const std::string& text) {
    try {
        std::size_t consumed = 0;
        const unsigned long long value = std::stoull(text, &consumed);
        return consumed == text.size() ? std::optional<unsigned long long> {value}
                                       : std::nullopt;
    } catch (const std::exception&) {
        return std::nullopt;
    }
}

void print_help(std::ostream& output) {
    output <<
        "Commands:\n"
        "  new                 Enter a new full or shortened deal\n"
        "  show                Show public hands and current position\n"
        "  reveal              Show the hidden East/West hands\n"
        "  analyze             Sample worlds and ask alpha-mu for a move\n"
        "  analyze2            Run experimental adaptive world selection\n"
        "  play CARD           Play a card, for example: play SA\n"
        "  bot                 Let alpha-mu or DDS play the current card\n"
        "  undo                Undo the most recent card\n"
        "  replay              Restart the entered deal\n"
        "  set depth N         Set alpha-mu depth M (1-26)\n"
        "  set worlds N        Set sampled worlds (1-64)\n"
        "  set target N        Set required North/South tricks\n"
        "  set seed N          Set the sampling seed\n"
        "  set time SECONDS    Set soft iterative time limit; 0 disables it\n"
        "  optimizations       List every optimization and its state\n"
        "  set opt NAME on|off Enable or disable one optimization\n"
        "  set audit on|off    Print shortcuts taken by each analysis\n"
        "  benchmark NAME      Time one optimization off/on on identical worlds\n"
        "  help                Show this help\n"
        "  quit                Exit\n";
}

std::optional<bool> parse_switch(std::string value) {
    value = lower(std::move(value));
    if (value == "on" || value == "true" || value == "1") return true;
    if (value == "off" || value == "false" || value == "0") return false;
    return std::nullopt;
}

void print_optimizations(const AnalysisSession& session, std::ostream& output) {
    output << "Alpha-mu optimizations:\n";
    for (const AlphaMuOptimization optimization : kOptimizations) {
        output << "  " << std::left << std::setw(16) << to_string(optimization)
               << (optimization_enabled(session.settings().optimizations, optimization)
                       ? "on"
                       : "off")
               << '\n';
    }
    output << std::right;
}

std::uint64_t optimization_event_count(
    const AlphaMuSearchStats& stats,
    AlphaMuOptimization optimization) {
    switch (optimization) {
        case AlphaMuOptimization::IterativeDeepening:
            return stats.completed_iterations;
        case AlphaMuOptimization::TranspositionTable:
        case AlphaMuOptimization::CanonicalTranspositionKeys:
            return stats.transposition_hits;
        case AlphaMuOptimization::MaxEquivalentCards:
            return stats.max_equivalent_moves_skipped;
        case AlphaMuOptimization::MinEquivalentSuccessors:
            return stats.min_equivalent_moves_skipped;
        case AlphaMuOptimization::EarlyCut:
            return stats.early_cuts;
        case AlphaMuOptimization::UsefulWorlds:
            return stats.useful_worlds_removed;
        case AlphaMuOptimization::WorldCuts:
            return stats.world_cuts;
        case AlphaMuOptimization::EmptyEntry:
            return stats.empty_entry_searches;
        case AlphaMuOptimization::DeepAlphaCut:
            return stats.deep_alpha_cuts;
        case AlphaMuOptimization::RootCut:
            return stats.root_cuts;
        case AlphaMuOptimization::WinCut:
            return stats.win_cuts;
        case AlphaMuOptimization::TargetBounds:
            return stats.target_reached_cuts + stats.target_impossible_cuts;
        case AlphaMuOptimization::QuickTrickBounds:
            return stats.quick_trick_cuts;
        case AlphaMuOptimization::ClaimBounds:
            return stats.claim_cuts;
        case AlphaMuOptimization::ForcedMoves:
            return stats.forced_move_nodes + stats.forced_root_recommendations;
        case AlphaMuOptimization::ForcedTrumpRun:
            return stats.forced_trump_run_cuts;
        case AlphaMuOptimization::LeafDdsBatch:
            return stats.leaf_dds_batches;
    }
    return 0;
}

std::unique_ptr<AnalysisSession> read_session(
    std::istream& input,
    std::ostream& output) {
    Deal deal;
    for (const Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West}) {
        std::string text;
        if (!prompt(input, output, to_string(seat) + " (SHDC): ", text)) {
            return nullptr;
        }
        const std::optional<Hand> hand = parse_hand_record(text);
        if (!hand.has_value()) {
            throw std::invalid_argument(
                "invalid hand; use four SHDC holdings such as AJ32.A.-.-");
        }
        hand_of(deal, seat) = *hand;
    }

    std::string text;
    if (!prompt(input, output, "Leader (N/E/S/W): ", text)) return nullptr;
    const std::optional<Seat> leader = parse_seat(text);
    if (!leader.has_value()) throw std::invalid_argument("invalid leader");

    if (!prompt(input, output, "Trump (S/H/D/C/NT): ", text)) return nullptr;
    std::optional<Suit> trump;
    if (!parse_trump(text, trump)) throw std::invalid_argument("invalid trump suit");

    auto session = std::make_unique<AnalysisSession>(deal, *leader, trump);
    BotSettings settings = session->settings();
    if (!prompt(input, output, "Target North/South tricks: ", text)) return nullptr;
    const std::optional<unsigned long long> target = parse_number(text);
    if (!target.has_value()) throw std::invalid_argument("invalid target trick count");
    settings.target_tricks = static_cast<std::uint8_t>(*target);
    session->set_settings(settings);
    return session;
}

void show_session(const AnalysisSession& session, std::ostream& output) {
    const Position& position = session.position();
    output << session.public_diagram();
    output << "Turn: " << to_string(next_to_play(position.current_trick)) << '\n';
    output << "Current trick: " << format_trick(position.current_trick) << '\n';
    output << "Score: NS " << static_cast<int>(position.score.north_south)
           << " - EW " << static_cast<int>(position.score.east_west) << '\n';
    output << "Known voids: " << session.known_voids() << '\n';
    if (!is_deal_finished(position)) {
        const Seat player = next_to_play(position.current_trick);
        output << "Legal: " << format_card_list(legal_plays(
            position.current_trick,
            hand_of(position.deal, player))) << '\n';
    }
    const BotSettings& settings = session.settings();
    output << "Settings: worlds=" << settings.world_count
           << " M=" << static_cast<int>(settings.max_declarer_plies)
           << " target=" << static_cast<int>(settings.target_tricks)
           << " time=" << settings.max_search_seconds << "s"
           << " seed=" << settings.random_seed << '\n';
}

SessionAnalysis analyze(AnalysisSession& session, std::ostream& output) {
    const SessionAnalysis analysis = session.analyze();
    const bool forced =
        analysis.search.stats.forced_root_recommendations != 0;
    const bool presampling_bound =
        forced ||
        analysis.search.stats.quick_trick_root_cuts != 0 ||
        analysis.search.stats.claim_root_cuts != 0 ||
        analysis.search.stats.target_reached_cuts != 0 ||
        analysis.search.stats.target_impossible_cuts != 0;
    output << "Possible deals: " << analysis.possible_deals;
    if (forced) {
        output << "; forced play, no worlds sampled\n";
    } else if (presampling_bound) {
        output << "; public bound, no worlds sampled\n";
    } else {
        output << "; sampled " << session.settings().world_count
               << " (" << analysis.unique_worlds << " unique) in "
               << std::fixed << std::setprecision(3)
               << analysis.sampling_ms << " ms\n";
    }
    output << "Root moves:\n";
    for (const AlphaMuRootMove& move : analysis.search.root_moves) {
        output << "  " << to_string(move.move);
        if (forced || presampling_bound) {
            output << (forced ? ": only legal card\n" : ": public bound\n");
        } else {
            output << ": " << move.winning_worlds
                   << '/' << session.settings().world_count
                   << " worlds, " << move.pareto_vectors << " vector(s)\n";
        }
    }
    output << "Recommended: " << to_string(analysis.search.best_move)
           << " in " << analysis.search_ms << " ms\n";
    output << "Stats: nodes=" << analysis.search.stats.nodes
           << " DDS-worlds=" << analysis.search.stats.dds_worlds
           << " TT-hits=" << analysis.search.stats.transposition_hits
           << " early-cuts=" << analysis.search.stats.early_cuts
           << " deep-alpha-cuts=" << analysis.search.stats.deep_alpha_cuts
           << " useful-removed=" << analysis.search.stats.useful_worlds_removed
           << " world-cuts=" << analysis.search.stats.world_cuts
           << " empty-entry=" << analysis.search.stats.empty_entry_searches
           << " root-cuts=" << analysis.search.stats.root_cuts
           << " equals-skipped=" << analysis.search.stats.equivalent_moves_skipped
           << " (MAX " << analysis.search.stats.max_equivalent_moves_skipped
           << ", MIN " << analysis.search.stats.min_equivalent_moves_skipped << ')'
           << " forced-moves="
           << analysis.search.stats.forced_move_nodes +
                  analysis.search.stats.forced_root_recommendations
           << " forced-trump-cuts=" << analysis.search.stats.forced_trump_run_cuts
           << " win-cuts=" << analysis.search.stats.win_cuts
           << " target-bounds="
           << analysis.search.stats.target_reached_cuts +
                  analysis.search.stats.target_impossible_cuts
           << " quick-tricks=" << analysis.search.stats.quick_trick_cuts
           << " claim-cuts=" << analysis.search.stats.claim_cuts
           << " claim-states=" << analysis.search.stats.claim_states
           << " claim-cache-hits=" << analysis.search.stats.claim_cache_hits
           << " claim-budget-aborts=" << analysis.search.stats.claim_budget_aborts
           << " DDS-batches=" << analysis.search.stats.leaf_dds_batches
           << " completed-M="
           << static_cast<int>(analysis.search.stats.completed_depth);
    if (analysis.search.stats.stopped_by_time_limit) {
        output << " (soft time limit reached)";
    }
    output << '\n';
    output << "Timing: tree=" << analysis.search.stats.tree_search_ms
           << " ms policy=" << analysis.search.stats.policy_build_ms << " ms\n";
    if (!analysis.search.audit_log.empty()) {
        output << "Optimization audit:\n" << analysis.search.audit_log;
    }
    return analysis;
}

AlphaMu2SessionAnalysis analyze2(
    AnalysisSession& session,
    std::ostream& output) {
    const AlphaMu2SessionAnalysis analysis = session.analyze2();
    const AlphaMu2Result& result = analysis.search;
    output << "AlphaMu2 reservoir: " << result.stats.reservoir_worlds
           << " worlds (" << analysis.unique_reservoir_worlds
           << " unique), " << result.stats.distinct_screening_vectors
           << " DDS root fingerprint(s)\n";
    output << "Active worlds: " << result.stats.initial_worlds
           << " -> " << result.stats.final_worlds
           << "; counterexamples " << result.stats.counterexamples_added
           << " added from " << result.stats.counterexamples_found
           << " candidate(s)\n";
    output << "Recommended: " << to_string(result.search.best_move) << '\n';
    output << "AlphaMu2 work: searches=" << result.stats.search_runs
           << " refinements=" << result.stats.refinement_rounds
           << " reserve-checks=" << result.stats.reserve_worlds_checked
           << " validation-DDS-leaves=" << result.stats.policy_dds_leaves
           << '\n';
    output << std::fixed << std::setprecision(3)
           << "Timing: sample=" << analysis.sampling_ms
           << " ms screen=" << result.stats.screening_ms
           << " ms select=" << result.stats.selection_ms
           << " ms search=" << result.stats.search_ms
           << " ms validate=" << result.stats.validation_ms << " ms\n";
    return analysis;
}

void print_benchmark(
    const OptimizationBenchmark& benchmark,
    std::ostream& output) {
    const OptimizationBenchmarkRun& off = benchmark.disabled;
    const OptimizationBenchmarkRun& on = benchmark.enabled;
    const std::size_t off_score = best_winning_world_count(off.search.front);
    const std::size_t on_score = best_winning_world_count(on.search.front);

    output << "Benchmark " << to_string(benchmark.optimization) << " using the same "
           << benchmark.sampled_worlds << " sampled worlds for both runs ("
           << benchmark.unique_worlds << " unique; sampling "
           << std::fixed << std::setprecision(3) << benchmark.sampling_ms << " ms)\n";
    output << std::left << std::setw(18) << "" << std::right
           << std::setw(14) << "off" << std::setw(14) << "on" << '\n';
    output << std::left << std::setw(18) << "runtime ms" << std::right
           << std::setw(14) << off.search_ms << std::setw(14) << on.search_ms << '\n';
    output << std::left << std::setw(18) << "nodes" << std::right
           << std::setw(14) << off.search.stats.nodes
           << std::setw(14) << on.search.stats.nodes << '\n';
    output << std::left << std::setw(18) << "DDS worlds" << std::right
           << std::setw(14) << off.search.stats.dds_worlds
           << std::setw(14) << on.search.stats.dds_worlds << '\n';
    output << std::left << std::setw(18) << "TT hits" << std::right
           << std::setw(14) << off.search.stats.transposition_hits
           << std::setw(14) << on.search.stats.transposition_hits << '\n';
    output << std::left << std::setw(18) << "equals skipped" << std::right
           << std::setw(14) << off.search.stats.equivalent_moves_skipped
           << std::setw(14) << on.search.stats.equivalent_moves_skipped << '\n';
    output << std::left << std::setw(18) << "shortcut events" << std::right
           << std::setw(14) << optimization_event_count(off.search.stats, benchmark.optimization)
           << std::setw(14) << optimization_event_count(on.search.stats, benchmark.optimization)
           << '\n';
    output << std::left << std::setw(18) << "winning worlds" << std::right
           << std::setw(14) << off_score << std::setw(14) << on_score << '\n';
    output << std::left << std::setw(18) << "best move" << std::right
           << std::setw(14) << to_string(off.search.best_move)
           << std::setw(14) << to_string(on.search.best_move) << '\n';
    output << std::left;
    if (on.search_ms > 0.0) {
        output << "Enabled speed ratio: " << off.search_ms / on.search_ms << "x\n";
    }
    output << "Score check: " << (off_score == on_score ? "match" : "MISMATCH") << '\n';
    output << std::right;
}

Card choose_dds_defender_card(const Position& position) {
    const Seat player = next_to_play(position.current_trick);
    const Hand legal = legal_plays(position.current_trick, hand_of(position.deal, player));
    Card best = kNoCard;
    std::uint8_t minimum = std::numeric_limits<std::uint8_t>::max();
    for (int bit = kDeckSize - 1; bit >= 0; --bit) {
        const Card card = Card {1} << bit;
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
    return best;
}

void set_option(
    AnalysisSession& session,
    const std::string& option,
    const std::string& value) {
    BotSettings settings = session.settings();
    if (option == "time") {
        try {
            std::size_t consumed = 0;
            settings.max_search_seconds = std::stod(value, &consumed);
            if (consumed != value.size()) throw std::invalid_argument("invalid time limit");
        } catch (const std::exception&) {
            throw std::invalid_argument("time limit must be a number of seconds");
        }
        session.set_settings(settings);
        return;
    }
    if (option == "audit") {
        const std::optional<bool> enabled = parse_switch(value);
        if (!enabled.has_value()) throw std::invalid_argument("audit must be on or off");
        settings.collect_audit_log = *enabled;
        session.set_settings(settings);
        return;
    }

    const std::optional<unsigned long long> parsed = parse_number(value);
    if (!parsed.has_value()) throw std::invalid_argument("setting must be an integer");
    if (option == "depth") {
        settings.max_declarer_plies = static_cast<std::uint8_t>(*parsed);
    } else if (option == "worlds") {
        settings.world_count = static_cast<std::size_t>(*parsed);
    } else if (option == "target") {
        settings.target_tricks = static_cast<std::uint8_t>(*parsed);
    } else if (option == "seed") {
        settings.random_seed = *parsed;
    } else {
        throw std::invalid_argument("unknown setting");
    }
    session.set_settings(settings);
}

}  // namespace

void run_interactive(std::istream& input, std::ostream& output) {
    output << "Bridge alpha-mu position lab. Type 'help' for commands.\n";
    std::unique_ptr<AnalysisSession> session;
    std::string line;
    while (prompt(input, output, "bridge> ", line)) {
        std::istringstream command_stream(line);
        std::string command;
        command_stream >> command;
        command = lower(command);
        if (command.empty()) continue;

        try {
            if (command == "quit" || command == "exit") {
                return;
            }
            if (command == "help") {
                print_help(output);
            } else if (command == "new") {
                std::unique_ptr<AnalysisSession> replacement = read_session(input, output);
                if (replacement != nullptr) {
                    session = std::move(replacement);
                    output << "Position created. East/West are hidden; use 'reveal' if needed.\n";
                    show_session(*session, output);
                }
            } else if (session == nullptr) {
                output << "No position. Use 'new' first.\n";
            } else if (command == "show") {
                show_session(*session, output);
            } else if (command == "reveal") {
                output << session->full_diagram();
            } else if (command == "analyze") {
                analyze(*session, output);
            } else if (command == "analyze2") {
                analyze2(*session, output);
            } else if (command == "optimizations") {
                print_optimizations(*session, output);
            } else if (command == "benchmark") {
                std::string name;
                command_stream >> name;
                const std::optional<AlphaMuOptimization> optimization =
                    parse_alpha_mu_optimization(name);
                if (!optimization.has_value()) {
                    throw std::invalid_argument(
                        "unknown optimization; use 'optimizations' to list names");
                }
                print_benchmark(session->benchmark(*optimization), output);
            } else if (command == "play") {
                std::string card_text;
                command_stream >> card_text;
                const std::optional<Card> card = parse_card(card_text);
                if (!card.has_value()) throw std::invalid_argument("use a card such as SA or H7");
                const Seat player = next_to_play(session->position().current_trick);
                session->play(*card);
                output << to_string(player) << " played " << to_string(*card) << ".\n";
            } else if (command == "bot") {
                const Seat player = next_to_play(session->position().current_trick);
                Card card = kNoCard;
                if (same_side(player, Seat::South)) {
                    std::optional<Card> policy = session->policy_move();
                    if (!policy.has_value()) {
                        const SessionAnalysis result = analyze(*session, output);
                        card = result.search.best_move;
                    } else {
                        card = *policy;
                        output << "Following retained trick policy.\n";
                    }
                } else {
                    card = choose_dds_defender_card(session->position());
                }
                session->play(card);
                output << to_string(player) << " played " << to_string(card) << ".\n";
            } else if (command == "undo") {
                output << (session->undo() ? "Last card undone.\n" : "Nothing to undo.\n");
            } else if (command == "replay") {
                session->replay();
                output << "Deal reset to its original position.\n";
            } else if (command == "set") {
                std::string option;
                std::string value;
                command_stream >> option;
                option = lower(option);
                if (option == "opt") {
                    std::string name;
                    command_stream >> name >> value;
                    const std::optional<AlphaMuOptimization> optimization =
                        parse_alpha_mu_optimization(name);
                    const std::optional<bool> enabled = parse_switch(value);
                    if (!optimization.has_value() || !enabled.has_value()) {
                        throw std::invalid_argument("use: set opt NAME on|off");
                    }
                    BotSettings settings = session->settings();
                    set_optimization_enabled(
                        settings.optimizations, *optimization, *enabled);
                    session->set_settings(settings);
                } else {
                    command_stream >> value;
                    set_option(*session, option, value);
                }
                output << "Settings updated.\n";
            } else {
                output << "Unknown command. Type 'help'.\n";
            }
        } catch (const std::exception& error) {
            output << "Error: " << error.what() << '\n';
        }
    }
}

}  // namespace bridge::cli
