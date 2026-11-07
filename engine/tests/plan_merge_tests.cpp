#include "bridge/plan_merge.h"

#include <iostream>
#include <sstream>
#include <stdexcept>

namespace {
using namespace bridge;
using Policy = std::shared_ptr<AlphaMuPolicyNode>;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

template <class Action>
void rejects(Action action) {
    try { action(); }
    catch (const std::invalid_argument&) { return; }
    throw std::runtime_error("invalid merge was accepted");
}

Card card(const char* name) { return parse_card(name).value(); }

Policy play(Seat player, const char* move, Policy next = nullptr) {
    auto result = std::make_shared<AlphaMuPolicyNode>();
    result->player = player;
    result->declarer_move = card(move);
    result->continuation = next;
    return result;
}

Policy observe(Seat player, std::initializer_list<AlphaMuPolicyBranch> branches) {
    auto result = std::make_shared<AlphaMuPolicyNode>();
    result->player = player;
    result->defender_branches = branches;
    return result;
}

PlanDag graph(Policy policy) {
    AlphaMuConfig config {.declarer = Seat::South, .target_tricks = 1, .max_declarer_plies = 2};
    AlphaMuResult result;
    result.trick_policy = policy;
    result.stats.completed_depth = config.max_declarer_plies;
    return compress_plan_tree(capture_plan_tree(result, config)).graph;
}

PlanDag proof_graph(PlanNodeKind kind, PlanProofKind reason) {
    auto result = graph(nullptr);
    result.nodes[result.root].kind = kind;
    result.nodes[result.root].proof = reason;
    return result;
}

std::string json(const PlanDag& graph) {
    std::ostringstream output;
    write_plan_dag_json(output, graph);
    return output.str();
}

PlanNodeId step(const PlanDag& graph, PlanNodeId node, Seat player, const char* move) {
    const auto next = advance_plan_dag(graph, node, player, card(move));
    require(next.has_value(), "expected stored transition");
    return *next;
}

void test_shared_sibling_is_filled_in_its_corresponding_context_only() {
    const auto shared = play(Seat::North, "SA");
    const auto primary = graph(observe(Seat::West, {
        {card("S8"), 1, shared}, {card("S9"), 1, shared},
    }));
    auto fallback = graph(observe(Seat::West, {
        {card("S8"), 1, play(Seat::North, "SA", play(Seat::South, "CK"))},
        {card("S9"), 1, play(Seat::North, "SA")},
    }));
    fallback.completed_m = 7;
    const auto primary_before = json(primary);
    const auto fallback_before = json(fallback);
    require(step(primary, primary.root, Seat::West, "S8") ==
        step(primary, primary.root, Seat::West, "S9"), "fixture must share the primary suffix");
    const auto result = merge_plan_prefixes(primary, fallback);
    const auto& merged = result.graph;
    const auto eight = step(merged, step(merged, merged.root, Seat::West, "S8"), Seat::North, "SA");
    const auto nine = step(merged, step(merged, merged.root, Seat::West, "S9"), Seat::North, "SA");
    require(merged.nodes[eight].kind == PlanNodeKind::Play && merged.nodes[eight].card == card("CK"),
        "matching frontier did not acquire fallback instructions");
    require(merged.nodes[nine].kind == PlanNodeKind::Frontier,
        "filling one shared frontier occurrence changed another public history");
    require(result.filled_frontiers == 1 && result.added_responses == 0 && result.conflicts == 0,
        "merge diagnostics differ from the two matching prefixes");
    require(merged.variable_horizon && merged.completed_m == primary.completed_m &&
        merged.declarer == primary.declarer && merged.target_tricks == primary.target_tricks,
        "merged graph lost primary metadata or variable-horizon indication");
    require(json(primary) == primary_before && json(fallback) == fallback_before,
        "merge mutated one of its source graphs");
    measure_plan_dag(merged);
}

void test_observation_union_preserves_exact_cards_and_interns_equal_suffixes() {
    const auto primary = graph(observe(Seat::East, {
        {card("S2"), 1, play(Seat::South, "CA")},
        {card("S4"), 1, play(Seat::South, "CA")},
    }));
    const auto fallback = graph(observe(Seat::East, {
        {card("S3"), 1, play(Seat::South, "CA")},
        {card("S4"), 1, play(Seat::South, "CA")},
    }));
    const auto result = merge_plan_prefixes(primary, fallback);
    const auto& merged = result.graph;
    const auto two = step(merged, merged.root, Seat::East, "S2");
    require(two == step(merged, merged.root, Seat::East, "S3") &&
        two == step(merged, merged.root, Seat::East, "S4"), "equal imported suffixes were not interned");
    require(merged.nodes[merged.root].edge_count == 3 && merged.nodes.size() == 3 &&
        result.added_responses == 1 && result.filled_frontiers == 0 && result.conflicts == 0,
        "observation union changed primary-only branches or exact response coverage");
    require(!advance_plan_dag(merged, merged.root, Seat::East, card("S5")),
        "merge invented an observation response");
    measure_plan_dag(merged);
}

void test_different_play_does_not_transplant_a_later_matching_suffix() {
    const auto primary = graph(play(Seat::South, "SA", observe(Seat::West, {
        {card("S2"), 1, play(Seat::North, "SQ")},
    })));
    const auto fallback = graph(play(Seat::South, "SK", observe(Seat::West, {
        {card("S2"), 1, play(Seat::North, "SQ", play(Seat::South, "CA"))},
    })));
    const auto result = merge_plan_prefixes(primary, fallback);
    const auto& merged = result.graph;
    auto node = step(merged, merged.root, Seat::South, "SA");
    node = step(merged, node, Seat::West, "S2");
    node = step(merged, node, Seat::North, "SQ");
    require(merged.nodes[node].kind == PlanNodeKind::Frontier &&
        merged.nodes.size() == primary.nodes.size(), "a conflicting action acquired an unsafe suffix");
    require(result.conflicts == 1 && result.filled_frontiers == 0 && result.added_responses == 0,
        "conflicting play was traversed instead of retained wholesale");

    const auto observer = graph(observe(Seat::West, {{card("S2"), 1, nullptr}}));
    const auto wrong_player = graph(observe(Seat::East, {{card("S3"), 1, play(Seat::North, "SA")}}));
    for (const auto& incompatible : {wrong_player, graph(play(Seat::West, "S3"))}) {
        const auto conflict = merge_plan_prefixes(observer, incompatible);
        require(conflict.conflicts == 1 && conflict.added_responses == 0 &&
            conflict.graph.nodes[conflict.graph.root].player == Seat::West &&
            conflict.graph.nodes[conflict.graph.root].edge_count == 1,
            "differing player or instruction kind contributed a response");
    }
    const auto wrong_actor = merge_plan_prefixes(graph(play(Seat::North, "SA")), graph(play(Seat::South, "SA")));
    require(wrong_actor.conflicts == 1 && wrong_actor.graph.nodes[wrong_actor.graph.root].player == Seat::North,
        "same card played by a different actor matched");
}

void test_proof_leaves_remain_recheck_instructions() {
    const auto empty = graph(nullptr);
    const auto continuation = graph(play(Seat::South, "CA"));
    for (const auto& proof : {
        proof_graph(PlanNodeKind::WinProof, PlanProofKind::DeclarerClaim),
        proof_graph(PlanNodeKind::WinProof, PlanProofKind::DeclarerQuickTricks),
        proof_graph(PlanNodeKind::LossProof, PlanProofKind::DdsLoss)}) {
        const auto inserted = merge_plan_prefixes(empty, proof);
        const auto retained = merge_plan_prefixes(proof, continuation);
        for (const auto& result : {inserted, retained}) {
            require(result.graph.nodes.size() == 1 && result.graph.edges.empty() &&
                result.graph.nodes[result.graph.root].kind == proof.nodes[proof.root].kind &&
                result.graph.nodes[result.graph.root].proof == proof.nodes[proof.root].proof,
                "merge changed or expanded a stored proof method");
        }
        require(inserted.filled_frontiers == 1 && retained.filled_frontiers == 0,
            "proof import/retention frontier accounting is wrong");
    }
    const auto retained = merge_plan_prefixes(continuation, empty);
    require(retained.graph.nodes.size() == continuation.nodes.size() &&
        retained.graph.nodes[retained.graph.root].card == card("CA"),
        "fallback frontier discarded existing deep instructions");
}

void test_pair_memoization_and_self_merge_preserve_sharing() {
    const auto primary = graph(observe(Seat::West, {
        {card("S2"), 1, nullptr}, {card("S3"), 1, nullptr},
    }));
    const auto shared = play(Seat::North, "SA");
    const auto fallback = graph(observe(Seat::West, {
        {card("S2"), 1, shared}, {card("S3"), 1, shared},
    }));
    const auto result = merge_plan_prefixes(primary, fallback);
    require(result.filled_frontiers == 1 && result.graph.nodes.size() == fallback.nodes.size(),
        "one shared node pair was treated as multiple independent instruction repairs");
    const auto self = merge_plan_prefixes(fallback, fallback);
    require(self.graph.nodes.size() == fallback.nodes.size() && self.filled_frontiers == 0 &&
        self.added_responses == 0 && self.conflicts == 0,
        "self merge changed instructions or reported spurious edits");
}

void test_both_inputs_and_metadata_are_validated() {
    const auto valid = graph(play(Seat::South, "SA"));
    auto wrong_target = valid;
    ++wrong_target.target_tricks;
    rejects([&] { merge_plan_prefixes(valid, wrong_target); });
    auto wrong_declarer = valid;
    wrong_declarer.declarer = Seat::North;
    rejects([&] { merge_plan_prefixes(valid, wrong_declarer); });
    auto cycle = valid;
    cycle.nodes[cycle.root].next = cycle.root;
    rejects([&] { merge_plan_prefixes(cycle, valid); });
    rejects([&] { merge_plan_prefixes(valid, cycle); });
    const auto wrong_proof = proof_graph(PlanNodeKind::WinProof, PlanProofKind::DdsLoss);
    rejects([&] { merge_plan_prefixes(valid, wrong_proof); });
    rejects([&] { merge_plan_prefixes(wrong_proof, valid); });
}

}  // namespace

int main() {
    try {
        test_shared_sibling_is_filled_in_its_corresponding_context_only();
        test_observation_union_preserves_exact_cards_and_interns_equal_suffixes();
        test_different_play_does_not_transplant_a_later_matching_suffix();
        test_proof_leaves_remain_recheck_instructions();
        test_pair_memoization_and_self_merge_preserve_sharing();
        test_both_inputs_and_metadata_are_validated();
        std::cout << "All plan prefix merge tests passed.\n";
    } catch (const std::exception& error) {
        std::cerr << "Plan prefix merge test failure: " << error.what() << '\n';
        return 1;
    }
}
