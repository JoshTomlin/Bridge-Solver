#include "bridge/alpha_mu2.h"
#include "bridge/analysis_session.h"
#include "bridge/dds_solver.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <map>
#include <optional>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace {

using namespace bridge;

struct CorpusCase {
    std::string name;
    std::vector<AlphaMuWorld> worlds;
    AlphaMuConfig config;
    Card expected_move {kNoCard};
};

std::vector<std::string> split(std::string_view text, char delimiter) {
    std::vector<std::string> fields;
    std::size_t start = 0;
    for (;;) {
        const std::size_t end = text.find(delimiter, start);
        fields.emplace_back(text.substr(start, end - start));
        if (end == std::string_view::npos) break;
        start = end + 1;
    }
    return fields;
}

std::optional<Seat> parse_seat(std::string_view text) {
    if (text.empty()) return std::nullopt;
    switch (static_cast<char>(std::toupper(
                static_cast<unsigned char>(text.front())))) {
        case 'N': return Seat::North;
        case 'E': return Seat::East;
        case 'S': return Seat::South;
        case 'W': return Seat::West;
        default: return std::nullopt;
    }
}

bool parse_strain(std::string text, std::optional<Suit>& strain) {
    std::transform(text.begin(), text.end(), text.begin(), [](unsigned char ch) {
        return static_cast<char>(std::toupper(ch));
    });
    if (text == "N" || text == "NT") {
        strain.reset();
        return true;
    }
    const std::optional<Suit> parsed =
        text.empty() ? std::nullopt : parse_suit(text.front());
    if (!parsed) return false;
    strain = *parsed;
    return true;
}

