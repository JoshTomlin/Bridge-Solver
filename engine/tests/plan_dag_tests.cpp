#include "bridge/plan_dag.h"
#include "bridge/analysis_session.h"

#include <algorithm>
#include <array>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace {
using namespace bridge;
using Policy = std::shared_ptr<AlphaMuPolicyNode>;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

template <typename Action>
void require_rejected(Action action, const char* message) {
    try { action(); }
    catch (const std::exception&) { return; }
    throw std::runtime_error(message);
}

Card card(const char* text) { return parse_card(text).value(); }

Policy play(Seat player, const char* move, Policy next = nullptr, WorldMask mask = 0) {
    return std::make_shared<AlphaMuPolicyNode>(AlphaMuPolicyNode {
        .player = player,
        .possible_worlds = mask,
        .outcome = OutcomeVector {mask},
        .declarer_move = card(move),
        .continuation = std::move(next),
    });
}

Policy observe(Seat player, std::initializer_list<AlphaMuPolicyBranch> replies) {
    auto node = std::make_shared<AlphaMuPolicyNode>();
    node->player = player;
    node->defender_branches = replies;
    for (const auto& reply : replies) node->possible_worlds |= reply.possible_worlds;
    return node;
}

PlanTree capture(const Policy& root) {
    AlphaMuResult result;
    result.trick_policy = root;
    result.stats.completed_depth = 2;
    return capture_plan_tree(result, AlphaMuConfig {
        .declarer = Seat::South, .target_tricks = 3,
    });
}

PlanNodeId child(const PlanTree& tree, PlanNodeId parent, Seat player, const char* move) {
    const auto next = advance_plan_tree(tree, parent, player, card(move));
    require(next.has_value(), "fixture is missing an expected transition");
    return *next;
}

// Independently compare the interpreters on every input, including absent
// observations and wrong players. The map checks the entire next continuation,
// not merely whether the two interpreters happen to accept the same card.
void compare_every_transition(const PlanTree& tree, const PlanDagBuild& built) {
    require(built.tree_to_dag.size() == tree.nodes.size(), "missing occurrence mapping");
    require(built.tree_to_dag.at(tree.root) == built.graph.root, "root mapping differs");
    for (PlanNodeId id = 0; id < tree.nodes.size(); ++id) {
        require(built.tree_to_dag[id] < built.graph.nodes.size(), "invalid mapped node");
        for (unsigned seat = 0; seat < 4; ++seat) {
            const auto player = static_cast<Seat>(seat);
            for (unsigned bit = 0; bit < kDeckSize; ++bit) {
                const Card move = Card {1} << bit;
                const auto raw = advance_plan_tree(tree, id, player, move);
                const auto shared = advance_plan_dag(
                    built.graph, built.tree_to_dag[id], player, move);
                require(raw.has_value() == shared.has_value(),
                    "sharing changed card/player acceptance");
                if (raw) {
                    require(built.tree_to_dag.at(*raw) == *shared,
                        "sharing changed the next continuation");
                }
            }
            for (const Card invalid : {kNoCard, Card {3}, Card {1} << 63}) {
                require(!advance_plan_dag(built.graph, built.tree_to_dag[id], player, invalid),
                    "an invalid card must not advance a plan");
            }
        }
    }
    const auto checked = verify_plan_dag(tree, built.graph);
    require(checked.checked_nodes == tree.nodes.size(), "verifier skipped a raw occurrence");
    require(checked.checked_edges == measure_plan_tree(tree).card_edges,
        "verifier skipped a raw transition");
}

PlanTree repeated_suffix_fixture() {
    return capture(observe(Seat::East, {
        {card("S2"), 1, play(Seat::South, "SA", nullptr, 1)},
        {card("S3"), 2, play(Seat::South, "SA", nullptr, 2)},
    }));
}

