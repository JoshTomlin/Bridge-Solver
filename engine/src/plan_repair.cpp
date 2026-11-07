#include "bridge/plan_repair.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <set>
#include <stdexcept>
#include <string_view>

namespace bridge {
namespace {
using Clock = std::chrono::steady_clock;
struct BudgetExhausted {};
double elapsed_ms(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}
std::uint8_t won(const Position& p, Seat declarer) {
    return same_side(declarer, Seat::North) ? p.score.north_south : p.score.east_west;
}
bool replay(Position& position, const std::vector<AlphaMuPolicyStep>& path) {
    for (const auto& step : path) {
        if (step.player != next_to_play(position.current_trick) ||
            !is_legal_play(position.current_trick, hand_of(position.deal, step.player), step.card)) return false;
        play_card(position, step.card);
    }
    return true;
}
std::optional<PlanNodeId> follow(const PlanDag& graph, const std::vector<AlphaMuPolicyStep>& path) {
    auto id = graph.root;
    for (const auto& step : path) {
        const auto next = advance_plan_dag(graph, id, step.player, step.card);
        if (!next) return std::nullopt;
        id = *next;
    }
    return id;
}
std::size_t max_choices(const PlanDag& graph) {
    std::vector<std::size_t> depth(graph.nodes.size());
    for (std::size_t i = 0; i < graph.nodes.size(); ++i) {
        const auto& node = graph.nodes[i];
        if (node.kind == PlanNodeKind::Play) depth[i] = 1 + depth[node.next];
        if (node.kind == PlanNodeKind::Observe) {
            for (std::size_t j = 0; j < node.edge_count; ++j) {
                depth[i] = std::max(depth[i], depth[graph.edges[node.first_edge + j].next]);
            }
        }
    }
    return depth[graph.root];
}
std::size_t min_choices(const PlanDag& graph) {
    std::vector<std::size_t> depth(graph.nodes.size());
    for (std::size_t i = 0; i < graph.nodes.size(); ++i) {
        const auto& node = graph.nodes[i];
        // A public terminal needs no further instructions. This is only a
        // structural allowance: check() must revalidate its proof in each
        // concrete execution before a replacement can be accepted.
        if (node.kind == PlanNodeKind::WinProof) depth[i] = kDeckSize;
        if (node.kind == PlanNodeKind::Play) depth[i] = 1 + depth[node.next];
        if (node.kind == PlanNodeKind::Observe && node.edge_count) {
            depth[i] = kDeckSize;
            for (std::size_t j = 0; j < node.edge_count; ++j) depth[i] = std::min(depth[i], depth[graph.edges[node.first_edge + j].next]);
        }
    }
    return depth[graph.root];
}

class Repair {
public:
    Repair(const PlanDag& graph, const std::vector<AlphaMuWorld>& archive,
        std::size_t failing, const AlphaMuConfig& config, const PlanRepairOptions& options)
        : original_(graph), archive_(archive), failing_(failing), config_(config), options_(options), start_(Clock::now()) {
        if (archive.empty() || failing >= archive.size() || options.maximum_attempts == 0 ||
            options.maximum_local_worlds == 0 || options.maximum_local_worlds > 64 ||
            options.local_m == 0 || options.local_m > kMaxDeclarerPlies ||
            options.maximum_search_m < options.local_m || options.maximum_search_m > kMaxDeclarerPlies ||
            options.evaluation_nodes == 0 || !std::isfinite(options.seconds) || options.seconds <= 0 ||
            graph.declarer != config.declarer || graph.target_tricks != config.target_tricks) {
            throw std::invalid_argument("invalid local plan repair arguments");
        }
        if (options.use_deep_constructor &&
            (!std::isfinite(options.deep_options.seconds) || options.deep_options.seconds <= 0 ||
             options.deep_options.max_nodes == 0 || options.deep_options.max_contexts == 0 ||
             (options.deep_options.max_stored_declarer_plies &&
              *options.deep_options.max_stored_declarer_plies > kMaxDeclarerPlies))) {
            throw std::invalid_argument("invalid deep local plan repair budgets");
        }
        measure_plan_dag(graph);
        result_.graph = graph;
    }

