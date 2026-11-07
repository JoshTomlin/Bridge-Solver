#include "bridge/analysis_session.h"
#include "bridge/dds_solver.h"
#include "bridge/plan_challenge.h"

#include <algorithm>
#include <array>
#include <bit>
#include <iostream>
#include <set>
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

Position position(std::array<const char*, 4> hands, Seat leader = Seat::South) {
    Position result;
    Hand remaining = kEmptyHand;
    for (std::size_t i = 0; i < hands.size(); ++i) {
        result.deal.hands[i] = parse_hand_record(hands[i]).value();
        require(!(remaining & result.deal.hands[i]), "fixture hands overlap");
        remaining |= result.deal.hands[i];
    }
    result.played_cards = kFullDeck & ~remaining;
    result.current_trick.leader = leader;
    return result;
}

Policy play(Seat player, const char* move, Policy next = nullptr) {
    auto node = std::make_shared<AlphaMuPolicyNode>();
    node->player = player;
    node->declarer_move = card(move);
    node->continuation = std::move(next);
    return node;
}

Policy observe(Seat player, std::initializer_list<AlphaMuPolicyBranch> branches = {}) {
    auto node = std::make_shared<AlphaMuPolicyNode>();
    node->player = player;
    node->defender_branches = branches;
    return node;
}

PlanDag graph(const Policy& policy, const AlphaMuConfig& config) {
    AlphaMuResult result;
    result.trick_policy = policy;
    result.stats.completed_depth = config.max_declarer_plies;
    return compress_plan_tree(capture_plan_tree(result, config)).graph;
}

std::vector<AlphaMuWorld> discovery_pool() {
    // All 20 allocations of six hidden cards, with the same visible hands.
    // This small exhaustive pool lets drawing tests check legality by index.
    const std::array<Card, 6> hidden {
        card("S7"), card("S8"), card("S9"), card("SQ"), card("HA"), card("HK")};
    const auto base = position({"AJT.-.-.-", "7.AK.-.-", "K32.-.-.-", "Q98.-.-.-"});
    std::vector<AlphaMuWorld> pool;
    for (unsigned bits = 0; bits < (1U << hidden.size()); ++bits) {
        if (std::popcount(bits) != 3) continue;
        auto current = base;
        current.deal.hands[seat_index(Seat::East)] = kEmptyHand;
        current.deal.hands[seat_index(Seat::West)] = kEmptyHand;
        for (std::size_t i = 0; i < hidden.size(); ++i) {
            const Seat owner = (bits & (1U << i)) ? Seat::East : Seat::West;
            hand_of(current.deal, owner) |= hidden[i];
        }
        pool.push_back({current});
    }
    return pool;
}

void test_real_policies_match_pointer_evaluation() {
    const std::vector<AlphaMuWorld> training {
        {position({"AJT.-.-.-", "7.AK.-.-", "K32.-.-.-", "Q98.-.-.-"})},
        {position({"AJT.-.-.-", "Q.AK.-.-", "K32.-.-.-", "987.-.-.-"})},
    };
    const auto unseen = discovery_pool();
    std::size_t passes = 0, failures = 0;
    for (std::uint8_t m = 1; m <= 6; ++m) {
        AlphaMuConfig config {
            .declarer = Seat::South,
            .target_tricks = 3,
            .max_declarer_plies = m,
            .build_trick_policy = true,
            .limit_policy_to_current_trick = false,
        };
        config.optimizations.iterative_deepening = false;
        const auto search = alpha_mu_search(training, config);
        const auto dag = compress_plan_tree(capture_plan_tree(search, config)).graph;
        const auto compare = [&](const AlphaMuWorld& world) {
            const auto reference = evaluate_alpha_mu_policy(world.position, search.trick_policy, config);
            const auto evaluated = evaluate_plan_dag(world.position, dag, config, {
                .max_witnesses = 1, .diagnose_losses = false,
            });
            require(evaluated.survives_horizon == reference.makes_target,
                "DAG changed fixed-policy survival on a training or unseen layout");
            if (reference.makes_target) {
                require(evaluated.complete && evaluated.failures.empty(),
                    "passing a layout requires exhaustive execution without failures");
                ++passes;
            } else {
                require(evaluated.failures.size() == 1, "first-failure check lost its witness");
                const auto kind = evaluated.failures.front().kind;
                require((kind != PlanFailureKind::DdLoss) == reference.unsupported_observation,
                    "DAG changed a coverage gap into a loss, or vice versa");
                ++failures;
            }
        };
        for (const auto& world : training) compare(world);
        for (const auto& world : unseen) compare(world);
    }
    require(passes && failures, "oracle comparison must exercise success and failure");
}

