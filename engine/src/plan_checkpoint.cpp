#include "bridge/plan_checkpoint.h"

#include <charconv>
#include <istream>
#include <ostream>
#include <stdexcept>
#include <string>

namespace bridge {
namespace {
constexpr std::uint64_t max_nodes = 1000000;
constexpr std::uint64_t max_edges = 4000000;

void require(bool condition, const char* message) {
    if (!condition) throw std::invalid_argument(message);
}

std::uint64_t number(std::istream& input, std::uint64_t maximum) {
    std::string token;
    require(static_cast<bool>(input >> token), "truncated plan checkpoint");
    std::uint64_t value {};
    const auto parsed = std::from_chars(token.data(), token.data() + token.size(), value);
    require(parsed.ec == std::errc {} && parsed.ptr == token.data() + token.size() && value <= maximum,
        "invalid integer in plan checkpoint");
    return value;
}

void validate(const PlanDag& graph) {
    require(graph.nodes.size() <= max_nodes && graph.edges.size() <= max_edges,
        "plan checkpoint exceeds size limits");
    require(graph.completed_m <= kMaxDeclarerPlies, "invalid plan checkpoint search depth");
    measure_plan_dag(graph);
}
} // namespace

PlanDag read_plan_checkpoint(std::istream& input) {
    std::string magic;
    require(static_cast<bool>(input >> magic) && magic == "BRIDGE_PLAN_CHECKPOINT",
        "invalid plan checkpoint signature");
    require(number(input, 1) == 1, "unsupported plan checkpoint version");
    PlanDag graph;
    graph.root = static_cast<PlanNodeId>(number(input, kNoPlanNode - 1));
    graph.declarer = static_cast<Seat>(number(input, 3));
    graph.target_tricks = static_cast<std::uint8_t>(number(input, kRanksPerSuit));
    graph.completed_m = static_cast<std::uint8_t>(number(input, kMaxDeclarerPlies));
    graph.variable_horizon = number(input, 1) != 0;
    const auto nodes = number(input, max_nodes);
    const auto edges = number(input, max_edges);
    require(nodes != 0 && graph.root < nodes && edges <= nodes * kDeckSize,
        "invalid plan checkpoint counts/root");
    graph.nodes.reserve(static_cast<std::size_t>(nodes));
    graph.edges.reserve(static_cast<std::size_t>(edges));
    for (std::uint64_t i = 0; i < nodes; ++i) {
        PlanTreeNode node;
        node.kind = static_cast<PlanNodeKind>(number(input, 4));
        node.player = static_cast<Seat>(number(input, 3));
        node.card = number(input, kFullDeck);
        node.next = static_cast<PlanNodeId>(number(input, kNoPlanNode));
        node.first_edge = static_cast<std::uint32_t>(number(input, edges));
        node.edge_count = static_cast<std::uint32_t>(number(input, kDeckSize));
        node.proof = static_cast<PlanProofKind>(number(input, 6));
        graph.nodes.push_back(node);
    }
    for (std::uint64_t i = 0; i < edges; ++i) {
        const auto card = number(input, kFullDeck);
        const auto next = static_cast<PlanNodeId>(number(input, nodes - 1));
        graph.edges.push_back({card, next});
    }
    input >> std::ws;
    require(input.eof() && !input.bad(), "trailing content in plan checkpoint");
    validate(graph);
    return graph;
}

void write_plan_checkpoint(std::ostream& output, const PlanDag& graph) {
    validate(graph);
    // Explicit decimal conversion keeps the format independent of callers'
    // stream flags (hex, showbase, boolalpha, etc.).
    const auto n = [](auto value) { return std::to_string(static_cast<std::uint64_t>(value)); };
    output << "BRIDGE_PLAN_CHECKPOINT 1\n"
        << n(graph.root) << ' ' << n(graph.declarer) << ' ' << n(graph.target_tricks) << ' '
        << n(graph.completed_m) << ' ' << n(graph.variable_horizon) << ' '
        << n(graph.nodes.size()) << ' ' << n(graph.edges.size()) << '\n';
    for (const auto& node : graph.nodes) {
        output << n(node.kind) << ' ' << n(node.player) << ' ' << n(node.card) << ' '
            << n(node.next) << ' ' << n(node.first_edge) << ' ' << n(node.edge_count) << ' '
            << n(node.proof) << '\n';
    }
    for (const auto& edge : graph.edges) output << n(edge.observation) << ' ' << n(edge.next) << '\n';
    if (!output) throw std::runtime_error("could not write plan checkpoint");
}

} // namespace bridge
