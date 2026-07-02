#include "alpha_mu_internal.h"

#include <algorithm>
#include <bit>
#include <cctype>
#include <stdexcept>
#include <string>

namespace bridge {
namespace {

std::string normalized_optimization_name(std::string_view name) {
    std::string result;
    result.reserve(name.size());
    for (const unsigned char character : name) {
        if (character == '_' || character == ' ') {
            result.push_back('-');
        } else {
            result.push_back(static_cast<char>(std::tolower(character)));
        }
    }
    return result;
}

}  // namespace

std::string_view to_string(AlphaMuOptimization optimization) {
    switch (optimization) {
        case AlphaMuOptimization::IterativeDeepening: return "iterative";
        case AlphaMuOptimization::TranspositionTable: return "tt";
        case AlphaMuOptimization::CanonicalTranspositionKeys: return "canonical-tt";
        case AlphaMuOptimization::MaxEquivalentCards: return "max-equals";
        case AlphaMuOptimization::MinEquivalentSuccessors: return "min-equals";
        case AlphaMuOptimization::EarlyCut: return "early-cut";
        case AlphaMuOptimization::UsefulWorlds: return "useful-worlds";
        case AlphaMuOptimization::WorldCuts: return "world-cuts";
        case AlphaMuOptimization::EmptyEntry: return "empty-entry";
        case AlphaMuOptimization::DeepAlphaCut: return "deep-alpha";
        case AlphaMuOptimization::RootCut: return "root-cut";
        case AlphaMuOptimization::WinCut: return "win-cut";
        case AlphaMuOptimization::TargetBounds: return "target-bounds";
        case AlphaMuOptimization::ForcedTrumpRun: return "forced-trump";
        case AlphaMuOptimization::LeafDdsBatch: return "leaf-dds-batch";
    }
    throw std::invalid_argument("unknown alpha-mu optimization");
}

std::optional<AlphaMuOptimization> parse_alpha_mu_optimization(std::string_view name) {
    const std::string normalized = normalized_optimization_name(name);
    for (const AlphaMuOptimization optimization : {
             AlphaMuOptimization::IterativeDeepening,
             AlphaMuOptimization::TranspositionTable,
             AlphaMuOptimization::CanonicalTranspositionKeys,
             AlphaMuOptimization::MaxEquivalentCards,
             AlphaMuOptimization::MinEquivalentSuccessors,
             AlphaMuOptimization::EarlyCut,
             AlphaMuOptimization::UsefulWorlds,
             AlphaMuOptimization::WorldCuts,
             AlphaMuOptimization::EmptyEntry,
             AlphaMuOptimization::DeepAlphaCut,
             AlphaMuOptimization::RootCut,
             AlphaMuOptimization::WinCut,
             AlphaMuOptimization::TargetBounds,
             AlphaMuOptimization::ForcedTrumpRun,
             AlphaMuOptimization::LeafDdsBatch}) {
        if (normalized == to_string(optimization)) {
            return optimization;
        }
    }
    return std::nullopt;
}

bool optimization_enabled(
    const AlphaMuOptimizations& optimizations,
    AlphaMuOptimization optimization) {
    switch (optimization) {
        case AlphaMuOptimization::IterativeDeepening:
            return optimizations.iterative_deepening;
        case AlphaMuOptimization::TranspositionTable:
            return optimizations.transposition_table;
        case AlphaMuOptimization::CanonicalTranspositionKeys:
            return optimizations.canonical_transposition_keys;
        case AlphaMuOptimization::MaxEquivalentCards:
            return optimizations.max_equivalent_cards;
        case AlphaMuOptimization::MinEquivalentSuccessors:
            return optimizations.min_equivalent_successors;
        case AlphaMuOptimization::EarlyCut:
            return optimizations.early_cut;
        case AlphaMuOptimization::UsefulWorlds:
            return optimizations.useful_worlds;
        case AlphaMuOptimization::WorldCuts:
            return optimizations.world_cuts;
        case AlphaMuOptimization::EmptyEntry:
            return optimizations.empty_entry;
        case AlphaMuOptimization::DeepAlphaCut:
            return optimizations.deep_alpha_cut;
        case AlphaMuOptimization::RootCut:
            return optimizations.root_cut;
        case AlphaMuOptimization::WinCut:
            return optimizations.win_cut;
        case AlphaMuOptimization::TargetBounds:
            return optimizations.target_bounds;
        case AlphaMuOptimization::ForcedTrumpRun:
            return optimizations.forced_trump_run;
        case AlphaMuOptimization::LeafDdsBatch:
            return optimizations.leaf_dds_batch;
    }
    return false;
}

void set_optimization_enabled(
    AlphaMuOptimizations& optimizations,
    AlphaMuOptimization optimization,
    bool enabled) {
    switch (optimization) {
        case AlphaMuOptimization::IterativeDeepening:
            optimizations.iterative_deepening = enabled;
            return;
        case AlphaMuOptimization::TranspositionTable:
            optimizations.transposition_table = enabled;
            return;
        case AlphaMuOptimization::CanonicalTranspositionKeys:
            optimizations.canonical_transposition_keys = enabled;
            return;
        case AlphaMuOptimization::MaxEquivalentCards:
            optimizations.max_equivalent_cards = enabled;
            return;
        case AlphaMuOptimization::MinEquivalentSuccessors:
            optimizations.min_equivalent_successors = enabled;
            return;
        case AlphaMuOptimization::EarlyCut:
            optimizations.early_cut = enabled;
            return;
        case AlphaMuOptimization::UsefulWorlds:
            optimizations.useful_worlds = enabled;
            return;
        case AlphaMuOptimization::WorldCuts:
            optimizations.world_cuts = enabled;
            return;
        case AlphaMuOptimization::EmptyEntry:
            optimizations.empty_entry = enabled;
            return;
        case AlphaMuOptimization::DeepAlphaCut:
            optimizations.deep_alpha_cut = enabled;
            return;
        case AlphaMuOptimization::RootCut:
            optimizations.root_cut = enabled;
            return;
        case AlphaMuOptimization::WinCut:
            optimizations.win_cut = enabled;
            return;
        case AlphaMuOptimization::TargetBounds:
            optimizations.target_bounds = enabled;
            return;
        case AlphaMuOptimization::ForcedTrumpRun:
            optimizations.forced_trump_run = enabled;
            return;
        case AlphaMuOptimization::LeafDdsBatch:
            optimizations.leaf_dds_batch = enabled;
            return;
    }
}

AlphaMuOptimizations disabled_alpha_mu_optimizations() {
    return AlphaMuOptimizations {
        .iterative_deepening = false,
        .transposition_table = false,
        .canonical_transposition_keys = false,
        .max_equivalent_cards = false,
        .min_equivalent_successors = false,
        .early_cut = false,
        .useful_worlds = false,
        .world_cuts = false,
        .empty_entry = false,
        .deep_alpha_cut = false,
        .root_cut = false,
        .win_cut = false,
        .target_bounds = false,
        .forced_trump_run = false,
        .leaf_dds_batch = false,
    };
}

namespace alpha_mu_detail {

std::size_t NodeKeyHash::operator()(const NodeKey& key) const {
    return static_cast<std::size_t>(key.first ^ std::rotl(key.second, 23));
}

ParetoFront zero_front() {
    return ParetoFront {.vectors = {OutcomeVector {}}};
}

void merge_max_front(ParetoFront& destination, const ParetoFront& source) {
    for (const OutcomeVector& vector : source.vectors) {
        add_to_pareto_front(destination, vector);
    }
}

bool front_wins_all_worlds(const ParetoFront& front, WorldMask active_worlds) {
    return std::any_of(
        front.vectors.begin(),
        front.vectors.end(),
        [&](const OutcomeVector& outcome) {
            return (outcome.wins & active_worlds) == active_worlds;
        });
}

WorldMask worlds_with_possible_win(const ParetoFront& front) {
    WorldMask result = 0;
    for (const OutcomeVector& outcome : front.vectors) result |= outcome.wins;
    return result;
}

bool front_is_covered_by_alpha(
    const ParetoFront& candidate,
    WorldMask candidate_active_worlds,
    const AlphaBounds& bounds) {
    for (const AlphaBound& bound : bounds) {
        if (bound.front == nullptr || bound.front->vectors.empty()) continue;

        // A world absent from the descendant information set is "x" in the
        // paper. It is optimistic (1) for this comparison unless an ancestor
        // had already proved it useless (0).
        const WorldMask impossible_but_useful =
            bound.useful_worlds & ~candidate_active_worlds;
        bool covered = true;
        for (const OutcomeVector& candidate_vector : candidate.vectors) {
            const WorldMask optimistic_wins =
                candidate_vector.wins | impossible_but_useful;
            const bool vector_covered = std::any_of(
                bound.front->vectors.begin(),
                bound.front->vectors.end(),
                [&](const OutcomeVector& bound_vector) {
                    return (bound_vector.wins | optimistic_wins) ==
                        bound_vector.wins;
                });
            if (!vector_covered) {
                covered = false;
                break;
            }
        }
        if (covered) return true;
    }
    return false;
}

WorldMask all_worlds_mask(std::size_t world_count) {
    return world_count == 64
        ? ~WorldMask {0}
        : (WorldMask {1} << world_count) - 1;
}

std::size_t first_world(WorldMask active_worlds) {
    return static_cast<std::size_t>(std::countr_zero(active_worlds));
}

std::vector<Card> ordered_cards(Hand cards, Card preferred) {
    std::vector<Card> result;
    for (const Suit suit : {Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs}) {
        for (int rank = static_cast<int>(Rank::Ace);
             rank >= static_cast<int>(Rank::Two);
             --rank) {
            const Card card = make_card(suit, static_cast<Rank>(rank));
            if (contains(cards, card)) {
                result.push_back(card);
            }
        }
    }

    const auto preferred_position = std::find(result.begin(), result.end(), preferred);
    if (preferred_position != result.end()) {
        std::rotate(result.begin(), preferred_position, preferred_position + 1);
    }
    return result;
}

std::vector<Card> representative_cards(
    const Position& position,
    Hand legal_moves,
    Card preferred,
    SearchContext& context,
    std::size_t search_depth) {
    if (!context.config.optimizations.max_equivalent_cards) {
        return ordered_cards(legal_moves, preferred);
    }

    Hand representatives = kEmptyHand;
    const Seat player = next_to_play(position.current_trick);
    const std::vector<Hand> groups = equivalent_play_groups(
        position.current_trick,
        legal_moves,
        hand_of(position.deal, player),
        position.played_cards);
    for (const Hand group : groups) {
        const Card representative = preferred != kNoCard && contains(group, preferred)
            ? preferred
            : ordered_cards(group).front();
        representatives |= representative;

        const std::uint64_t skipped = card_count(group) - 1;
        context.stats.equivalent_moves_skipped += skipped;
        context.stats.max_equivalent_moves_skipped += skipped;
        if (skipped > 0) {
            audit_line(
                context,
                search_depth,
                "max-equals",
                "kept " + to_string(representative) + " from " + format_card_list(group));
        }
    }
    return ordered_cards(representatives, preferred);
}

namespace {

void hash_value(NodeKey& key, std::uint64_t value) {
    key.first ^= value + 0x9E3779B97F4A7C15ULL +
        (key.first << 6) + (key.first >> 2);
    value ^= value >> 30;
    value *= 0xBF58476D1CE4E5B9ULL;
    value ^= value >> 27;
    value *= 0x94D049BB133111EBULL;
    value ^= value >> 31;
    key.second = std::rotl(key.second, 17) ^ value;
}

}  // namespace

NodeKey make_node_key(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    WorldMask useful_worlds,
    bool canonical) {
    NodeKey key {
        .first = 0x243F6A8885A308D3ULL,
        .second = 0x13198A2E03707344ULL,
    };
    hash_value(key, active_worlds);
    hash_value(key, useful_worlds);

    for (std::size_t world = 0; world < worlds.size(); ++world) {
        const WorldMask bit = WorldMask {1} << world;
        if ((active_worlds & bit) == 0) {
            continue;
        }

        const Position& position = worlds[world].position;
        hash_value(key, world);
        hash_value(key, seat_index(position.current_trick.leader));
        hash_value(
            key,
            position.current_trick.trump_suit.has_value()
                ? static_cast<std::uint64_t>(*position.current_trick.trump_suit) + 1
                : 0);
        hash_value(key, position.current_trick.card_count);
        for (const Suit suit : {Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades}) {
            hash_value(key, 0x100 + static_cast<std::uint64_t>(suit));
            for (int rank_value = static_cast<int>(Rank::Two);
                 rank_value <= static_cast<int>(Rank::Ace);
                 ++rank_value) {
                const Card card = make_card(suit, static_cast<Rank>(rank_value));
                std::uint64_t location = 0;
                for (const Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West}) {
                    if (contains(hand_of(position.deal, seat), card)) {
                        location = 1 + seat_index(seat);
                        break;
                    }
                }
                if (location == 0) {
                    for (std::uint8_t slot = 0;
                         slot < position.current_trick.card_count;
                         ++slot) {
                        if (position.current_trick.cards[slot] == card) {
                            location = 5 + slot;
                            break;
                        }
                    }
                }

                if (!canonical) {
                    hash_value(key, card);
                    hash_value(key, location);
                } else if (location != 0) {
                    // Omitting absolute rank labels makes touching-rank states
                    // share a key while retaining the ordered ownership pattern.
                    hash_value(key, location);
                }
            }
            hash_value(key, 0);
        }
        hash_value(key, position.score.north_south);
        hash_value(key, position.score.east_west);
        hash_value(key, position.completed_tricks);
    }
    return key;
}

std::string format_world_mask(WorldMask mask, std::size_t world_count) {
    std::string result;
    result.reserve(world_count + 2);
    result.push_back('[');
    for (std::size_t world = 0; world < world_count; ++world) {
        result.push_back((mask & (WorldMask {1} << world)) != 0 ? '1' : '0');
    }
    result.push_back(']');
    return result;
}

std::string format_front(const ParetoFront& front, std::size_t world_count) {
    std::ostringstream output;
    for (std::size_t index = 0; index < front.vectors.size(); ++index) {
        if (index > 0) {
            output << ' ';
        }
        output << format_world_mask(front.vectors[index].wins, world_count);
    }
    return output.str();
}

void trace_line(std::ostringstream* trace, std::size_t depth, const std::string& text) {
    if (trace != nullptr) {
        *trace << std::string(depth * 2, ' ') << text << '\n';
    }
}

void audit_line(
    SearchContext& context,
    std::size_t depth,
    std::string_view optimization,
    const std::string& text) {
    if (context.config.collect_audit_log) {
        context.audit << std::string(depth * 2, ' ') << '[' << optimization << "] "
                      << text << '\n';
    }
}

Seat player_to_act(const Position& position) {
    return next_to_play(position.current_trick);
}

std::uint8_t tricks_won_by_declarer(const Position& position, Seat declarer) {
    return same_side(declarer, Seat::North)
        ? position.score.north_south
        : position.score.east_west;
}

void validate_worlds(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config) {
    if (worlds.empty() || worlds.size() > 64) {
        throw std::invalid_argument("alpha-mu requires between 1 and 64 worlds");
    }

    const Position& public_position = worlds.front().position;
    const Seat turn = player_to_act(public_position);
    for (const AlphaMuWorld& world : worlds) {
        const Position& position = world.position;
        if (player_to_act(position) != turn ||
            position.current_trick.leader != public_position.current_trick.leader ||
            position.current_trick.card_count != public_position.current_trick.card_count ||
            position.current_trick.cards != public_position.current_trick.cards ||
            position.current_trick.trump_suit != config.trump_suit ||
            position.score.north_south != public_position.score.north_south ||
            position.score.east_west != public_position.score.east_west ||
            position.completed_tricks != public_position.completed_tricks ||
            position.played_cards != public_position.played_cards) {
            throw std::invalid_argument("alpha-mu worlds must share one public position");
        }

        for (const Seat seat : {Seat::North, Seat::East, Seat::South, Seat::West}) {
            if (same_side(seat, config.declarer) &&
                hand_of(position.deal, seat) != hand_of(public_position.deal, seat)) {
                throw std::invalid_argument(
                    "alpha-mu worlds must share declarer and dummy cards");
            }
        }
    }
}

Hand shared_declarer_moves(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds) {
    Hand shared = kFullDeck;
    for (std::size_t world = 0; world < worlds.size(); ++world) {
        if ((active_worlds & (WorldMask {1} << world)) == 0) {
            continue;
        }
        const Position& position = worlds[world].position;
        shared &= legal_plays(
            position.current_trick,
            hand_of(position.deal, player_to_act(position)));
    }
    return shared;
}

Hand union_of_defender_moves(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds) {
    Hand result = kEmptyHand;
    for (std::size_t world = 0; world < worlds.size(); ++world) {
        if ((active_worlds & (WorldMask {1} << world)) == 0) {
            continue;
        }
        const Position& position = worlds[world].position;
        result |= legal_plays(
            position.current_trick,
            hand_of(position.deal, player_to_act(position)));
    }
    return result;
}

const CachedNode* shallow_cached_node(
    const TranspositionEntry& entry,
    std::uint8_t depth) {
    for (int candidate = static_cast<int>(depth) - 1; candidate >= 0; --candidate) {
        if (entry.by_depth[static_cast<std::size_t>(candidate)].has_value()) {
            return &*entry.by_depth[static_cast<std::size_t>(candidate)];
        }
    }
    return nullptr;
}

}  // namespace alpha_mu_detail
}  // namespace bridge
