#pragma once

#include "bridge/plan_tree.h"

namespace bridge {

// Immutable executable instructions only. Game state and sample-dependent
// evidence belong to each execution, not to these shared nodes.
// Every child has a smaller ID than its parent. Observation edges are sorted
// by the exact card value; different cards are never collapsed into one edge.
struct PlanDag {
    PlanNodeId root {};
    Seat declarer {Seat::South};
    std::uint8_t target_tricks {};
    std::uint8_t completed_m {};
    // After local edits, completed_m records the initial construction horizon;
    // individual continuations can now end at different declarer depths.
    bool variable_horizon {false};
    std::vector<PlanTreeNode> nodes;
    std::vector<PlanTreeEdge> edges;
};

struct PlanDagBuild {
    PlanDag graph;
    // Diagnostic provenance only; callers may discard this after verification.
    // Different raw occurrences can share instructions without sharing beliefs.
    std::vector<PlanNodeId> tree_to_dag;
};

// Validates the captured tree, then interns complete instruction keys bottom-up.
// Equality includes every exact observation and its complete continuation.
PlanDagBuild compress_plan_tree(const PlanTree& tree);

// Follows one card without consulting hidden cards, evidence, search, or DDS.
// A missing observation, mismatching action/player, or leaf returns nullopt.
std::optional<PlanNodeId> advance_plan_dag(
    const PlanDag& graph, PlanNodeId node, Seat player, Card card);

struct PlanDagStats {
    std::size_t play_nodes {};
    std::size_t observe_nodes {};
    std::size_t frontiers {};
    std::size_t card_edges {};
    std::size_t program_bytes {};
    std::size_t allocated_program_bytes {};
    std::size_t win_proofs {};
    std::size_t loss_proofs {};
};

// Both byte counts cover the node/edge vectors only. Allocated bytes use their
// actual capacities; neither count includes allocator headers, build indexes,
// the diagnostic mapping, nor the original tree/evidence.
PlanDagStats measure_plan_dag(const PlanDag& graph);

struct PlanDagVerification {
    std::size_t checked_nodes {};
    std::size_t checked_edges {};
};

// Checks every raw occurrence, including occurrences that share a DAG node.
// Throws invalid_argument on malformed input or different instructions/metadata.
// This proves storage equivalence, not bridge legality or contract success.
PlanDagVerification verify_plan_dag(const PlanTree& tree, const PlanDag& graph);

void write_plan_dag_json(std::ostream& output, const PlanDag& graph);

}  // namespace bridge
