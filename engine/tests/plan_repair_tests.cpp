#include "bridge/analysis_session.h"
#include "bridge/plan_repair.h"

#include <array>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace {
using namespace bridge;
using Policy = std::shared_ptr<AlphaMuPolicyNode>;
void require(bool condition, const char* message) { if (!condition) throw std::runtime_error(message); }
template<class F> void rejects(F action) {
    try { action(); } catch (const std::exception&) { return; }
    throw std::runtime_error("invalid operation was accepted");
}
Card card(const char* text) { return parse_card(text).value(); }
Position position(std::array<const char*, 4> hands, Seat leader) {
    Position result;
    Hand remaining = 0;
    for (std::size_t i = 0; i < 4; ++i) {
        result.deal.hands[i] = parse_hand_record(hands[i]).value();
        remaining |= result.deal.hands[i];
    }
    result.played_cards = kFullDeck & ~remaining;
    result.current_trick.leader = leader;
    return result;
}
Policy play(Seat player, const char* move, Policy next = nullptr) {
    auto result = std::make_shared<AlphaMuPolicyNode>();
    result->player = player; result->declarer_move = card(move); result->continuation = next;
    return result;
}
Policy observe(Seat player, std::initializer_list<AlphaMuPolicyBranch> branches) {
    auto result = std::make_shared<AlphaMuPolicyNode>();
    result->player = player; result->defender_branches = branches;
    return result;
}
PlanDag graph(Policy policy, const AlphaMuConfig& config) {
    AlphaMuResult result;
    result.trick_policy = policy; result.stats.completed_depth = config.max_declarer_plies;
    return compress_plan_tree(capture_plan_tree(result, config)).graph;
}
std::string json(const PlanDag& graph) { std::ostringstream out; write_plan_dag_json(out, graph); return out.str(); }
PlanNodeId step(const PlanDag& graph, PlanNodeId node, Seat player, const char* move) {
    const auto result = advance_plan_dag(graph, node, player, card(move));
    require(result.has_value(), "expected stored transition"); return *result;
}

void test_occurrence_edit_does_not_change_shared_sibling() {
    AlphaMuConfig config {.declarer = Seat::South, .target_tricks = 1, .max_declarer_plies = 1};
    auto shared = play(Seat::North, "SA");
    const auto original = graph(observe(Seat::West, {{card("S8"), 1, shared}, {card("S9"), 1, shared}}), config);
    const auto before = json(original);
    require(step(original, original.root, Seat::West, "S8") == step(original, original.root, Seat::West, "S9"),
        "fixture must genuinely share its continuation");
    const auto replacement = graph(play(Seat::South, "CK"), config);
    const auto edited = patch_plan_occurrence(original,
        {{Seat::West, card("S8")}, {Seat::North, card("SA")}}, replacement);
    const auto eight = step(edited, edited.root, Seat::West, "S8");
    const auto nine = step(edited, edited.root, Seat::West, "S9");
    const auto changed = step(edited, eight, Seat::North, "SA");
    const auto unchanged = step(edited, nine, Seat::North, "SA");
    require(edited.nodes[changed].kind == PlanNodeKind::Play && edited.nodes[changed].card == card("CK"),
        "selected occurrence did not receive replacement");
    require(edited.nodes[unchanged].kind == PlanNodeKind::Frontier,
        "editing one shared occurrence changed another history");
    require(json(original) == before && edited.variable_horizon, "source mutated or depth metadata lost");
    measure_plan_dag(edited);
    const auto extracted = plan_continuation(edited, changed);
    require(extracted.nodes.size() == 2 && extracted.nodes[extracted.root].card == card("CK"),
        "continuation extraction retained unreachable instructions");
    const auto grafted = patch_plan_occurrence(original, {{Seat::West, card("S7")}}, graph(shared, config));
    require(advance_plan_dag(grafted, grafted.root, Seat::West, card("S7")).has_value(), "missing observation was not attached");
    rejects([&] { patch_plan_occurrence(original, {{Seat::East, card("S8")}}, replacement); });
    rejects([&] { patch_plan_occurrence(original, {{Seat::West, card("S7")}, {Seat::North, card("SA")}}, replacement); });
}

