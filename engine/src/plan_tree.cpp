#include "bridge/plan_tree.h"

#include <algorithm>
#include <iomanip>
#include <map>
#include <ostream>
#include <sstream>
#include <stdexcept>

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

void validate_node(const PlanTreeNode& node) {
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
}

std::string hex_mask(WorldMask mask) {
    std::ostringstream text;
    text << "0x" << std::hex << mask;
    return text.str();
}

}  // namespace

PlanTree capture_plan_tree(
    const AlphaMuResult& result,
    const AlphaMuConfig& config,
    std::size_t max_nodes) {
    if (max_nodes == 0 || max_nodes >= kNoPlanNode) {
        throw std::invalid_argument("plan tree node limit is out of range");
    }
    PlanTree tree;
    tree.declarer = config.declarer;
    tree.target_tricks = config.target_tricks;
    tree.completed_m = result.stats.completed_depth;
    const auto copy = [&](auto&& self,
                          const std::shared_ptr<const AlphaMuPolicyNode>& source,
                          std::size_t depth,
                          WorldMask possible) -> PlanNodeId {
        if (depth > kDeckSize || tree.nodes.size() >= max_nodes) {
            throw std::length_error("plan tree exceeds capture depth/node limit");
        }
        const auto id = static_cast<PlanNodeId>(tree.nodes.size());
        tree.nodes.emplace_back();
        tree.evidence.push_back({possible, source ? source->outcome.wins : 0});
        if (!source) return id;

        tree.nodes[id].player = source->player;
        if (same_side(source->player, config.declarer)) {
            if (!valid_card(source->declarer_move)) {
                throw std::invalid_argument("plan contains an invalid declarer card");
            }
            tree.nodes[id].kind = PlanNodeKind::Play;
            tree.nodes[id].card = source->declarer_move;
            const PlanNodeId child = self(
                self, source->continuation, depth + 1,
                source->continuation ? source->continuation->possible_worlds : possible);
            tree.nodes[id].next = child;
        } else {
            tree.nodes[id].kind = PlanNodeKind::Observe;
            const auto first = static_cast<std::uint32_t>(tree.edges.size());
            const auto count = source->defender_branches.size();
            if (count > kDeckSize) {
                throw std::invalid_argument("too many defender observations");
            }
            tree.nodes[id].first_edge = first;
            tree.nodes[id].edge_count = static_cast<std::uint32_t>(count);
            tree.edges.resize(tree.edges.size() + count);
            Hand seen = kEmptyHand;
            for (std::size_t i = 0; i < count; ++i) {
                const auto& branch = source->defender_branches[i];
                if (!valid_card(branch.card) || contains(seen, branch.card)) {
                    throw std::invalid_argument("invalid or duplicate defender observation");
                }
                seen |= branch.card;
                const PlanNodeId child = self(
                    self, branch.continuation, depth + 1, branch.possible_worlds);
                tree.edges[first + i] = {branch.card, child};
            }
        }
        return id;
    };
    tree.root = copy(copy, result.trick_policy, 0,
        result.trick_policy ? result.trick_policy->possible_worlds : 0);
    return tree;
}

std::optional<PlanNodeId> advance_plan_tree(
    const PlanTree& tree, PlanNodeId id, Seat player, Card card) {
    const PlanTreeNode& node = tree.nodes.at(id);
    if ((node.kind != PlanNodeKind::Play && node.kind != PlanNodeKind::Observe) ||
        node.player != player || !valid_card(card)) {
        return std::nullopt;
    }
    if (node.kind == PlanNodeKind::Play) {
        return node.card == card ? std::optional(node.next) : std::nullopt;
    }
    for (std::size_t i = 0; i < node.edge_count; ++i) {
        const auto& edge = tree.edges.at(node.first_edge + i);
        if (edge.observation == card) return edge.next;
    }
    return std::nullopt;
}

