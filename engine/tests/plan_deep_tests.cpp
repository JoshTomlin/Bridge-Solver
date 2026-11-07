#include "bridge/analysis_session.h"
#include "bridge/plan_deep.h"
#include "bridge/plan_challenge.h"

#include <array>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace {
using namespace bridge;
void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
Card card(const char* text) { return parse_card(text).value(); }
Position position(std::array<const char*, 4> hands, Seat leader) {
    Position p;
    Hand remaining = 0;
    for (std::size_t i = 0; i < 4; ++i) { p.deal.hands[i] = parse_hand_record(hands[i]).value(); remaining |= p.deal.hands[i]; }
    p.played_cards = kFullDeck & ~remaining;
    p.current_trick.leader = leader;
    return p;
}
PlanTreeNode proof_node(PlanProofKind kind) {
    PlanTreeNode result;
    result.kind = plan_proof_is_win(kind) ? PlanNodeKind::WinProof : PlanNodeKind::LossProof;
    result.proof = kind;
    return result;
}

std::string json(const PlanDag& graph) {
    std::ostringstream output;
    write_plan_dag_json(output, graph);
    return output.str();
}

void require_stored_prefix(const PlanDag& prefix, PlanNodeId prefix_id,
    const PlanDag& full, PlanNodeId full_id) {
    const auto& a = prefix.nodes[prefix_id];
    const auto& b = full.nodes[full_id];
    if (a.kind == PlanNodeKind::Frontier) return;
    require(a.kind == b.kind, "short storage changed the full-lookahead instruction kind");
    if (a.kind == PlanNodeKind::Play) {
        require(a.player == b.player && a.card == b.card,
            "short storage changed a move chosen using full lookahead");
        require_stored_prefix(prefix, a.next, full, b.next);
    } else if (a.kind == PlanNodeKind::Observe) {
        require(a.player == b.player && a.edge_count == b.edge_count,
            "short storage removed a sampled defensive response");
        for (std::size_t i = 0; i < a.edge_count; ++i) {
            const auto& ae = prefix.edges[a.first_edge + i];
            const auto& be = full.edges[b.first_edge + i];
            require(ae.observation == be.observation, "stored observation changed with storage horizon");
            require_stored_prefix(prefix, ae.next, full, be.next);
        }
    } else require(a.proof == b.proof, "storage horizon changed the terminal proof");
}