void test_frontier_modes_and_proof_boundary() {
    const auto root = position({"A.-.-.-", "2.-.-.-", "K.-.-.-", "3.-.-.-"}, Seat::South);
    AlphaMuConfig config {.declarer = Seat::South, .target_tricks = 1};
    const auto empty = graph(nullptr, config);
    const auto dds = evaluate_plan_dag(root, empty, config);
    require(dds.survives_horizon && !dds.proven_contract && dds.frontier_survivors == 1,
        "DDS optimism became a full contract certificate");
    const auto pending = evaluate_plan_dag(root, empty, config,
        {.frontier_mode = PlanFrontierMode::ReportUnresolved});
    require(!pending.survives_horizon && !pending.proven_contract && pending.unresolved_frontiers.size() == 1 && pending.dds_calls == 0,
        "unfinished frontier was treated as success or called DDS");
    const auto claim = evaluate_plan_dag(root, empty, config, {.frontier_mode = PlanFrontierMode::PublicClaim});
    require(claim.proven_contract && claim.public_claims == 1 && claim.dds_calls == 0,
        "public one-trick claim should certify this simple ending");
    const auto expired = evaluate_plan_dag(root, empty, config,
        {.max_seconds = 1e-30, .frontier_mode = PlanFrontierMode::PublicClaim});
    require(!expired.complete && !expired.proven_contract, "expired proof budget reported success");
}

void test_missing_observation_reuses_valid_suffix() {
    const auto root = position({"A2.-.-.-", "KQ.-.-.-", "J3.-.-.-", "98.-.-.-"}, Seat::West);
    AlphaMuConfig config {.declarer = Seat::South, .target_tricks = 1, .max_declarer_plies = 1};
    const auto original = graph(observe(Seat::West, {{card("S9"), 1, play(Seat::North, "SA")}}), config);
    const auto before = json(original);
    const auto failed = evaluate_plan_dag(root, original, config, {.max_witnesses = 1});
    require(failed.failures.size() == 1 && failed.failures[0].card == card("S8"), "fixture missing response differs");
    const auto repaired = repair_plan_failure(original, {{root}}, 0, failed.failures[0], config);
    require(repaired.accepted && repaired.reused_continuation && repaired.search_ms == 0,
        "valid sibling should be reused without alpha-mu search");
    require(evaluate_plan_dag(root, repaired.graph, config).survives_horizon, "repaired plan still has the missing branch");
    require(json(original) == before, "repair mutated the saved source plan");
}

void test_failed_sibling_reuse_reserves_a_search_attempt() {
    const auto root = position({"A.-.-.-", "2.-.-.-", "K.-.-.-", "8.-.-.-"}, Seat::West);
    AlphaMuConfig config {.declarer = Seat::South, .target_tricks = 1, .max_declarer_plies = 1};
    // Every existing continuation asks North for a different card it does not
    // hold. The absent S8 response therefore needs a newly searched suffix.
    const auto original = graph(observe(Seat::West, {
        {card("S9"), 1, play(Seat::North, "S3")},
        {card("ST"), 1, play(Seat::North, "S4")},
        {card("SJ"), 1, play(Seat::North, "S5")},
    }), config);
    const auto failed = evaluate_plan_dag(root, original, config, {.max_witnesses = 1});
    require(failed.failures.size() == 1 && failed.failures.front().card == card("S8"),
        "fixture must reach its missing observation before a stored suffix");
    for (const std::size_t attempts : {std::size_t{1}, std::size_t{2}}) {
        const auto repaired = repair_plan_failure(original, {{root}}, 0, failed.failures.front(), config,
            {.local_m = 1, .maximum_attempts = attempts, .seconds = 5});
        require(repaired.accepted && !repaired.reused_continuation && repaired.local_worlds > 0,
            "failed sibling reuse exhausted the budget before fresh local search");
        require(repaired.attempts <= attempts, "repair exceeded its attempt budget");
        require(evaluate_plan_dag(root, repaired.graph, config).survives_horizon,
            "newly searched missing-observation continuation does not make target");
    }
}

