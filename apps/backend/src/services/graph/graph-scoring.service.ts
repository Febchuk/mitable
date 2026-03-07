/**
 * Graph Scoring Service
 *
 * Stateless pure-math service for computing decay-weighted edge scores.
 * Uses a 30-day half-life exponential decay formula.
 */

import type { EdgeWeightInput, EdgeWeightOutput } from "./types";

const HALF_LIFE_DAYS = 30;

class GraphScoringService {
  /**
   * Exponential decay factor with 30-day half-life.
   * Returns 1.0 for 0 days, 0.5 for 30 days, 0.25 for 60 days, etc.
   */
  decayFactor(daysSinceLastSeen: number): number {
    if (daysSinceLastSeen <= 0) return 1.0;
    return Math.pow(0.5, daysSinceLastSeen / HALF_LIFE_DAYS);
  }

  /**
   * Compute new edge weight:
   *   newWeight = clamp(oldWeight * decay + sourceReliability * confidence, 0, 1)
   */
  computeWeight(input: EdgeWeightInput): EdgeWeightOutput {
    const decay = this.decayFactor(input.daysSinceLastSeen);
    const decayedOld = input.oldWeight * decay;
    const increment = input.sourceReliability * input.confidence;
    const weight = Math.min(1, Math.max(0, decayedOld + increment));

    return { weight, decayApplied: decay };
  }

  /**
   * Iteratively apply weight formula across multiple events on the same edge.
   * Events should be sorted oldest-first so most recent event has strongest influence.
   */
  computeAggregateWeight(
    events: Array<{
      daysSinceLastSeen: number;
      sourceReliability: number;
      confidence: number;
    }>
  ): EdgeWeightOutput {
    let currentWeight = 0;
    let lastDecay = 1.0;

    for (const event of events) {
      const result = this.computeWeight({
        oldWeight: currentWeight,
        daysSinceLastSeen: event.daysSinceLastSeen,
        sourceReliability: event.sourceReliability,
        confidence: event.confidence,
      });
      currentWeight = result.weight;
      lastDecay = result.decayApplied;
    }

    return { weight: currentWeight, decayApplied: lastDecay };
  }

  /**
   * Check if evidence count meets the stability threshold.
   */
  isStable(evidenceCount: number, min = 5): boolean {
    return evidenceCount >= min;
  }
}

export const graphScoringService = new GraphScoringService();
