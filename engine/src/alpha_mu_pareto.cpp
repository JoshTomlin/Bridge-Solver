#include "bridge/alpha_mu.h"

#include <algorithm>
#include <bit>

namespace bridge {

bool outcome_dominates(const OutcomeVector& a, const OutcomeVector& b) {
    return a.wins != b.wins && (a.wins | b.wins) == a.wins;
}

std::size_t winning_world_count(const OutcomeVector& outcome) {
    return static_cast<std::size_t>(std::popcount(outcome.wins));
}

std::size_t best_winning_world_count(const ParetoFront& front) {
    std::size_t best = 0;
    for (const OutcomeVector& outcome : front.vectors) {
        best = std::max(best, winning_world_count(outcome));
    }
    return best;
}

bool add_to_pareto_front(ParetoFront& front, OutcomeVector candidate) {
    for (const OutcomeVector& existing : front.vectors) {
        if (existing.wins == candidate.wins || outcome_dominates(existing, candidate)) {
            return false;
        }
    }

    std::erase_if(front.vectors, [&](const OutcomeVector& existing) {
        return outcome_dominates(candidate, existing);
    });
    front.vectors.push_back(candidate);
    return true;
}

ParetoFront combine_max_fronts(const std::vector<ParetoFront>& child_fronts) {
    ParetoFront result;
    for (const ParetoFront& child : child_fronts) {
        for (const OutcomeVector& vector : child.vectors) {
            add_to_pareto_front(result, vector);
        }
    }

    if (result.vectors.empty()) {
        result.vectors.push_back(OutcomeVector {});
    }
    return result;
}

ParetoFront combine_min_fronts(const ParetoFront& left, const ParetoFront& right) {
    ParetoFront result;
    for (const OutcomeVector& lhs : left.vectors) {
        for (const OutcomeVector& rhs : right.vectors) {
            add_to_pareto_front(result, OutcomeVector {.wins = lhs.wins & rhs.wins});
        }
    }

    if (result.vectors.empty()) {
        result.vectors.push_back(OutcomeVector {});
    }
    return result;
}

bool pareto_front_is_covered_by(
    const ParetoFront& candidate,
    const ParetoFront& bound) {
    for (const OutcomeVector& candidate_vector : candidate.vectors) {
        const bool covered = std::any_of(
            bound.vectors.begin(),
            bound.vectors.end(),
            [&](const OutcomeVector& bound_vector) {
                return (bound_vector.wins | candidate_vector.wins) == bound_vector.wins;
            });
        if (!covered) {
            return false;
        }
    }
    return true;
}

}  // namespace bridge
