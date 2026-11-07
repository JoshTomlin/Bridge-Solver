#pragma once

#include "bridge/plan_dag.h"

namespace bridge {

// Versioned research checkpoint. Preserves instruction IDs, every node field,
// observation order and metadata; execution evidence and vector capacities are
// not serialized. All proof instructions must still be rechecked on replay.
// Readers reject malformed programs, trailing content, and checkpoints above
// 1,000,000 nodes or 4,000,000 observation edges before allocating their arrays.
PlanDag read_plan_checkpoint(std::istream& input);
void write_plan_checkpoint(std::ostream& output, const PlanDag& graph);

} // namespace bridge
