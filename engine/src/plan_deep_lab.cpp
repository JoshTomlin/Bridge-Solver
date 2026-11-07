#include "bridge/plan_deep.h"
#include "bridge/plan_challenge.h"
#include <algorithm>
#include <bit>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <random>
#include <sstream>
#include <stdexcept>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <psapi.h>
#endif

namespace bridge {
namespace {
using Clock = std::chrono::steady_clock;
struct ProcessMemory {
    std::size_t peak_working_set {}, peak_commit {};
};
ProcessMemory process_memory() {
#ifdef _WIN32
    PROCESS_MEMORY_COUNTERS_EX counters {};
    counters.cb = sizeof(counters);
    if (!GetProcessMemoryInfo(GetCurrentProcess(),
        reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&counters), sizeof(counters))) {
        throw std::runtime_error("could not measure process memory");
    }
    return {counters.PeakWorkingSetSize, counters.PeakPagefileUsage};
#else
    return {}; // Unsupported is reported as zero, not a measured zero footprint.
#endif
}
struct Coverage {
    std::size_t maximum_depth {}, first_responses {}, continued_responses {};
    int minimum_frontier_depth {-1};
};
Coverage coverage(const PlanDag& graph) {
    constexpr auto none = std::numeric_limits<std::size_t>::max();
    std::vector<std::size_t> minimum(graph.nodes.size(), none), maximum(graph.nodes.size());
    for (std::size_t i = 0; i < graph.nodes.size(); ++i) {
        const auto& node = graph.nodes[i];
        if (node.kind == PlanNodeKind::Frontier) minimum[i] = 0;
        if (node.kind == PlanNodeKind::Play) {
            maximum[i] = 1 + maximum[node.next];
            if (minimum[node.next] != none) minimum[i] = 1 + minimum[node.next];
        }
        if (node.kind == PlanNodeKind::Observe) {
            for (std::size_t j = 0; j < node.edge_count; ++j) {
                const auto child = graph.edges[node.first_edge + j].next;
                minimum[i] = std::min(minimum[i], minimum[child]);
                maximum[i] = std::max(maximum[i], maximum[child]);
            }
        }
    }
    Coverage result;
    result.maximum_depth = maximum[graph.root];
    if (minimum[graph.root] != none) result.minimum_frontier_depth = static_cast<int>(minimum[graph.root]);
    auto first = graph.root;
    while (graph.nodes[first].kind == PlanNodeKind::Play) first = graph.nodes[first].next;
    const auto& node = graph.nodes[first];
    if (node.kind == PlanNodeKind::Observe) {
        result.first_responses = node.edge_count;
        for (std::size_t j = 0; j < node.edge_count; ++j) {
            if (graph.nodes[graph.edges[node.first_edge + j].next].kind != PlanNodeKind::Frontier)
                ++result.continued_responses;
        }
    }
    return result;
}
std::string quote(const std::string& value) {
    std::string result = "\"";
    for (const char c : value) { if (c == '"') result += '"'; result += c; }
    return result + '"';
}
std::string path_text(const std::vector<AlphaMuPolicyStep>& path) {
    std::string result;
    for (const auto& step : path) {
        if (!result.empty()) result += ' ';
        result += to_string(step.player) + ':' + to_string(step.card);
    }
    return result;
}
const char* frontier_reason(PlanFrontierReason reason) {
    switch (reason) {
    case PlanFrontierReason::StoredFrontier: return "stored_frontier";
    case PlanFrontierReason::MissingObservation: return "missing_observation";
    case PlanFrontierReason::RejectedProof: return "rejected_proof";
    }
    return "unknown";
}
void write_witness(std::ostream& out, const char* partition, std::size_t index,
    const char* kind, const char* reason, PlanNodeId node, const Position& root,
    const Position& position, const std::vector<AlphaMuPolicyStep>& path) {
    out << partition << ',' << index << ',' << kind << ',' << reason << ',' << node
        << ",0x" << std::hex << hand_of(root.deal, Seat::East) << ",0x" << position.played_cards << std::dec;
    for (Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West})
        out << ',' << quote(format_hand(hand_of(position.deal, seat)));
    out << ',' << to_string(position.current_trick.leader) << ',';
    std::string trick;
    for (std::size_t i = 0; i < position.current_trick.card_count; ++i) {
        if (!trick.empty()) trick += ' ';
        trick += to_string(position.current_trick.cards[i]);
    }
    out << quote(trick) << ',' << static_cast<int>(position.score.north_south)
        << ',' << static_cast<int>(position.score.east_west) << ',' << quote(path_text(path)) << '\n';
}
struct MiningSummary {
    std::size_t layouts {}, completed {}, proven {}, survived {}, losses {}, gaps {}, partial {},
        visited {}, dds_calls {};
    double milliseconds {};
};
// Equal per-layout budgets avoid spending a whole group budget on its first layout.
constexpr std::size_t mining_nodes_per_layout = 20000;
MiningSummary mine(const std::vector<AlphaMuWorld>& worlds, const PlanDag& graph,
    const AlphaMuConfig& config, const char* partition, std::ostream* rows, std::ostream* witnesses,
    double mining_seconds_per_layout) {
    MiningSummary summary;
    const auto start = Clock::now();
    for (std::size_t i = 0; i < worlds.size(); ++i) {
        const auto began = Clock::now();
        PlanEvaluationOptions options;
        options.max_witnesses = 8;
        options.max_nodes = mining_nodes_per_layout;
        options.max_seconds = mining_seconds_per_layout;
        options.diagnose_losses = false;
        options.frontier_mode = PlanFrontierMode::Dds;
        options.max_cached_contexts = 50000;
        options.mine_partial_plan = true;
        options.max_partial_witnesses = 8;
        const auto evaluation = evaluate_plan_dag(worlds[i].position, graph, config, options);
        const auto elapsed = std::chrono::duration<double, std::milli>(Clock::now() - began).count();
        ++summary.layouts;
        summary.completed += evaluation.complete;
        summary.proven += evaluation.proven_contract;
        summary.survived += evaluation.survives_horizon;
        summary.losses += evaluation.dd_losses != 0;
        summary.gaps += evaluation.coverage_gaps != 0;
        summary.partial += evaluation.frontier_survivors != 0 || evaluation.rejected_proofs != 0;
        summary.visited += evaluation.visited_nodes;
        summary.dds_calls += evaluation.dds_calls;
        if (rows) {
            *rows << partition << ',' << i << ',' << evaluation.complete << ',' << evaluation.proven_contract
                << ',' << evaluation.survives_horizon << ',' << evaluation.dd_losses << ',' << evaluation.illegal_instructions
                << ',' << evaluation.coverage_gaps << ',' << evaluation.rejected_proofs << ',' << evaluation.frontier_survivors
                << ',' << evaluation.visited_nodes << ',' << evaluation.dds_calls << ',' << evaluation.cache_hits
                << ',' << elapsed << ',' << mining_seconds_per_layout << ',' << mining_nodes_per_layout << '\n';
        }
        if (witnesses) {
            for (const auto& witness : evaluation.failures)
                write_witness(*witnesses, partition, i, witness.kind == PlanFailureKind::DdLoss ? "dd_loss" : "illegal_instruction",
                    witness.frontier_reason ? frontier_reason(*witness.frontier_reason) : "instruction",
                    witness.node, worlds[i].position, witness.position, witness.path);
            for (const auto& witness : evaluation.coverage_gap_witnesses) {
                auto observed = witness.position;
                play_card(observed, witness.card);
                write_witness(*witnesses, partition, i, "coverage_gap", "missing_observation",
                    witness.node, worlds[i].position, observed, witness.path);
            }
            for (const auto& witness : evaluation.dd_feasible_frontier_witnesses)
                write_witness(*witnesses, partition, i, "dd_feasible", frontier_reason(witness.reason),
                    witness.node, worlds[i].position, witness.position, witness.path);
        }
    }
    summary.milliseconds = std::chrono::duration<double, std::milli>(Clock::now() - start).count();
    return summary;
}
void mining_header(std::ostream& out, const char* prefix) {
    for (const char* field : {"layouts", "completed", "proven", "survived", "losses", "gaps", "partial", "visited", "dds_calls", "ms"})
        out << ',' << prefix << "_mine_" << field;
}
void mining_row(std::ostream& out, const MiningSummary& result) {
    out << ',' << result.layouts << ',' << result.completed << ',' << result.proven << ',' << result.survived
        << ',' << result.losses << ',' << result.gaps << ',' << result.partial << ',' << result.visited
        << ',' << result.dds_calls << ',' << result.milliseconds;
}
int classify(const PlanEvaluation& evaluation) {
    if (evaluation.proven_contract) return 0;
    if (!evaluation.failures.empty()) return evaluation.failures.front().kind == PlanFailureKind::DdLoss ? 2 : 3;
    if (!evaluation.unresolved_frontiers.empty()) return 1;
    return 4;
}
std::array<std::size_t, 5> validate(const std::vector<AlphaMuWorld>& worlds,
    const PlanDag& graph, const AlphaMuConfig& config, double seconds) {
    const auto start = Clock::now();
    std::array<std::size_t, 5> counts {};
    for (const auto& world : worlds) {
        const auto left = seconds - std::chrono::duration<double>(Clock::now() - start).count();
        if (left <= 0) { ++counts[4]; continue; }
        const auto result = evaluate_plan_dag(world.position, graph, config,
            {.max_witnesses = 1, .max_nodes = 2000000, .max_seconds = left, .diagnose_losses = false,
             .frontier_mode = PlanFrontierMode::ReportUnresolved, .max_cached_contexts = 500000});
        ++counts[classify(result)];
    }
    return counts;
}
}

