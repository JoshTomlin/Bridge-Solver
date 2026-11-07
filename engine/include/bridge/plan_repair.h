#pragma once

#include "bridge/plan_challenge.h"
#include "bridge/plan_deep.h"

namespace bridge {

// Extracts reachable instructions, reindexes and interns them children-first.
PlanDag plan_continuation(const PlanDag& graph, PlanNodeId root);

// Replaces one occurrence identified by its full public card history. The last
// step may be a missing Observe edge; every earlier step must already exist.
// Shared occurrences outside that history keep their previous instructions.
// The source graph is never modified. Metadata marks a variable horizon.
PlanDag patch_plan_occurrence(const PlanDag& graph,
    const std::vector<AlphaMuPolicyStep>& prefix, const PlanDag& replacement);

struct PlanRepairOptions {
    std::uint8_t local_m {3};
    std::size_t maximum_attempts {8};
    std::size_t maximum_local_worlds {16};
    std::size_t evaluation_nodes {100000};
    double seconds {10};
    std::uint8_t maximum_search_m {6}; // Local search ceiling; never shorten an existing suffix.
    // Opt-in proof-aware reconstruction. maximum_search_m is lookahead, while
    // local_m and the longest existing suffix set minimum unfinished storage.
    // The builder receives at most 60% of the remaining shared time budget.
    bool use_deep_constructor {};
    PlanDeepOptions deep_options {};
};

struct PlanRepairResult {
    PlanDag graph;
    bool accepted {};
    bool reused_continuation {};
    bool changed_at_root {};
    std::size_t attempts {};
    std::size_t local_worlds {}; // Largest local construction sample in this repair.
    std::size_t compatible_worlds {};
    std::size_t validation_worlds {};
    std::size_t unknown_checks {};
    std::size_t rejected_shorter {};
    std::size_t baseline_proofs_checked {};
    std::size_t construction_contexts {};
    std::vector<AlphaMuPolicyStep> repaired_prefix;
    double search_ms {};
    double validation_ms {};
};

// Worlds must be distinct root layouts in the same public information set.
// Patches are proposed using compatible information states, then checked at
// the affected occurrence in every compatible archived layout. No hidden
// layout-specific action is ever added to the executable program.
PlanRepairResult repair_plan_failure(const PlanDag& graph,
    const std::vector<AlphaMuWorld>& archive, std::size_t failing_world,
    const PlanFailureWitness& witness, const AlphaMuConfig& config,
    const PlanRepairOptions& options = {});

PlanRepairResult extend_plan_frontier(const PlanDag& graph,
    const std::vector<AlphaMuWorld>& archive, std::size_t world,
    const PlanFrontierWitness& frontier, const AlphaMuConfig& config,
    const PlanRepairOptions& options = {});

} // namespace bridge