void test_multiple_missing_responses_and_limits() {
    const auto state = position({"A.A.-.A", "2.2.-.2", "K.K.-.K", "Q.Q.-.Q"}, Seat::East);
    const AlphaMuConfig config {.declarer = Seat::South, .target_tricks = 1};
    const auto dag = graph(observe(Seat::East), config);
    const auto all = evaluate_plan_dag(state, dag, config, {.max_witnesses = 8});
    require(!all.survives_horizon && all.complete && all.failures.size() == 3,
        "one layout must expose every distinct missing response when budgets allow");
    std::set<Card> missing;
    for (const auto& failure : all.failures) {
        require(failure.kind == PlanFailureKind::MissingObservation,
            "an absent legal defensive branch must be a coverage gap");
        require(failure.path.size() == 1 && failure.path.back().player == Seat::East,
            "missing-response witness must retain its public observation");
        require(failure.path.back().card == failure.card &&
            is_legal_play(state.current_trick, hand_of(state.deal, Seat::East), failure.card),
            "missing response must refer to an actually legal card");
        missing.insert(failure.card);
    }
    require(missing.size() == 3, "repeated witnesses must not replace different replies");
    const auto limited = evaluate_plan_dag(state, dag, config, {.max_witnesses = 1});
    require(!limited.survives_horizon && !limited.complete && limited.failures.size() == 1,
        "stopping after one of several witnesses must mark traversal incomplete");

    const auto one_trick = position({"A.-.-.-", "2.-.-.-", "K.-.-.-", "3.-.-.-"});
    const auto full = graph(play(Seat::South, "SK", observe(Seat::West, {
        {card("S3"), 1, play(Seat::North, "SA", observe(Seat::East, {
            {card("S2"), 1, nullptr},
        }))},
    })), config);
    const auto capped = evaluate_plan_dag(one_trick, full, config, {.max_nodes = 1});
    require(!capped.survives_horizon && !capped.complete && capped.failures.empty(),
        "a node budget must never turn unvisited defence into a successful plan");
    const auto exhausted = evaluate_plan_dag(one_trick, full, config);
    require(exhausted.survives_horizon && exhausted.complete && exhausted.frontier_survivors == 0,
        "completed target must be recognized before an unused frontier instruction");
}

void test_frontier_and_terminal_are_distinct() {
    auto state = position({"A.-.-.-", "2.-.-.-", "K.-.-.-", "3.-.-.-"});
    const AlphaMuConfig config {.declarer = Seat::South, .target_tricks = 1};
    const auto frontier = graph(nullptr, config);
    const auto optimistic = evaluate_plan_dag(state, frontier, config);
    require(optimistic.survives_horizon && optimistic.complete && optimistic.frontier_survivors == 1 &&
        optimistic.dds_calls == 1, "DDS-makeable frontier must remain an optimistic horizon result");

    for (const char* move : {"SK", "S3", "SA", "S2"}) play_card(state, card(move));
    const auto won = evaluate_plan_dag(state, frontier, config);
    require(won.survives_horizon && won.complete && won.frontier_survivors == 0 && won.dds_calls == 0,
        "a finished winning deal must not be counted as a DDS horizon survivor");
    state.score = {};
    const auto lost = evaluate_plan_dag(state, frontier, config);
    require(!lost.survives_horizon && lost.complete && lost.frontier_survivors == 0 &&
        lost.failures.size() == 1 && lost.failures.front().kind == PlanFailureKind::DdLoss,
        "a finished losing deal must provide a real failure witness");
}

