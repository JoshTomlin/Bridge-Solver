#include "bridge/alpha_mu.h"

#include <algorithm>
#include <bit>
#include <stdexcept>

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

AlphaMuScore alpha_mu_outcome_score(
    const OutcomeVector& outcome,
    const std::vector<double>& world_weights,
    WorldMask critical_worlds,
    WorldMask relevant_worlds) {
    const WorldMask wins = outcome.wins & relevant_worlds;
    AlphaMuScore score {
        .critical_wins = static_cast<std::size_t>(
            std::popcount(wins & critical_worlds)),
        .winning_worlds = static_cast<std::size_t>(std::popcount(wins)),
    };
    if (world_weights.empty()) {
        score.weighted_wins = static_cast<double>(score.winning_worlds);
        return score;
    }
    if (world_weights.size() > 64) {
        throw std::invalid_argument("alpha-mu supports at most 64 world weights");
    }
    for (std::size_t index = 0; index < world_weights.size(); ++index) {
        if ((wins & (WorldMask {1} << index)) != 0) {
            score.weighted_wins += world_weights[index];
        }
    }
    return score;
}

bool alpha_mu_score_better(
    const AlphaMuScore& candidate,
    const AlphaMuScore& incumbent,
    double weighted_tolerance) {
    const double tolerance = std::max(0.0, weighted_tolerance);
    if (candidate.weighted_wins > incumbent.weighted_wins + tolerance) {
        return true;
    }
    if (incumbent.weighted_wins > candidate.weighted_wins + tolerance) {
        return false;
    }
    if (candidate.critical_wins != incumbent.critical_wins) {
        return candidate.critical_wins > incumbent.critical_wins;
    }
    if (candidate.weighted_wins != incumbent.weighted_wins) {
        return candidate.weighted_wins > incumbent.weighted_wins;
    }
    return candidate.winning_worlds > incumbent.winning_worlds;
}

AlphaMuScore best_alpha_mu_score(
    const ParetoFront& front,
    const std::vector<double>& world_weights,
    WorldMask critical_worlds,
    WorldMask relevant_worlds,
    double weighted_tolerance) {
    AlphaMuScore best;
    bool found = false;
    for (const OutcomeVector& outcome : front.vectors) {
        const AlphaMuScore score = alpha_mu_outcome_score(
            outcome,
            world_weights,
            critical_worlds,
            relevant_worlds);
        if (!found || alpha_mu_score_better(score, best, weighted_tolerance)) {
            best = score;
            found = true;
        }
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
