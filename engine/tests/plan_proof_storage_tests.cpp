#include "bridge/plan_repair.h"

#include <array>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace {
using namespace bridge;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

template <class Action>
void rejects(Action action) {
    try { action(); }
    catch (const std::invalid_argument&) { return; }
    throw std::runtime_error("invalid proof program was accepted");
}

Card card(const char* name) { return parse_card(name).value(); }

PlanTreeNode proof(PlanNodeKind kind, PlanProofKind reason) {
    PlanTreeNode node;
    node.kind = kind;
    node.proof = reason;
    return node;
}

PlanTree leaf_tree(PlanNodeKind kind, PlanProofKind reason) {
    PlanTree tree;
    tree.declarer = Seat::South;
    tree.target_tricks = 6;
    tree.completed_m = 12;
    tree.nodes.push_back(proof(kind, reason));
    tree.evidence.emplace_back();
    return tree;
}

std::string json(const PlanDag& graph) {
    std::ostringstream output;
    write_plan_dag_json(output, graph);
    return output.str();
}

void test_reason_identity_and_occurrence_evidence() {
    PlanTree tree;
    tree.target_tricks = 6;
    tree.nodes.push_back(PlanTreeNode {
        .kind = PlanNodeKind::Observe, .player = Seat::East, .edge_count = 8,
    });
    const std::array leaves {
        proof(PlanNodeKind::WinProof, PlanProofKind::DeclarerClaim),
        proof(PlanNodeKind::WinProof, PlanProofKind::DeclarerClaim),
        proof(PlanNodeKind::WinProof, PlanProofKind::DeclarerQuickTricks),
        proof(PlanNodeKind::WinProof, PlanProofKind::TargetReached),
        proof(PlanNodeKind::LossProof, PlanProofKind::DdsLoss),
        proof(PlanNodeKind::LossProof, PlanProofKind::DefenderQuickTricks),
        proof(PlanNodeKind::LossProof, PlanProofKind::TargetImpossible),
        PlanTreeNode {},
    };
    const std::array cards {"S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"};
    tree.evidence.push_back({255, 15});
    for (std::size_t i = 0; i < leaves.size(); ++i) {
        tree.nodes.push_back(leaves[i]);
        tree.edges.push_back({card(cards[i]), static_cast<PlanNodeId>(i + 1)});
        tree.evidence.push_back({WorldMask {1} << i, i < 4 ? WorldMask {1} << i : 0});
    }

    const auto built = compress_plan_tree(tree);
    const auto raw_stats = measure_plan_tree(tree);
    const auto stats = measure_plan_dag(built.graph);
    require(raw_stats.win_proofs == 4 && raw_stats.loss_proofs == 3 && raw_stats.frontiers == 1,
        "tree did not distinguish proof directions and unresolved frontier");
    require(stats.win_proofs == 3 && stats.loss_proofs == 3 && stats.frontiers == 1 &&
        stats.observe_nodes == 1 && built.graph.nodes.size() == 8,
        "proof method identity was not retained during interning");
    require(raw_stats.unique_subtrees == built.graph.nodes.size() &&
        raw_stats.shared_program_bytes_estimate == stats.program_bytes,
        "tree subtree accounting differs from proof DAG storage");
    require(built.tree_to_dag[1] == built.tree_to_dag[2],
        "identical proof instructions with different evidence should share");
    require(built.tree_to_dag[1] != built.tree_to_dag[3] &&
        built.tree_to_dag[5] != built.tree_to_dag[6],
        "different proof methods must not share");
    const auto verified = verify_plan_dag(tree, built.graph);
    require(verified.checked_nodes == 9 && verified.checked_edges == 8,
        "verification omitted repeated proof occurrences");
    tree.evidence[1] = {0, 0};
    tree.evidence[2] = {WorldMask {1} << 63, WorldMask {1} << 63};
    verify_plan_dag(tree, built.graph);
    for (std::size_t i = 1; i < tree.nodes.size(); ++i) {
        for (unsigned seat = 0; seat < 4; ++seat) {
            require(!advance_plan_tree(tree, static_cast<PlanNodeId>(i), static_cast<Seat>(seat), card("SA")) &&
                !advance_plan_dag(built.graph, built.tree_to_dag[i], static_cast<Seat>(seat), card("SA")),
                "a proof leaf must never execute a card");
        }
    }
    auto different = built.graph;
    different.nodes[built.tree_to_dag[1]].proof = PlanProofKind::DeclarerQuickTricks;
    rejects([&] { verify_plan_dag(tree, different); });

    const auto exported = json(built.graph);
    require(exported.find("\"kind\": \"win_proof\"") != std::string::npos &&
        exported.find("\"kind\": \"loss_proof\"") != std::string::npos &&
        exported.find("\"proof_reason\":") != std::string::npos &&
        exported.find("\"win_proofs\": 3") != std::string::npos,
        "export omitted proof methods or statistics");
    require(exported.find("possible_worlds") == std::string::npos &&
        exported.find("sampled_wins") == std::string::npos,
        "interned proof instruction leaked occurrence evidence");
    std::ostringstream raw_export;
    write_plan_tree_json(raw_export, tree);
    require(raw_export.str().find("\"proof_reason\":") != std::string::npos,
        "tree export omitted its proof method");
}