void test_exact_sharing_and_separate_evidence() {
    auto tree = repeated_suffix_fixture();
    const auto built = compress_plan_tree(tree);
    require(tree.nodes.size() == 5 && tree.edges.size() == 2,
        "fixture must contain two separately stored suffixes");
    require(built.graph.nodes.size() == 3 && built.graph.edges.size() == 2,
        "five-node example must compress to three instruction nodes");
    require(built.graph.declarer == tree.declarer &&
        built.graph.target_tricks == tree.target_tricks &&
        built.graph.completed_m == tree.completed_m, "plan metadata changed");

    const auto first = child(tree, tree.root, Seat::East, "S2");
    const auto second = child(tree, tree.root, Seat::East, "S3");
    require(first != second && built.tree_to_dag[first] == built.tree_to_dag[second],
        "identical instructions with disjoint evidence must share");
    require(tree.evidence[first].possible_worlds == 1 && tree.evidence[first].wins == 1 &&
        tree.evidence[second].possible_worlds == 2 && tree.evidence[second].wins == 2,
        "compression must not overwrite occurrence-specific evidence");
    compare_every_transition(tree, built);

    // Changing only sample annotations leaves the executable program intact.
    tree.evidence[first] = {WorldMask {1} << 63, 0};
    tree.evidence[second] = {0, 7};
    compare_every_transition(tree, built);

    const auto stats = measure_plan_dag(built.graph);
    require(stats.play_nodes == 1 && stats.observe_nodes == 1 && stats.frontiers == 1,
        "incorrect node-kind counts for shared graph");
    require(stats.card_edges == 3, "shared graph must count each stored transition once");
    require(stats.program_bytes == 3 * sizeof(PlanTreeNode) + 2 * sizeof(PlanTreeEdge),
        "instruction bytes must use actual node/edge sizes");
    require(stats.allocated_program_bytes ==
        built.graph.nodes.capacity() * sizeof(PlanTreeNode) +
        built.graph.edges.capacity() * sizeof(PlanTreeEdge),
        "allocated bytes must include actual vector capacity");
    require(stats.allocated_program_bytes >= stats.program_bytes,
        "allocation cannot be smaller than the stored instructions");

    std::ostringstream json;
    write_plan_dag_json(json, built.graph);
    require(json.str().find("\"kind\": \"frontier\"") != std::string::npos,
        "export must retain unresolved frontier semantics");
    require(json.str().find("possible_worlds") == std::string::npos &&
        json.str().find("sampled_wins") == std::string::npos,
        "shared instructions must not export one occurrence's evidence as global evidence");
}

void test_branch_order_and_depth_are_not_identity() {
    const auto left = observe(Seat::West, {
        {card("C2"), 1, nullptr}, {card("C3"), 2, nullptr},
    });
    const auto right = observe(Seat::West, {
        {card("C3"), 4, nullptr}, {card("C2"), 8, nullptr},
    });
    const auto reordered = capture(observe(Seat::East, {
        {card("S2"), 3, left}, {card("S3"), 12, right},
    }));
    const auto built = compress_plan_tree(reordered);
    require(built.graph.nodes.size() == 3 && built.graph.edges.size() == 4,
        "observation order and evidence must not prevent exact suffix sharing");
    require(built.tree_to_dag[child(reordered, 0, Seat::East, "S2")] ==
        built.tree_to_dag[child(reordered, 0, Seat::East, "S3")],
        "reversed observation lists must canonicalize to the same instruction");
    compare_every_transition(reordered, built);

    const auto suffix = play(Seat::South, "SA");
    const auto longer = play(Seat::South, "SK",
        observe(Seat::West, {{card("C2"), 1,
            play(Seat::North, "D2",
                observe(Seat::East, {{card("H2"), 1, suffix}}))}}));
    const auto depths = capture(observe(Seat::East, {
        {card("S2"), 1, suffix}, {card("S3"), 1, longer},
    }));
    const auto depth_graph = compress_plan_tree(depths);
    const auto shallow = child(depths, 0, Seat::East, "S2");
    auto deep = child(depths, 0, Seat::East, "S3");
    deep = child(depths, deep, Seat::South, "SK");
    deep = child(depths, deep, Seat::West, "C2");
    deep = child(depths, deep, Seat::North, "D2");
    deep = child(depths, deep, Seat::East, "H2");
    require(shallow != deep && depth_graph.tree_to_dag[shallow] == depth_graph.tree_to_dag[deep],
        "identical instructions at different card depths must share");
    compare_every_transition(depths, depth_graph);
}