void test_loss_diagnosis_and_validation() {
    const auto state = position({"-.-.-.A2", "-.-.2.K", "-.-.3.Q", "-.-.4.J"}, Seat::North);
    const AlphaMuConfig config {.declarer = Seat::North, .target_tricks = 2, .max_declarer_plies = 1};
    require(double_dummy_future_tricks(state, Seat::North) == 2,
        "diagnostic fixture must initially make its contract");
    const auto dag = graph(play(Seat::North, "C2"), config);
    const auto failed = evaluate_plan_dag(state, dag, config);
    require(!failed.survives_horizon && failed.failures.size() == 1,
        "a legal but losing stored card must refute the plan");
    const auto& witness = failed.failures.front();
    require(witness.kind == PlanFailureKind::DdLoss && witness.diagnosed_choice &&
        witness.node == dag.root && witness.card == card("C2"),
        "diagnosis must identify the declarer choice that discarded DD makeability");
    require(contains(witness.making_moves, card("CA")) && !contains(witness.making_moves, card("C2")),
        "DDS diagnosis must record the alternative that preserves the contract");
    require(witness.position.deal.hands == state.deal.hands && witness.path.size() == 1 &&
        witness.path.front().card == card("C2"),
        "choice diagnosis must retain the position before the losing play and its witness path");

    const auto illegal = evaluate_plan_dag(state, graph(play(Seat::North, "C3"), config), config);
    require(!illegal.survives_horizon && illegal.failures.size() == 1 &&
        illegal.failures.front().kind == PlanFailureKind::IllegalInstruction,
        "a card absent from the declarer's hand must be an illegal instruction");
    auto corrupt = dag;
    corrupt.nodes[corrupt.root].next = corrupt.root;
    require_rejected([&] { evaluate_plan_dag(state, corrupt, config); },
        "an executable plan must reject graph cycles");
    auto wrong_target = config;
    wrong_target.target_tricks = 1;
    require_rejected([&] { evaluate_plan_dag(state, dag, wrong_target); },
        "evaluation must not silently change stored contract metadata");
    require_rejected([&] { evaluate_plan_dag(state, dag, config, {.max_nodes = 0}); },
        "zero node budget must be rejected");
    require_rejected([&] { evaluate_plan_dag(state, dag, config, {.max_witnesses = 0}); },
        "zero witness budget must be rejected");
}

