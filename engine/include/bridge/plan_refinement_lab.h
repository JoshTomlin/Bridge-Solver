#pragma once
#include "bridge/alpha_mu.h"

namespace bridge {
int run_plan_refinement_lab(std::vector<AlphaMuWorld> legal_worlds,
    int max_m, std::uint64_t seed, std::size_t batches, std::size_t batch_size,
    double stage_seconds, const std::string& output_directory,
    bool audit_all = false, std::optional<Position> actual = std::nullopt);
int run_plan_persistent_lab(std::vector<AlphaMuWorld> legal_worlds,
    int initial_m, std::uint64_t seed, std::size_t rounds, std::size_t batch_size,
    double stage_seconds, const std::string& output_directory);
}