void test_different_instructions_never_merge() {
    const auto west_club = observe(Seat::West, {{card("C2"), 1, nullptr}});
    const auto tree = capture(observe(Seat::East, {
        {card("S2"), 1, play(Seat::South, "SA", west_club)},
        {card("S3"), 1, play(Seat::North, "SA", west_club)},
        {card("S4"), 1, play(Seat::South, "SK", west_club)},
        {card("S5"), 1, play(Seat::South, "SA",
            observe(Seat::West, {{card("C3"), 1, nullptr}}))},
        {card("S6"), 1, play(Seat::South, "SA",
            observe(Seat::East, {{card("C2"), 1, nullptr}}))},
    }));
    const auto built = compress_plan_tree(tree);
    std::vector<PlanNodeId> alternatives;
    for (const auto* observation : {"S2", "S3", "S4", "S5", "S6"}) {
        alternatives.push_back(built.tree_to_dag[child(tree, 0, Seat::East, observation)]);
    }
    std::sort(alternatives.begin(), alternatives.end());
    require(std::adjacent_find(alternatives.begin(), alternatives.end()) == alternatives.end(),
        "player, action, later observation, and later player must all distinguish programs");
    require(built.graph.nodes.size() == 10,
        "only the frontier and exactly repeated West response may merge");
    compare_every_transition(tree, built);
}

void test_frontier_and_empty_observation_differ() {
    const auto frontier = capture(nullptr);
    const auto built = compress_plan_tree(frontier);
    require(built.graph.nodes.size() == 1 && built.graph.edges.empty(),
        "absent policy must remain a single unresolved instruction");
    require(measure_plan_dag(built.graph).frontiers == 1, "frontier lost during compression");
    compare_every_transition(frontier, built);

    const auto tree = capture(observe(Seat::East, {
        {card("S2"), 1, nullptr},
        {card("S3"), 2, observe(Seat::West, {})},
    }));
    const auto graph = compress_plan_tree(tree);
    require(graph.graph.nodes.size() == 3,
        "an observation with no stored responses is not an unresolved frontier instruction");
    compare_every_transition(tree, graph);
}

void test_verifier_rejects_corruption() {
    const auto tree = repeated_suffix_fixture();
    const auto built = compress_plan_tree(tree);
    const auto play_id = built.tree_to_dag[child(tree, 0, Seat::East, "S2")];
    const auto reject_graph = [&](auto corrupt, const char* message) {
        auto graph = built.graph;
        corrupt(graph);
        require_rejected([&] { verify_plan_dag(tree, graph); }, message);
    };
    reject_graph([&](auto& graph) { graph.nodes[play_id].card = card("SK"); },
        "verifier accepted a changed prescribed card");
    reject_graph([&](auto& graph) { graph.nodes[play_id].player = Seat::North; },
        "verifier accepted a changed player");
    reject_graph([](auto& graph) { graph.edges.front().observation = card("C2"); },
        "verifier accepted a changed defender response");
    reject_graph([&](auto& graph) { graph.nodes[play_id].next = play_id; },
        "verifier accepted a cycle");
    reject_graph([&](auto& graph) { graph.nodes[play_id].next = kNoPlanNode; },
        "verifier accepted an invalid action target");
    reject_graph([](auto& graph) { graph.edges.front().next = kNoPlanNode; },
        "verifier accepted an invalid observation target");
    reject_graph([](auto& graph) { graph.nodes.push_back(PlanTreeNode {}); },
        "verifier accepted an unreachable instruction");
    reject_graph([](auto& graph) { graph.edges.push_back(graph.edges.front()); },
        "verifier accepted an unowned response");
    reject_graph([](auto& graph) { graph.root = kNoPlanNode; },
        "verifier accepted an invalid root");
    reject_graph([](auto& graph) { graph.nodes[graph.root].first_edge = UINT32_MAX; },
        "verifier accepted an invalid response range");
    reject_graph([](auto& graph) { ++graph.target_tricks; },
        "verifier accepted changed contract metadata");
    reject_graph([](auto& graph) { ++graph.completed_m; },
        "verifier accepted changed horizon metadata");
    reject_graph([](auto& graph) { graph.declarer = Seat::North; },
        "verifier accepted changed declarer metadata");
}

