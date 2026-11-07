#pragma once

#include "bridge/plan_deep.h"

namespace bridge {
int run_plan_local_lab(std::vector<AlphaMuWorld> legal_worlds,
    const std::string& deep_checkpoint, const std::string& broad_checkpoint,
    std::size_t repair_count, double repair_seconds, std::uint64_t seed,
    const std::string& output_directory, std::optional<Position> actual = std::nullopt);
}
