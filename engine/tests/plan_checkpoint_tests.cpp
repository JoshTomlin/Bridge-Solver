#include "bridge/plan_checkpoint.h"

#include <array>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace {
using namespace bridge;
void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
template <class Action> void rejects(Action action) {
    try { action(); }
    catch (const std::invalid_argument&) { return; }
    throw std::runtime_error("invalid checkpoint accepted");
}
Card card(const char* name) { return parse_card(name).value(); }

PlanDag fixture() {
    PlanDag graph;
    graph.declarer = Seat::South;
    graph.target_tricks = 12;
    graph.completed_m = 26;
    graph.variable_horizon = true;
    graph.nodes.push_back({});
    for (auto method : {PlanProofKind::TargetReached, PlanProofKind::DeclarerQuickTricks,
            PlanProofKind::DeclarerClaim, PlanProofKind::TargetImpossible,
            PlanProofKind::DefenderQuickTricks, PlanProofKind::DdsLoss}) {
        PlanTreeNode node;
        node.kind = plan_proof_is_win(method) ? PlanNodeKind::WinProof : PlanNodeKind::LossProof;
        node.proof = method;
        graph.nodes.push_back(node);
    }
    PlanTreeNode observe;
    observe.kind = PlanNodeKind::Observe;
    observe.player = Seat::East;
    observe.edge_count = static_cast<std::uint32_t>(graph.nodes.size() + 1);
    for (PlanNodeId i = 0; i < graph.nodes.size(); ++i) graph.edges.push_back({Card{1} << i, i});
    graph.edges.push_back({card("C9"), 1}); // A shared proof must keep its ID.
    graph.nodes.push_back(observe);
    PlanTreeNode play;
    play.kind = PlanNodeKind::Play;
    play.player = Seat::South;
    play.card = card("SA");
    play.next = static_cast<PlanNodeId>(graph.nodes.size() - 1);
    graph.nodes.push_back(play);
    graph.root = static_cast<PlanNodeId>(graph.nodes.size() - 1);
    return graph;
}
std::string checkpoint(const PlanDag& graph) {
    std::ostringstream out;
    out << std::hex << std::showbase << std::boolalpha;
    write_plan_checkpoint(out, graph);
    return out.str();
}
std::string json(const PlanDag& graph) {
    std::ostringstream out;
    write_plan_dag_json(out, graph);
    return out.str();
}
PlanDag read(const std::string& text) {
    std::istringstream input(text);
    return read_plan_checkpoint(input);
}
std::string changed(std::string text, const std::string& from, const std::string& to) {
    const auto offset = text.find(from);
    require(offset != std::string::npos, "test mutation string not found");
    text.replace(offset, from.size(), to);
    return text;
}
void test_roundtrip() {
    const auto original = fixture();
    const auto text = checkpoint(original);
    const auto restored = read(text);
    require(checkpoint(restored) == text, "checkpoint changed instruction fields/IDs");
    require(restored.nodes.size() == original.nodes.size() && restored.edges.size() == original.edges.size(),
        "checkpoint changed graph size");
    const auto stats = measure_plan_dag(restored);
    require(stats.frontiers == 1 && stats.win_proofs == 3 && stats.loss_proofs == 3,
        "checkpoint lost proof methods or unresolved state");
    // JSON includes allocation capacity, so compare fields through stable text.
    require(restored.root == original.root && restored.completed_m == 26 && restored.variable_horizon &&
        restored.edges.back().next == 1, "checkpoint lost metadata or sharing");
    require(checkpoint(read(text + " \n\t")) == text, "trailing whitespace was rejected");
    PlanDag leaf;
    leaf.nodes.push_back({});
    require(checkpoint(read(checkpoint(leaf))) == checkpoint(leaf), "single frontier roundtrip failed");
}
void test_malformed() {
    const auto text = checkpoint(fixture());
    const std::array<std::pair<std::string, std::string>, 13> mutations {{
        {"BRIDGE_PLAN_CHECKPOINT", "BAD"}, {"CHECKPOINT 1", "CHECKPOINT 2"},
        {"8 2 12 26 1 9 8", "8 2 12 26 1 1000001 8"},
        {"8 2 12 26 1 9 8", "8 2 12 26 1 9 4000001"},
        {"8 2 12 26 1 9 8", "9 2 12 26 1 9 8"},
        {"8 2 12 26 1 9 8", "8 4 12 26 1 9 8"},
        {"8 2 12 26 1 9 8", "8 2 12 27 1 9 8"},
        {"8 2 12 26 1 9 8", "8 2 12 26 2 9 8"},
        {"8 2 12 26 1 9 8", "8 2 12 26 1 -9 8"},
        {"2 0 0 4294967295 0 0 0", "2 0 0 4294967295 0 0 1"},
        {"3 0 0 4294967295 0 0 1", "3 0 0 4294967295 0 0 2"},
        {"2 0 0 4294967295 0 0 0", "5 0 0 4294967295 0 0 0"},
        {"2251799813685248 7", "2251799813685248 8"},
    }};
    for (const auto& [from, to] : mutations) rejects([&] { read(changed(text, from, to)); });
    rejects([&] { read(text.substr(0, text.size() / 2)); });
    rejects([&] { read(text + "unexpected"); });
    rejects([&] { read(changed(text, "1 0\n", "3 0\n")); }); // invalid multi-card observation
    rejects([&] { read(changed(text, "128 1\n", "1 1\n")); }); // duplicate/unsorted observation
    rejects([&] { read(changed(text, "128 1\n", "128 99\n")); });
    rejects([&] { read(changed(text, "128 1\n", "18446744073709551616 1\n")); });
    auto invalid = fixture(); invalid.nodes[0].card = card("C2");
    rejects([&] { checkpoint(invalid); });
}
void test_failed_write() {
    std::ostringstream output;
    output.setstate(std::ios::badbit);
    try { write_plan_checkpoint(output, fixture()); }
    catch (const std::runtime_error&) { return; }
    throw std::runtime_error("checkpoint silently accepted failed output");
}
} // namespace

int main() {
    try {
        test_roundtrip(); test_malformed(); test_failed_write();
        std::cout << "All plan checkpoint tests passed.\n";
    } catch (const std::exception& error) {
        std::cerr << "Plan checkpoint test failure: " << error.what() << '\n';
        return 1;
    }
}
