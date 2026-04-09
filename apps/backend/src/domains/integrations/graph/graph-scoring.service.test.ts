import { graphScoringService } from "./graph-scoring.service";

describe("GraphScoringService", () => {
  describe("decayFactor", () => {
    it("returns 1.0 for 0 days", () => {
      expect(graphScoringService.decayFactor(0)).toBe(1.0);
    });

    it("returns 0.5 for 30 days (half-life)", () => {
      expect(graphScoringService.decayFactor(30)).toBeCloseTo(0.5, 5);
    });

    it("returns 0.25 for 60 days", () => {
      expect(graphScoringService.decayFactor(60)).toBeCloseTo(0.25, 5);
    });

    it("returns 1.0 for negative days", () => {
      expect(graphScoringService.decayFactor(-5)).toBe(1.0);
    });

    it("approaches 0 for very old data", () => {
      const result = graphScoringService.decayFactor(365);
      expect(result).toBeLessThan(0.001);
      expect(result).toBeGreaterThan(0);
    });

    it("returns ~0.707 for 15 days (quarter half-life)", () => {
      expect(graphScoringService.decayFactor(15)).toBeCloseTo(Math.pow(0.5, 0.5), 3);
    });
  });

  describe("computeWeight", () => {
    it("clamps result to [0, 1]", () => {
      const result = graphScoringService.computeWeight({
        oldWeight: 0.9,
        daysSinceLastSeen: 0,
        sourceReliability: 1.0,
        confidence: 1.0,
      });
      expect(result.weight).toBeLessThanOrEqual(1);
      expect(result.weight).toBeGreaterThanOrEqual(0);
    });

    it("applies decay to oldWeight", () => {
      const result = graphScoringService.computeWeight({
        oldWeight: 1.0,
        daysSinceLastSeen: 30,
        sourceReliability: 0,
        confidence: 0,
      });
      expect(result.weight).toBeCloseTo(0.5, 3);
      expect(result.decayApplied).toBeCloseTo(0.5, 3);
    });

    it("adds sourceReliability * confidence", () => {
      const result = graphScoringService.computeWeight({
        oldWeight: 0,
        daysSinceLastSeen: 0,
        sourceReliability: 0.85,
        confidence: 0.7,
      });
      expect(result.weight).toBeCloseTo(0.85 * 0.7, 5);
    });

    it("combines decay and increment", () => {
      const result = graphScoringService.computeWeight({
        oldWeight: 0.5,
        daysSinceLastSeen: 30,
        sourceReliability: 0.7,
        confidence: 0.5,
      });
      // 0.5 * 0.5 + 0.7 * 0.5 = 0.25 + 0.35 = 0.60
      expect(result.weight).toBeCloseTo(0.6, 3);
    });

    it("never returns negative weight", () => {
      const result = graphScoringService.computeWeight({
        oldWeight: 0,
        daysSinceLastSeen: 1000,
        sourceReliability: 0,
        confidence: 0,
      });
      expect(result.weight).toBe(0);
    });
  });

  describe("computeAggregateWeight", () => {
    it("accumulates weight across multiple events", () => {
      const result = graphScoringService.computeAggregateWeight([
        { daysSinceLastSeen: 10, sourceReliability: 0.7, confidence: 0.5 },
        { daysSinceLastSeen: 5, sourceReliability: 0.85, confidence: 0.8 },
      ]);
      expect(result.weight).toBeGreaterThan(0);
      expect(result.weight).toBeLessThanOrEqual(1);
    });

    it("returns 0 for empty events", () => {
      const result = graphScoringService.computeAggregateWeight([]);
      expect(result.weight).toBe(0);
    });

    it("returns single event weight for one event", () => {
      const single = graphScoringService.computeWeight({
        oldWeight: 0,
        daysSinceLastSeen: 5,
        sourceReliability: 0.7,
        confidence: 0.8,
      });
      const aggregate = graphScoringService.computeAggregateWeight([
        { daysSinceLastSeen: 5, sourceReliability: 0.7, confidence: 0.8 },
      ]);
      expect(aggregate.weight).toBeCloseTo(single.weight, 5);
    });
  });

  describe("isStable", () => {
    it("returns false below threshold", () => {
      expect(graphScoringService.isStable(4)).toBe(false);
    });

    it("returns true at threshold", () => {
      expect(graphScoringService.isStable(5)).toBe(true);
    });

    it("returns true above threshold", () => {
      expect(graphScoringService.isStable(100)).toBe(true);
    });

    it("accepts custom threshold", () => {
      expect(graphScoringService.isStable(3, 3)).toBe(true);
      expect(graphScoringService.isStable(2, 3)).toBe(false);
    });
  });
});
