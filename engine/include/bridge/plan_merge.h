#pragma once

#include "bridge/plan_dag.h"

namespace bridge {

struct PlanMergeResult {
    PlanDag graph;
    // Counts distinct visited node pairs/edges, not expanded public histories.
    std::size_t filled_frontiers {};
    std::size_t added_responses {};
    std::size_t conflicts {};
};

// Fill holes in primary using fallback along identical instruction prefixes.
// Existing primary plays and proof leaves take precedence. Matching Observe
// nodes acquire fallback-only responses; differing plays, players or instruction
// kinds preserve the entire primary continuation without transplanting suffixes.
// A shared Frontier is filled per corresponding node pair, never globally.
//
// Both DAGs are validated and must have the same declarer and target. Callers
// must also ensure their roots refer to the same public starting position: the
// instruction-only DAG does not encode that position. This preserves policy
// instructions, not a success guarantee; imported proof methods must still be
// rechecked in each execution context. Sources are unchanged. The result retains
// primary.completed_m as construction provenance and sets variable_horizon.
PlanMergeResult merge_plan_prefixes(const PlanDag& primary, const PlanDag& fallback);

}  // namespace bridge