PlanTreeStats measure_plan_tree(const PlanTree& tree) {
    PlanTreeStats stats;
    if (tree.nodes.empty() || tree.root != 0 ||
        tree.evidence.size() != tree.nodes.size()) {
        throw std::invalid_argument("invalid captured plan tree");
    }
    require(tree.nodes.size() < kNoPlanNode &&
        tree.edges.size() < std::numeric_limits<std::uint32_t>::max() &&
        valid_seat(tree.declarer) && tree.target_tricks <= kRanksPerSuit,
        "invalid plan tree metadata");
    std::vector<std::size_t> depths(tree.nodes.size());
    std::vector<std::size_t> max_depths(tree.nodes.size());
    std::vector<bool> reached(tree.nodes.size());
    std::vector<bool> used_edges(tree.edges.size());
    reached[tree.root] = true;
    for (std::size_t i = 0; i < tree.nodes.size(); ++i) {
        if (!reached[i]) throw std::invalid_argument("unreachable plan node");
        const auto& node = tree.nodes[i];
        validate_node(node);
        const auto depth = depths[i];
        require(depth <= kDeckSize, "plan tree exceeds deck depth");
        if (stats.nodes_by_card_depth.size() <= depth) {
            stats.nodes_by_card_depth.resize(depth + 1);
        }
        ++stats.nodes_by_card_depth[depth];
        stats.max_card_plies = std::max(stats.max_card_plies, depth);
        stats.max_declarer_plies = std::max(stats.max_declarer_plies, max_depths[i]);
        const auto visit = [&](PlanNodeId child, bool max_move) {
            if (child <= i || child >= tree.nodes.size() || reached[child]) {
                throw std::invalid_argument("expected a forward, unshared plan tree");
            }
            reached[child] = true;
            depths[child] = depth + 1;
            max_depths[child] = max_depths[i] + (max_move ? 1 : 0);
            ++stats.card_edges;
        };
        switch (node.kind) {
        case PlanNodeKind::Play:
            ++stats.play_nodes;
            visit(node.next, true);
            break;
        case PlanNodeKind::Observe:
            ++stats.observe_nodes;
            stats.max_defender_fanout = std::max<std::size_t>(
                stats.max_defender_fanout, node.edge_count);
            {
                const std::size_t first = node.first_edge;
                require(first <= tree.edges.size() && node.edge_count <= tree.edges.size() - first &&
                    node.edge_count <= kDeckSize, "invalid plan observation edge range");
                Hand seen = kEmptyHand;
                for (std::size_t j = 0; j < node.edge_count; ++j) {
                    const auto index = first + j;
                    const auto& edge = tree.edges[index];
                    require(!used_edges[index], "overlapping plan observation edge ranges");
                    used_edges[index] = true;
                    require(valid_card(edge.observation) && !contains(seen, edge.observation),
                        "invalid or duplicate plan observation");
                    seen |= edge.observation;
                    visit(edge.next, false);
                }
            }
            break;
        case PlanNodeKind::Frontier:
            ++stats.frontiers;
            break;
        case PlanNodeKind::WinProof:
            ++stats.win_proofs;
            break;
        case PlanNodeKind::LossProof:
            ++stats.loss_proofs;
            break;
        }
    }
    require(std::all_of(used_edges.begin(), used_edges.end(), [](bool used) { return used; }),
        "unreferenced plan tree edge");

    // Children have larger IDs. Bottom-up interning counts exact repeated
    // programs without modifying the raw tree. Branch order is immaterial.
    std::map<std::vector<std::uint64_t>, std::size_t> interned;
    std::vector<std::size_t> signatures(tree.nodes.size());
    for (std::size_t i = tree.nodes.size(); i-- > 0;) {
        const auto& node = tree.nodes[i];
        std::vector<std::uint64_t> key {static_cast<std::uint64_t>(node.kind)};
        if (node.kind == PlanNodeKind::Play || node.kind == PlanNodeKind::Observe) {
            key.push_back(static_cast<std::uint64_t>(node.player));
        }
        if (node.kind == PlanNodeKind::Play) {
            key.push_back(node.card);
            key.push_back(signatures[node.next]);
        } else if (node.kind == PlanNodeKind::Observe) {
            std::vector<std::pair<Card, std::size_t>> branches;
            for (std::size_t j = 0; j < node.edge_count; ++j) {
                const auto& edge = tree.edges.at(node.first_edge + j);
                branches.emplace_back(edge.observation, signatures[edge.next]);
            }
            std::sort(branches.begin(), branches.end());
            for (const auto& [card, signature] : branches) {
                key.push_back(card);
                key.push_back(signature);
            }
        } else if (node.kind == PlanNodeKind::WinProof || node.kind == PlanNodeKind::LossProof) {
            key.push_back(static_cast<std::uint64_t>(node.proof));
        }
        const auto [entry, inserted] = interned.emplace(std::move(key), interned.size());
        signatures[i] = entry->second;
        if (inserted) {
            stats.shared_program_bytes_estimate += sizeof(PlanTreeNode);
            if (node.kind == PlanNodeKind::Observe) {
                stats.shared_program_bytes_estimate += node.edge_count * sizeof(PlanTreeEdge);
            }
        }
    }
    stats.unique_subtrees = interned.size();
    stats.program_bytes = tree.nodes.size() * sizeof(PlanTreeNode) +
        tree.edges.size() * sizeof(PlanTreeEdge);
    stats.evidence_bytes = tree.evidence.size() * sizeof(PlanTreeEvidence);
    stats.allocated_payload_bytes = tree.nodes.capacity() * sizeof(PlanTreeNode) +
        tree.edges.capacity() * sizeof(PlanTreeEdge) +
        tree.evidence.capacity() * sizeof(PlanTreeEvidence);
    return stats;
}