    PlanRepairResult run(std::vector<AlphaMuPolicyStep> prefix, bool missing, bool deepen) {
        try {
            if (missing) {
                if (prefix.empty()) throw std::invalid_argument("missing observation has no history");
                auto parent_path = prefix;
                const auto observation = parent_path.back(); parent_path.pop_back();
                const auto parent = follow(original_, parent_path);
                if (!parent || original_.nodes[*parent].kind != PlanNodeKind::Observe ||
                    original_.nodes[*parent].player != observation.player ||
                    advance_plan_dag(original_, *parent, observation.player, observation.card)) {
                    throw std::invalid_argument("repair is not a missing observation");
                }
                if (!compatible(prefix)) return std::move(result_);
                set_baseline(prefix);
                const auto& node = original_.nodes[*parent];
                std::set<PlanNodeId> tried;
                // Failed copies must not consume every attempt before fresh
                // search gets a chance. A one-attempt budget goes to search.
                const auto reuse_limit = options_.maximum_attempts / 2;
                for (std::size_t j = 0; j < node.edge_count && result_.attempts < reuse_limit; ++j) {
                    const auto child = original_.edges[node.first_edge + j].next;
                    if (!tried.insert(child).second || original_.nodes[child].kind == PlanNodeKind::Frontier) continue;
                    auto candidate = plan_continuation(original_, child);
                    std::size_t consumed = 0;
                    for (const auto& step : prefix) consumed += same_side(step.player, config_.declarer);
                    const auto required = options_.use_deep_constructor ? options_.local_m :
                        (consumed < original_.completed_m ? original_.completed_m - consumed : 0);
                    if (min_choices(candidate) < required) continue;
                    ++result_.attempts;
                    if (check(candidate) == compatible_.size()) {
                        accept(prefix, candidate, true);
                        return std::move(result_);
                    }
                }
            }
            for (;;) {
                remaining();
                const auto existing = follow(original_, prefix);
                if (!missing && !existing) throw std::invalid_argument("local repair history is not in the plan");
                if (compatible(prefix)) {
                    set_baseline(prefix);
                    std::size_t horizon = options_.local_m;
                    if (existing) horizon = std::max(horizon, max_choices(plan_continuation(original_, *existing)));
                    // Missing branches must at least preserve the initial fixed
                    // horizon, even when the copied sibling has a short terminal.
                    std::size_t consumed = 0;
                    for (const auto& step : prefix) consumed += same_side(step.player, config_.declarer);
                    if (!options_.use_deep_constructor && original_.completed_m > consumed) {
                        horizon = std::max(horizon, original_.completed_m - consumed);
                    }
                    if (horizon <= options_.maximum_search_m && search(prefix, static_cast<std::uint8_t>(horizon))) {
                        return std::move(result_);
                    }
                }
                // Failed frontier deepening is left unresolved. Failure repairs
                // may need to revisit an earlier declarer choice, up to root.
                if (deepen || prefix.empty() || !can_attempt()) break;
                bool found = false;
                while (!prefix.empty()) {
                    const auto last = prefix.back(); prefix.pop_back();
                    if (same_side(last.player, config_.declarer)) { found = true; break; }
                }
                missing = false;
                if (!found) break;
            }
        } catch (const BudgetExhausted&) { ++result_.unknown_checks; }
        return std::move(result_);
    }

private:
    double remaining() const {
        const double value = options_.seconds - elapsed_ms(start_) / 1000.0;
        if (value <= 0) throw BudgetExhausted{};
        return value;
    }
    bool can_attempt() const { return result_.attempts < options_.maximum_attempts; }

    void set_baseline(const std::vector<AlphaMuPolicyStep>& prefix) {
        baseline_.reset();
        if (!options_.use_deep_constructor) return;
        if (const auto node = follow(original_, prefix)) {
            baseline_ = plan_continuation(original_, *node);
        }
        baseline_proven_.assign(compatible_.size(), std::nullopt);
    }

    bool compatible(const std::vector<AlphaMuPolicyStep>& prefix) {
        compatible_.clear();
        compatible_indices_.clear();
        // Check the challenger first, so all local searches retain its constraint.
        for (std::size_t offset = 0; offset < archive_.size(); ++offset) {
            const auto i = (failing_ + offset) % archive_.size();
            Position position = archive_[i].position;
            if (replay(position, prefix)) {
                compatible_.push_back({position});
                compatible_indices_.push_back(i);
            }
        }
        result_.compatible_worlds = compatible_.size();
        return !compatible_.empty() && compatible_indices_.front() == failing_;
    }