void test_independent_storage_horizon_and_completed_pass_fallback() {
    const std::vector<AlphaMuWorld> worlds {
        {position({"AJT.-.-.-", "7.AK.-.-", "K32.-.-.-", "Q98.-.-.-"}, Seat::South)},
        {position({"AJT.-.-.-", "Q.AK.-.-", "K32.-.-.-", "987.-.-.-"}, Seat::South)},
    };
    AlphaMuConfig c {.declarer = Seat::South, .target_tricks = 3, .max_declarer_plies = 6};
    c.optimizations.iterative_deepening = false;
    c.optimizations.quick_trick_bounds = false;
    c.optimizations.claim_bounds = false;
    const auto full = build_deep_plan(worlds, c, {.seconds = 5});
    const auto bounded = build_deep_plan(worlds, c,
        {.seconds = 5, .max_stored_declarer_plies = 2});
    require(full.value_complete && bounded.value_complete && !bounded.budget_exhausted &&
        full.selected_wins == 3 && bounded.selected_wins == full.selected_wins &&
        bounded.graph.completed_m == 6 && bounded.search_stats.completed_depth == 6,
        "bounded storage shortened the value search");
    require(full.storage_passes == 0 && !full.storage_horizon_complete &&
        bounded.completed_storage_plies == 2 && bounded.storage_passes == 3 &&
        bounded.storage_horizon_complete, "completed storage-depth metadata is incorrect");
    require_stored_prefix(bounded.graph, bounded.graph.root, full.graph, full.graph.root);
    const auto& play = bounded.graph.nodes[bounded.graph.root];
    require(play.kind == PlanNodeKind::Play && play.card == card("SK"),
        "bounded plan lost the discovery play");
    const auto& response = bounded.graph.nodes[play.next];
    require(response.kind == PlanNodeKind::Observe && response.edge_count == 4,
        "completed storage pass did not cover all initial defensive responses");
    for (const auto& world : worlds) {
        const auto pending = evaluate_plan_dag(world.position, bounded.graph, c,
            {.frontier_mode = PlanFrontierMode::ReportUnresolved, .max_frontiers = 1000});
        require(pending.complete && pending.failures.empty() && !pending.proven_contract &&
            !pending.unresolved_frontiers.empty(), "shortened storage was mistaken for a full proof");
        for (const auto& frontier : pending.unresolved_frontiers) {
            unsigned declaring = 0;
            for (const auto& step : frontier.path) if (same_side(step.player, c.declarer)) ++declaring;
            require(declaring == 2, "completed pass left an uneven early frontier");
        }
        const auto feasible = evaluate_plan_dag(world.position, bounded.graph, c);
        require(feasible.survives_horizon && !feasible.proven_contract && feasible.dds_calls > 0,
            "DD-feasible bounded leaf became a winning certificate");
    }
    const auto interrupted = build_deep_plan(worlds, c,
        {.seconds = 5, .max_contexts = bounded.contexts + 1, .max_stored_declarer_plies = 6});
    require(interrupted.budget_exhausted && interrupted.stop_reason == "contexts" &&
        interrupted.contexts == bounded.contexts + 1 && interrupted.completed_storage_plies == 2 &&
        interrupted.storage_passes == 3 && !interrupted.storage_horizon_complete &&
        json(interrupted.graph) == json(bounded.graph),
        "interrupted deeper pass discarded or mixed into the previous broad instructions");
    const auto zero = build_deep_plan(worlds, c,
        {.seconds = 5, .max_stored_declarer_plies = 0});
    require(zero.value_complete && zero.selected_wins == full.selected_wins &&
        zero.storage_passes == 1 && zero.storage_horizon_complete && zero.contexts == 0 &&
        zero.graph.nodes[zero.graph.root].kind == PlanNodeKind::Frontier,
        "zero storage horizon changed search depth or generated instructions");
    bool rejected = false;
    try { (void)build_deep_plan(worlds, c, {.max_stored_declarer_plies = 27}); }
    catch (const std::invalid_argument&) { rejected = true; }
    require(rejected, "out-of-range storage horizon was accepted");
}

void test_public_and_layout_specific_bounds() {
    AlphaMuConfig c {.declarer = Seat::South, .target_tricks = 1, .max_declarer_plies = 26};
    const auto winning = position({"A.-.-.-", "2.-.-.-", "K.-.-.-", "3.-.-.-"}, Seat::South);
    const auto proof = prove_plan_terminal(winning, c);
    require(proof.win && proof.public_information && proof.kind == PlanProofKind::DeclarerQuickTricks,
        "public quick-trick bound not retained");
    require(recheck_plan_proof(PlanProofKind::DeclarerClaim, winning, c), "claim proof does not verify winning ending");
    const auto losing = position({"Q.-.-.-", "A.-.-.-", "J.-.-.-", "K.-.-.-"}, Seat::East);
    const auto defence = prove_plan_terminal(losing, c);
    require(defence.kind == PlanProofKind::DefenderQuickTricks && !defence.win && !defence.public_information,
        "defence bound should be a concrete-layout loss");
    require(recheck_plan_proof(PlanProofKind::DdsLoss, losing, c), "DDS loss should verify losing ending");
    auto different = winning; different.current_trick.leader = Seat::East;
    require(!recheck_plan_proof(PlanProofKind::DefenderQuickTricks, different, c), "defence proof leaked to another layout");
    c.target_tricks = 2;
    require(prove_plan_terminal(winning, c).kind == PlanProofKind::TargetImpossible, "remaining-trick upper bound lost");
    c.target_tricks = 0;
    require(prove_plan_terminal(winning, c).kind == PlanProofKind::TargetReached, "target-reached bound lost");
}