void test_partial_mining_continues_past_gaps_and_rejected_proofs() {
    // West's diamond lead is visited first and is absent from the plan. The
    // covered club lead then exposes a bad declarer instruction. A gap must
    // not use up the one available genuine-loss witness.
    const auto state = position({"-.-.-.A2", "-.-.2.K", "-.-.3.Q", "-.-.4.J"}, Seat::West);
    const AlphaMuConfig config {.declarer = Seat::North, .target_tricks = 1};
    require(double_dummy_future_tricks(state, Seat::North) >= 1,
        "partial mining fixture must initially be makeable");
    const auto dag = graph(observe(Seat::West, {
        {card("CJ"), 1, play(Seat::North, "C2")},
    }), config);
    const auto strict = evaluate_plan_dag(state, dag, config, {.max_witnesses = 1});
    require(!strict.complete && strict.failures.size() == 1 && strict.coverage_gaps == 1 &&
        strict.failures.front().kind == PlanFailureKind::MissingObservation && strict.dd_losses == 0,
        "legacy first-gap behavior changed");
    const PlanEvaluationOptions mining {.max_witnesses = 1, .mine_partial_plan = true};
    const auto mined = evaluate_plan_dag(state, dag, config, mining);
    require(mined.complete && !mined.survives_horizon && !mined.proven_contract &&
        mined.coverage_gaps == 1 && mined.coverage_gap_witnesses.size() == 1 &&
        mined.frontier_survivors == 1 && mined.dd_feasible_frontier_witnesses.size() == 1 &&
        mined.dd_losses == 1 && mined.failures.size() == 1,
        "an earlier gap hid the covered losing instruction during partial mining");
    require(mined.failures.front().kind == PlanFailureKind::DdLoss &&
        mined.failures.front().diagnosed_choice && mined.failures.front().card == card("C2") &&
        contains(mined.failures.front().making_moves, card("CA")),
        "partial mining did not diagnose the saved card that lost the contract");
    const auto& feasible = mined.dd_feasible_frontier_witnesses.front();
    require(feasible.reason == PlanFrontierReason::MissingObservation && feasible.path.size() == 1 &&
        feasible.path.front().card == card("D4") && feasible.position.current_trick.card_count == 1 &&
        !contains(hand_of(feasible.position.deal, Seat::West), card("D4")),
        "a gap's DD frontier must retain the state after the missing defensive response");

    // A deliberately inapplicable proof method behaves like an unresolved
    // leaf. Mining rechecks it with DD and continues, without certifying it.
    auto rejected_dag = graph(observe(Seat::West, {
        {card("D4"), 1, nullptr},
        {card("CJ"), 1, play(Seat::North, "C2")},
    }), config);
    for (auto& node : rejected_dag.nodes) {
        if (node.kind != PlanNodeKind::Frontier) continue;
        node.kind = PlanNodeKind::WinProof;
        node.proof = PlanProofKind::TargetReached;
    }
    const auto rejected_strict = evaluate_plan_dag(state, rejected_dag, config);
    require(!rejected_strict.complete && rejected_strict.rejected_proofs == 1 &&
        rejected_strict.unresolved_frontiers.size() == 1 && rejected_strict.dd_losses == 0,
        "default rejected-proof handling should still stop at its frontier budget");
    const auto rejected_mined = evaluate_plan_dag(state, rejected_dag, config, mining);
    require(rejected_mined.complete && !rejected_mined.proven_contract &&
        rejected_mined.checked_proofs == 2 && rejected_mined.rejected_proofs == 2 &&
        rejected_mined.unresolved_frontiers.empty() && rejected_mined.frontier_survivors == 1 &&
        rejected_mined.dd_losses == 1 && rejected_mined.failures.size() == 1 &&
        rejected_mined.failures.front().frontier_reason == PlanFrontierReason::RejectedProof &&
        rejected_mined.dd_feasible_frontier_witnesses.front().reason == PlanFrontierReason::RejectedProof,
        "rejected proofs blocked later loss mining or became an unconditional win");
}

void test_partial_mining_caps_and_missing_response_loss_origin() {
    const auto state = position({"A.A.-.A", "2.2.-.2", "K.K.-.K", "Q.Q.-.Q"}, Seat::East);
    const AlphaMuConfig config {.declarer = Seat::South, .target_tricks = 1};
    const auto dag = graph(observe(Seat::East), config);
    PlanEvaluationOptions options {
        .max_witnesses = 1, .mine_partial_plan = true, .max_partial_witnesses = 1,
    };
    const auto capped = evaluate_plan_dag(state, dag, config, options);
    require(capped.complete && !capped.survives_horizon && !capped.proven_contract &&
        capped.coverage_gaps == 3 && capped.frontier_survivors == 3 && capped.failures.empty() &&
        capped.coverage_gap_witnesses.size() == 1 && capped.dd_feasible_frontier_witnesses.size() == 1,
        "partial-witness retention limits must not stop traversal or lose event counts");
    options.max_partial_witnesses = 0;
    const auto counters_only = evaluate_plan_dag(state, dag, config, options);
    require(counters_only.complete && !counters_only.proven_contract &&
        counters_only.coverage_gaps == 3 && counters_only.frontier_survivors == 3 &&
        counters_only.coverage_gap_witnesses.empty() && counters_only.dd_feasible_frontier_witnesses.empty(),
        "zero partial-witness storage must retain conservative results and counters");

    const auto losing_state = position({"-.-.-.A2", "-.-.2.K", "-.-.3.Q", "-.-.4.J"}, Seat::North);
    const AlphaMuConfig losing_config {.declarer = Seat::North, .target_tricks = 2};
    require(double_dummy_future_tricks(losing_state, Seat::North) == 2,
        "post-gap loss fixture must start makeable");
    const auto losing_dag = graph(play(Seat::North, "C2", observe(Seat::East)), losing_config);
    const auto failed = evaluate_plan_dag(losing_state, losing_dag, losing_config, options);
    require(failed.complete && !failed.proven_contract && failed.coverage_gaps == 1 &&
        failed.dd_losses == 1 && failed.failures.size() == 1 &&
        failed.failures.front().frontier_reason == PlanFrontierReason::MissingObservation &&
        failed.failures.front().diagnosed_choice && failed.failures.front().card == card("C2"),
        "DD loss found at a gap must retain its origin and earlier losing declarer choice");

    options.max_nodes = 1;
    const auto interrupted = evaluate_plan_dag(losing_state, losing_dag, losing_config, options);
    require(!interrupted.complete && !interrupted.proven_contract && interrupted.failures.empty(),
        "mining must still obey the node budget without claiming unvisited paths");
    options.frontier_mode = PlanFrontierMode::ReportUnresolved;
    require_rejected([&] { evaluate_plan_dag(state, dag, config, options); },
        "mining with non-DD frontier mode must not silently change evaluation semantics");
}

