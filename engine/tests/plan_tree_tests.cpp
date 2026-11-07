#include "bridge/plan_tree.h"
#include "bridge/analysis_session.h"

#include <iostream>
#include <sstream>
#include <stdexcept>

namespace {
using namespace bridge;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

Card card(const char* text) { return parse_card(text).value(); }

void compare_every_branch(
    const PlanTree& tree, PlanNodeId id,
    const std::shared_ptr<const AlphaMuPolicyNode>& source) {
    const auto& node = tree.nodes.at(id);
    if (!source) {
        require(node.kind == PlanNodeKind::Frontier, "null continuation must be unresolved");
        require(!advance_plan_tree(tree, id, Seat::South, card("SA")),
            "frontier must not supply a made-up action");
        return;
    }
    require(node.player == source->player, "player changed during capture");
    if (same_side(source->player, tree.declarer)) {
        require(node.kind == PlanNodeKind::Play, "missing declarer action");
        require(node.card == source->declarer_move, "declarer card changed");
        const auto child = advance_plan_tree(tree, id, source->player, source->declarer_move);
        require(child.has_value(), "captured action cannot be followed");
        compare_every_branch(tree, *child, source->continuation);
    } else {
        require(node.kind == PlanNodeKind::Observe, "missing defender observation");
        require(node.edge_count == source->defender_branches.size(), "branch was lost");
        for (const auto& branch : source->defender_branches) {
            const auto child = advance_plan_tree(tree, id, source->player, branch.card);
            require(child.has_value(), "captured observation cannot be followed");
            require(tree.evidence[*child].possible_worlds == branch.possible_worlds,
                "branch evidence changed");
            compare_every_branch(tree, *child, branch.continuation);
        }
    }
}

void test_raw_storage_and_program_identity() {
    const auto play = [](Card move, WorldMask mask) {
        return std::make_shared<AlphaMuPolicyNode>(AlphaMuPolicyNode {
            .player = Seat::South,
            .possible_worlds = mask,
            .outcome = OutcomeVector {mask},
            .declarer_move = move,
        });
    };
    const auto first = play(card("SA"), 1);
    const auto second = play(card("SA"), 2);
    auto root = std::make_shared<AlphaMuPolicyNode>(AlphaMuPolicyNode {
        .player = Seat::East,
        .possible_worlds = 3,
        .defender_branches = {
            {card("S2"), 1, first},
            {card("S3"), 2, second},
            {card("S4"), 1, first},
        },
    });
    AlphaMuResult result;
    result.trick_policy = root;
    result.stats.completed_depth = 1;
    const AlphaMuConfig config {.declarer = Seat::South, .target_tricks = 1};
    auto tree = capture_plan_tree(result, config);
    auto stats = measure_plan_tree(tree);
    require(tree.nodes.size() == 7 && stats.card_edges == 6,
        "baseline must copy identical subtrees and repeated pointers");
    require(stats.unique_subtrees == 3, "sample evidence must not prevent program sharing");
    require(stats.max_card_plies == 2 && stats.max_declarer_plies == 1,
        "card and MAX horizons must be measured separately");
    require(stats.nodes_by_card_depth == std::vector<std::size_t>({1, 3, 3}),
        "incorrect per-card-depth profile");
    require(!advance_plan_tree(tree, 0, Seat::East, card("C2")),
        "unseen card must not select an arbitrary branch");
    require(!advance_plan_tree(tree, 0, Seat::West, card("S2")),
        "wrong player must not advance the plan");
    compare_every_branch(tree, tree.root, result.trick_policy);

    root->defender_branches[1].continuation = play(card("SK"), 2);
    tree = capture_plan_tree(result, config);
    require(measure_plan_tree(tree).unique_subtrees == 4,
        "different actions must not share even if their outcomes agree");
    bool limited = false;
    try { capture_plan_tree(result, config, 3); }
    catch (const std::length_error&) { limited = true; }
    require(limited, "capture must enforce its node budget");
    std::ostringstream json;
    write_plan_tree_json(json, tree);
    require(json.str().find("\"kind\": \"frontier\"") != std::string::npos &&
        json.str().find("0x") != std::string::npos,
        "export must identify frontiers and preserve 64-bit masks as strings");
}

void test_observation_order_is_not_program_identity() {
    auto left = std::make_shared<AlphaMuPolicyNode>(AlphaMuPolicyNode {
        .player = Seat::West,
        .defender_branches = {{card("C2"), 1, nullptr}, {card("C3"), 2, nullptr}},
    });
    auto right = std::make_shared<AlphaMuPolicyNode>(*left);
    std::swap(right->defender_branches[0], right->defender_branches[1]);
    AlphaMuResult result;
    result.trick_policy = std::make_shared<AlphaMuPolicyNode>(AlphaMuPolicyNode {
        .player = Seat::East,
        .defender_branches = {{card("S2"), 1, left}, {card("S3"), 2, right}},
    });
    const auto stats = measure_plan_tree(capture_plan_tree(result, AlphaMuConfig {}));
    require(stats.unique_subtrees == 3, "response storage order should be canonicalized");
}

void test_search_policy_capture() {
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
        require(result.trick_policy != nullptr, "expected a concrete search policy");
        const auto tree = capture_plan_tree(result, config);
        compare_every_branch(tree, tree.root, result.trick_policy);
        const auto stats = measure_plan_tree(tree);
        require(tree.completed_m == m && stats.max_declarer_plies <= m,
            "capture must respect the actual completed search horizon");
        require(stats.card_edges + 1 == tree.nodes.size(), "raw output must be a tree");
    }
    AlphaMuResult empty;
    const auto frontier = capture_plan_tree(empty, AlphaMuConfig {});
    require(frontier.nodes.size() == 1 && measure_plan_tree(frontier).frontiers == 1,
        "absent policy must be one unresolved frontier");
}

}  // namespace

int main() {
    try {
        test_raw_storage_and_program_identity();
        test_observation_order_is_not_program_identity();
        test_search_policy_capture();
        std::cout << "All plan tree tests passed.\n";
    } catch (const std::exception& error) {
        std::cerr << "Plan tree test failure: " << error.what() << '\n';
        return 1;
    }
}