void test_shared_proof_rechecks_history_and_remaining_pool() {
    // East can spend the king now or retain it. The SAME instruction suffix
    // reaches a cashing proof in both histories, but only a spent king permits
    // the claim. Context must flow down the execution, not live on node 0.
    const auto root = position({"AQ.-.-.-", "K2.-.-.-", "J3.-.-.-", "T9.-.-.-"}, Seat::East);
    AlphaMuConfig c {.declarer = Seat::South, .target_tricks = 2};
    PlanDag graph;
    graph.declarer = c.declarer; graph.target_tricks = c.target_tricks; graph.root = 4;
    graph.nodes = {
        proof_node(PlanProofKind::DeclarerQuickTricks),
        {.kind = PlanNodeKind::Play, .player = Seat::North, .card = card("SA"), .next = 0},
        {.kind = PlanNodeKind::Observe, .player = Seat::West, .first_edge = 0, .edge_count = 2},
        {.kind = PlanNodeKind::Play, .player = Seat::South, .card = card("SJ"), .next = 2},
        {.kind = PlanNodeKind::Observe, .player = Seat::East, .first_edge = 2, .edge_count = 2},
    };
    graph.edges = {{card("S9"), 1}, {card("ST"), 1}, {card("S2"), 3}, {card("SK"), 3}};
    const auto result = evaluate_plan_dag(root, graph, c, {.max_frontiers = 4});
    require(result.complete && !result.proven_contract && result.failures.empty() &&
        result.checked_proofs == 4 && result.public_claims == 2 && result.rejected_proofs == 2 &&
        result.unresolved_frontiers.size() == 2, "a shared proof forgot the current sequence of plays");
    for (const auto& unresolved : result.unresolved_frontiers) {
        require(unresolved.path.front().card == card("S2") &&
            contains(hand_of(unresolved.position.deal, Seat::East), card("SK")),
            "failed proof did not retain the relevant public path/current layout");
    }
}

void test_direct_constructor_closes_final_defensive_response() {
    std::vector<AlphaMuWorld> worlds {
        {position({"A.-.-.-", "2.-.-.-", "K.-.-.-", "3.-.-.-"}, Seat::South)},
        {position({"A.-.-.-", "3.-.-.-", "K.-.-.-", "2.-.-.-"}, Seat::South)},
    };
    for (auto& world : worlds) play_card(world.position, card("SK"));
    AlphaMuConfig c {.declarer = Seat::South, .target_tricks = 1, .max_declarer_plies = 1};
    c.optimizations.quick_trick_bounds = false; c.optimizations.claim_bounds = false;
    const auto built = build_deep_plan(worlds, c, {.seconds = 5});
    const auto bounded = build_deep_plan(worlds, c,
        {.seconds = 5, .max_stored_declarer_plies = 1});
    require(built.value_complete && !built.budget_exhausted && built.selected_wins == 3,
        "small full continuation search did not complete");
    const auto stats = measure_plan_dag(built.graph);
    require(stats.frontiers == 0 && stats.win_proofs == 1, "final defender card left an artificial horizon");
    require(built.graph.nodes[built.graph.root].kind == PlanNodeKind::Observe &&
        built.graph.nodes[built.graph.root].edge_count == 2, "compatible layouts lost a legal defensive observation");
    for (const auto& world : worlds) {
        const auto evaluated = evaluate_plan_dag(world.position, built.graph, c,
            {.frontier_mode = PlanFrontierMode::ReportUnresolved});
        require(evaluated.proven_contract && evaluated.dds_calls == 0, "full continuation depends on a DDS winning leaf");
        require(evaluate_plan_dag(world.position, bounded.graph, c,
            {.frontier_mode = PlanFrontierMode::ReportUnresolved}).proven_contract,
            "bounded storage failed to finish the final defensive response");
    }
}

