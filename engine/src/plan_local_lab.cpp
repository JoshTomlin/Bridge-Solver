#include "bridge/plan_local_lab.h"
#include "bridge/plan_checkpoint.h"
#include "bridge/plan_merge.h"
#include "bridge/plan_repair.h"
#include "bridge/dds_solver.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <random>
#include <set>
#include <sstream>
#include <stdexcept>

namespace bridge {
namespace {
using Clock = std::chrono::steady_clock;
std::string quote(const std::string& value) {
    std::string result = "\"";
    for (char c : value) { if (c == '"') result += c; result += c; }
    return result + '"';
}
std::string path_text(const std::vector<AlphaMuPolicyStep>& path) {
    std::string text;
    for (const auto& step : path) {
        if (!text.empty()) text += ' ';
        text += to_string(step.player) + ':' + to_string(step.card);
    }
    return text;
}
struct Summary {
    std::size_t layouts {}, complete {}, proven {}, survived {}, losses {}, illegal {}, gaps {}, partial {};
    double ms {};
};
struct Target {
    std::size_t index {};
    PlanFailureWitness witness;
};
PlanEvaluationOptions mining_options(double seconds, bool diagnose = false) {
    PlanEvaluationOptions options;
    options.max_witnesses = 4;
    options.max_nodes = 200000;
    options.max_seconds = seconds;
    options.diagnose_losses = diagnose;
    options.frontier_mode = PlanFrontierMode::Dds;
    options.max_cached_contexts = 100000;
    options.mine_partial_plan = true;
    options.max_partial_witnesses = 0;
    return options;
}
void save(const PlanDag& graph, const std::filesystem::path& directory, const std::string& name) {
    std::ofstream json(directory / (name + ".dag.json"));
    write_plan_dag_json(json, graph);
    std::ofstream checkpoint(directory / (name + ".checkpoint"));
    write_plan_checkpoint(checkpoint, graph);
}
// Diagnose the first known losing declaring choice by replaying the existing
// instructions. A missing final response can reveal an earlier stored mistake.
std::optional<PlanFailureWitness> diagnose(const AlphaMuWorld& world, const PlanDag& graph,
    const PlanFailureWitness& endpoint, const AlphaMuConfig& config) {
    auto position = world.position;
    if (position.score.north_south + double_dummy_future_tricks(position, config.declarer) < config.target_tricks)
        return std::nullopt;
    auto node = graph.root;
    std::vector<AlphaMuPolicyStep> path;
    for (const auto& step : endpoint.path) {
        if (step.player != next_to_play(position.current_trick) ||
            !is_legal_play(position.current_trick, hand_of(position.deal, step.player), step.card)) return std::nullopt;
        path.push_back(step);
        if (same_side(step.player, config.declarer)) {
            Hand making = 0;
            for (const auto& move : double_dummy_move_scores(position, config.declarer))
                if (position.score.north_south + move.future_tricks >= config.target_tricks) making |= move.card;
            if (making && !contains(making, step.card)) {
                const auto& instruction = graph.nodes[node];
                if (instruction.kind != PlanNodeKind::Play || instruction.player != step.player || instruction.card != step.card)
                    throw std::logic_error("diagnosed choice does not match frozen instructions");
                return PlanFailureWitness {.kind = PlanFailureKind::DdLoss, .node = node,
                    .position = position, .card = step.card, .making_moves = making,
                    .diagnosed_choice = true, .path = std::move(path), .frontier_reason = endpoint.frontier_reason};
            }
        }
        const auto next = advance_plan_dag(graph, node, step.player, step.card);
        if (!next) return std::nullopt;
        play_card(position, step.card); node = *next;
    }
    return std::nullopt;
}
Summary scan(const std::vector<AlphaMuWorld>& worlds, const PlanDag& graph, const AlphaMuConfig& config,
    const char* stage, const char* partition, std::ostream& rows, double seconds,
    std::vector<Target>* targets = nullptr, std::size_t index_offset = 0) {
    Summary summary;
    const auto start = Clock::now();
    std::set<std::string> seen_paths;
    for (std::size_t i = 0; i < worlds.size(); ++i) {
        const auto began = Clock::now();
        const auto result = evaluate_plan_dag(worlds[i].position, graph, config, mining_options(seconds));
        ++summary.layouts; summary.complete += result.complete;
        summary.proven += result.proven_contract; summary.survived += result.survives_horizon;
        summary.losses += result.dd_losses != 0; summary.illegal += result.illegal_instructions != 0;
        summary.gaps += result.coverage_gaps != 0; summary.partial += result.frontier_survivors != 0;
        rows << stage << ',' << partition << ',' << i << ',' << result.complete << ',' << result.proven_contract
            << ',' << result.survives_horizon << ',' << result.dd_losses << ',' << result.illegal_instructions
            << ',' << result.coverage_gaps << ',' << result.frontier_survivors << ',' << result.visited_nodes
            << ',' << result.dds_calls << ',' << std::chrono::duration<double, std::milli>(Clock::now() - began).count() << '\n';
        if (targets) {
            for (const auto& failure : result.failures) {
                if (failure.kind != PlanFailureKind::DdLoss) continue;
                const auto diagnosed = diagnose(worlds[i], graph, failure, config);
                if (!diagnosed) continue;
                if (seen_paths.insert(path_text(diagnosed->path)).second)
                    targets->push_back({i + index_offset, *diagnosed});
                // One target per layout in the initial scheduling pass.
                break;
            }
        }
    }
    summary.ms = std::chrono::duration<double, std::milli>(Clock::now() - start).count();
    return summary;
}
void summary_row(const char* stage, const char* partition, const PlanDag& graph, const Summary& result) {
    const auto stats = measure_plan_dag(graph);
    std::cout << stage << ',' << partition << ',' << graph.nodes.size() << ',' << stats.program_bytes
        << ',' << result.layouts << ',' << result.complete << ',' << result.proven << ',' << result.survived
        << ',' << result.losses << ',' << result.illegal << ',' << result.gaps << ',' << result.partial << ',' << result.ms << '\n';
}
std::vector<bool> strict_training(const std::vector<AlphaMuWorld>& training, const PlanDag& graph,
    const AlphaMuConfig& config, const char* stage, std::ostream& rows) {
    std::vector<bool> proven;
    for (std::size_t i = 0; i < training.size(); ++i) {
        const auto result = evaluate_plan_dag(training[i].position, graph, config,
            {.max_witnesses = 1, .max_nodes = 2000000, .max_seconds = 5, .diagnose_losses = false,
             .frontier_mode = PlanFrontierMode::ReportUnresolved, .max_cached_contexts = 500000});
        proven.push_back(result.proven_contract);
        rows << stage << ',' << i << ',' << result.proven_contract << ',' << result.complete << ','
            << result.failures.size() << ',' << result.unresolved_frontiers.size() << '\n';
    }
    return proven;
}
}

int run_plan_local_lab(std::vector<AlphaMuWorld> legal_worlds,
    const std::string& deep_checkpoint, const std::string& broad_checkpoint,
    std::size_t repair_count, double repair_seconds, std::uint64_t seed,
    const std::string& output_directory, std::optional<Position> actual) {
    constexpr std::size_t initial_count = 10, discovery_count = 256, fresh_count = 256;
    if (legal_worlds.size() < initial_count + discovery_count + fresh_count || repair_count == 0 ||
        !std::isfinite(repair_seconds) || repair_seconds <= 0 || output_directory.empty())
        throw std::invalid_argument("invalid deep repair lab arguments");
    std::ifstream deep_input(deep_checkpoint), broad_input(broad_checkpoint);
    if (!deep_input || !broad_input) throw std::runtime_error("could not read frozen input checkpoints");
    const auto deep = read_plan_checkpoint(deep_input);
    const auto broad = read_plan_checkpoint(broad_input);
    const auto merged = merge_plan_prefixes(deep, broad);
    auto graph = merged.graph;
    const auto baseline = graph;
    AlphaMuConfig config {.declarer = Seat::South, .trump_suit = Suit::Spades, .target_tricks = 12,
        .max_declarer_plies = 26};
    if (graph.declarer != config.declarer || graph.target_tricks != config.target_tricks)
        throw std::invalid_argument("input plan does not describe the 6S experiment");
    config.optimizations.iterative_deepening = false;
    std::mt19937_64 random(seed);
    std::shuffle(legal_worlds.begin(), legal_worlds.end(), random);
    const std::vector<AlphaMuWorld> initial(legal_worlds.begin(), legal_worlds.begin() + initial_count);
    const std::vector<AlphaMuWorld> discovery(legal_worlds.begin() + initial_count,
        legal_worlds.begin() + initial_count + discovery_count);
    const std::vector<AlphaMuWorld> archive(legal_worlds.begin(), legal_worlds.begin() + initial_count + discovery_count);
    const std::vector<AlphaMuWorld> fresh(legal_worlds.begin() + initial_count + discovery_count,
        legal_worlds.begin() + initial_count + discovery_count + fresh_count);
    const auto directory = std::filesystem::path(output_directory);
    std::filesystem::create_directories(directory);
    save(graph, directory, "merged_before");
    std::ofstream partition(directory / "split.csv"), rows(directory / "replay.csv"), events(directory / "repairs.csv"),
        strict(directory / "strict-training.csv"), targets_file(directory / "targets.csv");
    partition << "partition,index,east_mask\n";
    for (std::size_t i = 0; i < initial_count + discovery_count + fresh_count; ++i) {
        const char* group = i < initial_count ? "initial" : i < initial_count + discovery_count ? "discovery" : "fresh";
        const auto index = i < initial_count ? i : i < initial_count + discovery_count ? i - initial_count : i - initial_count - discovery_count;
        partition << group << ',' << index << ",0x" << std::hex << hand_of(legal_worlds[i].position.deal, Seat::East) << std::dec << '\n';
    }
    rows << "stage,partition,index,complete,proven_contract,survives_horizon,dd_losses,illegal_instructions,coverage_gaps,dd_feasible_leaves,visited_nodes,dds_calls,ms\n";
    strict << "stage,index,proven_contract,complete,failures,unresolved\n";
    events << "attempt,archive_index,accepted,reused,changed_at_root,local_attempts,local_worlds,compatible_worlds,validation_worlds,unknown_checks,search_ms,validation_ms,nodes_before,nodes_after,bad_card,target_path,repaired_prefix\n";
    targets_file << "archive_index,east_mask,bad_card,making_alternatives,path\n";
    std::cerr << "Retained deep instructions and merged prefix: " << deep.nodes.size() << " -> " << graph.nodes.size()
        << " nodes, filled_frontiers=" << merged.filled_frontiers << " added_responses=" << merged.added_responses
        << " conflicts=" << merged.conflicts << '\n';
    const auto originally_proven = strict_training(initial, deep, config, "deep_before", strict);
    const auto merged_proven = strict_training(initial, baseline, config, "merged_before", strict);
    for (std::size_t i = 0; i < initial_count; ++i)
        if (originally_proven[i] && !merged_proven[i]) throw std::runtime_error("merge lost a training proof");
    std::cout << "stage,partition,nodes,program_bytes,layouts,complete,proven,survived,loss_layouts,illegal_layouts,gap_layouts,partial_layouts,ms\n";
    std::vector<Target> targets;
    summary_row("before", "initial", graph, scan(initial, graph, config, "before", "initial", rows, 0.25));
    summary_row("before", "discovery", graph, scan(discovery, graph, config, "before", "discovery", rows, 0.25, &targets, initial_count));
    for (const auto& target : targets) targets_file << target.index << ",0x" << std::hex
        << hand_of(archive[target.index].position.deal, Seat::East) << std::dec << ',' << to_string(target.witness.card)
        << ',' << quote(format_card_list(target.witness.making_moves)) << ',' << quote(path_text(target.witness.path)) << '\n';
    targets_file.flush();
    std::cerr << "Discovered " << targets.size() << " distinct diagnosed repair histories; fresh layouts remain unused\n";
    std::set<std::string> attempted;
    std::size_t attempts = 0, accepted = 0;
    for (const auto& target : targets) {
        if (attempts >= repair_count) break;
        // Refresh after each edit: instruction IDs and the first failing history may change.
        const auto refreshed = evaluate_plan_dag(archive[target.index].position, graph, config, mining_options(0.5));
        std::optional<PlanFailureWitness> witness;
        for (const auto& failure : refreshed.failures) if (failure.kind == PlanFailureKind::DdLoss) {
            const auto diagnosed = diagnose(archive[target.index], graph, failure, config);
            if (diagnosed && !attempted.contains(path_text(diagnosed->path))) { witness = diagnosed; break; }
        }
        if (!witness) continue;
        attempted.insert(path_text(witness->path)); ++attempts;
        PlanRepairOptions options;
        options.local_m = 2; options.maximum_attempts = 4; options.maximum_local_worlds = 32;
        options.evaluation_nodes = 2000000; options.seconds = repair_seconds;
        options.maximum_search_m = 26; options.use_deep_constructor = true;
        options.deep_options.seconds = std::min(15.0, repair_seconds * 0.6);
        options.deep_options.max_nodes = 250000; options.deep_options.max_contexts = 500000;
        const auto before_nodes = graph.nodes.size();
        std::cerr << "Repair " << attempts << '/' << repair_count << ": archive " << target.index
            << " bad " << to_string(witness->card) << " at " << path_text(witness->path) << '\n';
        const auto repair = repair_plan_failure(graph, archive, target.index, *witness, config, options);
        if (repair.accepted) { graph = repair.graph; ++accepted; save(graph, directory, "accepted_" + std::to_string(accepted)); }
        events << attempts << ',' << target.index << ',' << repair.accepted << ',' << repair.reused_continuation
            << ',' << repair.changed_at_root << ',' << repair.attempts << ',' << repair.local_worlds << ',' << repair.compatible_worlds
            << ',' << repair.validation_worlds << ',' << repair.unknown_checks << ',' << repair.search_ms << ',' << repair.validation_ms
            << ',' << before_nodes << ',' << graph.nodes.size() << ',' << to_string(witness->card) << ',' << quote(path_text(witness->path))
            << ',' << quote(path_text(repair.repaired_prefix)) << '\n';
        events.flush();
        std::cerr << "Repair accepted=" << repair.accepted << " checks=" << repair.validation_worlds
            << " unknowns=" << repair.unknown_checks << " search_ms=" << repair.search_ms << '\n';
    }
    // Freeze the final graph before using any fresh layout for comparison.
    save(graph, directory, "repaired_final");
    const auto finally_proven = strict_training(initial, graph, config, "after", strict);
    for (std::size_t i = 0; i < initial_count; ++i)
        if (originally_proven[i] && !finally_proven[i]) throw std::runtime_error("repair lost a previously verified training proof");
    summary_row("after", "initial", graph, scan(initial, graph, config, "after", "initial", rows, 0.25));
    summary_row("after", "discovery", graph, scan(discovery, graph, config, "after", "discovery", rows, 0.25));
    summary_row("before", "fresh", baseline, scan(fresh, baseline, config, "before", "fresh", rows, 0.25));
    summary_row("after", "fresh", graph, scan(fresh, graph, config, "after", "fresh", rows, 0.25));
    if (actual) {
        const std::vector<AlphaMuWorld> actual_world {{*actual}};
        summary_row("before", "actual", baseline, scan(actual_world, baseline, config, "before", "actual", rows, 1));
        summary_row("after", "actual", graph, scan(actual_world, graph, config, "after", "actual", rows, 1));
    }
    if (!partition || !rows || !events || !strict || !targets_file) throw std::runtime_error("could not write repair evidence");
    std::cerr << "Accepted " << accepted << " of " << attempts << " local repairs; final nodes=" << graph.nodes.size() << '\n';
    return 0;
}
}