    std::size_t check(const PlanDag& candidate) {
        const auto start = Clock::now();
        std::size_t failed = compatible_.size();
        try {
            for (std::size_t i = 0; i < compatible_.size(); ++i) {
                const auto evaluation = evaluate_plan_dag(compatible_[i].position, candidate, config_, {
                    .max_witnesses = 1, .max_nodes = options_.evaluation_nodes,
                    .max_seconds = remaining(), .diagnose_losses = false});
                ++result_.validation_worlds;
                if (!evaluation.survives_horizon) {
                    if (evaluation.failures.empty()) ++result_.unknown_checks;
                    failed = i; break;
                }
                if (options_.use_deep_constructor && baseline_ && !evaluation.proven_contract) {
                    if (!baseline_proven_[i]) {
                        const auto prior = evaluate_plan_dag(compatible_[i].position, *baseline_, config_, {
                            .max_witnesses = 1, .max_nodes = options_.evaluation_nodes,
                            .max_seconds = remaining(), .diagnose_losses = false,
                            .frontier_mode = PlanFrontierMode::ReportUnresolved});
                        ++result_.baseline_proofs_checked;
                        if (!prior.complete && prior.failures.empty() && prior.unresolved_frontiers.empty()) {
                            ++result_.unknown_checks;
                            failed = i; break;
                        }
                        baseline_proven_[i] = prior.proven_contract;
                    }
                    if (*baseline_proven_[i]) { failed = i; break; }
                }
            }
        } catch (...) {
            result_.validation_ms += elapsed_ms(start);
            throw;
        }
        result_.validation_ms += elapsed_ms(start);
        return failed;
    }

    std::shared_ptr<const AlphaMuPolicyNode> construct(
        const std::vector<AlphaMuWorld>& worlds, AlphaMuConfig config, std::size_t defender_depth = 0) {
        remaining();
        const auto& position = worlds.front().position;
        if (is_deal_finished(position) || won(position, config.declarer) >= config.target_tricks) return nullptr;
        const auto player = next_to_play(position.current_trick);
        if (same_side(player, config.declarer)) {
            config.max_search_seconds = remaining();
            config.hard_time_limit = true;
            config.build_trick_policy = true;
            config.limit_policy_to_current_trick = false;
            config.optimizations.iterative_deepening = false;
            config.world_weights.clear(); config.critical_worlds = 0;
            const auto searched = alpha_mu_search(worlds, config);
            if (searched.stats.completed_depth != config.max_declarer_plies) throw BudgetExhausted{};
            return searched.trick_policy;
        }
        if (defender_depth >= kDeckSize) throw std::logic_error("non-advancing local defender prefix");
        Hand observations = 0;
        for (const auto& world : worlds) {
            if (next_to_play(world.position.current_trick) != player) throw std::invalid_argument("inconsistent public repair state");
            observations |= legal_plays(world.position.current_trick, hand_of(world.position.deal, player));
        }
        auto node = std::make_shared<AlphaMuPolicyNode>();
        node->player = player;
        for (int bit = kDeckSize - 1; bit >= 0; --bit) {
            const Card card = Card{1} << bit;
            if (!contains(observations, card)) continue;
            std::vector<AlphaMuWorld> children;
            for (auto world : worlds) {
                if (!is_legal_play(world.position.current_trick, hand_of(world.position.deal, player), card)) continue;
                play_card(world.position, card); children.push_back(world);
            }
            node->defender_branches.push_back({card, 0, construct(children, config, defender_depth + 1)});
        }
        return node;
    }