void test_proofs_budgets_and_dds_are_distinct() {
    const std::vector<AlphaMuWorld> worlds {{position({"A.-.-.-", "2.-.-.-", "K.-.-.-", "3.-.-.-"}, Seat::South)}};
    AlphaMuConfig c {.declarer = Seat::South, .target_tricks = 1, .max_declarer_plies = 26};
    const auto closed = build_deep_plan(worlds, c);
    const auto bounded_closed = build_deep_plan(worlds, c, {.max_stored_declarer_plies = 0});
    require(closed.graph.nodes.size() == 1 && closed.graph.nodes[0].kind == PlanNodeKind::WinProof && closed.contexts == 0,
        "public proof unnecessarily expanded a full plan");
    require(evaluate_plan_dag(worlds[0].position, closed.graph, c).proven_contract,
        "public terminal proof was not verified");
    require(bounded_closed.storage_horizon_complete && bounded_closed.contexts == 0 &&
        bounded_closed.graph.nodes[bounded_closed.graph.root].kind == PlanNodeKind::WinProof,
        "storage frontier prevented a public proof");
    const auto timed = build_deep_plan(worlds, c, {.seconds = 1e-30});
    require(timed.budget_exhausted && timed.graph.nodes[timed.graph.root].kind == PlanNodeKind::Frontier,
        "expired construction budget became a proof");
    require(timed.graph.completed_m == 0 && timed.search_stats.completed_depth == 0,
        "expired construction advertised an unsearched depth");
    const auto capped = build_deep_plan(worlds, c, {.max_nodes = 1});
    require(capped.budget_exhausted && measure_plan_dag(capped.graph).frontiers == 1, "node budget silently accepted proof");
    c.max_declarer_plies = 0; c.optimizations.quick_trick_bounds = false; c.optimizations.claim_bounds = false;
    const auto shallow = build_deep_plan(worlds, c);
    const auto unresolved = evaluate_plan_dag(worlds[0].position, shallow.graph, c,
        {.frontier_mode = PlanFrontierMode::ReportUnresolved});
    require(shallow.selected_wins == 1 && !unresolved.proven_contract && !unresolved.unresolved_frontiers.empty(),
        "DDS search value became a constructed certificate");
    c.max_declarer_plies = 27;
    bool rejected = false;
    try { (void)build_deep_plan(worlds, c); } catch (const std::invalid_argument&) { rejected = true; }
    require(rejected, "out-of-range M was accepted");
}

