#include "bridge/plan_refinement_lab.h"
#include "bridge/plan_challenge.h"
#include "bridge/plan_repair.h"
#include "bridge/dds_solver.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <numeric>
#include <random>
#include <set>
#include <sstream>
#include <stdexcept>

namespace bridge {
namespace {
using Clock = std::chrono::steady_clock;
double milliseconds(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}
double remaining(Clock::time_point start, double budget) {
    return std::max(0.0, budget - milliseconds(start) / 1000.0);
}
std::uint8_t score(const Position& p, Seat declarer) {
    return same_side(declarer, Seat::North) ? p.score.north_south : p.score.east_west;
}
std::string quote(const std::string& text) {
    std::string result = "\"";
    for (char c : text) { if (c == '"') result += '"'; result += c; }
    return result + '"';
}
std::string source_name(PlanChallengeSource source) {
    switch (source) {
    case PlanChallengeSource::Random: return "random";
    case PlanChallengeSource::Structural: return "structural";
    case PlanChallengeSource::Targeted: return "targeted";
    }
    throw std::logic_error("unknown challenge source");
}
std::string kind_name(PlanFailureKind kind) {
    switch (kind) {
    case PlanFailureKind::MissingObservation: return "missing_observation";
    case PlanFailureKind::IllegalInstruction: return "illegal_instruction";
    case PlanFailureKind::DdLoss: return "dd_loss";
    }
    throw std::logic_error("unknown failure kind");
}
std::string path_text(const std::vector<AlphaMuPolicyStep>& path) {
    std::string text;
    for (const auto& step : path) {
        if (!text.empty()) text += ' ';
        text += to_string(step.player) + ":" + to_string(step.card);
    }
    return text;
}
struct BuiltPlan {
    AlphaMuResult search;
    PlanDag dag;
};
BuiltPlan build(const std::vector<AlphaMuWorld>& worlds, AlphaMuConfig config,
    std::size_t probability_count) {
    if (worlds.empty() || worlds.size() > 64 || probability_count > worlds.size()) {
        throw std::invalid_argument("invalid refinement active set");
    }
    config.world_weights.assign(worlds.size(), 0.0);
    for (std::size_t i = 0; i < probability_count; ++i) config.world_weights[i] = 1.0;
    for (std::size_t i = probability_count; i < worlds.size(); ++i) {
        config.critical_worlds |= WorldMask{1} << i;
    }
    config.weighted_score_tolerance = 0.005;
    BuiltPlan result;
    result.search = alpha_mu_search(worlds, config);
    if (result.search.stats.completed_depth != config.max_declarer_plies) {
        throw std::runtime_error("refinement search did not complete requested M");
    }
    const auto tree = capture_plan_tree(result.search, config);
    result.dag = compress_plan_tree(tree).graph;
    verify_plan_dag(tree, result.dag);
    return result;
}

// A controlled reference for the old selection idea, not a second invocation
// of AlphaMu2's different initial-set/weighting pipeline. It sees the same
// candidates, only their first failure, and deduplicates exact path + root DD.
std::vector<std::size_t> first_failure_reference(
    const std::vector<PlanChallengeCandidate>& candidates, std::size_t maximum) {
    std::vector<std::size_t> order(candidates.size());
    std::iota(order.begin(), order.end(), 0);
    std::stable_sort(order.begin(), order.end(), [&](auto a, auto b) {
        const auto& x = candidates[a].evaluation.failures;
        const auto& y = candidates[b].evaluation.failures;
        const bool x_gap = !x.empty() && x.front().kind != PlanFailureKind::DdLoss;
        const bool y_gap = !y.empty() && y.front().kind != PlanFailureKind::DdLoss;
        return x_gap > y_gap;
    });
    std::set<std::vector<std::uint64_t>> seen;
    std::set<std::size_t> worlds;
    std::vector<std::size_t> selected;
    for (auto index : order) {
        if (selected.size() == maximum) break;
        const auto& c = candidates[index];
        if (c.evaluation.failures.empty() || worlds.contains(c.pool_index)) continue;
        std::vector<std::uint64_t> key(c.root_profile.begin(), c.root_profile.end());
        key.push_back(UINT64_MAX);
        for (const auto& step : c.evaluation.failures.front().path) {
            key.push_back(seat_index(step.player)); key.push_back(step.card);
        }
        if (!seen.insert(std::move(key)).second) continue;
        worlds.insert(c.pool_index);
        selected.push_back(index);
    }
    return selected;
}

// 0 = horizon survivor, 1 = demonstrated loss, 2 = coverage gap, 3 = budget unknown.
int classify(const PlanEvaluation& result) {
    for (const auto& failure : result.failures) {
        if (failure.kind == PlanFailureKind::DdLoss) return 1;
    }
    if (!result.failures.empty()) return 2;
    return result.survives_horizon ? 0 : 3;
}
struct Validation {
    std::vector<int> outcomes;
    std::array<std::size_t, 4> counts {};
    double ms {};
};
Validation validate(const std::vector<AlphaMuWorld>& worlds, const PlanDag& dag,
    const AlphaMuConfig& config, double seconds) {
    const auto start = Clock::now();
    Validation result;
    for (const auto& world : worlds) {
        const double left = remaining(start, seconds);
        int status = 3;
        if (left > 0) {
            status = classify(evaluate_plan_dag(world.position, dag, config,
                {.max_witnesses = 1, .max_nodes = 1000000,
                 .max_seconds = left, .diagnose_losses = false}));
        }
        result.outcomes.push_back(status);
        ++result.counts[status];
    }
    result.ms = milliseconds(start);
    return result;
}
}

int run_plan_refinement_lab(std::vector<AlphaMuWorld> legal_worlds,
    int max_m, std::uint64_t seed, std::size_t batches, std::size_t batch_size,
    double stage_seconds, const std::string& output_directory,
    bool audit_all, std::optional<Position> actual) {
    constexpr std::size_t initial_count = 30, holdout_count = 256, promotions = 8;
    if (max_m < 1 || max_m > kMaxDeclarerPlies || !std::isfinite(stage_seconds) ||
        stage_seconds <= 0 || batches == 0 || batches > 64 ||
        batch_size == 0 || batch_size > 4096 ||
        legal_worlds.size() < initial_count + holdout_count + batch_size) {
        throw std::invalid_argument("invalid refinement lab sizes, M, or seconds");
    }
    if (!output_directory.empty()) std::filesystem::create_directories(output_directory);
    std::mt19937_64 random(seed);
    std::shuffle(legal_worlds.begin(), legal_worlds.end(), random);
    const std::vector<AlphaMuWorld> active(legal_worlds.begin(), legal_worlds.begin() + initial_count);
    const std::vector<AlphaMuWorld> holdout(legal_worlds.begin() + initial_count,
        legal_worlds.begin() + initial_count + holdout_count);
    const std::vector<AlphaMuWorld> pool(legal_worlds.begin() + initial_count + holdout_count,
        legal_worlds.end());
    AlphaMuConfig config {
        .declarer = Seat::South, .trump_suit = Suit::Spades, .target_tricks = 12,
        .max_declarer_plies = static_cast<std::uint8_t>(max_m),
        .build_trick_policy = true, .max_search_seconds = stage_seconds,
        .hard_time_limit = true, .limit_policy_to_current_trick = false,
    };
    config.optimizations.iterative_deepening = false;
    std::cerr << "Building initial plan on " << active.size() << " layouts\n";
    auto initial = build(active, config, initial_count);
    std::vector<PlanChallengeCandidate> candidates;
    std::vector<std::size_t> used;
    std::vector<AlphaMuWorld> mutation_seeds = active;
    std::vector<PlanFailureWitness> targets;
    std::array<std::size_t, 3> source_counts {};
    std::size_t screened = 0, impossible = 0, unknown = 0, witnesses = 0;
    const auto mining_start = Clock::now();
    for (std::size_t batch = 0; batch < batches && remaining(mining_start, stage_seconds) > 0; ++batch) {
        auto draws = draw_plan_challengers(pool, mutation_seeds, targets, used,
            batch_size, seed + batch + 1);
        if (draws.empty() || remaining(mining_start, stage_seconds) <= 0) break;
        std::vector<Position> positions;
        for (const auto& draw : draws) positions.push_back(pool[draw.index].position);
        const auto scores = double_dummy_move_scores_batch(positions, config.declarer);
        for (std::size_t i = 0; i < draws.size(); ++i) {
            if (remaining(mining_start, stage_seconds) <= 0) break;
            const auto draw = draws[i];
            used.push_back(draw.index);
            ++screened;
            ++source_counts[static_cast<std::size_t>(draw.source)];
            auto ordered = scores[i];
            std::sort(ordered.begin(), ordered.end(), [](const auto& a, const auto& b) {
                return a.card < b.card;
            });
            if (std::none_of(ordered.begin(), ordered.end(), [&](const auto& value) {
                return score(positions[i], config.declarer) + value.future_tricks >= config.target_tricks;
            })) { ++impossible; continue; }
            const double evaluation_left = remaining(mining_start, stage_seconds);
            if (evaluation_left <= 0) { ++unknown; break; }
            auto evaluation = evaluate_plan_dag(positions[i], initial.dag, config,
                {.max_witnesses = 3, .max_nodes = 100000,
                 .max_seconds = evaluation_left, .diagnose_losses = true});
            if (evaluation.failures.empty()) {
                if (!evaluation.complete) ++unknown;
                continue;
            }
            witnesses += evaluation.failures.size();
            PlanChallengeCandidate candidate {
                .pool_index = draw.index, .source = draw.source, .root = positions[i],
                .evaluation = std::move(evaluation),
            };
            for (const auto& value : ordered) candidate.root_profile.push_back(value.future_tricks);
            candidates.push_back(std::move(candidate));
        }
        // Refresh guidance from diverse failures instead of letting the first
        // few failed deals monopolise every later targeted batch.
        targets.clear();
        mutation_seeds = active;
        for (auto index : select_plan_counterexamples(candidates, active, 12)) {
            mutation_seeds.push_back(pool[candidates[index].pool_index]);
            for (const auto& witness : candidates[index].evaluation.failures) targets.push_back(witness);
        }
        std::cerr << "Batch " << batch + 1 << ": " << screened << " layouts, "
            << candidates.size() << " failing layouts, " << witnesses << " witnesses\n";
    }
    const double mining_ms = milliseconds(mining_start);
    auto reference = first_failure_reference(candidates, promotions);
    auto diverse = select_plan_counterexamples(candidates, active, promotions);
    const std::vector<std::vector<std::size_t>> selections {{}, reference, diverse};
    const std::array<std::string, 3> names {"initial", "first_failure_reference", "diverse"};
    if (!output_directory.empty()) {
        std::ofstream out(std::filesystem::path(output_directory) / "selected.csv");
        out << "method,pool_index,source,witness,kind,diagnosed,player,card,making_cards,path,east,west\n";
        for (std::size_t method = 1; method < names.size(); ++method) {
            for (auto index : selections[method]) {
                const auto& candidate = candidates.at(index);
                for (std::size_t w = 0; w < candidate.evaluation.failures.size(); ++w) {
                    const auto& failure = candidate.evaluation.failures[w];
                    out << names[method] << ',' << candidate.pool_index << ','
                        << source_name(candidate.source) << ',' << w << ',' << kind_name(failure.kind)
                        << ',' << failure.diagnosed_choice << ',' << to_string(next_to_play(failure.position.current_trick))
                        << ',' << (failure.card ? to_string(failure.card) : "") << ','
                        << quote(format_card_list(failure.making_moves)) << ',' << quote(path_text(failure.path))
                        << ',' << quote(format_hand(hand_of(candidate.root.deal, Seat::East)))
                        << ',' << quote(format_hand(hand_of(candidate.root.deal, Seat::West))) << '\n';
                }
            }
        }
        if (!out) throw std::runtime_error("could not write selected counterexamples");
        std::ofstream split(std::filesystem::path(output_directory) / "split.csv");
        split << "partition,index,east_mask\n";
        const auto write_split = [&](const char* label, const auto& worlds) {
            for (std::size_t i = 0; i < worlds.size(); ++i) {
                split << label << ',' << i << ",0x" << std::hex
                    << hand_of(worlds[i].position.deal, Seat::East) << std::dec << '\n';
            }
        };
        write_split("initial", active); write_split("holdout", holdout); write_split("candidate_pool", pool);
        if (!split) throw std::runtime_error("could not write refinement split");
    }
    // The holdout is used for the first time here, after selection is frozen.
    std::vector<Position> holdout_positions;
    for (const auto& world : holdout) holdout_positions.push_back(world.position);
    // The move-score wrapper chunks arbitrary input sizes to DDS's board limit.
    const auto holdout_dd = double_dummy_move_scores_batch(holdout_positions, config.declarer);
    std::vector<AlphaMuWorld> makeable_holdout;
    for (std::size_t i = 0; i < holdout.size(); ++i) {
        if (std::any_of(holdout_dd[i].begin(), holdout_dd[i].end(), [&](const auto& value) {
            return score(holdout[i].position, config.declarer) + value.future_tricks >= config.target_tricks;
        })) {
            makeable_holdout.push_back(holdout[i]);
        }
    }
    std::cout << "method,seed,m,active,selected,selected_features,dag_nodes,search_ms,policy_build_ms,"
        "mining_ms,screened,dd_impossible,mining_unknown,failing_layouts,witnesses,random,structural,targeted,"
        "holdout,holdout_makeable,horizon_pass,dd_loss,coverage_gap,budget_unknown,repairs,regressions,"
        "holdout_ms,promoted_survivors,promoted_total";
    if (audit_all) std::cout << ",oracle_count,oracle_pass,oracle_dd_loss,oracle_gap,oracle_unknown,oracle_ms,actual_status,actual_path,actual_failure";
    std::cout << '\n';
    Validation baseline;
    for (std::size_t method = 0; method < names.size(); ++method) {
        std::vector<AlphaMuWorld> search_worlds = active, promoted;
        std::set<std::vector<std::uint64_t>> features;
        for (auto index : selections[method]) {
            search_worlds.push_back(pool.at(candidates.at(index).pool_index));
            promoted.push_back(search_worlds.back());
            for (auto feature : plan_failure_features(candidates[index])) features.insert(std::move(feature));
        }
        std::cerr << "Evaluating " << names[method] << " with " << search_worlds.size() << " active layouts\n";
        BuiltPlan rebuilt;
        const BuiltPlan* plan = &initial;
        if (method > 0 && !selections[method].empty()) {
            rebuilt = build(search_worlds, config, initial_count);
            plan = &rebuilt;
        }
        const auto validation = validate(makeable_holdout, plan->dag, config, stage_seconds);
        const auto repaired = validate(promoted, plan->dag, config, stage_seconds);
        Validation audit;
        std::optional<PlanEvaluation> actual_evaluation;
        if (audit_all) {
            std::cerr << "Auditing " << names[method] << " on all " << legal_worlds.size() << " legal layouts\n";
            audit = validate(legal_worlds, plan->dag, config, stage_seconds);
            if (actual) actual_evaluation = evaluate_plan_dag(*actual, plan->dag, config,
                {.max_witnesses = 1, .max_nodes = 1000000,
                 .max_seconds = stage_seconds, .diagnose_losses = true});
        }
        std::size_t repairs = 0, regressions = 0;
        if (method == 0) baseline = validation;
        else for (std::size_t i = 0; i < validation.outcomes.size(); ++i) {
            if ((baseline.outcomes[i] == 1 || baseline.outcomes[i] == 2) && validation.outcomes[i] == 0) ++repairs;
            if (baseline.outcomes[i] == 0 && (validation.outcomes[i] == 1 || validation.outcomes[i] == 2)) ++regressions;
        }
        std::cout << names[method] << ',' << seed << ',' << max_m << ',' << search_worlds.size() << ','
            << selections[method].size() << ',' << features.size() << ',' << plan->dag.nodes.size() << ','
            << plan->search.stats.tree_search_ms << ',' << plan->search.stats.policy_build_ms << ',' << mining_ms
            << ',' << screened << ',' << impossible << ',' << unknown << ',' << candidates.size() << ',' << witnesses
            << ',' << source_counts[0] << ',' << source_counts[1] << ',' << source_counts[2]
            << ',' << holdout.size() << ',' << makeable_holdout.size();
        for (auto count : validation.counts) std::cout << ',' << count;
        std::cout << ',' << repairs << ',' << regressions << ',' << validation.ms << ','
            << repaired.counts[0] << ',' << promoted.size();
        if (audit_all) {
            std::cout << ',' << legal_worlds.size();
            for (auto count : audit.counts) std::cout << ',' << count;
            std::cout << ',' << audit.ms << ',';
            if (actual_evaluation) {
                const std::array<const char*, 4> labels {"horizon_survivor", "dd_loss", "coverage_gap", "unknown"};
                std::cout << labels[classify(*actual_evaluation)] << ',';
                if (!actual_evaluation->failures.empty()) {
                    const auto& failure = actual_evaluation->failures.front();
                    std::cout << quote(path_text(failure.path)) << ',' << kind_name(failure.kind);
                } else std::cout << ',';
            } else std::cout << "not_supplied,,";
        }
        std::cout << '\n';
        std::cout.flush();
        if (!output_directory.empty()) {
            std::ofstream out(std::filesystem::path(output_directory) / (names[method] + ".dag.json"));
            write_plan_dag_json(out, plan->dag);
        }
    }
    return 0;
}

int run_plan_persistent_lab(std::vector<AlphaMuWorld> legal_worlds,
    int initial_m, std::uint64_t seed, std::size_t rounds, std::size_t batch_size,
    double stage_seconds, const std::string& output_directory) {
    constexpr std::size_t initial_count = 10, holdout_count = 256;
    if (initial_m < 1 || initial_m > kMaxDeclarerPlies || rounds == 0 || rounds > 8 ||
        batch_size == 0 || batch_size > 1024 || !std::isfinite(stage_seconds) || stage_seconds <= 0 ||
        legal_worlds.size() < initial_count + holdout_count + batch_size) {
        throw std::invalid_argument("invalid persistent-plan experiment arguments");
    }
    if (!output_directory.empty()) std::filesystem::create_directories(output_directory);
    std::mt19937_64 random(seed);
    std::shuffle(legal_worlds.begin(), legal_worlds.end(), random);
    const std::vector<AlphaMuWorld> initial_worlds(legal_worlds.begin(), legal_worlds.begin() + initial_count);
    const std::vector<AlphaMuWorld> holdout(legal_worlds.begin() + initial_count,
        legal_worlds.begin() + initial_count + holdout_count);
    const std::vector<AlphaMuWorld> pool(legal_worlds.begin() + initial_count + holdout_count, legal_worlds.end());
    if (!output_directory.empty()) {
        std::ofstream split(std::filesystem::path(output_directory) / "split.csv");
        split << "partition,index,east_mask\n";
        const auto write_split = [&](const char* label, const auto& worlds) {
            for (std::size_t i = 0; i < worlds.size(); ++i) {
                split << label << ',' << i << ",0x" << std::hex
                    << hand_of(worlds[i].position.deal, Seat::East) << std::dec << '\n';
            }
        };
        write_split("initial", initial_worlds); write_split("holdout", holdout); write_split("candidate_pool", pool);
        if (!split) throw std::runtime_error("could not write persistent-plan split");
    }
    AlphaMuConfig config {.declarer = Seat::South, .trump_suit = Suit::Spades, .target_tricks = 12,
        .max_declarer_plies = static_cast<std::uint8_t>(initial_m), .build_trick_policy = true,
        .max_search_seconds = stage_seconds, .hard_time_limit = true, .limit_policy_to_current_trick = false};
    config.optimizations.iterative_deepening = false;
    std::cerr << "Constructing M=" << initial_m << " plan on ten layouts\n";
    const auto initial_start = Clock::now();
    auto initial = build(initial_worlds, config, initial_count);
    struct Snapshot {
        std::string name;
        PlanDag graph;
        std::size_t archive {}, patches {}, reused {}, deepened {}, attempted {}, local_max {};
        double work_ms {}, search_ms {}, local_validation_ms {};
    };
    std::vector<Snapshot> snapshots;
    snapshots.push_back({.name = "initial", .graph = initial.dag, .archive = initial_count,
        .work_ms = milliseconds(initial_start),
        .search_ms = initial.search.stats.tree_search_ms + initial.search.stats.policy_build_ms});
    auto graph = initial.dag;
    auto archive = initial_worlds;
    std::vector<std::size_t> used;
    std::map<std::size_t, std::size_t> archive_indices;
    std::vector<AlphaMuWorld> draw_seeds = initial_worlds;
    std::vector<PlanFailureWitness> targets;
    std::vector<AlphaMuWorld> rebuild_worlds = initial_worlds;
    std::set<std::size_t> rebuild_indices;
    std::ofstream events, archive_log;
    if (!output_directory.empty()) {
        events.open(std::filesystem::path(output_directory) / "repairs.csv");
        events << "round,kind,archive_index,accepted,reused,root_replaced,attempts,local_worlds,compatible_worlds,checks,unknown_checks,search_ms,validation_ms,path\n";
        archive_log.open(std::filesystem::path(output_directory) / "archive.csv");
        archive_log << "round,archive_index,pool_index,source,east_mask\n";
        for (std::size_t i = 0; i < initial_worlds.size(); ++i) {
            archive_log << "0," << i << ",,initial,0x" << std::hex
                << hand_of(initial_worlds[i].position.deal, Seat::East) << std::dec << '\n';
        }
        if (!events || !archive_log) throw std::runtime_error("could not open persistent-plan traces");
    }
    for (std::size_t round = 0; round < rounds; ++round) {
        const auto started = Clock::now();
        Snapshot snapshot {.name = "local_round_" + std::to_string(round + 1)};
        const auto draws = draw_plan_challengers(pool, draw_seeds, targets, used, batch_size, seed + round + 1);
        std::vector<Position> positions;
        for (const auto& draw : draws) positions.push_back(pool[draw.index].position);
        if (remaining(started, stage_seconds) <= 0) break;
        const auto profiles = double_dummy_move_scores_batch(positions, config.declarer);
        std::vector<PlanChallengeCandidate> candidates;
        for (std::size_t i = 0; i < draws.size(); ++i) {
            used.push_back(draws[i].index);
            // DD-impossible worlds cannot provide a repairable challenge.
            if (std::none_of(profiles[i].begin(), profiles[i].end(), [&](const auto& value) {
                return score(positions[i], config.declarer) + value.future_tricks >= config.target_tricks;
            })) continue;
            archive_indices[draws[i].index] = archive.size();
            if (archive_log.is_open()) archive_log << round + 1 << ',' << archive.size() << ','
                << draws[i].index << ',' << source_name(draws[i].source) << ",0x" << std::hex
                << hand_of(pool[draws[i].index].position.deal, Seat::East) << std::dec << '\n';
            archive.push_back(pool[draws[i].index]);
        }
        for (std::size_t i = 0; i < draws.size(); ++i) {
            const double left = remaining(started, stage_seconds);
            if (left <= 0) break;
            if (!archive_indices.contains(draws[i].index)) continue;
            auto evaluation = evaluate_plan_dag(positions[i], graph, config,
                {.max_witnesses = 2, .max_nodes = 100000, .max_seconds = left, .diagnose_losses = true});
            if (evaluation.failures.empty()) continue;
            PlanChallengeCandidate candidate {.pool_index = draws[i].index, .source = draws[i].source,
                .root = positions[i], .evaluation = std::move(evaluation)};
            auto ordered = profiles[i];
            std::sort(ordered.begin(), ordered.end(), [](auto a, auto b) { return a.card < b.card; });
            for (const auto& value : ordered) candidate.root_profile.push_back(value.future_tricks);
            candidates.push_back(std::move(candidate));
        }
        const auto selected = select_plan_counterexamples(candidates, initial_worlds, 8);
        targets.clear(); draw_seeds = initial_worlds;
        for (auto index : selected) {
            const auto& candidate = candidates[index];
            const auto archive_index = archive_indices.at(candidate.pool_index);
            draw_seeds.push_back(pool[candidate.pool_index]);
            for (const auto& failure : candidate.evaluation.failures) targets.push_back(failure);
            if (rebuild_indices.insert(candidate.pool_index).second && rebuild_worlds.size() < 64) rebuild_worlds.push_back(pool[candidate.pool_index]);
            const double left = remaining(started, stage_seconds);
            if (left <= 0) break;
            // Graph IDs and failures can change after each accepted patch.
            auto current = evaluate_plan_dag(archive[archive_index].position, graph, config,
                {.max_witnesses = 1, .max_nodes = 100000, .max_seconds = left, .diagnose_losses = true});
            if (current.failures.empty()) continue;
            const double repair_left = remaining(started, stage_seconds);
            if (repair_left <= 0) break;
            const auto repair = repair_plan_failure(graph, archive, archive_index, current.failures.front(), config,
                {.local_m = 3, .maximum_attempts = 8, .maximum_local_worlds = 16,
                 .evaluation_nodes = 100000, .seconds = std::min(5.0, repair_left)});
            snapshot.attempted += repair.attempts;
            snapshot.local_max = std::max(snapshot.local_max, repair.local_worlds);
            snapshot.search_ms += repair.search_ms;
            snapshot.local_validation_ms += repair.validation_ms;
            if (repair.accepted) {
                graph = repair.graph; ++snapshot.patches;
                snapshot.reused += repair.reused_continuation;
            }
            if (events.is_open()) events << round + 1 << ",failure," << archive_index << ',' << repair.accepted
                << ',' << repair.reused_continuation << ',' << repair.changed_at_root << ',' << repair.attempts
                << ',' << repair.local_worlds << ',' << repair.compatible_worlds << ',' << repair.validation_worlds
                << ',' << repair.unknown_checks << ',' << repair.search_ms << ',' << repair.validation_ms
                << ',' << quote(path_text(repair.repaired_prefix)) << '\n';
        }
        // Spend a bounded slice on depth even while other branches lack breadth.
        const double left = remaining(started, stage_seconds);
        const auto deepen_world = round % initial_count;
        if (left > 0) {
            const auto frontier = evaluate_plan_dag(archive[deepen_world].position, graph, config,
                {.max_witnesses = 1, .max_nodes = 100000, .max_seconds = left, .diagnose_losses = false,
                 .frontier_mode = PlanFrontierMode::ReportUnresolved});
            const double deepen_left = remaining(started, stage_seconds);
            if (!frontier.unresolved_frontiers.empty() && deepen_left > 0) {
                const auto repair = extend_plan_frontier(graph, archive, deepen_world,
                    frontier.unresolved_frontiers.front(), config,
                    {.local_m = 3, .maximum_attempts = 8, .maximum_local_worlds = 16,
                     .evaluation_nodes = 100000, .seconds = std::min(5.0, deepen_left)});
                snapshot.attempted += repair.attempts;
                snapshot.local_max = std::max(snapshot.local_max, repair.local_worlds);
                snapshot.search_ms += repair.search_ms;
                snapshot.local_validation_ms += repair.validation_ms;
                if (repair.accepted) { graph = repair.graph; ++snapshot.deepened; }
                if (events.is_open()) events << round + 1 << ",frontier," << deepen_world << ',' << repair.accepted
                    << ',' << repair.reused_continuation << ',' << repair.changed_at_root << ',' << repair.attempts
                    << ',' << repair.local_worlds << ',' << repair.compatible_worlds << ',' << repair.validation_worlds
                    << ',' << repair.unknown_checks << ',' << repair.search_ms << ',' << repair.validation_ms
                    << ',' << quote(path_text(repair.repaired_prefix)) << '\n';
            }
        }
        snapshot.graph = graph; snapshot.archive = archive.size(); snapshot.work_ms = milliseconds(started);
        std::cerr << "Round " << round + 1 << ": archive=" << archive.size() << " failures=" << candidates.size()
            << " patches=" << snapshot.patches << " reused=" << snapshot.reused << " deepened=" << snapshot.deepened
            << " graph=" << graph.nodes.size() << " work_ms=" << snapshot.work_ms << '\n';
        snapshots.push_back(std::move(snapshot));
    }
    if (events.is_open() && !events) throw std::runtime_error("could not write repair trace");
    if (archive_log.is_open() && !archive_log) throw std::runtime_error("could not write archive trace");
    // A control rebuilt at the original depth using the SAME selected layouts.
    // It does not see the holdout, and added challenges carry no probability mass.
    std::cerr << "Constructing full-rebuild control on " << rebuild_worlds.size() << " layouts\n";
    const auto rebuild_start = Clock::now();
    const auto rebuilt = build(rebuild_worlds, config, initial_count);
    snapshots.push_back({.name = "full_rebuild_control", .graph = rebuilt.dag, .archive = rebuild_worlds.size(),
        .work_ms = milliseconds(rebuild_start), .search_ms = rebuilt.search.stats.tree_search_ms + rebuilt.search.stats.policy_build_ms});

    std::cout << "stage,seed,initial_m,archive,nodes,min_frontier_m,max_frontier_m,patches,reused,deepened,attempts,max_local_worlds,"
        "work_ms,search_ms,local_validation_ms,holdout,horizon_pass,dd_loss,gap,unknown,repairs,regressions,validation_ms,"
        "strict_proven,strict_unresolved,strict_failure,strict_budget_unknown\n";
    Validation baseline;
    for (const auto& snapshot : snapshots) {
        std::cerr << "Validating frozen " << snapshot.name << " on " << holdout.size() << " untouched layouts\n";
        const auto validation = validate(holdout, snapshot.graph, config, stage_seconds);
        std::size_t repairs = 0, regressions = 0;
        if (snapshot.name == "initial") baseline = validation;
        else for (std::size_t i = 0; i < validation.outcomes.size(); ++i) {
            if ((baseline.outcomes[i] == 1 || baseline.outcomes[i] == 2) && validation.outcomes[i] == 0) ++repairs;
            if (baseline.outcomes[i] == 0 && (validation.outcomes[i] == 1 || validation.outcomes[i] == 2)) ++regressions;
        }
        std::array<std::size_t, 4> strict {};
        const auto strict_start = Clock::now();
        for (const auto& world : holdout) {
            const double left = remaining(strict_start, stage_seconds);
            if (left <= 0) { ++strict[3]; continue; }
            const auto check = evaluate_plan_dag(world.position, snapshot.graph, config,
                {.max_witnesses = 1, .max_nodes = 100000, .max_seconds = left, .diagnose_losses = false,
                 .frontier_mode = PlanFrontierMode::ReportUnresolved});
            if (check.proven_contract) ++strict[0];
            else if (!check.failures.empty()) ++strict[2];
            else if (!check.unresolved_frontiers.empty()) ++strict[1];
            else ++strict[3];
        }
        std::vector<std::size_t> min_depth(snapshot.graph.nodes.size()), max_depth(min_depth.size());
        for (std::size_t i = 0; i < min_depth.size(); ++i) {
            const auto& node = snapshot.graph.nodes[i];
            if (node.kind == PlanNodeKind::Play) { min_depth[i] = min_depth[node.next] + 1; max_depth[i] = max_depth[node.next] + 1; }
            if (node.kind == PlanNodeKind::Observe && node.edge_count) {
                min_depth[i] = kDeckSize;
                for (std::size_t j = 0; j < node.edge_count; ++j) {
                    const auto child = snapshot.graph.edges[node.first_edge + j].next;
                    min_depth[i] = std::min(min_depth[i], min_depth[child]);
                    max_depth[i] = std::max(max_depth[i], max_depth[child]);
                }
            }
        }
        std::cout << snapshot.name << ',' << seed << ',' << initial_m << ',' << snapshot.archive << ',' << snapshot.graph.nodes.size()
            << ',' << min_depth[snapshot.graph.root] << ',' << max_depth[snapshot.graph.root] << ',' << snapshot.patches
            << ',' << snapshot.reused << ',' << snapshot.deepened << ',' << snapshot.attempted << ',' << snapshot.local_max
            << ',' << snapshot.work_ms << ',' << snapshot.search_ms << ',' << snapshot.local_validation_ms << ',' << holdout.size();
        for (auto count : validation.counts) std::cout << ',' << count;
        std::cout << ',' << repairs << ',' << regressions << ',' << validation.ms;
        for (auto count : strict) std::cout << ',' << count;
        std::cout << '\n'; std::cout.flush();
        if (!output_directory.empty()) {
            std::ofstream out(std::filesystem::path(output_directory) / (snapshot.name + ".dag.json"));
            write_plan_dag_json(out, snapshot.graph);
        }
    }
    return 0;
}
} // namespace bridge
