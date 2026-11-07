#include "bridge/plan_repair.h"

#include <algorithm>
#include <map>
#include <stdexcept>
#include <utility>

namespace bridge {
namespace {

void require(bool condition, const char* message) {
    if (!condition) throw std::invalid_argument(message);
}

using Branches = std::vector<std::pair<Card, PlanNodeId>>;

// This builder visits instructions rather than expanding shared histories. Only
// the selected occurrence's ancestors are copied; other imports are memoized.
// Complete keys merge exact continuations across the old and replacement DAGs.
class Builder {
public:
    explicit Builder(const PlanDag& source) {
        graph.declarer = source.declarer;
        graph.target_tricks = source.target_tricks;
        graph.completed_m = source.completed_m;
        graph.variable_horizon = source.variable_horizon;
    }

    PlanNodeId import(const PlanDag& source, PlanNodeId id) {
        auto [entry, inserted] = imported.try_emplace(&source);
        if (inserted) entry->second.assign(source.nodes.size(), kNoPlanNode);
        auto& mapped = entry->second[id];
        if (mapped != kNoPlanNode) return mapped;
        const auto& original = source.nodes[id];
        PlanTreeNode node = original;
        Branches branches;
        if (node.kind == PlanNodeKind::Play) {
            node.next = import(source, node.next);
        } else if (node.kind == PlanNodeKind::Observe) {
            for (std::size_t j = 0; j < node.edge_count; ++j) {
                const auto& edge = source.edges[node.first_edge + j];
                branches.emplace_back(edge.observation, import(source, edge.next));
            }
        }
        mapped = intern(node, branches);
        return mapped;
    }

    PlanNodeId patch(const PlanDag& source, PlanNodeId id,
        const std::vector<AlphaMuPolicyStep>& prefix, std::size_t depth,
        const PlanDag& replacement) {
        if (depth == prefix.size()) return import(replacement, replacement.root);
        const auto& step = prefix[depth];
        const auto& original = source.nodes[id];
        require(original.kind == PlanNodeKind::Play || original.kind == PlanNodeKind::Observe,
            "patch history continues beyond a terminal instruction");
        require(step.player == original.player && is_single_card(step.card) &&
            (step.card & kFullDeck) == step.card, "patch history has an invalid player/card");
        PlanTreeNode node = original;
        Branches branches;
        if (node.kind == PlanNodeKind::Play) {
            require(step.card == node.card, "patch history differs from prescribed action");
            node.next = patch(source, node.next, prefix, depth + 1, replacement);
        } else {
            bool found = false;
            for (std::size_t j = 0; j < node.edge_count; ++j) {
                const auto& edge = source.edges[node.first_edge + j];
                const bool selected = edge.observation == step.card;
                found |= selected;
                branches.emplace_back(edge.observation, selected
                    ? patch(source, edge.next, prefix, depth + 1, replacement)
                    : import(source, edge.next));
            }
            if (!found) {
                require(depth + 1 == prefix.size(),
                    "only the final patch history step may be a missing observation");
                branches.emplace_back(step.card, import(replacement, replacement.root));
                std::sort(branches.begin(), branches.end());
            }
        }
        return intern(node, branches);
    }

    PlanDag finish(PlanNodeId root) {
        graph.root = root;
        // Checks the complete result, including maximum path depth, ownership
        // of every edge, reachability, and the children-first representation.
        measure_plan_dag(graph);
        return std::move(graph);
    }

    PlanDag graph;

private:
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
        if (const auto old = interned.find(key); old != interned.end()) return old->second;
        require(graph.nodes.size() < kNoPlanNode, "patched plan exceeds node index range");
        require(branches.size() < std::numeric_limits<std::uint32_t>::max() -
            graph.edges.size(), "patched plan exceeds edge index range");
        const auto id = static_cast<PlanNodeId>(graph.nodes.size());
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
        graph.nodes.push_back(node);
        interned.emplace(std::move(key), id);
        return id;
    }

    std::map<std::vector<std::uint64_t>, PlanNodeId> interned;
    std::map<const PlanDag*, std::vector<PlanNodeId>> imported;
};

} // namespace

PlanDag plan_continuation(const PlanDag& graph, PlanNodeId root) {
    measure_plan_dag(graph);
    require(root < graph.nodes.size(), "invalid continuation root");
    Builder builder(graph);
    return builder.finish(builder.import(graph, root));
}

PlanDag patch_plan_occurrence(const PlanDag& graph,
    const std::vector<AlphaMuPolicyStep>& prefix, const PlanDag& replacement) {
    measure_plan_dag(graph);
    measure_plan_dag(replacement);
    require(graph.declarer == replacement.declarer &&
        graph.target_tricks == replacement.target_tricks,
        "replacement declarer/target metadata differs");
    require(prefix.size() <= kDeckSize, "patch history exceeds deck depth");
    Builder builder(graph);
    builder.graph.variable_horizon = true;
    return builder.finish(builder.patch(graph, graph.root, prefix, 0, replacement));
}

} // namespace bridge