std::vector<Card> ordered_cards(Hand hand) {
    std::vector<Card> cards;
    for (const Suit suit : {
             Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        for (int rank = static_cast<int>(Rank::Ace);
             rank >= static_cast<int>(Rank::Two);
             --rank) {
            const Card card = make_card(suit, static_cast<Rank>(rank));
            if (contains(hand, card)) cards.push_back(card);
        }
    }
    return cards;
}

AlphaMuWorld make_world(
    const Deal& deal,
    Seat leader,
    std::optional<Suit> trump,
    const std::string& prefix) {
    Position position {
        .deal = deal,
        .current_trick = Trick {.leader = leader, .trump_suit = trump},
        .played_cards = kFullDeck & ~(
            deal.hands[0] | deal.hands[1] | deal.hands[2] | deal.hands[3]),
    };
    std::istringstream cards(prefix);
    std::string text;
    while (cards >> text) {
        const std::optional<Card> card = parse_card(text);
        if (!card) throw std::invalid_argument("invalid prefix card " + text);
        play_card(position, *card);
    }
    return AlphaMuWorld {.position = position};
}

std::vector<CorpusCase> load_corpus(const std::string& path) {
    std::ifstream input(path);
    if (!input) throw std::runtime_error("could not open corpus " + path);
    std::vector<CorpusCase> cases;
    std::map<std::string, std::size_t> by_name;
    std::string line;
    std::size_t line_number = 0;
    while (std::getline(input, line)) {
        ++line_number;
        if (line.empty() || line.front() == '#') continue;
        const std::vector<std::string> fields = split(line, '\t');
        if (fields.size() != 11) {
            throw std::invalid_argument(
                "corpus line " + std::to_string(line_number) +
                " must have 11 tab-separated fields");
        }
        Deal deal;
        for (std::size_t seat = 0; seat < 4; ++seat) {
            const std::optional<Hand> hand = parse_hand_record(fields[seat + 1]);
            if (!hand) {
                throw std::invalid_argument(
                    "invalid hand on corpus line " + std::to_string(line_number));
            }
            deal.hands[seat] = *hand;
        }
        const std::optional<Seat> leader = parse_seat(fields[5]);
        std::optional<Suit> trump;
        if (!leader || !parse_strain(fields[6], trump)) {
            throw std::invalid_argument(
                "invalid leader or strain on corpus line " +
                std::to_string(line_number));
        }
        const int target = std::stoi(fields[7]);
        const int max_m = std::stoi(fields[8]);
        const std::optional<Card> expected = parse_card(fields[10]);
        if (target < 1 || target > 13 || max_m < 1 ||
            max_m > kMaxDeclarerPlies || !expected) {
            throw std::invalid_argument(
                "invalid target, M, or expected move on corpus line " +
                std::to_string(line_number));
        }

        std::size_t case_index;
        const auto found = by_name.find(fields[0]);
        if (found == by_name.end()) {
            case_index = cases.size();
            by_name.emplace(fields[0], case_index);
            AlphaMuConfig config {
                .declarer = Seat::South,
                .trump_suit = trump,
                .target_tricks = static_cast<std::uint8_t>(target),
                .max_declarer_plies = static_cast<std::uint8_t>(max_m),
                .build_trick_policy = true,
                .compare_all_root_moves = true,
                .limit_policy_to_current_trick = false,
            };
            config.optimizations.iterative_deepening = false;
            cases.push_back(CorpusCase {
                .name = fields[0],
                .config = config,
                .expected_move = *expected,
            });
        } else {
            case_index = found->second;
            const CorpusCase& existing = cases[case_index];
            if (existing.config.target_tricks != target ||
                existing.config.max_declarer_plies != max_m ||
                existing.config.trump_suit != trump ||
                existing.expected_move != *expected) {
                throw std::invalid_argument(
                    "layouts in corpus case " + fields[0] +
                    " disagree on configuration");
            }
        }
        cases[case_index].worlds.push_back(
            make_world(deal, *leader, trump, fields[9]));
    }
    return cases;
}

std::size_t policy_passes(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuResult& result,
    const AlphaMuConfig& config) {
    std::size_t passes = 0;
    for (const AlphaMuWorld& world : worlds) {
        if (evaluate_alpha_mu_policy(
                world.position, result.trick_policy, config).makes_target) {
            ++passes;
        }
    }
    return passes;
}

int run_corpus(const std::string& path) {
    const std::vector<CorpusCase> cases = load_corpus(path);
    std::cout << "case,layouts,expected,actual,policy_passes,weighted_score,status\n";
    bool passed = true;
    for (const CorpusCase& test : cases) {
        const AlphaMuResult result = alpha_mu_search(test.worlds, test.config);
        const std::size_t passes = policy_passes(test.worlds, result, test.config);
        const bool okay = result.best_move == test.expected_move &&
            passes == test.worlds.size();
        passed = passed && okay;
        std::cout << test.name << ',' << test.worlds.size() << ','
                  << to_string(test.expected_move) << ','
                  << to_string(result.best_move) << ',' << passes << ','
                  << result.score.weighted_wins << ','
                  << (okay ? "PASS" : "FAIL") << '\n';
    }
    return passed ? 0 : 1;
}

std::vector<AlphaMuWorld> discovery_candidate_worlds() {
    const Hand north = make_hand({
        make_card(Suit::Spades, Rank::Ace),
        make_card(Suit::Spades, Rank::Jack),
        make_card(Suit::Spades, Rank::Ten),
    });
    const Hand south = make_hand({
        make_card(Suit::Spades, Rank::King),
        make_card(Suit::Spades, Rank::Three),
        make_card(Suit::Spades, Rank::Two),
    });
    const Hand defenders = make_hand({
        make_card(Suit::Spades, Rank::Queen),
        make_card(Suit::Spades, Rank::Nine),
        make_card(Suit::Spades, Rank::Eight),
        make_card(Suit::Spades, Rank::Seven),
        make_card(Suit::Hearts, Rank::Ace),
        make_card(Suit::Hearts, Rank::King),
    });
    const std::vector<Card> cards = ordered_cards(defenders);
    std::vector<AlphaMuWorld> worlds;
    for (std::size_t a = 0; a < cards.size(); ++a) {
        for (std::size_t b = a + 1; b < cards.size(); ++b) {
            for (std::size_t c = b + 1; c < cards.size(); ++c) {
                const Hand east = make_hand({cards[a], cards[b], cards[c]});
                const Hand west = defenders & ~east;
                const Deal deal {.hands = {north, east, south, west}};
                worlds.push_back(make_world(deal, Seat::South, std::nullopt, ""));
            }
        }
    }
    return worlds;
}

std::vector<std::uint8_t> fingerprint(const AlphaMuWorld& world) {
    std::vector<std::uint8_t> scores;
    for (const DoubleDummyMoveScore& score :
         double_dummy_move_scores(world.position, Seat::South)) {
        scores.push_back(score.future_tricks);
    }
    return scores;
}

int run_miner() {
    const std::vector<AlphaMuWorld> worlds = discovery_candidate_worlds();
    std::map<std::vector<std::uint8_t>, std::vector<std::size_t>> groups;
    for (std::size_t index = 0; index < worlds.size(); ++index) {
        groups[fingerprint(worlds[index])].push_back(index);
    }
    AlphaMuConfig config {
        .declarer = Seat::South,
        .target_tricks = 3,
        .max_declarer_plies = 2,
        .build_trick_policy = true,
        .compare_all_root_moves = true,
        .limit_policy_to_current_trick = false,
    };
    config.optimizations.iterative_deepening = false;

    std::size_t collisions = 0;
    std::cout << "same-fingerprint policy counterexamples\n";
    for (const auto& [scores, indices] : groups) {
        if (indices.size() < 2) continue;
        for (const std::size_t source : indices) {
            const AlphaMuResult policy = alpha_mu_search({worlds[source]}, config);
            for (const std::size_t held_out : indices) {
                if (held_out == source) continue;
                const AlphaMuPolicyEvaluation evaluation =
                    evaluate_alpha_mu_policy(
                        worlds[held_out].position,
                        policy.trick_policy,
                        config);
                if (evaluation.makes_target) continue;
                ++collisions;
                std::cout << "source=" << source
                          << " held_out=" << held_out
                          << " move=" << to_string(policy.best_move)
                          << " signature=" << evaluation.policy_signature
                          << " failure_depth=" << evaluation.failure_depth
                          << " east=" << format_hand(hand_of(
                                 worlds[held_out].position.deal, Seat::East))
                          << " west=" << format_hand(hand_of(
                                 worlds[held_out].position.deal, Seat::West))
                          << '\n';
                break;
            }
            if (collisions > 0) break;
        }
        if (collisions > 0) break;
    }
    std::cout << "layouts=" << worlds.size()
              << " fingerprints=" << groups.size()
              << " collisions=" << collisions << '\n';
    return collisions == 0 ? 1 : 0;
}

std::vector<AlphaMuWorld> rare_discovery_reservoir() {
    const std::vector<AlphaMuWorld> candidates = discovery_candidate_worlds();
    std::vector<AlphaMuWorld> result;
    // These are the compact pair used by the regression corpus: Q with West,
    // then Q with East. Repetition makes the second layout deliberately rare.
    const auto queen_is_east = [](const AlphaMuWorld& world) {
        return contains(
            hand_of(world.position.deal, Seat::East),
            make_card(Suit::Spades, Rank::Queen));
    };
    const auto west = std::find_if(
        candidates.begin(), candidates.end(), [&](const AlphaMuWorld& world) {
            return !queen_is_east(world) &&
                hand_of(world.position.deal, Seat::East) == make_hand({
                    make_card(Suit::Spades, Rank::Seven),
                    make_card(Suit::Hearts, Rank::Ace),
                    make_card(Suit::Hearts, Rank::King),
                });
        });
    const auto east = std::find_if(
        candidates.begin(), candidates.end(), [&](const AlphaMuWorld& world) {
            return queen_is_east(world) &&
                contains(hand_of(world.position.deal, Seat::East),
                         make_card(Suit::Hearts, Rank::Ace)) &&
                contains(hand_of(world.position.deal, Seat::East),
                         make_card(Suit::Hearts, Rank::King));
        });
    if (west == candidates.end() || east == candidates.end()) {
        throw std::logic_error("discovery layouts were not generated");
    }
    result.assign(15, *west);
    result.push_back(*east);
    return result;
}

int run_paired(std::size_t trials, std::uint64_t seed) {
    const std::vector<AlphaMuWorld> base = rare_discovery_reservoir();
    const std::vector<AlphaMuWorld> oracle {base.front(), base.back()};
    AlphaMuConfig config {
        .declarer = Seat::South,
        .target_tricks = 3,
        .max_declarer_plies = 2,
        .build_trick_policy = true,
        .compare_all_root_moves = true,
        .limit_policy_to_current_trick = false,
    };
    config.optimizations.iterative_deepening = false;
    std::mt19937_64 random(seed);
    std::size_t alpha_passes = 0;
    std::size_t alpha2_passes = 0;
    std::size_t alpha2_counterexamples = 0;
    std::cout << "trial,baseline_move,baseline_oracle,alpha2_move,alpha2_oracle,"
                 "counterexamples,collisions\n";
    for (std::size_t trial = 0; trial < trials; ++trial) {
        std::vector<AlphaMuWorld> reservoir = base;
        std::shuffle(reservoir.begin(), reservoir.end(), random);
        const AlphaMuResult baseline = alpha_mu_search({reservoir.front()}, config);
        const std::size_t baseline_oracle = policy_passes(oracle, baseline, config);
        alpha_passes += baseline_oracle == oracle.size();

        const AlphaMu2Result adaptive = alpha_mu2_search(
            reservoir,
            AlphaMu2Config {
                .initial_world_count = 1,
                .max_world_count = 2,
                .max_refinement_rounds = 2,
                .counterexamples_per_round = 1,
                .search = config,
            });
        const std::size_t adaptive_oracle =
            policy_passes(oracle, adaptive.search, config);
        alpha2_passes += adaptive_oracle == oracle.size();
        alpha2_counterexamples += adaptive.stats.counterexamples_added;
        std::cout << trial << ',' << to_string(baseline.best_move) << ','
                  << baseline_oracle << ',' << to_string(adaptive.search.best_move)
                  << ',' << adaptive_oracle << ','
                  << adaptive.stats.counterexamples_added << ','
                  << adaptive.stats.policy_fingerprint_collisions << '\n';
    }
    std::cout << "summary," << trials << ",baseline_full=" << alpha_passes
              << ",alpha2_full=" << alpha2_passes
              << ",alpha2_counterexamples=" << alpha2_counterexamples << '\n';
    return alpha2_passes < alpha_passes ? 1 : 0;
}

struct BridgeMasterOracle {
    std::vector<AlphaMuWorld> worlds;
    std::size_t actual_index {};
};

BridgeMasterOracle bridge_master_6s_oracle() {
    // Concrete low spots for the user's x-cards. The important known cards and
    // the 7-1 diamond constraint are preserved:
    // N Kxx.AQxx.xxxx.xx opposite S AQJT9.Kx.K.AKQxx.
    const Deal actual {.hands = {
        make_hand({
            make_card(Suit::Spades, Rank::King),
            make_card(Suit::Spades, Rank::Eight),
            make_card(Suit::Spades, Rank::Seven),
            make_card(Suit::Hearts, Rank::Ace),
            make_card(Suit::Hearts, Rank::Queen),
            make_card(Suit::Hearts, Rank::Five),
            make_card(Suit::Hearts, Rank::Four),
            make_card(Suit::Diamonds, Rank::Seven),
            make_card(Suit::Diamonds, Rank::Six),
            make_card(Suit::Diamonds, Rank::Five),
            make_card(Suit::Diamonds, Rank::Four),
            make_card(Suit::Clubs, Rank::Three),
            make_card(Suit::Clubs, Rank::Two),
        }),
        make_hand({
            make_card(Suit::Spades, Rank::Six),
            make_card(Suit::Spades, Rank::Five),
            make_card(Suit::Spades, Rank::Four),
            make_card(Suit::Spades, Rank::Three),
            make_card(Suit::Spades, Rank::Two),
            make_card(Suit::Hearts, Rank::Jack),
            make_card(Suit::Hearts, Rank::Ten),
            make_card(Suit::Hearts, Rank::Nine),
            make_card(Suit::Hearts, Rank::Eight),
            make_card(Suit::Hearts, Rank::Seven),
            make_card(Suit::Hearts, Rank::Six),
            make_card(Suit::Hearts, Rank::Three),
            make_card(Suit::Diamonds, Rank::Ace),
        }),
        make_hand({
            make_card(Suit::Spades, Rank::Ace),
            make_card(Suit::Spades, Rank::Queen),
            make_card(Suit::Spades, Rank::Jack),
            make_card(Suit::Spades, Rank::Ten),
            make_card(Suit::Spades, Rank::Nine),
            make_card(Suit::Hearts, Rank::King),
            make_card(Suit::Hearts, Rank::Two),
            make_card(Suit::Diamonds, Rank::King),
            make_card(Suit::Clubs, Rank::Ace),
            make_card(Suit::Clubs, Rank::King),
            make_card(Suit::Clubs, Rank::Queen),
            make_card(Suit::Clubs, Rank::Six),
            make_card(Suit::Clubs, Rank::Five),
        }),
        make_hand({
            make_card(Suit::Diamonds, Rank::Queen),
            make_card(Suit::Diamonds, Rank::Jack),
            make_card(Suit::Diamonds, Rank::Ten),
            make_card(Suit::Diamonds, Rank::Nine),
            make_card(Suit::Diamonds, Rank::Eight),
            make_card(Suit::Diamonds, Rank::Three),
            make_card(Suit::Diamonds, Rank::Two),
            make_card(Suit::Clubs, Rank::Jack),
            make_card(Suit::Clubs, Rank::Ten),
            make_card(Suit::Clubs, Rank::Nine),
            make_card(Suit::Clubs, Rank::Eight),
            make_card(Suit::Clubs, Rank::Seven),
            make_card(Suit::Clubs, Rank::Four),
        }),
    }};
    Position root {
        .deal = actual,
        .current_trick = Trick {
            .leader = Seat::West,
            .trump_suit = Suit::Spades,
        },
    };
    for (const Card card : {
             make_card(Suit::Diamonds, Rank::Two),
             make_card(Suit::Diamonds, Rank::Four),
             make_card(Suit::Diamonds, Rank::Ace),
             make_card(Suit::Diamonds, Rank::King),
             make_card(Suit::Spades, Rank::Two),
         }) {
        play_card(root, card);
    }

    const Hand actual_east = hand_of(root.deal, Seat::East);
    const Hand unknown = actual_east | hand_of(root.deal, Seat::West);
    const Hand forced_west_diamonds = cards_in_suit(unknown, Suit::Diamonds);
    const Hand flexible = unknown & ~forced_west_diamonds;
    const std::vector<Card> cards = ordered_cards(flexible);
    BridgeMasterOracle oracle;

    const auto choose = [&](auto&& self,
                            std::size_t next,
                            std::size_t needed,
                            Hand east) -> void {
        if (needed == 0) {
            Position world = root;
            hand_of(world.deal, Seat::East) = east;
            hand_of(world.deal, Seat::West) = unknown & ~east;
            if (east == actual_east) oracle.actual_index = oracle.worlds.size();
            oracle.worlds.push_back(AlphaMuWorld {.position = world});
            return;
        }
        if (cards.size() - next < needed) return;
        for (std::size_t index = next;
             index + needed <= cards.size();
             ++index) {
            self(
                self,
                index + 1,
                needed - 1,
                add_card(east, cards[index]));
        }
    };
    choose(choose, 0, card_count(actual_east), kEmptyHand);
    return oracle;
}

std::vector<AlphaMuWorld> seeded_reservoir(
    const BridgeMasterOracle& oracle,
    std::size_t count,
    std::uint64_t seed) {
    count = std::min(count, oracle.worlds.size());
    std::vector<std::size_t> indices(oracle.worlds.size());
    for (std::size_t index = 0; index < indices.size(); ++index) indices[index] = index;
    std::mt19937_64 random(seed);
    std::shuffle(indices.begin(), indices.end(), random);
    indices.resize(count);
    if (std::find(indices.begin(), indices.end(), oracle.actual_index) == indices.end()) {
        indices.back() = oracle.actual_index;
    }
    std::vector<AlphaMuWorld> reservoir;
    reservoir.reserve(count);
    for (const std::size_t index : indices) reservoir.push_back(oracle.worlds[index]);
    return reservoir;
}

std::string policy_line(
    Position position,
    std::shared_ptr<const AlphaMuPolicyNode> policy,
    const AlphaMuConfig& config) {
    std::ostringstream output;
    bool first = true;
    while (policy && !is_deal_finished(position)) {
        const Seat player = next_to_play(position.current_trick);
        Card card = kNoCard;
        std::shared_ptr<const AlphaMuPolicyNode> next;
        if (same_side(player, config.declarer)) {
            card = policy->declarer_move;
            next = policy->continuation;
        } else {
            card = choose_double_dummy_defender_card(
                position, config.declarer, "SHDC");
            const auto branch = std::find_if(
                policy->defender_branches.begin(),
                policy->defender_branches.end(),
                [&](const AlphaMuPolicyBranch& candidate) {
                    return candidate.card == card;
                });
            if (branch != policy->defender_branches.end()) {
                next = branch->continuation;
            }
        }
        if (card == kNoCard ||
            !is_legal_play(
                position.current_trick,
                hand_of(position.deal, player),
                card)) {
            output << (first ? "" : " ") << "[unsupported]";
            break;
        }
        if (!first) output << ' ';
        output << to_string(player).front() << ':' << to_string(card);
        first = false;
        play_card(position, card);
        policy = std::move(next);
    }
    const std::uint8_t already_won = same_side(config.declarer, Seat::South)
        ? position.score.north_south
        : position.score.east_west;
    const std::uint8_t projected = static_cast<std::uint8_t>(
        already_won +
        double_dummy_future_tricks(position, config.declarer));
    output << " -> " << static_cast<int>(projected) << " tricks";
    return output.str();
}

std::optional<std::string> policy_failure_line(
    Position position,
    const std::shared_ptr<const AlphaMuPolicyNode>& policy,
    const AlphaMuConfig& config) {
    const auto won = [&]() {
        return same_side(config.declarer, Seat::South)
            ? position.score.north_south
            : position.score.east_west;
    };
    if (won() >= config.target_tricks) return std::nullopt;
    if (is_deal_finished(position)) {
        return "-> " + std::to_string(won()) + " tricks";
    }
    if (!policy) {
        const std::uint8_t projected = static_cast<std::uint8_t>(
            won() + double_dummy_future_tricks(position, config.declarer));
        if (projected >= config.target_tricks) return std::nullopt;
        return "-> " + std::to_string(projected) + " tricks at DDS leaf";
    }

    const Seat player = next_to_play(position.current_trick);
    if (policy->player != player) return "[policy player mismatch]";
    const Hand legal = legal_plays(
        position.current_trick, hand_of(position.deal, player));
    if (same_side(player, config.declarer)) {
        const Card card = policy->declarer_move;
        if (!contains(legal, card)) return "[unsupported declarer move]";
        play_card(position, card);
        const std::optional<std::string> suffix = policy_failure_line(
            position, policy->continuation, config);
        if (!suffix) return std::nullopt;
        return to_string(player).substr(0, 1) + ':' + to_string(card) + ' ' + *suffix;
    }

    for (const Card card : ordered_cards(legal)) {
        const auto branch = std::find_if(
            policy->defender_branches.begin(),
            policy->defender_branches.end(),
            [&](const AlphaMuPolicyBranch& candidate) {
                return candidate.card == card;
            });
        if (branch == policy->defender_branches.end()) {
            return to_string(player).substr(0, 1) + ':' + to_string(card) +
                " [unsupported observation]";
        }
        Position child = position;
        play_card(child, card);
        const std::optional<std::string> suffix = policy_failure_line(
            child, branch->continuation, config);
        if (suffix) {
            return to_string(player).substr(0, 1) + ':' + to_string(card) +
                ' ' + *suffix;
        }
    }
    return std::nullopt;
}

int run_bridge_master_6s(
    std::size_t reservoir_count,
    std::uint8_t max_m,
    double seconds,
    std::uint64_t seed,
    std::size_t validation_count) {
    const auto oracle_start = std::chrono::steady_clock::now();
    const BridgeMasterOracle oracle = bridge_master_6s_oracle();
    std::vector<Position> positions;
    positions.reserve(oracle.worlds.size());
    for (const AlphaMuWorld& world : oracle.worlds) {
        positions.push_back(world.position);
    }
    std::vector<std::uint8_t> future;
    future.reserve(positions.size());
    constexpr std::size_t kDdsBatch = 128;
    for (std::size_t first = 0; first < positions.size(); first += kDdsBatch) {
        const std::size_t last = std::min(first + kDdsBatch, positions.size());
        const std::vector<Position> batch(
            positions.begin() + first, positions.begin() + last);
        std::vector<std::uint8_t> solved =
            double_dummy_future_tricks_batch(batch, Seat::South);
        future.insert(future.end(), solved.begin(), solved.end());
    }
    const std::size_t cold = static_cast<std::size_t>(std::count_if(
        future.begin(), future.end(), [](std::uint8_t tricks) {
            return tricks >= 12;
        }));
    const double oracle_ms = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - oracle_start).count();
    std::cout << "bridge_master_6s_oracle_layouts=" << oracle.worlds.size()
              << " cold=" << cold
              << " oracle_ms=" << oracle_ms << '\n' << std::flush;

    const std::vector<AlphaMuWorld> reservoir =
        seeded_reservoir(oracle, reservoir_count, seed);
    const std::vector<AlphaMuWorld> validation = seeded_reservoir(
        oracle, validation_count, seed ^ 0xD15C0A3EULL);
    AlphaMuConfig config {
        .declarer = Seat::South,
        .trump_suit = Suit::Spades,
        .target_tricks = 12,
        .max_declarer_plies = max_m,
        .build_trick_policy = true,
        .compare_all_root_moves = true,
        .max_search_seconds = seconds,
        .hard_time_limit = true,
        .limit_policy_to_current_trick = false,
    };

    const std::size_t baseline_count = std::min<std::size_t>(30, reservoir.size());
    const std::vector<AlphaMuWorld> baseline_worlds(
        reservoir.begin(), reservoir.begin() + baseline_count);
    const AlphaMuResult baseline = alpha_mu_search(baseline_worlds, config);
    const std::size_t baseline_passes =
        policy_passes(validation, baseline, config);
    const AlphaMuPolicyEvaluation baseline_actual = evaluate_alpha_mu_policy(
        oracle.worlds[oracle.actual_index].position,
        baseline.trick_policy,
        config);
    std::cout << "baseline move=" << to_string(baseline.best_move)
              << " M=" << static_cast<int>(baseline.stats.completed_depth)
              << " held_out=" << baseline_passes << '/' << validation.size()
              << " actual=" << (baseline_actual.makes_target ? "PASS" : "FAIL")
              << " nodes=" << baseline.stats.nodes << '\n' << std::flush;
    const std::optional<std::string> baseline_failure = policy_failure_line(
        oracle.worlds[oracle.actual_index].position,
        baseline.trick_policy,
        config);
    std::cout << "baseline_actual_failure="
              << (baseline_failure ? *baseline_failure : "none")
              << '\n' << std::flush;

    const AlphaMu2Result adaptive = alpha_mu2_search(
        reservoir,
        AlphaMu2Config {
            .initial_world_count = baseline_count,
            .max_world_count = std::min<std::size_t>(64, reservoir.size()),
            .max_refinement_rounds = 8,
            .counterexamples_per_round = 4,
            .search = config,
        });
    const std::size_t adaptive_passes =
        policy_passes(validation, adaptive.search, config);
    const AlphaMuPolicyEvaluation actual = evaluate_alpha_mu_policy(
        oracle.worlds[oracle.actual_index].position,
        adaptive.search.trick_policy,
        config);
    std::cout << "alpha2 move=" << to_string(adaptive.search.best_move)
              << " M=" << static_cast<int>(adaptive.search.stats.completed_depth)
              << " held_out=" << adaptive_passes << '/' << validation.size()
              << " actual=" << (actual.makes_target ? "PASS" : "FAIL")
              << " failure_depth="
              << (actual.makes_target ? "-" : std::to_string(actual.failure_depth))
              << " unsupported="
              << (actual.unsupported_observation ? "yes" : "no")
              << " counterexamples=" << adaptive.stats.counterexamples_added
              << " collisions=" << adaptive.stats.policy_fingerprint_collisions
              << " active=" << adaptive.stats.final_worlds
              << " total_ms=" << adaptive.stats.total_ms << '\n';
    const std::optional<std::string> adaptive_failure = policy_failure_line(
        oracle.worlds[oracle.actual_index].position,
        adaptive.search.trick_policy,
        config);
    std::cout << "alpha2_actual_failure="
              << (adaptive_failure ? *adaptive_failure : "none") << '\n';
    return cold == oracle.worlds.size() && actual.makes_target ? 0 : 1;
}

