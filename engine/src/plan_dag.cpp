#include "bridge/plan_dag.h"

#include <algorithm>
#include <map>
#include <ostream>
#include <stdexcept>
#include <utility>

namespace bridge {
namespace {

bool valid_card(Card card) {
    return is_single_card(card) && (card & kFullDeck) == card;
}

bool valid_seat(Seat player) {
    return player == Seat::North || player == Seat::East ||
        player == Seat::South || player == Seat::West;
}

void require(bool condition, const char* message) {
    if (!condition) throw std::invalid_argument(message);
}

void validate_header(
    std::size_t nodes, std::size_t edges, PlanNodeId root, Seat declarer,
    std::uint8_t target_tricks) {
    require(nodes > 0 && nodes < kNoPlanNode && root < nodes,
        "invalid plan root/node count");
    require(edges < std::numeric_limits<std::uint32_t>::max(),
        "plan edge count exceeds its index range");
    require(valid_seat(declarer) && target_tricks <= kRanksPerSuit,
        "invalid plan metadata");
}

// Require canonical unused fields so a leaf cannot silently hide instructions.
// Proof methods are instructions to recheck, not cached truth values.
void validate_node(
    const PlanTreeNode& node, const std::vector<PlanTreeEdge>& edges,
    std::vector<bool>& used_edges, bool sorted) {
    if (node.kind == PlanNodeKind::Frontier || node.kind == PlanNodeKind::WinProof ||
        node.kind == PlanNodeKind::LossProof) {
        require(node.player == Seat::North && node.card == kNoCard &&
            node.next == kNoPlanNode && node.first_edge == 0 && node.edge_count == 0,
            "plan leaf has nondefault instruction fields");
        require(node.kind == PlanNodeKind::Frontier ? node.proof == PlanProofKind::None :
            node.kind == PlanNodeKind::WinProof ? plan_proof_is_win(node.proof) :
                plan_proof_is_loss(node.proof), "invalid plan proof reason/direction");
        return;
    }
    require(node.proof == PlanProofKind::None, "non-proof instruction has a proof reason");
    require(valid_seat(node.player), "invalid plan player");
    if (node.kind == PlanNodeKind::Play) {
        require(valid_card(node.card), "invalid plan action card");
        require(node.first_edge == 0 && node.edge_count == 0,
            "plan action has nondefault observation fields");
        return;
    }
    require(node.kind == PlanNodeKind::Observe, "invalid plan node kind");
    require(node.card == kNoCard && node.next == kNoPlanNode,
        "plan observation has nondefault action fields");
    const std::size_t first = node.first_edge;
    require(first <= edges.size() && node.edge_count <= edges.size() - first,
        "invalid plan observation edge range");
    require(node.edge_count <= kDeckSize, "too many plan observations");
    Hand seen = kEmptyHand;
    Card previous = kNoCard;
    for (std::size_t j = 0; j < node.edge_count; ++j) {
        const auto index = first + j;
        const Card card = edges[index].observation;
        require(!used_edges[index], "overlapping plan observation edge ranges");
        used_edges[index] = true;
        require(valid_card(card) && !contains(seen, card),
            "invalid or duplicate plan observation");
        require(!sorted || card > previous, "unsorted DAG observations");
        seen |= card;
        previous = card;
    }
}

template <class Visit>
void for_each_child(
    const PlanTreeNode& node, const std::vector<PlanTreeEdge>& edges, Visit visit) {
    if (node.kind == PlanNodeKind::Play) {
        visit(node.next);
    } else if (node.kind == PlanNodeKind::Observe) {
        for (std::size_t j = 0; j < node.edge_count; ++j) {
            visit(edges[static_cast<std::size_t>(node.first_edge) + j].next);
        }
    }
}

void validate_tree(const PlanTree& tree) {
    validate_header(tree.nodes.size(), tree.edges.size(), tree.root,
        tree.declarer, tree.target_tricks);
    require(tree.root == 0 && tree.evidence.size() == tree.nodes.size(),
        "expected a captured plan tree with one evidence record per node");
    std::vector<bool> reached(tree.nodes.size());
    std::vector<bool> used_edges(tree.edges.size());
    std::vector<std::size_t> depths(tree.nodes.size());
    reached[tree.root] = true;
    for (std::size_t i = 0; i < tree.nodes.size(); ++i) {
        require(reached[i], "unreachable plan tree node");
        const auto& node = tree.nodes[i];
        validate_node(node, tree.edges, used_edges, false);
        for_each_child(node, tree.edges, [&](PlanNodeId child) {
            require(child > i && child < tree.nodes.size() && !reached[child],
                "expected forward, unshared plan tree children");
            reached[child] = true;
            depths[child] = depths[i] + 1;
            require(depths[child] <= kDeckSize, "plan tree exceeds deck depth");
        });
    }
    require(std::all_of(used_edges.begin(), used_edges.end(), [](bool used) { return used; }),
        "unreferenced plan tree edge");
}

PlanDagStats validate_dag(const PlanDag& graph) {
    validate_header(graph.nodes.size(), graph.edges.size(), graph.root,
        graph.declarer, graph.target_tricks);
    PlanDagStats stats;
    std::vector<bool> used_edges(graph.edges.size());
    std::vector<std::size_t> depths(graph.nodes.size());
    for (std::size_t i = 0; i < graph.nodes.size(); ++i) {
        const auto& node = graph.nodes[i];
        validate_node(node, graph.edges, used_edges, true);
        switch (node.kind) {
        case PlanNodeKind::Play: ++stats.play_nodes; break;
        case PlanNodeKind::Observe: ++stats.observe_nodes; break;
        case PlanNodeKind::Frontier: ++stats.frontiers; break;
        case PlanNodeKind::WinProof: ++stats.win_proofs; break;
        case PlanNodeKind::LossProof: ++stats.loss_proofs; break;
        }
        for_each_child(node, graph.edges, [&](PlanNodeId child) {
            require(child < i, "DAG children must precede their parent");
            depths[i] = std::max(depths[i], depths[child] + 1);
            ++stats.card_edges;
        });
        require(depths[i] <= kDeckSize, "plan DAG exceeds deck depth");
    }
    require(std::all_of(used_edges.begin(), used_edges.end(), [](bool used) { return used; }),
        "unreferenced plan DAG edge");

    // Descending IDs visit every parent before its children without recursion.
    std::vector<bool> reached(graph.nodes.size());
    reached[graph.root] = true;
    for (std::size_t i = graph.nodes.size(); i-- > 0;) {
        require(reached[i], "unreachable plan DAG node");
        for_each_child(graph.nodes[i], graph.edges,
            [&](PlanNodeId child) { reached[child] = true; });
    }
    stats.program_bytes = graph.nodes.size() * sizeof(PlanTreeNode) +
        graph.edges.size() * sizeof(PlanTreeEdge);
    stats.allocated_program_bytes = graph.nodes.capacity() * sizeof(PlanTreeNode) +
        graph.edges.capacity() * sizeof(PlanTreeEdge);
    return stats;
}

}  // namespace

PlanDagBuild compress_plan_tree(const PlanTree& tree) {
    validate_tree(tree);
    PlanDagBuild result;
    auto& graph = result.graph;
    graph.declarer = tree.declarer;
    graph.target_tricks = tree.target_tricks;
    graph.completed_m = tree.completed_m;
    result.tree_to_dag.resize(tree.nodes.size());
    // A map compares the entire key, never a hash alone. This temporary index
    // is released on return and does not become part of the stored program.
    std::map<std::vector<std::uint64_t>, PlanNodeId> interned;
    for (std::size_t i = tree.nodes.size(); i-- > 0;) {
        const auto& source = tree.nodes[i];
        std::vector<std::uint64_t> key {static_cast<std::uint64_t>(source.kind)};
        std::vector<std::pair<Card, PlanNodeId>> branches;
        if (source.kind == PlanNodeKind::Play || source.kind == PlanNodeKind::Observe) {
            key.push_back(static_cast<std::uint64_t>(source.player));
        }
        if (source.kind == PlanNodeKind::Play) {
            key.push_back(source.card);
            key.push_back(result.tree_to_dag[source.next]);
        } else if (source.kind == PlanNodeKind::Observe) {
            branches.reserve(source.edge_count);
            for (std::size_t j = 0; j < source.edge_count; ++j) {
                const auto& edge = tree.edges[static_cast<std::size_t>(source.first_edge) + j];
                branches.emplace_back(edge.observation, result.tree_to_dag[edge.next]);
            }
            std::sort(branches.begin(), branches.end());
            for (const auto& [card, child] : branches) {
                key.push_back(card);
                key.push_back(child);
            }
        } else if (source.kind == PlanNodeKind::WinProof || source.kind == PlanNodeKind::LossProof) {
            key.push_back(static_cast<std::uint64_t>(source.proof));
        }
        const auto [entry, inserted] = interned.emplace(
            std::move(key), static_cast<PlanNodeId>(graph.nodes.size()));
        result.tree_to_dag[i] = entry->second;
        if (!inserted) continue;

        PlanTreeNode node;
        node.kind = source.kind;
        node.proof = source.proof;
        if (source.kind == PlanNodeKind::Play || source.kind == PlanNodeKind::Observe) {
            node.player = source.player;
        }
        if (source.kind == PlanNodeKind::Play) {
            node.card = source.card;
            node.next = result.tree_to_dag[source.next];
        } else if (source.kind == PlanNodeKind::Observe) {
            node.first_edge = static_cast<std::uint32_t>(graph.edges.size());
            node.edge_count = static_cast<std::uint32_t>(branches.size());
            for (const auto& [card, child] : branches) {
                graph.edges.push_back({card, child});
            }
        }
        // Grow only with distinct nodes/edges, never reserve raw-tree capacity.
        graph.nodes.push_back(node);
    }
    graph.root = result.tree_to_dag[tree.root];
    return result;
}

std::optional<PlanNodeId> advance_plan_dag(
    const PlanDag& graph, PlanNodeId id, Seat player, Card card) {
    const auto& node = graph.nodes.at(id);
    if ((node.kind != PlanNodeKind::Play && node.kind != PlanNodeKind::Observe) ||
        node.player != player || !valid_card(card)) {
        return std::nullopt;
    }
    if (node.kind == PlanNodeKind::Play) {
        return node.card == card ? std::optional(node.next) : std::nullopt;
    }
    require(node.kind == PlanNodeKind::Observe, "invalid plan node kind");
    for (std::size_t j = 0; j < node.edge_count; ++j) {
        const auto& edge = graph.edges.at(static_cast<std::size_t>(node.first_edge) + j);
        if (edge.observation == card) return edge.next;
    }
    return std::nullopt;
}

PlanDagStats measure_plan_dag(const PlanDag& graph) {
    return validate_dag(graph);
}

PlanDagVerification verify_plan_dag(const PlanTree& tree, const PlanDag& graph) {
    validate_tree(tree);
    validate_dag(graph);
    require(tree.declarer == graph.declarer &&
        tree.target_tricks == graph.target_tricks && tree.completed_m == graph.completed_m,
        "tree/DAG metadata mismatch");
    PlanDagVerification verification;
    std::vector<PlanNodeId> corresponding(tree.nodes.size(), kNoPlanNode);
    corresponding[tree.root] = graph.root;
    for (std::size_t i = 0; i < tree.nodes.size(); ++i) {
        const auto& raw = tree.nodes[i];
        const auto& shared = graph.nodes.at(corresponding[i]);
        ++verification.checked_nodes;
        require(raw.kind == shared.kind, "tree/DAG instruction kind mismatch");
        require(raw.proof == shared.proof, "tree/DAG proof reason mismatch");
        if (raw.kind == PlanNodeKind::Frontier) continue;
        if (raw.kind == PlanNodeKind::WinProof || raw.kind == PlanNodeKind::LossProof) continue;
        require(raw.player == shared.player, "tree/DAG player mismatch");
        if (raw.kind == PlanNodeKind::Play) {
            require(raw.card == shared.card, "tree/DAG action card mismatch");
            corresponding[raw.next] = shared.next;
            ++verification.checked_edges;
        } else {
            require(raw.edge_count == shared.edge_count,
                "tree/DAG observation domain mismatch");
            const auto first = graph.edges.begin() + shared.first_edge;
            const auto last = first + shared.edge_count;
            for (std::size_t j = 0; j < raw.edge_count; ++j) {
                const auto& edge = tree.edges[static_cast<std::size_t>(raw.first_edge) + j];
                const auto found = std::lower_bound(first, last, edge.observation,
                    [](const PlanTreeEdge& candidate, Card card) {
                        return candidate.observation < card;
                    });
                require(found != last && found->observation == edge.observation,
                    "tree/DAG observation domain mismatch");
                corresponding[edge.next] = found->next;
                ++verification.checked_edges;
            }
        }
    }
    return verification;
}

void write_plan_dag_json(std::ostream& out, const PlanDag& graph) {
    const auto stats = measure_plan_dag(graph);
    out << "{\n  \"schema_version\": 1,\n  \"representation\": \"shared_dag\",\n"
        << "  \"root\": " << graph.root << ",\n  \"declarer\": \"" << to_string(graph.declarer)
        << "\",\n  \"target_tricks\": " << static_cast<int>(graph.target_tricks)
        << ",\n  \"completed_m\": " << static_cast<int>(graph.completed_m);
    if (graph.variable_horizon) out << ",\n  \"variable_horizon\": true";
    out << ",\n  \"frontier_semantics\": \"unexpanded continuation; not a win certificate\"";
    if (stats.win_proofs || stats.loss_proofs) {
        out << ",\n  \"proof_semantics\": \"recheck the stored proof method in the current execution context; not a cached certificate\"";
    }
    out << ",\n  \"stats\": {\"nodes\": " << graph.nodes.size()
        << ", \"play_nodes\": " << stats.play_nodes
        << ", \"observe_nodes\": " << stats.observe_nodes
        << ", \"frontiers\": " << stats.frontiers;
    if (stats.win_proofs || stats.loss_proofs) {
        out << ", \"win_proofs\": " << stats.win_proofs
            << ", \"loss_proofs\": " << stats.loss_proofs;
    }
    out << ", \"card_edges\": " << stats.card_edges
        << ", \"program_bytes\": " << stats.program_bytes
        << ", \"allocated_program_bytes\": " << stats.allocated_program_bytes
        << "},\n  \"nodes\": [\n";
    for (std::size_t i = 0; i < graph.nodes.size(); ++i) {
        const auto& node = graph.nodes[i];
        out << "    {\"id\": " << i << ", \"kind\": \"";
        if (node.kind == PlanNodeKind::Frontier) {
            out << "frontier\"";
        } else if (node.kind == PlanNodeKind::WinProof || node.kind == PlanNodeKind::LossProof) {
            out << (node.kind == PlanNodeKind::WinProof ? "win_proof" : "loss_proof")
                << "\", \"proof_reason\": \"" << to_string(node.proof) << '"';
        } else if (node.kind == PlanNodeKind::Play) {
            out << "play\", \"player\": \"" << to_string(node.player)
                << "\", \"card\": \"" << to_string(node.card)
                << "\", \"next\": " << node.next;
        } else {
            out << "observe\", \"player\": \"" << to_string(node.player)
                << "\", \"responses\": [";
            for (std::size_t j = 0; j < node.edge_count; ++j) {
                const auto& edge = graph.edges[static_cast<std::size_t>(node.first_edge) + j];
                if (j) out << ',';
                out << "{\"card\": \"" << to_string(edge.observation)
                    << "\", \"next\": " << edge.next << '}';
            }
            out << ']';
        }
        out << '}' << (i + 1 == graph.nodes.size() ? "\n" : ",\n");
    }
    out << "  ]\n}\n";
    if (!out) throw std::runtime_error("failed to write plan DAG JSON");
}

}  // namespace bridge