PlanChallengeCandidate candidate(std::size_t index, const Position& state,
    PlanFailureKind kind, const char* move) {
    PlanChallengeCandidate result;
    result.pool_index = index;
    result.root = state;
    result.root_profile = {3, 3, 3};
    PlanFailureWitness failure;
    failure.kind = kind;
    failure.node = 7;
    failure.position = state;
    failure.card = card(move);
    failure.making_moves = card("SK");
    failure.diagnosed_choice = kind == PlanFailureKind::DdLoss;
    failure.path.push_back({next_to_play(state.current_trick), failure.card});
    result.evaluation.failures.push_back(std::move(failure));
    return result;
}

void test_batch_selection_coverage_and_novelty() {
    const auto state = discovery_pool().front().position;
    std::vector<PlanChallengeCandidate> candidates {
        candidate(0, state, PlanFailureKind::MissingObservation, "S7"),
        candidate(1, state, PlanFailureKind::MissingObservation, "S8"),
        candidate(2, state, PlanFailureKind::MissingObservation, "S9"),
        candidate(3, state, PlanFailureKind::DdLoss, "S2"),
    };
    const auto chosen = select_plan_counterexamples(candidates, {}, 2);
    require(chosen.size() == 2, "selector must fill a feasible two-layout batch");
    bool gap = false, loss = false;
    for (const auto index : chosen) {
        require(index < candidates.size(), "selector must return candidate-vector indices");
        const auto kind = candidates[index].evaluation.failures.front().kind;
        gap |= kind == PlanFailureKind::MissingObservation;
        loss |= kind == PlanFailureKind::DdLoss;
    }
    require(gap && loss, "many coverage gaps must not crowd a demonstrated loss out of the batch");

    candidates = {
        candidate(10, state, PlanFailureKind::DdLoss, "S2"),
        candidate(11, state, PlanFailureKind::DdLoss, "S2"),
        candidate(12, state, PlanFailureKind::DdLoss, "S3"),
    };
    require(plan_failure_features(candidates[0]) == plan_failure_features(candidates[1]) &&
        plan_failure_features(candidates[0]) != plan_failure_features(candidates[2]),
        "fixture must distinguish failure features while sharing its DDS root profile");
    const auto diverse = select_plan_counterexamples(candidates, {{state}}, 2);
    require(diverse.size() == 2 && std::find(diverse.begin(), diverse.end(), 2) != diverse.end(),
        "selection must measure novelty against the growing batch, not only the initial set");

    candidates.push_back(candidates[2]); // Same pool member must never be promoted twice.
    auto no_failure = candidates[0];
    no_failure.pool_index = 13;
    no_failure.evaluation.failures.clear();
    no_failure.evaluation.survives_horizon = true;
    candidates.push_back(no_failure);
    const auto all = select_plan_counterexamples(candidates, {}, 20);
    std::set<std::size_t> unique;
    for (const auto index : all) {
        require(!candidates[index].evaluation.failures.empty(), "passing layouts are not counterexamples");
        require(unique.insert(candidates[index].pool_index).second,
            "duplicate pool indices must not consume batch capacity");
    }
    require(unique.size() == 3, "different weaknesses with one root profile must remain eligible");
    require(select_plan_counterexamples(candidates, {}, 0).empty(), "zero batch capacity must select nothing");
}

