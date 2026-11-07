#pragma once

#include "bridge/alpha_mu.h"
#include "bridge/plan_proof.h"

#include <iosfwd>
#include <limits>

namespace bridge {

// Native research representation. It deliberately does not merge any subtrees.
using PlanNodeId = std::uint32_t;
inline constexpr PlanNodeId kNoPlanNode = std::numeric_limits<PlanNodeId>::max();

enum class PlanNodeKind : std::uint8_t { Play, Observe, Frontier, WinProof, LossProof };

struct PlanTreeNode {
    PlanNodeKind kind {PlanNodeKind::Frontier};
    Seat player {Seat::North};
    Card card {kNoCard};
    PlanNodeId next {kNoPlanNode};
    std::uint32_t first_edge {};
    std::uint32_t edge_count {};
    // A proof leaf requests a fresh check in its current execution context.
    // It stores a proof method, never an occurrence's hidden cards or result.
    PlanProofKind proof {PlanProofKind::None};
};

struct PlanTreeEdge {
    Card observation {kNoCard};
    PlanNodeId next {kNoPlanNode};
};

// Sample-dependent evidence is not part of the executable program's identity.
// For Observe children, possible_worlds comes from the corresponding branch.
struct PlanTreeEvidence {
    WorldMask possible_worlds {};
    WorldMask wins {};
};

struct PlanTree {
    PlanNodeId root {};
    Seat declarer {Seat::South};
    std::uint8_t target_tricks {};
    std::uint8_t completed_m {};
    std::vector<PlanTreeNode> nodes;
    std::vector<PlanTreeEdge> edges;
    std::vector<PlanTreeEvidence> evidence;
};

struct PlanTreeStats {
    std::size_t play_nodes {};
    std::size_t observe_nodes {};
    std::size_t frontiers {};
    std::size_t card_edges {};
    std::size_t max_card_plies {};
    std::size_t max_declarer_plies {};
    std::size_t max_defender_fanout {};
    std::size_t program_bytes {};
    std::size_t evidence_bytes {};
    std::size_t allocated_payload_bytes {};
    // Diagnostic only: exact suffix identity, ignoring sample annotations.
    std::size_t unique_subtrees {};
    std::size_t shared_program_bytes_estimate {};
    std::vector<std::size_t> nodes_by_card_depth;
    std::size_t win_proofs {};
    std::size_t loss_proofs {};
};

// Every null policy continuation becomes an explicit Frontier, never a win.
// Even repeated source pointers are copied: this is the uncompressed baseline.
PlanTree capture_plan_tree(
    const AlphaMuResult& result,
    const AlphaMuConfig& config,
    std::size_t max_nodes = 1'000'000);

// Follows exactly one observed/played card. No layout or DDS is consulted.
// Missing observations, mismatching actions/players, and all leaves return nullopt.
std::optional<PlanNodeId> advance_plan_tree(
    const PlanTree& tree, PlanNodeId node, Seat player, Card card);

PlanTreeStats measure_plan_tree(const PlanTree& tree);
void write_plan_tree_json(std::ostream& output, const PlanTree& tree);

}  // namespace bridge