    bool search(const std::vector<AlphaMuPolicyStep>& prefix, std::uint8_t horizon) {
        std::vector<std::size_t> selected;
        const auto first_count = std::min({std::size_t{10}, options_.maximum_local_worlds, compatible_.size()});
        for (std::size_t i = 0; i < first_count; ++i) selected.push_back(i);
        while (can_attempt()) {
            ++result_.attempts;
            result_.local_worlds = std::max(result_.local_worlds, selected.size());
            std::vector<AlphaMuWorld> sample;
            for (auto index : selected) sample.push_back(compatible_[index]);
            auto config = config_;
            config.max_declarer_plies = options_.use_deep_constructor ? options_.maximum_search_m : horizon;
            const auto start = Clock::now();
            AlphaMuResult searched;
            PlanDag candidate;
            try {
                if (options_.use_deep_constructor) {
                    config.optimizations.iterative_deepening = false;
                    config.world_weights.clear(); config.critical_worlds = 0;
                    auto budget = options_.deep_options;
                    budget.seconds = std::min(budget.seconds, remaining() * 0.6);
                    auto built = build_deep_plan(sample, config, budget);
                    result_.construction_contexts += built.contexts;
                    candidate = std::move(built.graph);
                } else {
                    searched.trick_policy = construct(sample, config);
                    searched.stats.completed_depth = horizon;
                    candidate = compress_plan_tree(capture_plan_tree(searched, config)).graph;
                }
            } catch (const std::runtime_error& error) {
                result_.search_ms += elapsed_ms(start);
                if (std::string_view(error.what()).find("hard deadline expired") != std::string_view::npos) throw BudgetExhausted{};
                throw;
            } catch (...) { result_.search_ms += elapsed_ms(start); throw; }
            result_.search_ms += elapsed_ms(start);
            remaining();
            if (options_.use_deep_constructor && min_choices(candidate) < horizon) {
                // A short budgeted prefix cannot erase the known losing play
                // and then pass validation solely because DDS likes its leaf.
                ++result_.rejected_shorter;
                return false;
            }
            const auto failed = check(candidate);
            if (failed == compatible_.size()) { accept(prefix, candidate, false); return true; }
            if (selected.size() >= options_.maximum_local_worlds ||
                std::find(selected.begin(), selected.end(), failed) != selected.end()) return false;
            // A counterexample to this local continuation becomes a retained
            // construction constraint for its next attempt.
            selected.push_back(failed);
        }
        return false;
    }

    void accept(const std::vector<AlphaMuPolicyStep>& prefix, const PlanDag& candidate, bool reused) {
        remaining();
        result_.graph = patch_plan_occurrence(original_, prefix, candidate);
        result_.accepted = true;
        result_.reused_continuation = reused;
        result_.changed_at_root = prefix.empty();
        result_.repaired_prefix = prefix;
    }

    const PlanDag& original_;
    const std::vector<AlphaMuWorld>& archive_;
    std::size_t failing_;
    const AlphaMuConfig& config_;
    const PlanRepairOptions& options_;
    Clock::time_point start_;
    PlanRepairResult result_;
    std::vector<AlphaMuWorld> compatible_;
    std::vector<std::size_t> compatible_indices_;
    std::optional<PlanDag> baseline_;
    std::vector<std::optional<bool>> baseline_proven_;
};
}

PlanRepairResult repair_plan_failure(const PlanDag& graph,
    const std::vector<AlphaMuWorld>& archive, std::size_t failing_world,
    const PlanFailureWitness& witness, const AlphaMuConfig& config,
    const PlanRepairOptions& options) {
    auto prefix = witness.path;
    const bool missing = witness.kind == PlanFailureKind::MissingObservation;
    if (!missing && witness.card != kNoCard && !prefix.empty() && prefix.back().card == witness.card) prefix.pop_back();
    return Repair(graph, archive, failing_world, config, options).run(std::move(prefix), missing, false);
}

PlanRepairResult extend_plan_frontier(const PlanDag& graph,
    const std::vector<AlphaMuWorld>& archive, std::size_t world,
    const PlanFrontierWitness& frontier, const AlphaMuConfig& config,
    const PlanRepairOptions& options) {
    const auto node = follow(graph, frontier.path);
    if (!node || *node != frontier.node ||
        (graph.nodes[*node].kind != PlanNodeKind::Frontier &&
         graph.nodes[*node].kind != PlanNodeKind::WinProof && graph.nodes[*node].kind != PlanNodeKind::LossProof)) {
        throw std::invalid_argument("extension is not at the specified frontier");
    }
    return Repair(graph, archive, world, config, options).run(frontier.path, false, true);
}
} // namespace bridge