void test_exact_context_evaluation_cache() {
    // The defenders can spend the same two cards in different orders. After
    // two complete tricks these histories reach the same actual position and
    // instruction, while histories retaining different cards remain distinct.
    const auto root = position({"AKQ.-.-.-", "987.-.-.-", "JT6.-.-.-", "543.-.-.-"}, Seat::North);
    AlphaMuConfig c {.declarer = Seat::South, .target_tricks = 3};
    PlanDag graph;
    graph.declarer = c.declarer; graph.target_tricks = c.target_tricks; graph.root = 8;
    graph.nodes = {
        proof_node(PlanProofKind::DeclarerQuickTricks),
        {.kind = PlanNodeKind::Observe, .player = Seat::West, .first_edge = 0, .edge_count = 3},
        {.kind = PlanNodeKind::Play, .player = Seat::South, .card = card("ST"), .next = 1},
        {.kind = PlanNodeKind::Observe, .player = Seat::East, .first_edge = 3, .edge_count = 3},
        {.kind = PlanNodeKind::Play, .player = Seat::North, .card = card("SK"), .next = 3},
        {.kind = PlanNodeKind::Observe, .player = Seat::West, .first_edge = 6, .edge_count = 3},
        {.kind = PlanNodeKind::Play, .player = Seat::South, .card = card("SJ"), .next = 5},
        {.kind = PlanNodeKind::Observe, .player = Seat::East, .first_edge = 9, .edge_count = 3},
        {.kind = PlanNodeKind::Play, .player = Seat::North, .card = card("SA"), .next = 7},
    };
    graph.edges = {
        {card("S3"), 0}, {card("S4"), 0}, {card("S5"), 0},
        {card("S7"), 2}, {card("S8"), 2}, {card("S9"), 2},
        {card("S3"), 4}, {card("S4"), 4}, {card("S5"), 4},
        {card("S7"), 6}, {card("S8"), 6}, {card("S9"), 6},
    };
    PlanEvaluationOptions options;
    options.max_witnesses = 1000; options.max_frontiers = 1000;
    options.diagnose_losses = false;
    options.frontier_mode = PlanFrontierMode::ReportUnresolved;
    options.max_cached_contexts = 0;
    const auto uncached = evaluate_plan_dag(root, graph, c, options);
    options.max_cached_contexts = 100000;
    const auto cached = evaluate_plan_dag(root, graph, c, options);
    require(uncached.complete && cached.complete && uncached.proven_contract && cached.proven_contract &&
        uncached.failures.empty() && cached.failures.empty() &&
        uncached.unresolved_frontiers.empty() && cached.unresolved_frontiers.empty(),
        "successful-context cache changed the proven outcome");
    require(uncached.cache_hits == 0 && cached.cache_hits > 0 && cached.visited_nodes < uncached.visited_nodes &&
        cached.checked_proofs < uncached.checked_proofs,
        "equivalent execution contexts were not reused");
    options.max_cached_contexts = 1;
    const auto bounded = evaluate_plan_dag(root, graph, c, options);
    require(bounded.proven_contract && bounded.cache_hits > 0 && bounded.cache_hits < cached.cache_hits,
        "successful-context cache ignored its capacity");

    graph.nodes[0] = PlanTreeNode {};
    options.frontier_mode = PlanFrontierMode::Dds;
    options.max_cached_contexts = 0;
    const auto dds_uncached = evaluate_plan_dag(root, graph, c, options);
    options.max_cached_contexts = 100000;
    const auto dds_cached = evaluate_plan_dag(root, graph, c, options);
    require(dds_uncached.survives_horizon && dds_cached.survives_horizon &&
        !dds_uncached.proven_contract && !dds_cached.proven_contract &&
        dds_cached.frontier_survivors > 0 && dds_cached.cache_hits > 0 &&
        dds_cached.dds_calls < dds_uncached.dds_calls,
        "cached DDS survival became a public proof or was not reused");

    options.frontier_mode = PlanFrontierMode::ReportUnresolved;
    options.max_cached_contexts = 0;
    const auto unresolved_uncached = evaluate_plan_dag(root, graph, c, options);
    options.max_cached_contexts = 100000;
    const auto unresolved_cached = evaluate_plan_dag(root, graph, c, options);
    require(unresolved_cached.complete && unresolved_uncached.complete &&
        !unresolved_cached.survives_horizon && !unresolved_uncached.survives_horizon &&
        unresolved_cached.cache_hits == 0 &&
        unresolved_cached.unresolved_frontiers.size() == unresolved_uncached.unresolved_frontiers.size(),
        "unresolved contexts were cached or witnesses were lost");

    c.target_tricks = 4; graph.target_tricks = 4;
    options.frontier_mode = PlanFrontierMode::Dds;
    options.max_cached_contexts = 0;
    const auto failed_uncached = evaluate_plan_dag(root, graph, c, options);
    options.max_cached_contexts = 100000;
    const auto failed_cached = evaluate_plan_dag(root, graph, c, options);
    require(failed_cached.complete && failed_uncached.complete &&
        !failed_cached.survives_horizon && !failed_uncached.survives_horizon &&
        failed_cached.cache_hits == 0 &&
        failed_cached.failures.size() == failed_uncached.failures.size() &&
        failed_cached.visited_nodes == failed_uncached.visited_nodes,
        "a repeated deduplicated failure was mistaken for a successful subtree");
    options.max_seconds = 1e-30;
    require(!evaluate_plan_dag(root, graph, c, options).complete,
        "enabling context reuse bypassed the evaluation deadline");
}
}
int main() {
    try {
        test_public_and_layout_specific_bounds();
        test_independent_storage_horizon_and_completed_pass_fallback();
        test_shared_proof_rechecks_history_and_remaining_pool();
        test_direct_constructor_closes_final_defensive_response();
        test_proofs_budgets_and_dds_are_distinct();
        test_exact_context_evaluation_cache();
        std::cout << "All deep plan and contextual proof tests passed.\n";
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