void write_plan_tree_json(std::ostream& out, const PlanTree& tree) {
    const auto stats = measure_plan_tree(tree);
    out << "{\n  \"schema_version\": 1,\n  \"representation\": \"uncompressed_tree\",\n"
        << "  \"root\": " << tree.root << ",\n  \"declarer\": \"" << to_string(tree.declarer)
        << "\",\n  \"target_tricks\": " << static_cast<int>(tree.target_tricks)
        << ",\n  \"completed_m\": " << static_cast<int>(tree.completed_m)
        << ",\n  \"frontier_semantics\": \"unexpanded continuation; not a win certificate\"";
    if (stats.win_proofs || stats.loss_proofs) {
        out << ",\n  \"proof_semantics\": \"recheck the stored proof method in the current execution context; not a cached certificate\"";
    }
    out << ",\n  \"stats\": {\"nodes\": " << tree.nodes.size()
        << ", \"card_edges\": " << stats.card_edges
        << ", \"unique_subtrees\": " << stats.unique_subtrees
        << ", \"program_bytes\": " << stats.program_bytes
        << ", \"evidence_bytes\": " << stats.evidence_bytes
        << ", \"shared_program_bytes_estimate\": " << stats.shared_program_bytes_estimate;
    if (stats.win_proofs || stats.loss_proofs) {
        out << ", \"win_proofs\": " << stats.win_proofs
            << ", \"loss_proofs\": " << stats.loss_proofs;
    }
    out << "},\n  \"nodes_by_card_depth\": [";
    for (std::size_t i = 0; i < stats.nodes_by_card_depth.size(); ++i) {
        if (i) out << ',';
        out << stats.nodes_by_card_depth[i];
    }
    out << "],\n  \"nodes\": [\n";
    for (std::size_t i = 0; i < tree.nodes.size(); ++i) {
        const auto& node = tree.nodes[i];
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
                const auto& edge = tree.edges.at(node.first_edge + j);
                if (j) out << ',';
                out << "{\"card\": \"" << to_string(edge.observation)
                    << "\", \"next\": " << edge.next << '}';
            }
            out << ']';
        }
        // Strings preserve all 64 bits in JavaScript JSON consumers.
        out << ", \"possible_worlds\": \"" << hex_mask(tree.evidence[i].possible_worlds)
            << "\", \"sampled_wins\": \"" << hex_mask(tree.evidence[i].wins) << "\"}"
            << (i + 1 == tree.nodes.size() ? "\n" : ",\n");
    }
    out << "  ]\n}\n";
    if (!out) throw std::runtime_error("failed to write plan tree JSON");
}

}  // namespace bridge
