#pragma once

#include "bridge/alpha_mu.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <sstream>
#include <unordered_map>
#include <vector>

namespace bridge::alpha_mu_detail {

struct NodeKey {
    std::uint64_t first {};
    std::uint64_t second {};

    bool operator==(const NodeKey&) const = default;
};

struct NodeKeyHash {
    std::size_t operator()(const NodeKey& key) const;
};

struct CachedNode {
    ParetoFront front;
    Card best_move {kNoCard};
};

struct TranspositionEntry {
    std::array<std::optional<CachedNode>, kMaxDeclarerPlies + 1> by_depth;
    Card move_hint {kNoCard};
};

struct SearchContext {
    const AlphaMuConfig& config;
    AlphaMuSearchStats stats;
    std::unordered_map<NodeKey, TranspositionEntry, NodeKeyHash> table;
    std::ostringstream audit;
};

struct NodeEvaluation {
    ParetoFront front;
    Card best_move {kNoCard};
};

ParetoFront zero_front();
void merge_max_front(ParetoFront& destination, const ParetoFront& source);
bool front_wins_all_worlds(const ParetoFront& front, WorldMask active_worlds);
WorldMask all_worlds_mask(std::size_t world_count);
std::size_t first_world(WorldMask active_worlds);

std::vector<Card> ordered_cards(Hand cards, Card preferred = kNoCard);
std::vector<Card> representative_cards(
    const Position& position,
    Hand legal_moves,
    Card preferred,
    SearchContext& context,
    std::size_t search_depth = 0);

NodeKey make_node_key(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    bool canonical);

std::string format_world_mask(WorldMask mask, std::size_t world_count);
std::string format_front(const ParetoFront& front, std::size_t world_count);
void trace_line(std::ostringstream* trace, std::size_t depth, const std::string& text);
void audit_line(
    SearchContext& context,
    std::size_t depth,
    std::string_view optimization,
    const std::string& text);

Seat player_to_act(const Position& position);
std::uint8_t tricks_won_by_declarer(const Position& position, Seat declarer);
void validate_worlds(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config);
Hand shared_declarer_moves(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds);
Hand union_of_defender_moves(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds);
const CachedNode* shallow_cached_node(
    const TranspositionEntry& entry,
    std::uint8_t depth);

NodeEvaluation alpha_mu_node(
    const std::vector<AlphaMuWorld>& worlds,
    WorldMask active_worlds,
    std::uint8_t max_moves_left,
    SearchContext& context,
    const ParetoFront* alpha,
    std::ostringstream* trace,
    std::size_t trace_depth);

std::shared_ptr<const AlphaMuPolicyNode> build_trick_policy(
    const std::vector<AlphaMuWorld>& worlds,
    const AlphaMuConfig& config,
    Card root_move,
    SearchContext& context);

}  // namespace bridge::alpha_mu_detail