void test_pool_draws_are_legal_diverse_and_reproducible() {
    const auto pool = discovery_pool();
    const std::vector<AlphaMuWorld> seeds {pool.front()};
    PlanFailureWitness target;
    target.kind = PlanFailureKind::MissingObservation;
    target.position = pool.front().position;
    play_card(target.position, card("S2"));
    target.card = card("S7");
    target.path = {{Seat::South, card("S2")}, {Seat::West, card("S7")}};
    const std::vector<std::size_t> used {0, 1};
    const auto first = draw_plan_challengers(pool, seeds, {target}, used, 12, 42);
    const auto repeat = draw_plan_challengers(pool, seeds, {target}, used, 12, 42);
    require(first.size() == 12 && repeat.size() == first.size(), "draw must fill available requested capacity");
    std::set<std::size_t> indices;
    bool random = false, structural = false, targeted = false;
    for (std::size_t i = 0; i < first.size(); ++i) {
        const auto draw = first[i];
        require(draw.index == repeat[i].index && draw.source == repeat[i].source,
            "fixed seed must reproduce challenger identities and sources");
        require(draw.index < pool.size() && draw.index != 0 && draw.index != 1 &&
            indices.insert(draw.index).second, "draw may return only unique unused legal pool members");
        random |= draw.source == PlanChallengeSource::Random;
        structural |= draw.source == PlanChallengeSource::Structural;
        targeted |= draw.source == PlanChallengeSource::Targeted;
    }
    require(random && structural && targeted, "feasible pool must exercise the mixed challenger sources");
    const auto remaining = draw_plan_challengers(pool, seeds, {target}, used, 100, 42);
    require(remaining.size() == pool.size() - used.size(), "pool exhaustion must bound challenger count");
    require(draw_plan_challengers(pool, seeds, {target}, used, 0, 42).empty(),
        "zero draw request must not consume layouts");
    require(draw_plan_challengers({}, {}, {}, {}, 8, 42).empty(), "empty pool must produce no invented deals");

    const auto mutations = draw_plan_challengers(pool, seeds, {}, used, 12, 99);
    bool seed_mutation = false;
    for (const auto draw : mutations) {
        if (draw.source != PlanChallengeSource::Targeted) continue;
        const auto& hands = pool[draw.index].position.deal.hands;
        require(std::popcount(hands[seat_index(Seat::East)] ^
            seeds.front().position.deal.hands[seat_index(Seat::East)]) == 2,
            "seed-only targeted draws must be one-card defender swaps");
        seed_mutation = true;
    }
    require(seed_mutation, "pool must contain a targeted neighbour of the failure seed");
}
} // namespace

int main() {
    try {
        test_real_policies_match_pointer_evaluation();
        test_multiple_missing_responses_and_limits();
        test_frontier_and_terminal_are_distinct();
        test_loss_diagnosis_and_validation();
        test_partial_mining_continues_past_gaps_and_rejected_proofs();
        test_partial_mining_caps_and_missing_response_loss_origin();
        test_batch_selection_coverage_and_novelty();
        test_pool_draws_are_legal_diverse_and_reproducible();
        std::cout << "All plan challenge tests passed.\n";
    } catch (const std::exception& error) {
        std::cerr << "Plan challenge test failure: " << error.what() << '\n';
        return 1;
    }
}