void usage() {
    std::cerr
        << "Usage:\n"
        << "  bridge_alpha_mu_lab corpus FILE.tsv\n"
        << "  bridge_alpha_mu_lab mine\n"
        << "  bridge_alpha_mu_lab paired [TRIALS] [SEED]\n"
        << "  bridge_alpha_mu_lab bridgemaster6s [RESERVOIR] [MAX_M] [SECONDS] [SEED] [VALIDATION]\n";
}

}  // namespace

int main(int argc, char** argv) {
    try {
        if (argc >= 3 && std::string_view(argv[1]) == "corpus") {
            return run_corpus(argv[2]);
        }
        if (argc == 2 && std::string_view(argv[1]) == "mine") {
            return run_miner();
        }
        if (argc >= 2 && argc <= 4 &&
            std::string_view(argv[1]) == "paired") {
            const std::size_t trials = argc >= 3
                ? static_cast<std::size_t>(std::stoull(argv[2]))
                : 25;
            const std::uint64_t seed = argc >= 4
                ? std::stoull(argv[3])
                : 11565831ULL;
            return run_paired(trials, seed);
        }
        if (argc >= 2 && argc <= 7 &&
            std::string_view(argv[1]) == "bridgemaster6s") {
            const std::size_t reservoir = argc >= 3
                ? static_cast<std::size_t>(std::stoull(argv[2]))
                : 256;
            const int max_m = argc >= 4 ? std::stoi(argv[3]) : 8;
            const double seconds = argc >= 5 ? std::stod(argv[4]) : 30.0;
            const std::uint64_t seed = argc >= 6
                ? std::stoull(argv[5])
                : 11565831ULL;
            const std::size_t validation = argc >= 7
                ? static_cast<std::size_t>(std::stoull(argv[6]))
                : 1024;
            if (reservoir == 0 || max_m < 1 || max_m > kMaxDeclarerPlies ||
                seconds < 0.0 || validation == 0) {
                throw std::invalid_argument(
                    "Bridge Master reservoir, M, or time limit is out of range");
            }
            return run_bridge_master_6s(
                reservoir,
                static_cast<std::uint8_t>(max_m),
                seconds,
                seed,
                validation);
        }
        usage();
        return 2;
    } catch (const std::exception& error) {
        std::cerr << "Alpha-mu lab error: " << error.what() << '\n';
        return 1;
    }
}
