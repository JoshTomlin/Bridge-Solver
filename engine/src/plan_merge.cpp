#include "bridge/plan_merge.h"

#include <array>
#include <map>
#include <stdexcept>
#include <utility>

namespace bridge {
namespace {

using Branches = std::vector<std::pair<Card, PlanNodeId>>;

void require(bool condition, const char* message) {
    if (!condition) throw std::invalid_argument(message);
}

class Merger {
public:
    Merger(const PlanDag& primary, const PlanDag& fallback)
        : sources_ {&primary, &fallback} {
        result_.graph.declarer = primary.declarer;
        result_.graph.target_tricks = primary.target_tricks;
        result_.graph.completed_m = primary.completed_m;
        result_.graph.variable_horizon = true;
        imported_[0].assign(primary.nodes.size(), kNoPlanNode);
        imported_[1].assign(fallback.nodes.size(), kNoPlanNode);
    }

    PlanMergeResult run() {
        result_.graph.root = merge(sources_[0]->root, sources_[1]->root);
        // The result must remain reachable, children-first, and within the
        // maximum deck depth, even when both independently valid prefixes fit.
        measure_plan_dag(result_.graph);
        return std::move(result_);
    }

private:
    PlanNodeId import(unsigned source_index, PlanNodeId id) {
        auto& mapped = imported_[source_index][id];
        if (mapped != kNoPlanNode) return mapped;
        const auto& source = *sources_[source_index];
        auto instruction = source.nodes[id];
        Branches branches;
        if (instruction.kind == PlanNodeKind::Play) {
            instruction.next = import(source_index, instruction.next);
        } else if (instruction.kind == PlanNodeKind::Observe) {
            branches.reserve(instruction.edge_count);
            for (std::size_t i = 0; i < instruction.edge_count; ++i) {
                const auto& edge = source.edges[instruction.first_edge + i];
                branches.emplace_back(edge.observation, import(source_index, edge.next));
            }
        }
        mapped = intern(instruction, branches);
        return mapped;
    }

    PlanNodeId merge(PlanNodeId primary_id, PlanNodeId fallback_id) {
        const auto pair = std::make_pair(primary_id, fallback_id);
        if (const auto found = merged_.find(pair); found != merged_.end()) return found->second;
        const auto& primary = sources_[0]->nodes[primary_id];
        const auto& fallback = sources_[1]->nodes[fallback_id];
        PlanNodeId result;
        if (primary.kind == PlanNodeKind::Frontier) {
            if (fallback.kind != PlanNodeKind::Frontier) ++result_.filled_frontiers;
            result = import(1, fallback_id);
        } else if (fallback.kind == PlanNodeKind::Frontier ||
            primary.kind == PlanNodeKind::WinProof || primary.kind == PlanNodeKind::LossProof) {
            result = import(0, primary_id);
        } else if (primary.kind != fallback.kind || primary.player != fallback.player ||
            (primary.kind == PlanNodeKind::Play && primary.card != fallback.card)) {
            // Do not align later equal-looking suffixes after a different play:
            // they would be executing in a different public information state.
            ++result_.conflicts;
            result = import(0, primary_id);
        } else if (primary.kind == PlanNodeKind::Play) {
            auto instruction = primary;
            instruction.next = merge(primary.next, fallback.next);
            result = intern(instruction, {});
        } else {
            Branches branches;
            std::size_t p = 0;
            std::size_t f = 0;
            while (p < primary.edge_count || f < fallback.edge_count) {
                const auto* left = p < primary.edge_count
                    ? &sources_[0]->edges[primary.first_edge + p] : nullptr;
                const auto* right = f < fallback.edge_count
                    ? &sources_[1]->edges[fallback.first_edge + f] : nullptr;
                if (left && (!right || left->observation < right->observation)) {
                    branches.emplace_back(left->observation, import(0, left->next));
                    ++p;
                } else if (right && (!left || right->observation < left->observation)) {
                    branches.emplace_back(right->observation, import(1, right->next));
                    ++result_.added_responses;
                    ++f;
                } else {
                    branches.emplace_back(left->observation, merge(left->next, right->next));
                    ++p;
                    ++f;
                }
            }
            result = intern(primary, branches);
        }
        merged_.emplace(pair, result);
        return result;
    }

    PlanNodeId intern(const PlanTreeNode& instruction, const Branches& branches) {
        std::vector<std::uint64_t> key {static_cast<std::uint64_t>(instruction.kind)};
        if (instruction.kind == PlanNodeKind::Play || instruction.kind == PlanNodeKind::Observe) {
            key.push_back(static_cast<std::uint64_t>(instruction.player));
        }
        if (instruction.kind == PlanNodeKind::Play) {
            key.push_back(instruction.card);
            key.push_back(instruction.next);
        } else if (instruction.kind == PlanNodeKind::Observe) {
            for (const auto& [card, child] : branches) {
                key.push_back(card);
                key.push_back(child);
            }
        } else if (instruction.kind == PlanNodeKind::WinProof || instruction.kind == PlanNodeKind::LossProof) {
            key.push_back(static_cast<std::uint64_t>(instruction.proof));
        }
        if (const auto found = interned_.find(key); found != interned_.end()) return found->second;
        auto& graph = result_.graph;
        require(graph.nodes.size() < kNoPlanNode, "merged plan exceeds node index range");
        require(branches.size() < std::numeric_limits<std::uint32_t>::max() - graph.edges.size(),
            "merged plan exceeds edge index range");
        PlanTreeNode node;
        node.kind = instruction.kind;
        node.proof = instruction.proof;
        if (node.kind == PlanNodeKind::Play || node.kind == PlanNodeKind::Observe) {
            node.player = instruction.player;
        }
        if (node.kind == PlanNodeKind::Play) {
            node.card = instruction.card;
            node.next = instruction.next;
        } else if (node.kind == PlanNodeKind::Observe) {
            node.first_edge = static_cast<std::uint32_t>(graph.edges.size());
            node.edge_count = static_cast<std::uint32_t>(branches.size());
            for (const auto& [card, child] : branches) graph.edges.push_back({card, child});
        }
        const auto id = static_cast<PlanNodeId>(graph.nodes.size());
        graph.nodes.push_back(node);
        interned_.emplace(std::move(key), id);
        return id;
    }

    std::array<const PlanDag*, 2> sources_;
    std::array<std::vector<PlanNodeId>, 2> imported_;
    std::map<std::pair<PlanNodeId, PlanNodeId>, PlanNodeId> merged_;
    std::map<std::vector<std::uint64_t>, PlanNodeId> interned_;
    PlanMergeResult result_;
};

}  // namespace

PlanMergeResult merge_plan_prefixes(const PlanDag& primary, const PlanDag& fallback) {
    measure_plan_dag(primary);
    measure_plan_dag(fallback);
    require(primary.declarer == fallback.declarer && primary.target_tricks == fallback.target_tricks,
        "merged plans have different declarer/target metadata");
    return Merger(primary, fallback).run();
}

}  // namespace bridge