void test_real_loss_backtracks_to_earlier_choice() {
    const auto root = position({"-.-.-.A2", "-.-.2.K", "-.-.3.Q", "-.-.4.J"}, Seat::North);
    AlphaMuConfig config {.declarer = Seat::North, .target_tricks = 2, .max_declarer_plies = 1};
    const auto original = graph(play(Seat::North, "C2"), config);
    const auto failed = evaluate_plan_dag(root, original, config, {.diagnose_losses = false});
    require(failed.failures.size() == 1 && failed.failures.front().card == kNoCard, "fixture must fail after irreversible bad choice");
    const auto repaired = repair_plan_failure(original, {{root}}, 0, failed.failures.front(), config,
        {.local_m = 2, .maximum_attempts = 5, .seconds = 5});
    require(repaired.accepted && repaired.changed_at_root && !repaired.reused_continuation,
        "a lost continuation must backtrack to a repairable earlier choice");
    require(repaired.graph.nodes[repaired.graph.root].card == card("CA"), "repair failed to preserve the club entry");
    require(evaluate_plan_dag(root, repaired.graph, config).survives_horizon, "repaired choice does not make target");
}

void test_frontier_extension_at_defender_turn_and_archive_checks() {
    const std::vector<AlphaMuWorld> archive {
        {position({"A.-.-.-", "2.-.-.-", "K.-.-.-", "3.-.-.-"}, Seat::South)},
        {position({"A.-.-.-", "3.-.-.-", "K.-.-.-", "2.-.-.-"}, Seat::South)},
    };
    AlphaMuConfig config {.declarer = Seat::South, .target_tricks = 1, .max_declarer_plies = 1};
    const auto original = graph(play(Seat::South, "SK"), config);
    const auto pending = evaluate_plan_dag(archive.front().position, original, config,
        {.frontier_mode = PlanFrontierMode::ReportUnresolved});
    const auto& frontier = pending.unresolved_frontiers.at(0);
    require(frontier.path.size() == 1 && next_to_play(frontier.position.current_trick) == Seat::West,
        "fixture must require constructing defensive observations before alpha-mu's declarer root");
    const auto deeper = extend_plan_frontier(original, archive, 0, frontier, config,
        {.local_m = 2, .seconds = 5});
    require(deeper.accepted && deeper.compatible_worlds == 2 && deeper.validation_worlds >= 2,
        "extension must be verified in all compatible archived layouts");
    for (const auto& world : archive) {
        const auto proof = evaluate_plan_dag(world.position, deeper.graph, config,
            {.frontier_mode = PlanFrontierMode::ReportUnresolved});
        require(proof.proven_contract && proof.unresolved_frontiers.empty() && proof.dds_calls == 0,
            "finished one-trick extension must win without DDS leaf assumptions");
    }
    const auto timed = extend_plan_frontier(original, archive, 0, frontier, config,
        {.local_m = 2, .seconds = 1e-30});
    require(!timed.accepted && timed.unknown_checks && json(timed.graph) == json(original),
        "failed/budgeted repair must preserve the saved graph");
}
}

int main() {
    try {
        test_occurrence_edit_does_not_change_shared_sibling();
        test_frontier_modes_and_proof_boundary();
        test_missing_observation_reuses_valid_suffix();
        test_failed_sibling_reuse_reserves_a_search_attempt();
        test_real_loss_backtracks_to_earlier_choice();
        test_frontier_extension_at_defender_turn_and_archive_checks();
        std::cout << "All persistent plan repair tests passed.\n";
    } catch (const std::exception& error) {
        std::cerr << "Plan repair test failure: " << error.what() << '\n'; return 1;
    }
}