int run_plan_deep_lab(std::vector<AlphaMuWorld> legal_worlds, std::size_t world_count,
    int requested_m, double seconds, std::uint64_t seed, const std::string& output_directory,
    std::optional<Position> actual, const PlanDeepOptions& build_options, bool mine_challengers,
    double mining_seconds_per_layout) {
    constexpr std::size_t holdout_count = 256;
    if (!world_count || world_count > 64 || requested_m < 0 || requested_m > kMaxDeclarerPlies ||
        !std::isfinite(seconds) || seconds <= 0 || !std::isfinite(mining_seconds_per_layout) ||
        mining_seconds_per_layout <= 0 || legal_worlds.size() < world_count + holdout_count) {
        throw std::invalid_argument("invalid deep-plan lab arguments");
    }
    std::mt19937_64 random(seed);
    std::shuffle(legal_worlds.begin(), legal_worlds.end(), random);
    const std::vector<AlphaMuWorld> initial(legal_worlds.begin(), legal_worlds.begin() + world_count);
    const std::vector<AlphaMuWorld> holdout(legal_worlds.begin() + world_count,
        legal_worlds.begin() + world_count + holdout_count);
    AlphaMuConfig config {.declarer = Seat::South, .trump_suit = Suit::Spades, .target_tricks = 12,
        .max_declarer_plies = static_cast<std::uint8_t>(requested_m)};
    config.optimizations.iterative_deepening = false;
    std::cerr << "Building proof-aware M=" << requested_m << " plan on " << world_count << " layouts\n";
    auto options = build_options;
    options.seconds = seconds;
    const auto memory_before = process_memory();
    const auto built = build_deep_plan(initial, config, options);
    const auto memory_after = process_memory(); // Before any validation cache is allocated.
    const auto stats = measure_plan_dag(built.graph);
    const auto covered = coverage(built.graph);
    std::cerr << "Graph ready: nodes=" << built.graph.nodes.size() << " frontiers=" << stats.frontiers
        << " win_proofs=" << stats.win_proofs << " budget_exhausted=" << built.budget_exhausted
        << " stop=" << built.stop_reason << " total_ms=" << built.total_ms
        << " storage_m=" << static_cast<int>(built.completed_storage_plies)
        << " min_frontier_m=" << covered.minimum_frontier_depth
        << " continued_responses=" << covered.continued_responses << '/' << covered.first_responses << '\n';
    // Freeze and export the graph before any validation of unseen layouts.
    if (!output_directory.empty()) {
        std::filesystem::create_directories(output_directory);
        std::ofstream graph(std::filesystem::path(output_directory) / "plan.dag.json");
        write_plan_dag_json(graph, built.graph);
        if (!graph) throw std::runtime_error("could not write frozen deep plan");
        std::ofstream split(std::filesystem::path(output_directory) / "split.csv");
        split << "partition,index,east_mask\n";
        for (std::size_t i = 0; i < initial.size(); ++i) split << "initial," << i << ",0x" << std::hex
            << hand_of(initial[i].position.deal, Seat::East) << std::dec << '\n';
        for (std::size_t i = 0; i < holdout.size(); ++i) split << "holdout," << i << ",0x" << std::hex
            << hand_of(holdout[i].position.deal, Seat::East) << std::dec << '\n';
        if (!split) throw std::runtime_error("could not write deep-plan partition");
    }
    std::cerr << "Checking construction layouts, then frozen holdout, without DDS winning leaves\n";
    const auto training = validate(initial, built.graph, config, seconds);
    const auto heldout = validate(holdout, built.graph, config, seconds);
    int actual_status = 4;
    if (actual) actual_status = classify(evaluate_plan_dag(*actual, built.graph, config,
        {.max_witnesses = 1, .max_nodes = 2000000, .max_seconds = seconds, .diagnose_losses = false,
         .frontier_mode = PlanFrontierMode::ReportUnresolved, .max_cached_contexts = 500000}));
    MiningSummary training_mining, heldout_mining, actual_mining;
    if (mine_challengers) {
        std::cerr << "Mining covered branches with DD frontiers; " << mining_seconds_per_layout
            << " seconds and " << mining_nodes_per_layout << " nodes per layout\n";
        std::ofstream rows, witnesses;
        if (!output_directory.empty()) {
            rows.open(std::filesystem::path(output_directory) / "mining.csv");
            witnesses.open(std::filesystem::path(output_directory) / "witnesses.csv");
            rows << "partition,index,complete,proven_contract,survives_horizon,dd_losses,illegal_instructions,coverage_gaps,rejected_proofs,dd_feasible_frontiers,visited_nodes,dds_calls,cache_hits,elapsed_ms,max_seconds,max_nodes\n";
            witnesses << "partition,index,kind,origin,node,root_east_mask,played_mask,north,east,south,west,trick_leader,trick_cards,ns_score,ew_score,path\n";
        }
        auto* row_output = output_directory.empty() ? nullptr : &rows;
        auto* witness_output = output_directory.empty() ? nullptr : &witnesses;
        training_mining = mine(initial, built.graph, config, "initial", row_output, witness_output, mining_seconds_per_layout);
        heldout_mining = mine(holdout, built.graph, config, "holdout", row_output, witness_output, mining_seconds_per_layout);
        if (actual) actual_mining = mine({AlphaMuWorld{*actual}}, built.graph, config, "actual", row_output, witness_output, mining_seconds_per_layout);
        if (!output_directory.empty() && (!rows || !witnesses)) throw std::runtime_error("could not write mining evidence");
    }
    std::cout << "seed,worlds,requested_m,value_m,value_complete,value_wins,nodes,win_proofs,loss_proofs,frontiers,max_declarer_plies,contexts,context_hits,proof_probes,proof_states,value_ms,construction_ms,total_ms,budget_exhausted,training_proven,training_unresolved,training_loss,training_gap,training_unknown,holdout_proven,holdout_unresolved,holdout_loss,holdout_gap,holdout_unknown,actual,public_proof_cache_hits,stop_reason"
        << ",requested_storage_m,completed_storage_m,storage_horizon_complete,storage_passes,max_contexts,max_nodes,min_frontier_m,first_responses,continued_responses,program_bytes,peak_working_set_before_build,peak_commit_before_build,peak_working_set_after_build,peak_commit_after_build,terminal_ms,value_probe_ms,value_probes,search_claim_ms,mining_seconds_per_layout";
    mining_header(std::cout, "training"); mining_header(std::cout, "holdout"); mining_header(std::cout, "actual");
    std::cout << '\n';
    std::cout << seed << ',' << world_count << ',' << requested_m << ',' << static_cast<int>(built.search_stats.completed_depth)
        << ',' << built.value_complete << ',' << std::popcount(built.selected_wins) << ',' << built.graph.nodes.size()
        << ',' << stats.win_proofs << ',' << stats.loss_proofs << ',' << stats.frontiers << ',' << covered.maximum_depth
        << ',' << built.contexts << ',' << built.context_hits << ',' << built.proof_probes << ',' << built.proof_states
        << ',' << built.value_ms << ',' << built.construction_ms << ',' << built.total_ms << ',' << built.budget_exhausted;
    for (auto count : training) std::cout << ',' << count;
    for (auto count : heldout) std::cout << ',' << count;
    const std::array labels {"proven", "unresolved", "loss", "coverage_gap", "budget_unknown"};
    std::cout << ',' << (actual ? labels[actual_status] : "not_supplied") << ','
        << built.public_proof_cache_hits << ',' << built.stop_reason
        << ',' << (options.max_stored_declarer_plies ? static_cast<int>(*options.max_stored_declarer_plies) : -1)
        << ',' << static_cast<int>(built.completed_storage_plies) << ',' << built.storage_horizon_complete
        << ',' << built.storage_passes << ',' << options.max_contexts << ',' << options.max_nodes
        << ',' << covered.minimum_frontier_depth << ',' << covered.first_responses << ',' << covered.continued_responses
        << ',' << stats.program_bytes << ',' << memory_before.peak_working_set << ',' << memory_before.peak_commit
        << ',' << memory_after.peak_working_set << ',' << memory_after.peak_commit
        << ',' << built.terminal_ms << ',' << built.value_probe_ms << ',' << built.value_probes
        << ',' << built.search_stats.claim_ms << ',' << mining_seconds_per_layout;
    mining_row(std::cout, training_mining); mining_row(std::cout, heldout_mining); mining_row(std::cout, actual_mining);
    std::cout << '\n';
    return 0;
}
} // namespace bridge