void test_proof_validation_rejects_wrong_direction_and_hidden_instructions() {
    const auto valid = leaf_tree(PlanNodeKind::WinProof, PlanProofKind::DeclarerClaim);
    const auto reject_corruption = [&](auto corrupt) {
        auto tree = valid;
        corrupt(tree.nodes[0]);
        rejects([&] { measure_plan_tree(tree); });
        rejects([&] { compress_plan_tree(tree); });
        auto graph = compress_plan_tree(valid).graph;
        corrupt(graph.nodes[0]);
        rejects([&] { measure_plan_dag(graph); });
    };
    reject_corruption([](auto& node) { node.proof = PlanProofKind::None; });
    reject_corruption([](auto& node) { node.proof = PlanProofKind::DefenderQuickTricks; });
    reject_corruption([](auto& node) { node.proof = static_cast<PlanProofKind>(99); });
    reject_corruption([](auto& node) { node.kind = PlanNodeKind::LossProof; });
    reject_corruption([](auto& node) { node.kind = PlanNodeKind::Frontier; });
    reject_corruption([](auto& node) { node.player = Seat::South; });
    reject_corruption([](auto& node) { node.card = card("SA"); });
    reject_corruption([](auto& node) { node.next = 0; });
    reject_corruption([](auto& node) { node.first_edge = 1; });
    reject_corruption([](auto& node) { node.edge_count = 1; });

    for (const auto kind : {PlanNodeKind::Play, PlanNodeKind::Observe}) {
        auto tree = valid;
        tree.nodes[0] = PlanTreeNode {};
        tree.nodes[0].kind = kind;
        tree.nodes[0].proof = PlanProofKind::DeclarerClaim;
        rejects([&] { measure_plan_tree(tree); });
        rejects([&] { compress_plan_tree(tree); });
    }
}

void test_edit_preserves_proof_reason_and_shared_history() {
    auto tree = leaf_tree(PlanNodeKind::WinProof, PlanProofKind::DeclarerClaim);
    tree.nodes.insert(tree.nodes.begin(), PlanTreeNode {
        .kind = PlanNodeKind::Observe, .player = Seat::East, .edge_count = 2,
    });
    tree.nodes.push_back(tree.nodes[1]);
    tree.edges = {{card("S2"), 1}, {card("S3"), 2}};
    tree.evidence.resize(3);
    const auto source = compress_plan_tree(tree).graph;
    const auto before = json(source);
    const auto replacement = compress_plan_tree(
        leaf_tree(PlanNodeKind::LossProof, PlanProofKind::DdsLoss)).graph;
    const auto edited = patch_plan_occurrence(source, {{Seat::East, card("S2")}}, replacement);
    const auto replaced = advance_plan_dag(edited, edited.root, Seat::East, card("S2")).value();
    const auto retained = advance_plan_dag(edited, edited.root, Seat::East, card("S3")).value();
    require(edited.nodes[replaced].kind == PlanNodeKind::LossProof &&
        edited.nodes[replaced].proof == PlanProofKind::DdsLoss &&
        edited.nodes[retained].kind == PlanNodeKind::WinProof &&
        edited.nodes[retained].proof == PlanProofKind::DeclarerClaim,
        "editing one shared proof occurrence changed another history or its method");
    require(edited.declarer == source.declarer && edited.target_tricks == source.target_tricks &&
        edited.completed_m == source.completed_m && edited.variable_horizon && json(source) == before,
        "proof edit changed source graph or lost graph metadata");
    const auto extracted = plan_continuation(edited, retained);
    require(extracted.nodes.size() == 1 && extracted.edges.empty() &&
        extracted.nodes[extracted.root].proof == PlanProofKind::DeclarerClaim &&
        extracted.variable_horizon, "proof extraction lost its method or metadata");
    rejects([&] { patch_plan_occurrence(source,
        {{Seat::East, card("S2")}, {Seat::North, card("SA")}}, replacement); });
    const auto grafted = patch_plan_occurrence(source, {{Seat::East, card("S4")}}, replacement);
    require(measure_plan_dag(grafted).loss_proofs == 1 && measure_plan_dag(grafted).win_proofs == 1,
        "grafting a proof leaf created unwanted context-specific copies");
}

void test_legacy_capture_stays_unresolved() {
    const auto tree = capture_plan_tree(AlphaMuResult {}, AlphaMuConfig {});
    const auto graph = compress_plan_tree(tree).graph;
    require(graph.nodes.size() == 1 && graph.nodes[0].kind == PlanNodeKind::Frontier &&
        graph.nodes[0].proof == PlanProofKind::None,
        "legacy null continuation became a proof");
    const auto output = json(graph);
    require(output.find("proof_reason") == std::string::npos && output.find("win_proofs") == std::string::npos &&
        output.find("loss_proofs") == std::string::npos,
        "legacy export gained proof-only fields");
}
} // namespace

int main() {
    try {
        test_reason_identity_and_occurrence_evidence();
        test_proof_validation_rejects_wrong_direction_and_hidden_instructions();
        test_edit_preserves_proof_reason_and_shared_history();
        test_legacy_capture_stays_unresolved();
        std::cout << "All plan proof storage tests passed.\n";
    } catch (const std::exception& error) {
        std::cerr << "Plan proof storage test failure: " << error.what() << '\n';
        return 1;
    }
}