void test_compression_rejects_malformed_raw_trees() {
    const auto tree = repeated_suffix_fixture();
    const auto play_id = child(tree, 0, Seat::East, "S2");
    const auto reject_tree = [&](auto corrupt, const char* message) {
        auto invalid = tree;
        corrupt(invalid);
        require_rejected([&] { compress_plan_tree(invalid); }, message);
    };
    reject_tree([](auto& raw) { raw.nodes.clear(); }, "empty raw plan accepted");
    reject_tree([](auto& raw) { raw.root = kNoPlanNode; }, "invalid raw root accepted");
    reject_tree([](auto& raw) { raw.evidence.pop_back(); }, "missing occurrence evidence accepted");
    reject_tree([&](auto& raw) { raw.nodes[play_id].next = play_id; }, "raw cycle accepted");
    reject_tree([&](auto& raw) { raw.nodes[play_id].next = kNoPlanNode; },
        "invalid raw child accepted");
    reject_tree([&](auto& raw) { raw.nodes[play_id].card = kNoCard; },
        "invalid raw action card accepted");
    reject_tree([&](auto& raw) { raw.nodes[play_id].player = static_cast<Seat>(99); },
        "invalid raw player accepted");
    reject_tree([](auto& raw) { raw.nodes[0].kind = static_cast<PlanNodeKind>(99); },
        "invalid raw instruction kind accepted");
    reject_tree([](auto& raw) { raw.edges[1].observation = raw.edges[0].observation; },
        "duplicate raw observation accepted");
    reject_tree([](auto& raw) { raw.edges[0].observation = Card {1} << 63; },
        "out-of-deck raw observation accepted");
    reject_tree([](auto& raw) { raw.edges[1].next = raw.edges[0].next; },
        "shared children in a supposedly raw tree accepted");
    reject_tree([](auto& raw) {
        raw.nodes.emplace_back();
        raw.evidence.emplace_back();
    }, "unreachable raw instruction accepted");
    reject_tree([](auto& raw) { raw.edges.push_back(raw.edges.front()); },
        "unowned raw response accepted");
    reject_tree([](auto& raw) { raw.nodes[0].first_edge = UINT32_MAX; },
        "overflowing raw response range accepted");
}

void test_search_policies_at_each_horizon() {
    std::vector<AlphaMuWorld> worlds;
    for (const auto& hands : {
             std::array<const char*, 4>{"AJT.-.-.-", "7.AK.-.-", "K32.-.-.-", "Q98.-.-.-"},
             std::array<const char*, 4>{"AJT.-.-.-", "Q.AK.-.-", "K32.-.-.-", "987.-.-.-"}}) {
        Position position;
        Hand remaining = kEmptyHand;
        for (std::size_t i = 0; i < 4; ++i) {
            position.deal.hands[i] = parse_hand_record(hands[i]).value();
            remaining |= position.deal.hands[i];
        }
        position.played_cards = kFullDeck & ~remaining;
        position.current_trick.leader = Seat::South;
        worlds.push_back({position});
    }
    bool compressed_any = false;
    for (std::uint8_t m = 1; m <= 6; ++m) {
        AlphaMuConfig config {
            .declarer = Seat::South,
            .target_tricks = 3,
            .max_declarer_plies = m,
            .build_trick_policy = true,
            .limit_policy_to_current_trick = false,
        };
        config.optimizations.iterative_deepening = false;
        const auto result = alpha_mu_search(worlds, config);
        require(result.trick_policy != nullptr, "expected a concrete alpha-mu policy");
        const auto tree = capture_plan_tree(result, config);
        const auto built = compress_plan_tree(tree);
        compare_every_transition(tree, built);
        const auto raw_stats = measure_plan_tree(tree);
        const auto dag_stats = measure_plan_dag(built.graph);
        require(built.graph.completed_m == m, "compression changed completed horizon");
        require(built.graph.nodes.size() == raw_stats.unique_subtrees,
            "compression disagrees with independent baseline subtree counting");
        require(dag_stats.program_bytes == raw_stats.shared_program_bytes_estimate,
            "actual graph payload differs from baseline estimate");
        require(dag_stats.program_bytes <= raw_stats.program_bytes,
            "sharing increased instruction payload");
        compressed_any |= built.graph.nodes.size() < tree.nodes.size();
    }
    require(compressed_any, "search fixtures must exercise actual subtree sharing");
}

}  // namespace

int main() {
    try {
        test_exact_sharing_and_separate_evidence();
        test_branch_order_and_depth_are_not_identity();
        test_different_instructions_never_merge();
        test_frontier_and_empty_observation_differ();
        test_verifier_rejects_corruption();
        test_compression_rejects_malformed_raw_trees();
        test_search_policies_at_each_horizon();
        std::cout << "All plan DAG tests passed.\n";
    } catch (const std::exception& error) {
        std::cerr << "Plan DAG test failure: " << error.what() << '\n';
        return 1;
    }
}
